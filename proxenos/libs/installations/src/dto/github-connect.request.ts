import { createZodDto, zGitHubConnectRequest } from '@proxenos/core';

export class GitHubConnectRequest extends createZodDto(zGitHubConnectRequest) {}
