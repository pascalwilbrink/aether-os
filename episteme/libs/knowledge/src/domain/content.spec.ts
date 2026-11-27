import { canonicalContent, checksumOf, unifiedDiff } from './content.js';

describe('content', () => {
  it('checksums the canonical Markdown', () => {
    expect(canonicalContent('a\r\nb\rc\n')).toBe('a\nb\nc\n');
    expect(checksumOf('a\r\nb')).toBe(checksumOf('a\nb'));
    expect(checksumOf('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('diffs two versions', () => {
    const diff = unifiedDiff(
      { number: 1, content: '# Policy\n\nOld rule.\n' },
      { number: 2, content: '# Policy\n\nNew rule.\n' },
    );
    expect(diff).toContain('--- version 1');
    expect(diff).toContain('+++ version 2');
    expect(diff).toContain('-Old rule.');
    expect(diff).toContain('+New rule.');
    expect(
      unifiedDiff({ number: 1, content: 'x' }, { number: 2, content: 'x' }),
    ).toBe('');
  });
});
