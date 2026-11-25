import "server-only";

import { notFound } from "next/navigation";

import { ApiError } from "./api/http";

/** The resource, or Next's not-found page when Polis says there's none (404). */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

/** The organization's pages, under `/orgs/<id>`. */
export const orgPath = (organizationId: string, path = "") =>
  `/orgs/${organizationId}${path}`;

/** "1 person", "3 people". */
export const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
/** "1 team", "3 teams". */
export const teamCount = (n: number) => `${n} team${n === 1 ? "" : "s"}`;
