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

  it('adds the failed acceptance criteria after a verification round', () => {
    const prompt = promptFor(
      task,
      [],
      [
        {
          key: 'tests-pass',
          description: 'The tests pass',
          output: '1 failing',
        },
      ],
    );
    expect(prompt).toContain('## Acceptance criteria not met');
    expect(prompt).toContain(
      '### tests-pass: The tests pass\n\n```\n1 failing\n```',
    );
  });

  it('says where the repository is, and that only commits are kept', () => {
    const prompt = promptFor(task, [], [], {
      fullName: 'acme/api',
      path: '/workspace/repo',
      branch: 'aether/0193',
      startedFrom: 'main',
    });
    expect(prompt).toBe(
      [
        '# Write it up\n\nA summary, please.',
        '',
        '## Repository',
        '',
        'The repository acme/api is checked out at /workspace/repo, on the branch aether/0193 (from main).',
        'Make your changes there and commit them with git (`git add`, `git commit`): only commits are kept, and uncommitted changes are lost.',
        "There's no network: don't push, Aether-os takes your commits from here.",
      ].join('\n'),
    );
  });

  it('gives a branch conflict to resolve, and says the work is checked again', () => {
    const repository = {
      fullName: 'acme/api',
      path: '/workspace/repo',
      branch: 'aether/0193',
      startedFrom: 'main',
    };
    const prompt = promptFor(task, [], [], repository, {
      branch: 'aether/0193',
      files: ['README.md', 'src/app.ts'],
    });
    expect(prompt).toContain(
      [
        '## The branch moved',
        '',
        'While you worked, another task in this tree pushed to aether/0193.',
        'Your commits are being rebased onto it in /workspace/repo, and the rebase stopped at conflicts in:',
        '',
        '- README.md',
        '- src/app.ts',
      ].join('\n'),
    );
    expect(prompt).toContain('GIT_EDITOR=true git rebase --continue');
    expect(prompt).toMatch(/verified again\.$/);

    expect(
      promptFor(task, [], [], repository, { branch: 'aether/0193', files: [] }),
    ).toContain(
      'Your commits were rebased onto it in /workspace/repo without conflicts.',
    );
  });
});
