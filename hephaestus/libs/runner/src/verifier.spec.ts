import type { ApiTypes } from '@hephaestus/core';

import type { Sandbox } from './sandbox-provisioner.js';
import { Verifier } from './verifier.js';

const criterion = (deliverable: string): ApiTypes.AcceptanceCriterion => ({
  key: `deliverable.${deliverable}`,
  description: `Deliverable ${deliverable}`,
  check: { type: 'artifact', deliverable },
  source: 'deliverable',
});

const artifact = (
  overrides: Partial<ApiTypes.ArtifactResponse>,
): ApiTypes.ArtifactResponse =>
  ({
    kind: 'text',
    status: 'pending',
    primary: false,
    title: 'x',
    deliverableKey: null,
    ...overrides,
  }) as ApiTypes.ArtifactResponse;

/** A sandbox whose `git rev-list --count` answers `stdout`. */
function sandboxCounting(stdout: string, exitCode = 0) {
  const calls: { command: string; args: string[] }[] = [];
  const sandbox = {
    agentSandbox: {
      executeCommand: (command: string, args: string[]) => {
        calls.push({ command, args });
        return Promise.resolve({ exitCode, stdout, stderr: 'boom' });
      },
    },
  } as unknown as Sandbox;
  return { sandbox, calls };
}

describe('Verifier: deliverables', () => {
  const verifier = new Verifier();
  const deliverables: ApiTypes.TaskDeliverable[] = [
    { key: 'notes', kind: 'text', description: 'Notes' },
    { key: 'pr', kind: 'pull_request', description: 'The fix' },
  ];

  it('passes a deliverable an artifact was submitted for, not a partial one', async () => {
    const [passed] = await verifier.verify({
      criteria: [criterion('notes')],
      deliverables,
      artifacts: [artifact({ deliverableKey: 'notes' })],
      sandbox: null,
    });
    expect(passed.outcome).toBe('passed');
    const [failed] = await verifier.verify({
      criteria: [criterion('notes')],
      deliverables,
      artifacts: [artifact({ deliverableKey: 'notes', status: 'partial' })],
      sandbox: null,
    });
    expect(failed).toMatchObject({
      outcome: 'failed',
      output:
        'Nothing was submitted for the deliverable notes (set deliverable: "notes" when submitting it).',
    });
  });

  it('passes a pull request deliverable when the run committed on top of its base', async () => {
    const { sandbox, calls } = sandboxCounting('2\n');
    const [passed] = await verifier.verify({
      criteria: [criterion('pr')],
      deliverables,
      artifacts: [],
      sandbox,
      repository: { path: '/workspace/repo', baseSha: 'abc' },
    });
    expect(passed).toMatchObject({
      outcome: 'passed',
      output: '2 commits for the pull request.',
    });
    expect(calls).toEqual([
      {
        command: 'git',
        args: ['-C', '/workspace/repo', 'rev-list', '--count', 'abc..HEAD'],
      },
    ]);

    const [nothing] = await verifier.verify({
      criteria: [criterion('pr')],
      deliverables,
      artifacts: [],
      sandbox: sandboxCounting('0').sandbox,
      repository: { path: '/workspace/repo', baseSha: 'abc' },
    });
    expect(nothing.outcome).toBe('failed');
    const [noRepository] = await verifier.verify({
      criteria: [criterion('pr')],
      deliverables,
      artifacts: [],
      sandbox: null,
    });
    expect(noRepository.output).toContain('has no repository to commit in');
  });

  it("throws when git can't count the commits (never a pass)", async () => {
    await expect(
      verifier.verify({
        criteria: [criterion('pr')],
        deliverables,
        artifacts: [],
        sandbox: sandboxCounting('', 128).sandbox,
        repository: { path: '/workspace/repo', baseSha: 'abc' },
      }),
    ).rejects.toThrow("Couldn't count the commits");
  });
});
