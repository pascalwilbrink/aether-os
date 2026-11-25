import {
  allowedModes,
  initialMode,
  modeProblem,
  modeSection,
} from './modes.js';

const settings = {
  defaultMode: 'discussion' as const,
  allowDirectInteraction: true,
  allowDiscussion: true,
  allowPlanning: true,
  allowDelegation: false,
};

describe('session modes', () => {
  it('allows the modes the council allows', () => {
    expect(allowedModes(settings)).toEqual([
      'direct',
      'facilitated',
      'discussion',
      'planning',
    ]);
    expect(
      allowedModes({
        ...settings,
        allowDirectInteraction: false,
        allowDiscussion: false,
        allowPlanning: false,
      }),
    ).toEqual(['facilitated']);
  });

  it("starts in the council's default when it can, else facilitated", () => {
    expect(initialMode(settings)).toBe('discussion');
    expect(initialMode({ ...settings, defaultMode: 'planning' })).toBe(
      'planning',
    );
    expect(initialMode({ ...settings, defaultMode: 'delegation' })).toBe(
      'facilitated',
    );
    expect(
      initialMode({
        ...settings,
        defaultMode: 'direct',
        allowDirectInteraction: false,
      }),
    ).toBe('facilitated');
  });

  it('says why a mode is refused', () => {
    expect(modeProblem('facilitated', settings)).toBeNull();
    expect(modeProblem('delegation', settings)).toContain(
      "doesn't allow the delegation mode",
    );
    expect(
      modeProblem('direct', { ...settings, allowDirectInteraction: false }),
    ).toContain("doesn't allow the direct mode");
  });

  it('tells the facilitator how to work in the mode, and what it can switch to', () => {
    const text = modeSection('discussion', ['facilitated', 'discussion']);
    expect(text).toContain('Mode: discussion.');
    expect(text).toContain('start_round');
    expect(text).toContain('(facilitated)');
    expect(modeSection('facilitated', ['facilitated'])).not.toContain(
      'set_mode',
    );
  });
});
