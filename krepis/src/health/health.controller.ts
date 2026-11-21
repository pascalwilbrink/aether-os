import { Controller, Get, Res } from '@nestjs/common';

import { Public } from '../auth/decorators.js';

import type { HealthReport } from './health-check.js';
import { HealthService } from './health.service.js';

/**
 * `/health` (unversioned, no token; docs/engineering.md, Health checks):
 * `GET /health/live` answers while the process runs, for restarts;
 * `GET /health` checks what the service depends on: `200` when it's `ok`
 * or `degraded`, `503` when a required check fails or it shuts down.
 */
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): { status: 'ok'; service: string } {
    return { status: 'ok', service: this.health.service };
  }

  @Get()
  async ready(
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<HealthReport> {
    const report = await this.health.report();
    response.status(report.status === 'down' ? 503 : 200);
    return report;
  }
}
