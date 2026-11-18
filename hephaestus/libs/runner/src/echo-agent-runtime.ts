import { Injectable } from '@nestjs/common';

import {
  AgentRuntime,
  type AgentRunInput,
  type AgentRunResult,
} from './agent-runtime.js';

/**
 * A stand-in runtime (`AGENT_RUNTIME=echo`) that finishes every task at once
 * without calling a model: for running the lifecycle locally until the
 * Mastra runtime exists. Never for production.
 */
@Injectable()
export class EchoAgentRuntime extends AgentRuntime {
  run({ task, agentVersion }: AgentRunInput): Promise<AgentRunResult> {
    return Promise.resolve({
      outcome: 'completed',
      summary: `Echo (${agentVersion.model.provider}/${agentVersion.model.model}): ${task.title}`,
    });
  }
}

/** `AGENT_RUNTIME=none`: no runner starts, so nothing should call it. */
@Injectable()
export class NoAgentRuntime extends AgentRuntime {
  run(): Promise<AgentRunResult> {
    return Promise.reject(new Error('No agent runtime is configured'));
  }
}
