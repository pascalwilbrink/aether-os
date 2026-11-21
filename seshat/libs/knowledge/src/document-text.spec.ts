import { readFileSync } from 'node:fs';

import { chunkText } from './chunks.js';
import { extractText, htmlToText } from './document-text.js';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('extractText', () => {
  it('reads text types, and generic ones by their extension', async () => {
    expect(
      await extractText(
        bytes('# Title\r\n\r\n\r\n\r\nBody  '),
        'text/markdown',
        'a.md',
      ),
    ).toEqual({
      kind: 'text',
      text: '# Title\n\nBody',
    });
    expect(
      await extractText(bytes('{"a":1}'), 'application/json', 'a.json'),
    ).toEqual({
      kind: 'text',
      text: '{"a":1}',
    });
    expect(
      await extractText(
        bytes('notes'),
        'application/octet-stream',
        'notes.txt',
      ),
    ).toEqual({ kind: 'text', text: 'notes' });
    expect(
      await extractText(bytes('x'), 'text/plain; charset=utf-8', 'a'),
    ).toEqual({
      kind: 'text',
      text: 'x',
    });
  });

  it('keeps images, archives, old .doc and unknown types as unsupported', async () => {
    for (const [type, name] of [
      ['image/png', 'a.png'],
      ['application/zip', 'a.zip'],
      ['application/msword', 'a.doc'],
    ]) {
      expect(await extractText(bytes('x'), type, name)).toEqual({
        kind: 'unsupported',
      });
    }
    expect(
      await extractText(bytes('x'), 'application/octet-stream', 'a.bin'),
    ).toEqual({ kind: 'unsupported' });
  });

  const fixture = (name: string) =>
    new Uint8Array(
      readFileSync(new URL(`../../../test/fixtures/${name}`, import.meta.url)),
    );

  it("reads a PDF's text layer, pages apart", async () => {
    const expected = {
      kind: 'text',
      text: 'Billing runbook\n\nRefunds go through the payments team.\nThey take three days.',
    };
    expect(
      await extractText(
        fixture('two-pages.pdf'),
        'application/pdf',
        'runbook.pdf',
      ),
    ).toEqual(expected);
    // A generic type, by its name.
    expect(
      await extractText(
        fixture('two-pages.pdf'),
        'application/octet-stream',
        'runbook.PDF',
      ),
    ).toEqual(expected);
  });

  it('says why a PDF without text, or a damaged one, is unreadable', async () => {
    expect(
      await extractText(fixture('no-text.pdf'), 'application/pdf', 'scan.pdf'),
    ).toEqual({
      kind: 'unreadable',
      reason: expect.stringContaining('no text layer'),
    });
    expect(
      await extractText(fixture('broken.pdf'), 'application/pdf', 'broken.pdf'),
    ).toEqual({
      kind: 'unreadable',
      reason: expect.stringContaining("The PDF can't be read"),
    });
  });

  it("reads a Word document's text", async () => {
    const docx =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(
      await extractText(fixture('checklist.docx'), docx, 'checklist.docx'),
    ).toEqual({
      kind: 'text',
      text: 'Deploy checklist\n\nRun the migrations before the release.',
    });
    expect(await extractText(bytes('not a zip'), docx, 'broken.docx')).toEqual({
      kind: 'unreadable',
      reason: expect.stringContaining("The Word document can't be read"),
    });
  });

  it('turns HTML into its text', async () => {
    expect(
      htmlToText(
        '<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>Title</h1><p>Fish &amp; chips&#33; &lt;3</p><!-- no --></body></html>',
      )
        .replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Title Fish & chips! <3');
    expect(
      (await extractText(bytes('<p>a</p><p>b</p>'), 'text/html', 'x')).kind,
    ).toBe('text');
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
