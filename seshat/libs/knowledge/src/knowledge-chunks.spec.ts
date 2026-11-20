import { searchableTitle } from './knowledge-chunks.service.js';

describe('searchableTitle', () => {
  it('turns file names into words', () => {
    expect(
      searchableTitle('Architecture_overview.pdf', 'Architecture_overview.pdf'),
    ).toBe('Architecture overview');
    expect(searchableTitle('run-book.md', 'run-book.md')).toBe('run book');
  });

  it('leaves other titles alone', () => {
    expect(searchableTitle('Use Postgres for everything.')).toBe(
      'Use Postgres for everything.',
    );
    expect(searchableTitle('Node.js upgrade', 'notes.md')).toBe(
      'Node.js upgrade',
    );
  });
});
