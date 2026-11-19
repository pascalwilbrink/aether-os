import { Logger } from '@nestjs/common';
import { DockerSandbox } from '@mastra/docker';
import Docker from 'dockerode';

import { PassThrough } from 'node:stream';

import { blockedHostsIn, EGRESS_PROXY_SOURCE } from './egress-proxy.js';
import {
  SandboxDriver,
  type CreatedSandbox,
  type SandboxExecOptions,
  type SandboxExecResult,
  type SandboxSpec,
} from './sandbox-driver.js';

const SANDBOX_LABEL = 'aether-os.sandbox';
const PROXY_LABEL = 'aether-os.sandbox-proxy';
const PROXY_PORT = 3128;

/** How `restricted` sandboxes reach the allowed hosts. */
export interface DockerNetworkOptions {
  /** The proxy's image: anything with `node` (it runs a script, `egress-proxy.ts`). */
  proxyImage: string;
  /** The network the proxy reaches the internet on (Docker's `bridge`). */
  egressNetwork: string;
  /** Refuse allowed hosts resolving to private addresses (off only in tests). */
  blockPrivateAddresses: boolean;
}

const DEFAULT_NETWORK_OPTIONS: DockerNetworkOptions = {
  proxyImage: 'node:22-alpine',
  egressNetwork: 'bridge',
  blockPrivateAddresses: true,
};

/**
 * Sandboxes as Docker containers (`SANDBOX_DRIVER=docker`, for local
 * development and CI; production uses a microVM-backed provider). The
 * container is created here, hardened (../CLAUDE.md): a non-root user, all
 * capabilities dropped, no new privileges, a read-only root filesystem with
 * only the working directory and /tmp writable (tmpfs), PID, memory and CPU
 * limits, an init process, and no network at all, or for `restricted`
 * access only an internal network of its own (no route out) whose one other
 * member is its proxy (`egress-proxy.ts`, as hardened, also on the egress
 * network): the sandbox reaches allowed hosts through `HTTP(S)_PROXY` and
 * nothing else. Mastra's `DockerSandbox` then attaches to it by its label
 * (it can't set the user itself), and is what the agent's workspace tools
 * run commands through.
 */
export class DockerSandboxDriver extends SandboxDriver {
  readonly provider = 'docker';
  private readonly logger = new Logger(DockerSandboxDriver.name);

