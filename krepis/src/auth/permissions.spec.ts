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
});
