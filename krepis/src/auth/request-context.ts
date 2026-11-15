import { AsyncLocalStorage } from 'node:async_hooks';

import type { EventActor } from '../event/domain-event.js';
import type { Principal } from './principal.js';

/** Per-request state, created for every HTTP request by `configureHttpApp`. */
export interface RequestContext {
  /** Set by the authentication guard once the token checks out. */
  principal?: Principal;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with a fresh request context. */
export function runWithRequestContext<T>(fn: () => T): T {
  return storage.run({}, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The authenticated principal of the current request, if any. */
export function currentPrincipal(): Principal | undefined {
  return storage.getStore()?.principal;
}

/** The current principal as an event's `actor` (docs/events.md), or null. */
export function currentActor(): EventActor | null {
  const principal = currentPrincipal();
  if (!principal) {
    return null;
  }
  return {
    sub: principal.sub,
    sub_type: principal.subType,
    ...(principal.actor ? { act: { sub: principal.actor.sub } } : {}),
  };
}

/**
 * Runs `fn` as `principal`, as if it arrived with that token: for
 * integration tests that call services directly, and for work a service
 * does on someone's behalf outside a request.
 */
export function runAsPrincipal<T>(principal: Principal, fn: () => T): T {
  return storage.run({ principal }, fn);
}
