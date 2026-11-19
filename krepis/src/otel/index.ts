// `@aether-os/krepis/otel`: starting OpenTelemetry, separate from the main
// entry point so loading Krepis never loads the SDK.
export * from './start-telemetry.js';
export { redactUrl } from './redact.js';
