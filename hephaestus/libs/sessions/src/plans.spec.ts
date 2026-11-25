import {
  checkedPlan,
  creationOrder,
  plansSection,
  withAssignments,
  type PlanContent,
  type PlanProposal,
} from './plans.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const members = [A, B];

const proposal: PlanProposal = {
  title: 'Passkeys',
  summary: 'Add passkey sign-in.',
  milestones: [
    { key: 'design', title: 'Agreed design' },
    { key: 'build', title: 'Working sign-in', dependsOn: ['design'] },
  ],
  entries: [
    {
      key: 'api',
      title: 'Draft the API',
      description: 'Write it.',
      agentId: A,
      milestoneKey: 'design',
    },
    {
      key: 'threat',
      title: 'Threat model',
      description: 'Model it.',
      agentId: B,
      milestoneKey: 'design',
    },
    {
      key: 'code',
      title: 'Build it',
      description: 'Code it.',
      agentId: A,
      milestoneKey: 'build',
    },
    {
      key: 'review',
      title: 'Review it',
      description: 'Check it.',
      agentId: B,
      dependsOn: ['code'],
    },
  ],
};

const planOf = (input: PlanProposal): PlanContent => {
  const checked = checkedPlan(input, members);
  if ('problems' in checked) throw new Error(checked.problems.join(' '));
  return checked.plan;
};

describe('council plans', () => {
  it('keeps a valid plan, its outcome the last entry by default', () => {
    const plan = planOf(proposal);
    expect(plan.outcomeEntryKey).toBe('review');
    expect(
      planOf({ ...proposal, outcomeEntryKey: 'code' }).outcomeEntryKey,
    ).toBe('code');
  });

  it('says everything wrong with a plan at once', () => {
    const checked = checkedPlan(
      {
        ...proposal,
        milestones: [
          { key: 'design', title: 'x', dependsOn: ['nowhere'] },
          { key: 'design', title: 'y' },
        ],
        entries: [
          {
            key: 'api',
            title: 't',
            description: 'd',
            agentId: 'stranger',
            dependsOn: ['ghost'],
          },
          {
            key: 'api',
            title: 't',
            description: 'd',
            agentId: A,
            milestoneKey: 'later',
          },
        ],
        outcomeEntryKey: 'missing',
      },
      members,
    );
    expect('problems' in checked && checked.problems).toEqual([
      'Two entries have the key "api".',
      'Two milestones have the key "design".',
      'Entry "api" is assigned to stranger, who isn\'t a member of this council.',
      'Entry "api" depends on "ghost", which isn\'t an entry of the plan.',
      'Entry "api" is in milestone "later", which isn\'t one of the plan\'s.',
      'Milestone "design" depends on "nowhere", which isn\'t one of the plan\'s.',
      'The outcome entry "missing" isn\'t an entry of the plan.',
    ]);
    expect(checkedPlan({ ...proposal, entries: [] }, members)).toEqual({
      problems: expect.arrayContaining(['A plan needs at least one entry.']),
    });
  });

  it('refuses a plan whose entries wait on each other', () => {
    const checked = checkedPlan(
      {
        ...proposal,
        entries: [
          {
            key: 'a',
            title: 't',
            description: 'd',
            agentId: A,
            dependsOn: ['b'],
          },
          {
            key: 'b',
            title: 't',
            description: 'd',
            agentId: B,
            dependsOn: ['a'],
          },
        ],
      },
      members,
    );
    expect('problems' in checked && checked.problems[0]).toContain('cycle');
  });

  it("orders entries so each comes after what it waits for, its milestone's dependencies included", () => {
    const order = creationOrder(planOf(proposal));
    expect(
      order?.map(({ entry, dependsOn }) => [entry.key, dependsOn]),
    ).toEqual([
      ['api', []],
      ['threat', []],
      ['code', ['api', 'threat']],
      ['review', ['code']],
    ]);
  });

  it("applies a reviewer's assignments to members only", () => {
    const plan = planOf(proposal);
    const assigned = withAssignments(
      plan,
      [{ entryKey: 'code', agentId: B }],
      members,
    );
    expect('plan' in assigned && assigned.plan.entries[2].agentId).toBe(B);
    expect('changed' in assigned && [...assigned.changed]).toEqual(['code']);
    expect(
      withAssignments(plan, [{ entryKey: 'nope', agentId: B }], members),
    ).toEqual({
      problem: '"nope" isn\'t an entry of the plan.',
    });
    expect(
      withAssignments(plan, [{ entryKey: 'code', agentId: 'x' }], members),
    ).toEqual({
      problem: "x isn't a member of this council.",
    });
  });

  it('tells the facilitator where its plans stand', () => {
    const text = plansSection(
      [
        {
          number: 1,
          title: 'First',
          status: 'changes_requested',
          comment: 'Smaller.',
          tasks: [],
          taskStatus: null,
        },
        {
          number: 2,
          title: 'Second',
          status: 'approved',
          comment: null,
          tasks: [{ entryKey: 'code', title: 'Build it', status: 'failed' }],
          taskStatus: 'failed',
        },
      ],
      true,
    );
    expect(text).toContain(
      'Plan 1, "First": changes requested (the person said: "Smaller.")',
    );
    expect(text).toContain('its tasks: code failed (the plan task: failed)');
    expect(text).toContain('propose a revised plan that answers the comment');
    expect(text).toContain('say what failed');
  });
});
