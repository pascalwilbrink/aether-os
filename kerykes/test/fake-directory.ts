import type {
  Directory,
  MemberInfo,
  ProjectGrantInfo,
  UserInfo,
  WorkAssigneeInfo,
} from '@kerykes/directory';

/** Polis, Pistis and Ergon as Kerykes sees them, set up by each test. */
export class FakeDirectory implements Directory {
  readonly members = new Map<string, MemberInfo[]>();
  readonly grants = new Map<string, ProjectGrantInfo[]>();
  readonly projects = new Map<string, string>();
  readonly users = new Map<string, UserInfo>();
  /** Polis's persons: person ID → the user they're linked to. */
  readonly persons = new Map<string, string>();
  /** Ergon's active assignments, per work item. */
  readonly work = new Map<string, WorkAssigneeInfo[]>();
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

  personUser(
    _organizationId: string,
    personId: string,
  ): Promise<string | null> {
    if (this.down) return Promise.reject(new Error('Polis is down'));
    return Promise.resolve(this.persons.get(personId) ?? null);
  }

  workAssignments(
    _organizationId: string,
    workItemId: string,
  ): Promise<WorkAssigneeInfo[] | null> {
    if (this.down) return Promise.reject(new Error('Ergon is down'));
    return Promise.resolve(this.work.get(workItemId) ?? null);
  }
}
