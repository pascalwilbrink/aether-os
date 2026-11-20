import { startTelemetry } from '@aether-os/krepis/otel';

// First, and awaited: OpenTelemetry patches only what's imported after it
// (../../CLAUDE.md, Observability). Without OTEL_EXPORTER_OTLP_ENDPOINT it
// starts nothing.
await startTelemetry({ serviceName: 'pylon' });
await import('./server.js');
