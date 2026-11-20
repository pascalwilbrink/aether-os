import { chunkText } from './chunks.js';
import { extractText, htmlToText } from './document-text.js';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('extractText', () => {
  it('reads text types, and generic ones by their extension', () => {
    expect(
      extractText(
        bytes('# Title\r\n\r\n\r\n\r\nBody  '),
        'text/markdown',
        'a.md',
      ),
    ).toEqual({
      kind: 'text',
      text: '# Title\n\nBody',
    });
    expect(extractText(bytes('{"a":1}'), 'application/json', 'a.json')).toEqual(
      {
        kind: 'text',
        text: '{"a":1}',
      },
    );
    expect(
      extractText(bytes('notes'), 'application/octet-stream', 'notes.txt'),
    ).toEqual({ kind: 'text', text: 'notes' });
    expect(extractText(bytes('x'), 'text/plain; charset=utf-8', 'a')).toEqual({
      kind: 'text',
      text: 'x',
    });
  });

  it('keeps PDFs, images and unknown types as unsupported', () => {
    for (const type of ['application/pdf', 'image/png', 'application/zip']) {
      expect(extractText(bytes('%PDF'), type, 'a.pdf')).toEqual({
        kind: 'unsupported',
      });
    }
    expect(
      extractText(bytes('x'), 'application/octet-stream', 'a.bin'),
    ).toEqual({ kind: 'unsupported' });
  });

  it('turns HTML into its text', () => {
    expect(
      htmlToText(
        '<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>Title</h1><p>Fish &amp; chips&#33; &lt;3</p><!-- no --></body></html>',
      )
        .replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Title Fish & chips! <3');
    expect(extractText(bytes('<p>a</p><p>b</p>'), 'text/html', 'x').kind).toBe(
      'text',
    );
  });
});

describe('chunkText', () => {
  it('keeps short text whole', () => {
    expect(chunkText('One.\n\nTwo.')).toEqual(['One.\n\nTwo.']);
  });

  it('packs paragraphs up to the limit, and starts a chunk at a heading', () => {
    const para = 'x'.repeat(40);
    const chunks = chunkText(
      [para, para, para, '## Next', para].join('\n\n'),
      100,
    );
    expect(chunks).toEqual([`${para}\n\n${para}`, para, `## Next\n\n${para}`]);
  });

  it('splits long paragraphs at sentences, then hard', () => {
    const sentence = 'A sentence that is long enough. ';
    const chunks = chunkText(sentence.repeat(10), 100);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(
      sentence.repeat(10).trim().replace(/\s+/g, ' '),
    );
    expect(chunkText('y'.repeat(250), 100)).toEqual([
      'y'.repeat(100),
      'y'.repeat(100),
      'y'.repeat(50),
    ]);
  });

  it('has nothing for empty text', () => {
    expect(chunkText('  \n\n ')).toEqual([]);
  });
});
