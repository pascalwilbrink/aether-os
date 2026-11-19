import { describe, expect, it } from "vitest";

import { inboxFilter, notificationHref, unreadBadge } from "./notifications";

const ORG = "0193a1b2-c3d4-7e5f-8a9b-000000000001";
const OTHER = "0193a1b2-c3d4-7e5f-8a9b-000000000002";
const PROJECT = "0193a1b2-c3d4-7e5f-8a9b-000000000003";

describe("notification helpers", () => {
  it("opens only this organization's pages in Iris", () => {
    const task = `/orgs/${ORG}/projects/${PROJECT}/tasks/${PROJECT}`;
    expect(notificationHref({ link: task }, ORG)).toBe(task);
    expect(notificationHref({ link: `${task}#budget` }, ORG)).toBe(`${task}#budget`);
    expect(notificationHref({ link: `/orgs/${ORG}` }, ORG)).toBe(`/orgs/${ORG}`);
    expect(notificationHref({ link: `/orgs/${ORG}/budget` }, ORG)).toBe(`/orgs/${ORG}/budget`);

    for (const link of [
      "https://evil.example/orgs",
      "//evil.example",
      `/orgs/${OTHER}/budget`,
      `/orgs/${ORG}/../../auth/sign-out`,
      `/orgs/${ORG}/budget?next=https://evil.example`,
      "javascript:alert(1)",
    ]) {
      expect(notificationHref({ link }, ORG)).toBe(`/orgs/${ORG}`);
    }
  });

  it("counts unread for the inbox link", () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(7)).toBe("7");
    expect(unreadBadge(120)).toBe("99+");
  });

  it("shows unread ones unless asked for all", () => {
    expect(inboxFilter(undefined)).toBe("unread");
    expect(inboxFilter("all")).toBe("all");
    expect(inboxFilter(["all"])).toBe("unread");
  });
});
