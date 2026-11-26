/** A `blocks` edge: `from` must be finished before `to`. */
export interface BlocksEdge {
  from: string;
  to: string;
}

/**
 * Whether adding `from` blocks `to` would close a cycle: it does when `to`
 * already leads to `from` through `blocks` edges (or they're the same).
 * `edges` needs to hold at least every edge reachable from `to`.
 */
export function createsCycle(
  edges: readonly BlocksEdge[],
  from: string,
  to: string,
): boolean {
  if (from === to) {
    return true;
  }
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }
  const seen = new Set<string>([to]);
  const queue = [to];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbour of next.get(current) ?? []) {
      if (neighbour === from) {
        return true;
      }
      if (!seen.has(neighbour)) {
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
  }
  return false;
}

/** `relates_to` has no direction: it's stored with the smaller ID first. */
export function relatedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
