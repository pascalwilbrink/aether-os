import { createZodDto, zConnectGitHubPath } from '@proxenos/core';

export class ConnectGitHubParams extends createZodDto(zConnectGitHubPath) {}
