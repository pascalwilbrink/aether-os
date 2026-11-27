import { FixedPermissionEvaluator } from './permission-evaluator.js';
import {
  effectiveProjectRole,
  organizationRolesGrant,
  type OrganizationRole,
  type ProjectRole,
} from './permissions.js';
import type { Principal } from './principal.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const PROJECT = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const OTHER_PROJECT = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';

const principal = (overrides: Partial<Principal> = {}): Principal => ({
  sub: 'u1',
  subType: 'user',
  organizationId: ORG,
  organizationRoles: ['member'],
  projectRoles: {},
  projectId: null,
  taskId: null,
  taskTreeId: null,
  agentId: null,
  agentVersionId: null,
  sessionId: null,
  actor: null,
  scopes: [],
  ...overrides,
});

describe('permissions', () => {
  it('grants organization permissions per role, combining roles', () => {
    expect(organizationRolesGrant(['viewer'], 'agent:read')).toBe(true);
    expect(organizationRolesGrant(['viewer'], 'agent:write')).toBe(false);
    expect(organizationRolesGrant(['member'], 'agent:write')).toBe(true);
    expect(organizationRolesGrant(['member'], 'agent:publish')).toBe(false);
    expect(organizationRolesGrant(['viewer', 'admin'], 'agent:publish')).toBe(
      true,
    );
    expect(organizationRolesGrant(['admin'], 'idp:manage')).toBe(false);
    expect(organizationRolesGrant(['owner'], 'idp:manage')).toBe(true);
    expect(organizationRolesGrant([], 'org:read')).toBe(false);
  });

  it.each<[OrganizationRole[], ProjectRole | undefined, ProjectRole | null]>([
    [['owner'], undefined, 'admin'],
    [['admin'], 'viewer', 'admin'],
    [['member'], 'approver', 'approver'],
    [['member'], 'editor', 'editor'],
    [['member'], undefined, null],
    [['member'], 'admin', null],
    [['viewer'], 'approver', 'viewer'],
    [['viewer'], 'viewer', 'viewer'],
    [['viewer'], undefined, null],
    [[], 'editor', null],
  ])(
    'org roles %j with grant %s → effective project role %s',
    (roles, grant, expected) => {
      expect(effectiveProjectRole(roles, grant)).toBe(expected);
    },
  );
});

