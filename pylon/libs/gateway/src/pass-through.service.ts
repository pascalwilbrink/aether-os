import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { isSelfHosted } from '@pylon/catalog';
import type { CallContext } from '@pylon/usage';

import { ModelGateway, providerUnavailable } from './model-gateway.js';
import {
  providerCall,
  upstreamRequest,
  type ProviderUrls,
} from './provider-apis.js';
import { ProviderClient, ProviderUnreachableError } from './provider-client.js';
import { SseParser } from './sse.js';
import { usageMeter, type UsageMeter } from './usage-meters.js';

export const PROVIDER_URLS = Symbol('PROVIDER_URLS');

/** Response headers passed back to the caller as the provider sent them. */
const RETURNED = [
  'content-type',
  'retry-after',
  'request-id',
  'x-request-id',
  'anthropic-ratelimit-requests-remaining',
  'anthropic-ratelimit-tokens-remaining',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-remaining-tokens',
];

/**
 * Passes a model call through to its provider, in the provider's own API
 * (docs/pylon.md, Model calls): checks and picks the key (`ModelGateway`),
 * sends the request on (`ProviderClient`), streams the answer back as it
 * comes while reading its usage, and records the call before the answer
 * ends. A caller that goes away stops the provider's answer, and what it
 * used so far is recorded (`aborted`). A provider's error answer goes back as it is, unrecorded.
 */
@Injectable()
export class PassThroughService {
  private readonly logger = new Logger(PassThroughService.name);

  constructor(
    private readonly gateway: ModelGateway,
    private readonly client: ProviderClient,
    @Inject(PROVIDER_URLS) private readonly urls: ProviderUrls,
  ) {}

  async call(
    context: CallContext,
    provider: string,
    path: string,
    request: Request,
    response: Response,
  ): Promise<void> {
    const call = providerCall(provider, path, request.body);
    if ('problem' in call) {
      throw new BadRequestException(call.problem);
    }
    const prepared = await this.gateway.prepare(
      context,
      'chat',
      call.provider,
      call.model,
    );
    const upstream = upstreamRequest(
      call,
      path,
      request.originalUrl.split('?')[1] ?? '',
      prepared.key.settings,
      this.urls,
      request.headers,
    );

    const abort = new AbortController();
    response.on('close', () => {
      if (!response.writableFinished) {
        abort.abort(new Error('The caller went away'));
      }
    });

    let answer: globalThis.Response;
    try {
      answer = await this.client.send(upstream, {
        selfHosted: isSelfHosted(call.provider),
        signal: abort.signal,
      });
    } catch (error) {
      if (error instanceof ProviderUnreachableError) {
        throw providerUnavailable(error.message);
      }
      throw error;
    }

    response.status(answer.status);
    for (const name of RETURNED) {
      const value = answer.headers.get(name);
      if (value !== null) {
        response.setHeader(name, value);
      }
    }
    if (!answer.ok || !answer.body) {
      // The provider's own refusal, as it gave it; nothing was used.
      response.end(Buffer.from(await answer.arrayBuffer()));
      return;
    }

    const meter = usageMeter(call.format);
    const streamed = (answer.headers.get('content-type') ?? '').includes(
      'text/event-stream',
    );
    let body: Buffer | null = null;
    let aborted = false;
    try {
      if (streamed) {
        response.setHeader('cache-control', 'no-cache');
        response.flushHeaders();
        await this.stream(answer.body, response, meter);
      } else {
        body = Buffer.from(await answer.arrayBuffer());
        readJson(body.toString('utf8'), meter);
      }
    } catch (error) {
      aborted = true;
      if (!abort.signal.aborted) {
        this.logger.warn(
          `A ${call.provider} answer broke off: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    // Recorded before the answer ends, so a caller that reads its usage
    // once the call returns finds it.
    const usage = meter.result();
    await this.gateway.finish(context, prepared, {
      tokens: usage.tokens,
      finishReason: aborted ? 'aborted' : usage.finishReason,
    });
    if (aborted) {
      response.destroy();
    } else {
      response.end(body ?? undefined);
    }
  }

  private async stream(
    body: ReadableStream<Uint8Array>,
    response: Response,
    meter: UsageMeter,
  ): Promise<void> {
    const decoder = new TextDecoder();
    const parser = new SseParser();
    const read = (events: ReturnType<SseParser['push']>) => {
      for (const event of events) {
        if (event.data === '[DONE]') continue;
        try {
          meter.event(event.event, JSON.parse(event.data));
        } catch {
          // Not JSON: nothing to meter in it.
        }
      }
    };
    for await (const chunk of body) {
      response.write(chunk);
      read(parser.push(decoder.decode(chunk, { stream: true })));
    }
    read(parser.push(decoder.decode()));
    read(parser.end());
  }
}

/** A JSON answer (Google's unstreamed `streamGenerateContent` is an array). */
function readJson(text: string, meter: UsageMeter): void {
  try {
    const body: unknown = JSON.parse(text);
    for (const part of Array.isArray(body) ? body : [body]) {
      meter.json(part);
    }
  } catch {
    // Not JSON: nothing to meter.
  }
}
