import { decisionsSection } from './decisions.js';

describe('decisions and syntheses', () => {
  it('tells the facilitator to record decisions and write syntheses', () => {
    const text = decisionsSection({
      decisions: true,
      requireSynthesis: true,
      syntheses: 2,
    });
    expect(text).toContain('record_decision');
    expect(text).toContain('This council requires a synthesis');
    expect(text).toContain('The session has 2 so far.');
  });

  it('leaves decisions out without Seshat, and asks rather than requires a synthesis', () => {
    const text = decisionsSection({
      decisions: false,
      requireSynthesis: false,
      syntheses: 0,
    });
    expect(text).not.toContain('record_decision');
    expect(text).toContain('After a discussion');
    expect(text).not.toContain('so far');
  });
});
