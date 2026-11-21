import { checkSkillFiles, frontMatterOf } from './skill-files.js';

const skillMd = (name = 'code-review', description = 'Reviews a change') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# Review\n`;

describe('checkSkillFiles', () => {
  it('reads the name and description from SKILL.md', () => {
    expect(
      checkSkillFiles([
        { path: 'SKILL.md', content: skillMd() },
        { path: 'references/checklist.md', content: '- tests' },
      ]),
    ).toEqual({
      name: 'code-review',
      description: 'Reviews a change',
      sizeBytes: Buffer.byteLength(skillMd()) + 7,
    });
    expect(
      checkSkillFiles(
        [{ path: 'SKILL.md', content: skillMd() }],
        'code-review',
      ),
    ).toMatchObject({ name: 'code-review' });
  });

  it.each([
    [[{ path: 'README.md', content: 'x' }], 'A skill has a SKILL.md'],
    [
      [{ path: 'SKILL.md', content: '# no front matter' }],
      'starts with front matter',
    ],
    [
      [{ path: 'SKILL.md', content: skillMd('Code Review') }],
      "SKILL.md's name",
    ],
    [
      [{ path: 'SKILL.md', content: skillMd('code-review', '') }],
      "SKILL.md's description",
    ],
    [
      [
        { path: 'SKILL.md', content: skillMd() },
        { path: 'a/../b.md', content: '' },
      ],
      "isn't a path inside the skill",
    ],
    [
      [
        { path: 'SKILL.md', content: skillMd() },
        { path: 'SKILL.md', content: skillMd() },
      ],
      'is there twice',
    ],
    [
      [
        { path: 'SKILL.md', content: skillMd() },
        { path: 'big.txt', content: 'x'.repeat(1024 * 1024) },
      ],
      'at most 1 MiB',
    ],
  ])('refuses %#', (files, problem) => {
    expect(checkSkillFiles(files)).toEqual({
      problem: expect.stringContaining(problem),
    });
  });

  it('wants the name the skill already has', () => {
    expect(
      checkSkillFiles([{ path: 'SKILL.md', content: skillMd() }], 'other'),
    ).toEqual({
      problem: 'SKILL.md names the skill code-review, but it is other.',
    });
  });
});

describe('frontMatterOf', () => {
  it('reads simple values and unquotes them', () => {
    expect(
      frontMatterOf(
        '---\r\nname: "a-b"\r\ndescription: \'Does x: well\'\r\nlicense: |\r\n  MIT\r\n---\r\nbody',
      ),
    ).toEqual({ name: 'a-b', description: 'Does x: well' });
    expect(frontMatterOf('no')).toBeNull();
  });
});
