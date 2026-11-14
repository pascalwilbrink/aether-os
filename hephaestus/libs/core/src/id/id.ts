import type { Brand } from '@aether-os/krepis';

// OrganizationId and ProjectId come from @aether-os/krepis.
export type AgentId = Brand<string, 'AgentId'>;
export type AgentVersionId = Brand<string, 'AgentVersionId'>;
export type ExecutionId = Brand<string, 'ExecutionId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
