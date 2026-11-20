import type { ApiTypes } from '@pylon/core';

/** One call's tokens, as the gateway records them. */
export interface CallTokens {
  /** Every input token, cache reads and writes included. */
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
}

export type Rates = Pick<
  ApiTypes.ModelPriceResponse,
  | 'inputPerMTok'
  | 'outputPerMTok'
  | 'cacheReadPerMTok'
  | 'cacheWritePerMTok'
  | 'longContext'
>;

const MICROS = 1_000_000n;
const DECIMAL = /^(\d+)(?:\.(\d{1,6}))?$/;

/** A decimal string with at most 6 decimals, in millionths. */
export function toMicros(value: string): bigint {
  const match = DECIMAL.exec(value);
  if (!match) {
    throw new Error(`Not a decimal with at most 6 decimals: ${value}`);
  }
  return BigInt(match[1]) * MICROS + BigInt((match[2] ?? '').padEnd(6, '0'));
}

/** Millionths as a decimal string with 6 decimals (`../docs/api.md`, Money). */
export function fromMicros(micros: bigint): string {
  const whole = micros / MICROS;
  const fraction = (micros % MICROS).toString().padStart(6, '0');
  return `${whole}.${fraction}`;
}

/**
 * What a call cost, in US dollars (6 decimals), at `rates`: input that
 * wasn't a cache read or write at the input price, cache reads and writes at
 * theirs (the input price when they have none), output at the output price.
 * A call with more input than a long-context threshold is priced wholly at
 * those rates. Exact: integer arithmetic in millionths, rounded half up once.
 */
export function costOf(rates: Rates, tokens: CallTokens): string {
  const input = count(tokens.inputTokens);
  const cacheRead = count(tokens.cacheReadTokens);
  const cacheWrite = count(tokens.cacheWriteTokens);
  const output = count(tokens.outputTokens);
  const applied =
    rates.longContext && input > BigInt(rates.longContext.aboveInputTokens)
      ? rates.longContext
      : rates;
  const inputPrice = toMicros(applied.inputPerMTok);
  const uncached = input - cacheRead - cacheWrite;
  // Micro-dollars per million tokens × tokens: 10^12 of these are a dollar.
  const total =
    (uncached > 0n ? uncached : 0n) * inputPrice +
    cacheRead * priceOr(applied.cacheReadPerMTok, inputPrice) +
    cacheWrite * priceOr(applied.cacheWritePerMTok, inputPrice) +
    output * toMicros(applied.outputPerMTok);
  return fromMicros((total + MICROS / 2n) / MICROS);
}

function priceOr(price: string | null | undefined, fallback: bigint): bigint {
  return price === null || price === undefined ? fallback : toMicros(price);
}

function count(tokens: number | null): bigint {
  return tokens === null || tokens <= 0 ? 0n : BigInt(Math.round(tokens));
}
