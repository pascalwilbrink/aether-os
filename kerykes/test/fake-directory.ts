import type {
  Directory,
  MemberInfo,
  ProjectGrantInfo,
  UserInfo,
} from '@kerykes/directory';

/** Polis and Pistis as Kerykes sees them, set up by each test. */
export class FakeDirectory implements Directory {
  readonly members = new Map<string, MemberInfo[]>();
  readonly grants = new Map<string, ProjectGrantInfo[]>();
  readonly projects = new Map<string, string>();
  readonly users = new Map<string, UserInfo>();
  /** Organizations whose members were asked for. */
  readonly synced: string[] = [];
  /** Set to make every call fail, as an unreachable service would. */
  down = false;

  organizationMembers(organizationId: string): Promise<MemberInfo[]> {
    if (this.down) return Promise.reject(new Error('Polis is down'));
    this.synced.push(organizationId);
    return Promise.resolve(this.members.get(organizationId) ?? []);
  }

  projectGrants(
    organizationId: string,
    sub: string,
  ): Promise<ProjectGrantInfo[]> {
    if (this.down) return Promise.reject(new Error('Polis is down'));
    return Promise.resolve(this.grants.get(`${organizationId}:${sub}`) ?? []);
  }

  projectName(
    _organizationId: string,
    projectId: string,
  ): Promise<string | null> {
    if (this.down) return Promise.reject(new Error('Polis is down'));
    return Promise.resolve(this.projects.get(projectId) ?? null);
  }

  user(sub: string): Promise<UserInfo | null> {
    if (this.down) return Promise.reject(new Error('Pistis is down'));
    return Promise.resolve(this.users.get(sub) ?? null);
  }
}