describe('FixedPermissionEvaluator', () => {
  const evaluator = new FixedPermissionEvaluator();

  it("keeps Episteme's reviews and publication for people; sessions read and draft", () => {
    const member = principal();
    const admin = principal({ organizationRoles: ['admin'] });
    const agent = principal({
      subType: 'service_account',
      organizationRoles: ['member'],
    });
    const session = principal({
      organizationRoles: ['admin'],
      projectId: PROJECT,
      sessionId: 's1',
    });
    expect(
      evaluator.hasOrganizationPermission(member, 'org:knowledge:review'),
    ).toBe(true);
    expect(
      evaluator.hasOrganizationPermission(member, 'org:knowledge:publish'),
    ).toBe(false);
    expect(
      evaluator.hasOrganizationPermission(admin, 'org:knowledge:publish'),
    ).toBe(true);
    expect(
      evaluator.hasOrganizationPermission(agent, 'org:knowledge:draft'),
    ).toBe(true);
    expect(
      evaluator.hasOrganizationPermission(agent, 'org:knowledge:review'),
    ).toBe(false);
    expect(
      evaluator.hasOrganizationPermission(session, 'org:knowledge:draft'),
    ).toBe(true);
    expect(
      evaluator.hasOrganizationPermission(session, 'org:knowledge:publish'),
    ).toBe(false);
  });

  it('checks project permissions against the effective role', () => {
    const editor = principal({ projectRoles: { [PROJECT]: 'editor' } });
    expect(evaluator.hasProjectPermission(editor, PROJECT, 'task:create')).toBe(
      true,
    );
    expect(
      evaluator.hasProjectPermission(editor, PROJECT, 'task:approve'),
    ).toBe(false);
    expect(
      evaluator.hasProjectPermission(editor, OTHER_PROJECT, 'project:read'),
    ).toBe(false);
    expect(
      evaluator.hasProjectPermission(
        principal({ organizationRoles: ['admin'] }),
        OTHER_PROJECT,
        'automation:manage',
      ),
    ).toBe(true);
  });

  it('never lets anyone but a user approve', () => {
    const roles = { organizationRoles: ['admin'] as OrganizationRole[] };
    expect(
      evaluator.hasProjectPermission(principal(roles), PROJECT, 'task:approve'),
    ).toBe(true);
    expect(
      evaluator.hasProjectPermission(
        principal({ ...roles, subType: 'service_account' }),
        PROJECT,
        'task:approve',
      ),
    ).toBe(false);
    // Knowledge too: agents propose it, people accept it.
    expect(
      evaluator.hasProjectPermission(
        principal(roles),
        PROJECT,
        'knowledge:approve',
      ),
    ).toBe(true);
    expect(
      evaluator.hasProjectPermission(
        principal({ ...roles, subType: 'service_account' }),
        PROJECT,
        'knowledge:approve',
      ),
    ).toBe(false);
    expect(
      evaluator.hasProjectPermission(
        principal({ ...roles, subType: 'service_account' }),
        PROJECT,
        'knowledge:write',
      ),
    ).toBe(true);
  });

  it('lets writers change work and everyone read it (Ergon)', () => {
    const member = principal({
      organizationRoles: ['member'],
      projectRoles: { [PROJECT]: 'viewer' },
    });
    expect(evaluator.hasProjectPermission(member, PROJECT, 'work:read')).toBe(
      true,
    );
    expect(evaluator.hasProjectPermission(member, PROJECT, 'work:write')).toBe(
      false,
    );
    expect(evaluator.hasOrganizationPermission(member, 'org:work:write')).toBe(
      true,
    );
    const viewer = principal({ organizationRoles: ['viewer'] });
    expect(evaluator.hasOrganizationPermission(viewer, 'org:work:read')).toBe(
      true,
    );
    expect(evaluator.hasOrganizationPermission(viewer, 'org:work:write')).toBe(
      false,
    );
  });

  it('limits task tokens to their project', () => {
    const task = principal({
      subType: 'service_account',
      projectId: PROJECT,
      projectRoles: { [PROJECT]: 'editor' },
    });
    expect(evaluator.hasProjectPermission(task, PROJECT, 'task:read')).toBe(
      true,
    );
    expect(
      evaluator.hasProjectPermission(
        { ...task, organizationRoles: ['admin'] },
        OTHER_PROJECT,
        'task:read',
      ),
    ).toBe(false);
  });

  it('gives platform permissions only to services, from their scopes', () => {
    const service = principal({
      subType: 'service',
      organizationId: null,
      organizationRoles: [],
      scopes: ['platform:read'],
    });
    expect(evaluator.hasPlatformPermission(service, 'platform:read')).toBe(
      true,
    );
    expect(evaluator.hasPlatformPermission(service, 'platform:manage')).toBe(
      false,
    );
    expect(
      evaluator.hasPlatformPermission(
        principal({ scopes: ['platform:read'] }),
        'platform:read',
      ),
    ).toBe(false);
    expect(evaluator.hasOrganizationPermission(service, 'org:read')).toBe(
      false,
    );
  });

  it('limits session tokens to reading their project, and model calls for sessions', () => {
    const session = (
      role: ProjectRole,
      orgRoles: OrganizationRole[] = ['member'],
    ) =>
      principal({
        organizationRoles: orgRoles,
        projectRoles: { [PROJECT]: role },
        projectId: PROJECT,
        sessionId: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5e',
        actor: { sub: 'hephaestus' },
      });
    const editor = session('editor');
    expect(evaluator.hasProjectPermission(editor, PROJECT, 'task:read')).toBe(
      true,
    );
    expect(
      evaluator.hasProjectPermission(editor, PROJECT, 'knowledge:read'),
    ).toBe(true);
    // Nothing that changes anything, whatever the person may do themselves.
    expect(evaluator.hasProjectPermission(editor, PROJECT, 'task:create')).toBe(
      false,
    );
    expect(
      evaluator.hasProjectPermission(editor, PROJECT, 'knowledge:write'),
    ).toBe(false);
    // Proposing knowledge, as the person could; never accepting it.
    expect(
      evaluator.hasProjectPermission(editor, PROJECT, 'knowledge:propose'),
    ).toBe(true);
    expect(
      evaluator.hasProjectPermission(
        session('viewer'),
        PROJECT,
        'knowledge:propose',
      ),
    ).toBe(false);
    expect(
      evaluator.hasProjectPermission(editor, PROJECT, 'knowledge:approve'),
    ).toBe(false);
    const admin = session('editor', ['owner']);
    expect(evaluator.hasProjectPermission(admin, PROJECT, 'task:approve')).toBe(
      false,
    );
    expect(evaluator.hasOrganizationPermission(admin, 'agent:write')).toBe(
      false,
    );
    expect(evaluator.hasOrganizationPermission(admin, 'agent:read')).toBe(true);
    // Work in Ergon: read, never changed from a session.
    expect(evaluator.hasProjectPermission(editor, PROJECT, 'work:read')).toBe(
      true,
    );
    expect(evaluator.hasProjectPermission(editor, PROJECT, 'work:write')).toBe(
      false,
    );
    expect(evaluator.hasOrganizationPermission(admin, 'org:work:read')).toBe(
      true,
    );
    expect(evaluator.hasOrganizationPermission(admin, 'org:work:write')).toBe(
      false,
    );
    // Model calls rest on session:use, which viewers have too.
    const viewer = session('viewer');
    expect(
      evaluator.hasProjectPermission(viewer, PROJECT, 'model:invoke'),
    ).toBe(true);
    expect(
      evaluator.hasProjectPermission(
        principal({ projectRoles: { [PROJECT]: 'viewer' } }),
        PROJECT,
        'model:invoke',
      ),
    ).toBe(false);
    // Only its own project.
    expect(
      evaluator.hasProjectPermission(editor, OTHER_PROJECT, 'task:read'),
    ).toBe(false);
  });
});
