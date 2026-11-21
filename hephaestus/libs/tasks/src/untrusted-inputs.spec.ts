import { fillUntrusted, namesUntrusted } from './untrusted-inputs.js';

const title = {
  name: 'issue.title',
  source: 'GitHub issue #12',
  value: 'Crash on {{issue.url}}',
};
const url = { name: 'issue.url', source: 'GitHub', value: 'https://x' };

describe('fillUntrusted', () => {
  it('fills in named inputs once, leaving other placeholders', () => {
    expect(
      fillUntrusted('Fix {{ issue.title }} ({{ticket}})', [title, url]),
    ).toBe('Fix Crash on {{issue.url}} ({{ticket}})');
    expect(fillUntrusted('Fix {{issue.title}}', [])).toBe(
      'Fix {{issue.title}}',
    );
  });

  it('wraps each value as asked', () => {
    expect(
      fillUntrusted(
        'Fix {{issue.title}}',
        [title],
        (input) => `[${input.name}]`,
      ),
    ).toBe('Fix [issue.title]');
  });
});

describe('namesUntrusted', () => {
  it('tells whether the text names one of the inputs', () => {
    expect(namesUntrusted('Fix {{issue.title}}', [title])).toBe(true);
    expect(namesUntrusted('Fix issue.title', [title])).toBe(false);
  });
});
