import { promptFor } from './mastra-agent-runtime.js';

const task = {
  title: 'Write it up',
  instructions: 'A summary, please.',
} as Parameters<typeof promptFor>[0];

describe('promptFor', () => {
  it('is the task alone on a first run', () => {
    expect(promptFor(task, [])).toBe('# Write it up\n\nA summary, please.');
  });

  it('adds what reviewers sent back, with their comments, on a revision run', () => {
    const prompt = promptFor(task, [
      {
        id: '0193a1b2-c3d4-7e5f-8a9b-0000000000a1',
        kind: 'json',
        title: 'Data',
        content: { rows: 2 },
        schema: null,
        review: {
          decision: 'changes_requested',
          comments: [
            { body: 'Three rows.', anchor: '/rows' },
            { body: 'And a total.' },
          ],
          decidedBy: 'reviewer-1',
          decidedAt: '2026-11-18T12:00:00.000Z',
        },
      } as unknown as Parameters<typeof promptFor>[1][number],
    ]);
    expect(prompt).toContain('## Changes requested');
    expect(prompt).toContain('`revises` to its artifact ID');
    expect(prompt).toContain(
      '### Data (artifact 0193a1b2-c3d4-7e5f-8a9b-0000000000a1, json)',
    );
    expect(prompt).toContain('"rows": 2');
    expect(prompt).toContain('- (/rows) Three rows.\n- And a total.');
  });
});
