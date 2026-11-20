/** Pure helpers for the projects overview and the new-project form. */

/** Polis's slug rule: lowercase letters, digits and single hyphens, 3 to 63 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A slug suggested from a name: "Billing API v2!" → "billing-api-v2". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/, "");
}

export interface NewProjectFields {
  name: string;
  slug: string;
  description: string;
}

/** The fields from the form, trimmed, or what's wrong with them (before asking Polis). */
export function newProjectRequest(
  fields: NewProjectFields,
): { request: NewProjectFields } | { error: string } {
  const name = fields.name.trim();
  const slug = fields.slug.trim();
  const description = fields.description.trim();
  if (!name) return { error: "Give the project a name." };
  if (name.length > 200)
    return { error: "The name is too long (200 characters at most)." };
  if (slug.length < 3 || slug.length > 63 || !SLUG_PATTERN.test(slug)) {
    return {
      error:
        "The slug needs 3 to 63 lowercase letters, digits and single dashes.",
    };
  }
  if (description.length > 2000)
    return { error: "The description is too long (2,000 characters at most)." };
  return { request: { name, slug, description } };
}

/** Whether the overview shows archived projects too (`?show=all`). */
export function showArchived(show: string | string[] | undefined): boolean {
  return show === "all";
}
