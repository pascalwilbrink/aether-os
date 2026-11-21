import { briefOf } from './task-brief.js';

describe('briefOf', () => {
  it('is the title and description alone for a plain task', () => {
    expect(
      briefOf({
        title: 'Write it up',
        description: 'A summary, please.',
        expectedOutcome: null,
        requirements: [],
        constraints: [],
        deliverables: [],
        acceptanceCriteria: [],
      }),
    ).toBe('# Write it up\n\nA summary, please.');
  });

  it('puts every field in the agreed order', () => {
    const brief = briefOf({
      title: 'Add invoices',
      description: 'Customers need invoices.',
      expectedOutcome: 'Invoices can be listed.',
      requirements: [{ key: 'REQ-1', description: 'Expose GET /v1/invoices' }],
      constraints: [{ key: 'CON-1', description: 'No new dependencies' }],
      deliverables: [
        {
          key: 'pr',
          kind: 'pull_request',
          description: 'The change',
          primary: true,
        },
        {
          key: 'notes',
          kind: 'file',
          description: 'Release notes',
          path: 'notes-*.md',
        },
      ],
      acceptanceCriteria: [
        {
          key: 'tests',
          description: 'The tests pass',
          requirementKey: 'REQ-1',
          check: { type: 'command', command: 'pnpm test' },
          source: 'task',
        },
        {
          key: 'deliverable.pr',
          description: 'Deliverable pr: The change',
          check: { type: 'artifact', deliverable: 'pr' },
          source: 'deliverable',
        },
      ],
    });
    const order = [
      '# Add invoices',
      'Customers need invoices.',
      '## Expected outcome',
      '## Requirements',
      '- REQ-1: Expose GET /v1/invoices',
      '## Constraints',
      '- CON-1: No new dependencies',
      '## Deliverables',
      '- pr (pull request, the main outcome): The change',
      '- notes (file, named notes-*.md): Release notes',
      '## Acceptance criteria',
      '- tests [REQ-1]: The tests pass (runs `pnpm test` in your sandbox; it must exit 0)',
    ].map((text) => brief.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The deliverables' own criteria are the deliverables, not listed twice.
    expect(brief).not.toContain('deliverable.pr');
  });
});
