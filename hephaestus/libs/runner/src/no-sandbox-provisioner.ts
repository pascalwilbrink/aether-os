import { Injectable } from '@nestjs/common';

import { RunnerFailure } from './runner.errors.js';
import {
  SandboxProvisioner,
  type Sandbox,
  type SandboxRequest,
} from './sandbox-provisioner.js';

/**
 * No sandboxes (`SANDBOX_DRIVER=none`): fine for agent versions that don't
 * need one; one that does fails without retrying, since retrying won't make
 * a sandbox appear.
 */
@Injectable()
export class NoSandboxProvisioner extends SandboxProvisioner {
  provision({ agentVersion }: SandboxRequest): Promise<Sandbox | null> {
    if (agentVersion.runtime.sandboxRequired) {
      return Promise.reject(
        new RunnerFailure(
          'The agent version needs a sandbox, and no sandbox driver is configured',
          'infrastructure',
          false,
        ),
      );
    }
    return Promise.resolve(null);
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}
