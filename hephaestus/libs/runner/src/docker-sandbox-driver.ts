import { Logger } from '@nestjs/common';
import { DockerSandbox } from '@mastra/docker';
import Docker from 'dockerode';

import { PassThrough } from 'node:stream';

import {
  SandboxDriver,
  type CreatedSandbox,
  type SandboxExecOptions,
  type SandboxExecResult,
  type SandboxSpec,
} from './sandbox-driver.js';

const SANDBOX_LABEL = 'aether-os.sandbox';

/**
 * Sandboxes as Docker containers (`SANDBOX_DRIVER=docker`, for local
 * development and CI; production uses a microVM-backed provider). The
 * container is created here, hardened (../CLAUDE.md): a non-root user, all
 * capabilities dropped, no new privileges, a read-only root filesystem with
 * only the working directory and /tmp writable (tmpfs), PID, memory and CPU
 * limits, an init process, and no network at all (`restricted` access needs
 * the allowlisting proxy, which doesn't exist yet). Mastra's `DockerSandbox`
 * then attaches to it by its label (it can't set the user itself), and is
 * what the agent's workspace tools run commands through.
 */
export class DockerSandboxDriver extends SandboxDriver {
  readonly provider = 'docker';
  private readonly logger = new Logger(DockerSandboxDriver.name);

  constructor(private readonly docker: Docker = new Docker()) {
    super();
  }

  async create(
    spec: SandboxSpec,
    signal: AbortSignal,
  ): Promise<CreatedSandbox> {
    if (/^(0|root)(:|$)/.test(spec.user)) {
      throw new Error('Sandboxes never run as root');
    }
    await this.ensureImage(spec.image);
    signal.throwIfAborted();

    const name = containerName(spec.sandboxId);
    let container: Docker.Container;
    try {
      container = await this.docker.createContainer({
        name,
        Image: spec.image,
        // Whatever the image's entrypoint (e.g. `git` in alpine/git): just sleep.
        Entrypoint: [''],
        Cmd: ['sleep', 'infinity'],
        User: spec.user,
        WorkingDir: spec.workingDirectory,
        // Nothing from Hephaestus's environment, and no secrets as env vars.
        Env: [`HOME=${spec.workingDirectory}`],
        Labels: {
          ...spec.labels,
          [SANDBOX_LABEL]: 'true',
          // How Mastra's DockerSandbox finds it.
          'mastra.sandbox': 'true',
          'mastra.sandbox.id': spec.sandboxId,
        },
        NetworkDisabled: true,
        HostConfig: {
          NetworkMode: 'none',
          ReadonlyRootfs: true,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges:true'],
          PidsLimit: spec.pidsLimit,
          Memory: spec.memoryMb * 1024 * 1024,
          MemorySwap: spec.memoryMb * 1024 * 1024,
          NanoCpus: Math.round(spec.cpus * 1e9),
          Init: true,
          Privileged: false,
          Tmpfs: {
            // Executable: the repository's own scripts and Git hooks run there.
            [spec.workingDirectory]: tmpfs(
              spec.user,
              spec.workspaceMb,
              '0700',
              true,
            ),
            '/tmp': tmpfs(spec.user, 256, '1777'),
          },
        },
      });
    } catch (error) {
      // Created already (a retried call): use it.
      if ((error as { statusCode?: number }).statusCode !== 409) {
        throw error;
      }
      container = this.docker.getContainer(name);
    }

    try {
      const info = await container.inspect();
      if (!info.State.Running) {
        await container.start();
      }
      signal.throwIfAborted();
      const agentSandbox = new DockerSandbox({
        id: spec.sandboxId,
        workingDirectory: spec.workingDirectory,
        // The same limits, so attaching doesn't warn about differences.
        pidsLimit: spec.pidsLimit,
        readonlyRootfs: true,
        capDrop: ['ALL'],
        securityOpt: ['no-new-privileges:true'],
        init: true,
        network: 'none',
      });
      await agentSandbox.start();
      return { resourceId: info.Id, agentSandbox };
    } catch (error) {
      await this.remove(spec.sandboxId);
      throw error;
    }
  }

  async remove(sandboxId: string): Promise<void> {
    try {
      await this.docker
        .getContainer(containerName(sandboxId))
        .remove({ force: true });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 404) {
        throw error;
      }
    }
  }

  async exec(
    sandboxId: string,
    command: string[],
    options: SandboxExecOptions = {},
  ): Promise<SandboxExecResult> {
    const exec = await this.docker.getContainer(containerName(sandboxId)).exec({
      Cmd: command,
      AttachStdin: options.stdin !== undefined,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      WorkingDir: options.workingDirectory,
    });
    const stream = await exec.start({
      hijack: true,
      stdin: options.stdin !== undefined,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const out = new PassThrough().on('data', (chunk: Buffer) =>
      stdout.push(chunk),
    );
    const err = new PassThrough().on('data', (chunk: Buffer) =>
      stderr.push(chunk),
    );
    this.docker.modem.demuxStream(stream, out, err);

    const timeoutMs = options.timeoutMs ?? 60_000;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error(`${command[0]} took longer than ${timeoutMs} ms`));
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      stream.on('end', done);
      stream.on('close', done);
      stream.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      if (options.stdin !== undefined) {
        stream.end(options.stdin);
      }
    });
    const { ExitCode } = await exec.inspect();
    return {
      exitCode: ExitCode ?? -1,
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr).toString('utf8'),
    };
  }

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch {
      // Not there yet: pull it.
    }
    this.logger.log(`Pulling sandbox image ${image}`);
    const stream = await this.docker.pull(image);
    await new Promise<void>((resolve, reject) =>
      this.docker.modem.followProgress(stream, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
  }
}

function containerName(sandboxId: string): string {
  return `aether-sandbox-${sandboxId}`;
}

/** Docker mounts tmpfs `noexec` unless told otherwise. */
function tmpfs(
  user: string,
  sizeMb: number,
  mode: string,
  exec = false,
): string {
  const [uid, gid = uid] = user.split(':');
  return `rw,nosuid,nodev,${exec ? 'exec' : 'noexec'},size=${sizeMb}m,uid=${uid},gid=${gid},mode=${mode}`;
}
