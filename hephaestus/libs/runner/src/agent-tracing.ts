import { Mastra } from '@mastra/core/mastra';
import { Observability } from '@mastra/observability';
import { OtelBridge } from '@mastra/otel-bridge';

/**
 * Mastra with its observability bridged to OpenTelemetry: the agent's run,
 * each model call (`gen_ai.*` attributes: the model, the messages, token
 * usage) and each tool call become spans in the active trace, the
 * execution's. Its sensitive data filter redacts fields that look like
 * secrets (keys, tokens, passwords) before they're recorded. Only when
 * Hephaestus traces (`startTelemetry` started an SDK); null otherwise, so
 * nothing is recorded for nobody.
 */
export function agentTracing(env: NodeJS.ProcessEnv): Mastra | undefined {
  const endpoint =
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || env.OTEL_SDK_DISABLED === 'true') {
    return undefined;
  }
  return mastraWithTracing();
}

export function mastraWithTracing(): Mastra {
  return new Mastra({
    logger: false,
    observability: new Observability({
      configs: {
        hephaestus: {
          serviceName: 'hephaestus',
          bridge: new OtelBridge(),
        },
      },
    }),
  });
}
