import { InMemorySkillSource } from './skill-files-source.js';

describe('InMemorySkillSource', () => {
  const source = new InMemorySkillSource([
    {
      name: 'review',
      files: [
        { path: 'SKILL.md', content: '---\nname: review\n---' },
        { path: 'references/checklist.md', content: '- tests' },
      ],
    },
  ]);

  it('serves the skills under /skills/<name>', async () => {
    await expect(source.readdir('/skills')).resolves.toEqual([
      { name: 'review', type: 'directory' },
    ]);
    await expect(source.readdir('/skills/review/')).resolves.toEqual([
      { name: 'SKILL.md', type: 'file' },
      { name: 'references', type: 'directory' },
    ]);
    await expect(
      source.readFile('/skills/review/references/checklist.md'),
    ).resolves.toBe('- tests');
    await expect(source.stat('/skills/review/SKILL.md')).resolves.toMatchObject(
      {
        type: 'file',
        size: 20,
      },
    );
    await expect(source.exists('/skills/review/references')).resolves.toBe(
      true,
    );
  });

  it("finds nothing outside them, and doesn't climb out", async () => {
    await expect(source.exists('/etc/passwd')).resolves.toBe(false);
    await expect(
      source.readFile('/skills/review/../../etc/passwd'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(source.readdir('/nowhere')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
