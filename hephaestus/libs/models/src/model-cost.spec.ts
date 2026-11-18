import { costOf, fromMicros, toMicros, type Rates } from './model-cost.js';

const sonnet: Rates = {
  inputPerMTok: '2.000000',
  outputPerMTok: '10.000000',
  cacheReadPerMTok: '0.100000',
  cacheWritePerMTok: '2.500000',
  longContext: null,
};
const tokens = (
  inputTokens: number | null,
  outputTokens: number | null,
  cacheReadTokens: number | null = null,
  cacheWriteTokens: number | null = null,
) => ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens });

describe('model cost', () => {
  it('reads and writes decimal strings exactly', () => {
    expect(toMicros('0.125')).toBe(125_000n);
    expect(toMicros('40')).toBe(40_000_000n);
    expect(fromMicros(1_234_567n)).toBe('1.234567');
    expect(fromMicros(5n)).toBe('0.000005');
    expect(() => toMicros('1.0000001')).toThrow();
  });

  it('prices input and output per million tokens', () => {
    // 1M in at $2 + 500k out at $10 = $7.
    expect(costOf(sonnet, tokens(1_000_000, 500_000))).toBe('7.000000');
    expect(costOf(sonnet, tokens(1234, 567))).toBe('0.008138');
  });

  it('prices cache reads and writes apart from other input', () => {
    // 100k input, of which 80k read from and 10k written to the cache:
    // 10k × $2 + 80k × $0.10 + 10k × $2.50 = $0.02 + $0.008 + $0.025.
    expect(costOf(sonnet, tokens(100_000, 0, 80_000, 10_000))).toBe('0.053000');
  });

  it('charges cache tokens as input when they have no price', () => {
    const openAiLike = { ...sonnet, cacheWritePerMTok: null };
    expect(costOf(openAiLike, tokens(100_000, 0, 0, 100_000))).toBe('0.200000');
  });

  it('prices the whole call at long-context rates above the threshold', () => {
    const haiku: Rates = {
      inputPerMTok: '0.1',
      outputPerMTok: '0.5',
      cacheReadPerMTok: '0.01',
      cacheWritePerMTok: '0.125',
      longContext: {
        aboveInputTokens: 100_000,
        inputPerMTok: '0.5',
        outputPerMTok: '2.5',
        cacheReadPerMTok: '0.05',
        cacheWritePerMTok: '0.625',
      },
    };
    expect(costOf(haiku, tokens(100_000, 1000))).toBe('0.010500');
    // Over the threshold even though most of it is a cache hit:
    // 1 × $0.50 + 100k × $0.05 + 1k × $2.50 = $0.0075005, rounded half up.
    expect(costOf(haiku, tokens(100_001, 1000, 100_000))).toBe('0.007501');
  });

  it('counts missing tokens as none and rounds half up', () => {
    expect(costOf(sonnet, tokens(null, null))).toBe('0.000000');
    // 1 token at $2/MTok is $0.000002; 1 at $0.10 is $0.0000001 → 0.
    expect(costOf(sonnet, tokens(1, 0))).toBe('0.000002');
    expect(costOf({ ...sonnet, inputPerMTok: '0.5' }, tokens(1, 0))).toBe(
      '0.000001',
    );
  });
});
