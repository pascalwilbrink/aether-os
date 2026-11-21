import { matchesPath, taskBriefOf } from './task-fields.js';

const req = (key: string) => ({ key, description: `Do ${key}` });

describe('taskBriefOf', () => {
  it('takes the description or its old name, and implies a criterion per deliverable', () => {
    expect(
      taskBriefOf(
        {
          instructions: 'Old name',
          requirements: [req('REQ-1')],
          constraints: [req('CON-1')],
          expectedOutcome: '  ',
          deliverables: [
            {
              key: 'report',
              kind: 'file',
              description: 'A report',
              path: '*.md',
            },
          ],
        },
        [
          {
            key: 'tests',
            description: 'Tests pass',
            requirementKey: 'REQ-1',
            check: { type: 'manual' },
          },
        ],
        false,
      ),
    ).toEqual({
      description: 'Old name',
      requirements: [req('REQ-1')],
      constraints: [req('CON-1')],
      expectedOutcome: null,
      deliverables: [
        { key: 'report', kind: 'file', description: 'A report', path: '*.md' },
      ],
      deliverableCriteria: [
        {
          key: 'deliverable.report',
          description: 'Deliverable report: A report',
          check: { type: 'artifact', deliverable: 'report' },
          source: 'deliverable',
        },
      ],
    });
    expect(
      taskBriefOf({ description: 'New', instructions: 'Old' }, [], false)
        .description,
    ).toBe('New');
  });

  it.each([
    [{}, 'A task needs a description'],
    [
      { description: 'x', requirements: [req('A')], constraints: [req('A')] },
      'The key A is used twice',
    ],
    [
      {
        description: 'x',
        deliverables: [
          { key: 'a', kind: 'text' as const, description: 'A' },
          { key: 'a', kind: 'json' as const, description: 'B' },
        ],
      },
      'The deliverable a is listed twice',
    ],
    [
      {
        description: 'x',
        deliverables: [
          { key: 'a', kind: 'text' as const, description: 'A', primary: true },
          { key: 'b', kind: 'text' as const, description: 'B', primary: true },
        ],
      },
      'At most one deliverable is the primary one',
    ],
    [
      {
        description: 'x',
        deliverables: [
          { key: 'a', kind: 'text' as const, description: 'A', path: 'a.md' },
        ],
      },
      'only a file deliverable takes one',
    ],
    [
      {
        description: 'x',
        deliverables: [
          { key: 'pr', kind: 'pull_request' as const, description: 'The fix' },
        ],
      },
      'the task works in no repository',
    ],
  ])('refuses %o', (dto, message) => {
    expect(() => taskBriefOf(dto, [], false)).toThrow(message);
  });

  it("refuses a criterion checking a requirement the task doesn't have", () => {
    expect(() =>
      taskBriefOf(
        { description: 'x' },
        [
          {
            key: 'c',
            description: 'C',
            requirementKey: 'REQ-9',
            check: { type: 'manual' },
          },
        ],
        false,
      ),
    ).toThrow("REQ-9, which isn't one of the task's requirements");
    // A pull request deliverable is fine with a repository.
    expect(
      taskBriefOf(
        {
          description: 'x',
          deliverables: [
            { key: 'pr', kind: 'pull_request', description: 'The fix' },
          ],
        },
        [],
        true,
      ).deliverableCriteria,
    ).toHaveLength(1);
  });
});

describe('matchesPath', () => {
  it('matches a name or a pattern with *', () => {
    expect(matchesPath('report.md', 'report.md')).toBe(true);
    expect(matchesPath('report-2026.md', 'report-*.md')).toBe(true);
    expect(matchesPath('report.md.txt', '*.md')).toBe(false);
    expect(matchesPath('reportXmd', 'report.md')).toBe(false);
  });
});