  constructor(
    private readonly docker: Docker = new Docker(),
    private readonly networkOptions: DockerNetworkOptions = DEFAULT_NETWORK_OPTIONS,
  ) {
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
    const restricted = spec.network.access === 'restricted';
    if (spec.network.access === 'restricted') {
      await this.startProxy(spec, spec.network.allowedHosts, signal);
    }

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
        // Nothing from Hephaestus's environment, and no secrets as env vars:
        // only where its proxy is.
        Env: [
          `HOME=${spec.workingDirectory}`,
          ...(restricted ? proxyEnv() : []),
        ],
        Labels: {
          ...spec.labels,
          [SANDBOX_LABEL]: 'true',
          // How Mastra's DockerSandbox finds it.
          'mastra.sandbox': 'true',
          'mastra.sandbox.id': spec.sandboxId,
        },
        NetworkDisabled: !restricted,
        HostConfig: {
          NetworkMode: restricted ? networkName(spec.sandboxId) : 'none',
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
        network: restricted ? networkName(spec.sandboxId) : 'none',
      });
      await agentSandbox.start();
      return { resourceId: info.Id, agentSandbox };
    } catch (error) {
      await this.remove(spec.sandboxId);
      throw error;
    }
  }

  async remove(sandboxId: string): Promise<void> {
    for (const name of [containerName(sandboxId), proxyName(sandboxId)]) {
      await ignoreMissing(() =>
        this.docker.getContainer(name).remove({ force: true }),
      );
    }
    await ignoreMissing(() =>
      this.docker.getNetwork(networkName(sandboxId)).remove(),
    );
  }

  async blockedHosts(sandboxId: string): Promise<string[]> {
    let logs: Buffer;
    try {
      logs = (await this.docker
        .getContainer(proxyName(sandboxId))
        .logs({ stdout: true, stderr: false, follow: false })) as Buffer;
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return [];
      throw error;
    }
    return blockedHostsIn(demux(logs));
  }

  /**
   * The sandbox's internal network and its proxy, idempotently: the proxy
   * is on the egress network and on the internal one (as `proxy`), and is
   * running and listening when this returns.
   */
  private async startProxy(
    spec: SandboxSpec,
    allowedHosts: string[],
    signal: AbortSignal,
  ): Promise<void> {
    const { proxyImage, egressNetwork, blockPrivateAddresses } =
      this.networkOptions;
    await this.ensureImage(proxyImage);
    const network = networkName(spec.sandboxId);
    try {
      await this.docker.getNetwork(network).inspect();
    } catch {
      await this.docker.createNetwork({
        Name: network,
        Driver: 'bridge',
        // No route out: the proxy is the only way.
        Internal: true,
        Labels: { ...spec.labels, [SANDBOX_LABEL]: 'true' },
      });
    }

    const name = proxyName(spec.sandboxId);
    let proxy: Docker.Container;
    try {
      proxy = await this.docker.createContainer({
        name,
        Image: proxyImage,
        Entrypoint: [''],
        Cmd: ['node', '-e', EGRESS_PROXY_SOURCE],
        User: spec.user,
        Env: [
          `ALLOWED_HOSTS=${allowedHosts.join(',')}`,
          'ALLOWED_PORTS=80,443',
          `PORT=${PROXY_PORT}`,
          `BLOCK_PRIVATE=${blockPrivateAddresses}`,
        ],
        Labels: { ...spec.labels, [PROXY_LABEL]: 'true' },
        HostConfig: {
          NetworkMode: egressNetwork,
          ReadonlyRootfs: true,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges:true'],
          PidsLimit: 64,
          Memory: 128 * 1024 * 1024,
          MemorySwap: 128 * 1024 * 1024,
          NanoCpus: 500_000_000,
          Init: true,
          Privileged: false,
        },
      });
      await this.docker.getNetwork(network).connect({
        Container: name,
        EndpointConfig: { Aliases: ['proxy'] },
      });
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode !== 409) {
        throw error;
      }
      proxy = this.docker.getContainer(name);
    }
    if (!(await proxy.inspect()).State.Running) {
      await proxy.start();
    }
    const deadline = Date.now() + 15_000;
    while (
      !demux(
        (await proxy.logs({ stdout: true, follow: false })) as Buffer,
      ).includes('"event":"ready"')
    ) {
      signal.throwIfAborted();
      if (Date.now() > deadline) {
        throw new Error("The sandbox's network proxy didn't start");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
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

function proxyName(sandboxId: string): string {
  return `aether-sandbox-proxy-${sandboxId}`;
}

function networkName(sandboxId: string): string {
  return `aether-sandbox-net-${sandboxId}`;
}

/** Where a `restricted` sandbox's proxy is, for the tools that read these. */
function proxyEnv(): string[] {
  const url = `http://proxy:${PROXY_PORT}`;
  return [
    `HTTP_PROXY=${url}`,
    `HTTPS_PROXY=${url}`,
    `http_proxy=${url}`,
    `https_proxy=${url}`,
    'NO_PROXY=localhost,127.0.0.1',
    'no_proxy=localhost,127.0.0.1',
  ];
}

async function ignoreMissing(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 404) {
      throw error;
    }
  }
}

/** A container's log without Docker's stream headers (8 bytes per frame). */
function demux(log: Buffer): string {
  const parts: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= log.length) {
    const size = log.readUInt32BE(offset + 4);
    parts.push(log.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size;
  }
  return Buffer.concat(parts).toString('utf8');
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
