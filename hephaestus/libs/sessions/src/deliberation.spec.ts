import {
  Deliberation,
  isRefusal,
  type Round,
  type RoundMember,
} from './deliberation.js';

const members: RoundMember[] = [
  { agentId: 'architect', name: 'Architect', participation: 'required' },
  { agentId: 'security', name: 'Security', participation: 'conditional' },
  { agentId: 'writer', name: 'Writer', participation: 'optional' },
];
const settings = {
  allowed: true,
  maxRounds: 2,
  allowAgentResponses: true,
  requireConclusion: true,
};
const now = new Date('2026-11-25T10:00:00Z');

const started = (deliberation: Deliberation, question = 'Q?'): Round => {
  const round = deliberation.start(question, [members[0]], now);
  if (isRefusal(round)) throw new Error(round.refused);
  return round;
};

describe('Deliberation', () => {
  it('takes the required members first, then those named, once each', () => {
    const deliberation = new Deliberation(settings, []);
    expect(
      deliberation.participantsFor(
        ['writer', 'architect', 'security', 'writer'],
        members,
      ),
    ).toEqual([members[0], members[2], members[1]]);
    expect(deliberation.participantsFor([], members)).toEqual([members[0]]);
    expect(deliberation.participantsFor(['facilitator'], members)).toEqual({
      refused: 'Not members of this council: facilitator.',
    });
    expect(deliberation.participantsFor([], [members[1]])).toMatchObject({
      refused: expect.stringContaining('needs participants'),
    });
  });

  it('numbers rounds, concludes them, and keeps what changed', () => {
    const deliberation = new Deliberation(settings, []);
    const round = started(deliberation);
    expect(round).toMatchObject({
      number: 1,
      status: 'open',
      participants: ['architect'],
    });
    expect(deliberation.open?.id).toBe(round.id);
    expect(deliberation.conclude('Agreed.', now)).toMatchObject({
      status: 'concluded',
      conclusion: 'Agreed.',
      concludedAt: now,
    });
    expect(deliberation.open).toBeNull();
    expect(deliberation.left).toBe(1);
    expect(deliberation.changed().map((changed) => changed.id)).toEqual([
      round.id,
    ]);
  });

  it('refuses a round while one is open when a conclusion is required, and past the limit', () => {
    const deliberation = new Deliberation(settings, []);
    started(deliberation);
    expect(deliberation.start('Again?', [members[0]], now)).toMatchObject({
      refused: expect.stringContaining('Round 1 is still open'),
    });
    deliberation.conclude('Done.', now);
    started(deliberation);
    deliberation.conclude('Done.', now);
    expect(deliberation.start('Third?', [members[0]], now)).toMatchObject({
      refused: expect.stringContaining('has had its 2 rounds'),
    });
    expect(deliberation.conclude('Nothing.', now)).toMatchObject({
      refused: expect.stringContaining('No round is open'),
    });
  });

  it('closes an open round without a conclusion when none is required', () => {
    const deliberation = new Deliberation(
      { ...settings, requireConclusion: false },
      [],
    );
    const first = started(deliberation);
    const second = started(deliberation, 'Next?');
    expect(second.number).toBe(2);
    const [closed] = deliberation.changed();
    expect(closed).toMatchObject({
      id: first.id,
      status: 'concluded',
      conclusion: null,
    });
  });

  it('starts from the rounds kept, and changes only its own copies', () => {
    const kept: Round = {
      id: 'r1',
      number: 1,
      question: 'Kept?',
      participants: ['architect'],
      status: 'open',
      conclusion: null,
      openedAt: now,
      concludedAt: null,
    };
    const deliberation = new Deliberation(settings, [kept]);
    expect(deliberation.describe()).toContain('Round 1 is open ("Kept?")');
    deliberation.conclude('Yes.', now);
    expect(kept.status).toBe('open');
    expect(deliberation.changed()).toEqual([
      expect.objectContaining({ id: 'r1', status: 'concluded' }),
    ]);
  });

  it('refuses everything, and says nothing, when the council has no discussion', () => {
    const deliberation = new Deliberation({ ...settings, allowed: false }, []);
    expect(deliberation.start('Q?', [members[0]], now)).toMatchObject({
      refused: expect.stringContaining("doesn't hold deliberation rounds"),
    });
    expect(deliberation.describe()).toBe('');
  });
});
