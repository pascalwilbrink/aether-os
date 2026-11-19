import type {
  SkillSource,
  SkillSourceEntry,
  SkillSourceStat,
} from '@mastra/core/workspace';

/** Where an agent's skills are, for Mastra's skill tools. */
export const SKILLS_ROOT = '/skills';

/** Where their files are copied in a sandbox (writable, under the workspace). */
export const SANDBOX_SKILLS_ROOT = '/workspace/skills';

/** A skill's files as a run has them. */
export interface RunSkill {
  name: string;
  files: { path: string; content: string }[];
}

/**
 * The run's skills as Mastra reads them (`SkillSource`), from memory:
 * `/skills/<name>/<path>`, read-only. Nothing touches Hephaestus's own
 * filesystem.
 */
export class InMemorySkillSource implements SkillSource {
  private readonly files = new Map<string, string>();
  private readonly created = new Date(0);

  constructor(skills: readonly RunSkill[]) {
    for (const skill of skills) {
      for (const file of skill.files) {
        this.files.set(
          `${SKILLS_ROOT}/${skill.name}/${file.path}`,
          file.content,
        );
      }
    }
  }

  exists(path: string): Promise<boolean> {
    const at = normalize(path);
    return Promise.resolve(this.files.has(at) || this.isDirectory(at));
  }

  stat(path: string): Promise<SkillSourceStat> {
    const at = normalize(path);
    const content = this.files.get(at);
    if (content === undefined && !this.isDirectory(at)) {
      return Promise.reject(notFound(path));
    }
    return Promise.resolve({
      name: at.split('/').pop() ?? '',
      type: content === undefined ? 'directory' : 'file',
      size: content === undefined ? 0 : Buffer.byteLength(content),
      createdAt: this.created,
      modifiedAt: this.created,
    });
  }

  readFile(path: string): Promise<string> {
    const content = this.files.get(normalize(path));
    return content === undefined
      ? Promise.reject(notFound(path))
      : Promise.resolve(content);
  }

  readdir(path: string): Promise<SkillSourceEntry[]> {
    const at = normalize(path);
    if (!this.isDirectory(at)) {
      return Promise.reject(notFound(path));
    }
    const prefix = at === '/' ? '/' : `${at}/`;
    const entries = new Map<string, SkillSourceEntry['type']>();
    for (const file of this.files.keys()) {
      if (!file.startsWith(prefix)) continue;
      const [first, ...rest] = file.slice(prefix.length).split('/');
      if (entries.get(first) !== 'directory') {
        entries.set(first, rest.length > 0 ? 'directory' : 'file');
      }
    }
    return Promise.resolve(
      [...entries].map(([name, type]) => ({ name, type })),
    );
  }

  realpath(path: string): Promise<string> {
    return Promise.resolve(normalize(path));
  }

  private isDirectory(path: string): boolean {
    const prefix = path === '/' ? '/' : `${path}/`;
    for (const file of this.files.keys()) {
      if (file.startsWith(prefix)) return true;
    }
    return false;
  }
}

/** Absolute, no trailing slash, no `.` segments (`..` leads nowhere). */
function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function notFound(path: string): Error {
  return Object.assign(
    new Error(`ENOENT: no such file or directory, ${path}`),
    {
      code: 'ENOENT',
    },
  );
}
