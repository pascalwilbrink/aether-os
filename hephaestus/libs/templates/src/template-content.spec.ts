import {
  effectiveTemplate,
  render,
  TemplateProblem,
  type TemplateContent,
} from './template-content.js';

const AGENT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a9';

const fixBug: TemplateContent = {
  title: 'Fix {{issue}}',
  instructions: 'Fix the bug in {{ issue }}. {{notes}}',
  agentId: AGENT,
  inputs: [
    { name: 'issue', description: 'The issue' },
    { name: 'notes', required: false },
  ],
  acceptanceCriteria: [
    {
      key: 'tests-pass',
      description: 'The tests pass',
      check: { type: 'command', command: 'pnpm test' },
    },
  ],
  review: { artifactKinds: ['json'] },
};

describe('effectiveTemplate', () => {
  it('is the content itself without extends, inputs required by default', () => {
    expect(effectiveTemplate(fixBug)).toEqual({
      title: 'Fix {{issue}}',
      instructions: 'Fix the bug in {{ issue }}. {{notes}}',
      agentId: AGENT,
      inputs: [
        { name: 'issue', description: 'The issue', required: true },
        { name: 'notes', required: false },
      ],
      acceptanceCriteria: fixBug.acceptanceCriteria,
      review: { artifactKinds: ['json'] },
    });
  });

  it('builds on what it extends: instructions appended, inputs and criteria added', () => {
    const base = effectiveTemplate(fixBug);
    const project = effectiveTemplate(
      {
        instructions: 'Also update the changelog for {{service}}.',
        inputs: [{ name: 'service' }],
        acceptanceCriteria: [
          {
            key: 'changelog',
            description: 'The changelog mentions the fix',
            check: { type: 'manual' },
          },
        ],
        review: { artifactKinds: ['text'] },
      },
      base,
    );
    expect(project).toMatchObject({
      title: 'Fix {{issue}}',
      instructions:
        'Fix the bug in {{ issue }}. {{notes}}\n\nAlso update the changelog for {{service}}.',
      agentId: AGENT,
      review: { artifactKinds: ['json', 'text'] },
    });
    expect(project.inputs.map((input) => input.name)).toEqual([
      'issue',
      'notes',
      'service',
    ]);
    expect(project.acceptanceCriteria.map((c) => c.key)).toEqual([
      'tests-pass',
      'changelog',
    ]);
  });

  it("can't redefine what it extends, or leave something out", () => {
    const base = effectiveTemplate(fixBug);
    expect(() =>
      effectiveTemplate(
        { acceptanceCriteria: fixBug.acceptanceCriteria },
        base,
      ),
    ).toThrow('tests-pass is defined twice');
    expect(() =>
      effectiveTemplate({ inputs: [{ name: 'issue' }] }, base),
    ).toThrow('issue is declared twice');
    expect(() => effectiveTemplate({ title: 'Nothing else' })).toThrow(
      TemplateProblem,
    );
    expect(() =>
      effectiveTemplate({ ...fixBug, title: 'Fix {{ticket}}' }),
    ).toThrow('Placeholders without an input: ticket');
  });
});

describe('render', () => {
  const template = effectiveTemplate(fixBug);

  it('fills in the inputs; optional ones left out are empty', () => {
    expect(render(template, { issue: '#42' })).toEqual({
      title: 'Fix #42',
      instructions: 'Fix the bug in #42. ',
    });
  });

  it('needs every required input, and only declared ones', () => {
    expect(() => render(template, {})).toThrow('Missing inputs: issue');
    expect(() => render(template, { issue: '#1', other: 'x' })).toThrow(
      'Unknown inputs: other',
    );
    expect(() => render(template, { issue: 'x'.repeat(300) })).toThrow(
      '1 to 200 characters',
    );
  });
});
