import { createZodDto, zGitHubConnectResponse } from '@proxenos/core';

export class GitHubConnectResponse extends createZodDto(
  zGitHubConnectResponse,
) {}
