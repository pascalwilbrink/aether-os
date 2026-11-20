import { attachment } from './content-disposition.js';

describe('attachment', () => {
  it('names the file, plainly and exactly', () => {
    expect(attachment('index.html')).toBe(
      `attachment; filename="index.html"; filename*=UTF-8''index.html`,
    );
  });

  it('keeps quotes and other characters from breaking out of the header', () => {
    expect(attachment('a "b"\\c;d.txt')).toBe(
      `attachment; filename="a _b__c;d.txt"; filename*=UTF-8''a%20%22b%22%5Cc%3Bd.txt`,
    );
  });

  it('encodes names beyond ASCII', () => {
    expect(attachment("résumé (final)'s.pdf")).toBe(
      `attachment; filename="r_sum_ (final)'s.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%28final%29%27s.pdf`,
    );
  });
});
