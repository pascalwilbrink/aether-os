import type { Principal } from '../auth/principal.js';
import { runAsPrincipal } from '../auth/request-context.js';

/** A principal for tests; by default a platform operator (every platform permission). */
export function testPrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: 'operator',
    subType: 'service',
    organizationId: null,
    organizationRoles: [],
    projectRoles: {},
    projectId: null,
    taskId: null,
    taskTreeId: null,
    agentId: null,
    agentVersionId: null,
    actor: null,
    scopes: ['platform:read', 'platform:manage'],
    ...overrides,
  };
}

/**
 * `target` with every method call running as `principal`, for integration
 * tests that call services directly (outside an HTTP request):
 * `service = actingAs(moduleRef.get(ProjectsService), testPrincipal())`.
 */
export function actingAs<T extends object>(target: T, principal: Principal): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver);
      return typeof value === 'function'
        ? (...args: unknown[]) =>
            runAsPrincipal(principal, () =>
              (value as (...a: unknown[]) => unknown).apply(object, args),
            )
        : value;
    },
  });
}
