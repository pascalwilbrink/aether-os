import { createZodDto, zGithubWebhookHeaders } from '@proxenos/core';

export class GitHubWebhookHeaders extends createZodDto(zGithubWebhookHeaders) {}
