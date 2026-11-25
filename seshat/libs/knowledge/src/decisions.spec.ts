import { decisionOf, searchableText } from './decisions.js';

describe('decisions', () => {
  it("keeps a decision's rationale and alternatives", () => {
    expect(
      decisionOf('decision', {
        rationale: 'Fewer moving parts.',
        alternatives: [{ option: 'Kafka', reason: 'More to run.' }],
      }),
    ).toEqual({
      rationale: 'Fewer moving parts.',
      alternatives: [{ option: 'Kafka', reason: 'More to run.' }],
    });
    expect(decisionOf('decision', { rationale: '  ' })).toEqual({
      rationale: null,
      alternatives: [],
    });
  });

  it('refuses them on anything but a decision', () => {
    expect(() => decisionOf('fact', { rationale: 'Because.' })).toThrow(
      'Only a decision has a rationale and alternatives, not a fact.',
    );
    expect(decisionOf('fact', {})).toEqual({
      rationale: null,
      alternatives: [],
    });
  });

  it('makes the reasons searchable after the body', () => {
    expect(
      searchableText({
        body: 'Use RabbitMQ.',
        rationale: 'Fewer moving parts.',
        alternatives: [{ option: 'Kafka', reason: 'More to run.' }],
      }),
    ).toBe(
      'Use RabbitMQ.\n\n## Rationale\n\nFewer moving parts.\n\n## Alternatives\n\n- Kafka: More to run.',
    );
    expect(
      searchableText({ body: 'A fact.', rationale: null, alternatives: [] }),
    ).toBe('A fact.');
  });
});
