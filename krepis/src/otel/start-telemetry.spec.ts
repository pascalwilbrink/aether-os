import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startTelemetry } from './start-telemetry.js';

describe('startTelemetry', () => {
  it('starts nothing without an OTLP endpoint, reading OTEL_* from the env file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'otel-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'OTEL_SDK_DISABLED=true\nDATABASE_URL=postgres://x\n');
    const env: NodeJS.ProcessEnv = {};

    const telemetry = await startTelemetry({
      serviceName: 'test',
      env,
      envFile: file,
    });

    expect(telemetry.enabled).toBe(false);
    // Only OTEL_* variables are taken from the file.
    expect(env).toEqual({ OTEL_SDK_DISABLED: 'true' });
    await telemetry.shutdown();
  });
});
