/**
 * What a form's Server Function returns: an error to show, and what was
 * submitted, so a refused form shows the person's input again (React resets
 * a form after its action; the fields take these as `defaultValue`s).
 */
export interface FormState {
  error?: string;
  /** Set after a change was saved, to say so. */
  saved?: boolean;
  values?: FormValues;
}

export interface FormValues {
  text: Record<string, string>;
  /** The departments checked. */
  departmentIds: string[];
}

/** A text field, trimmed ("" when absent). */
export const textOf = (form: FormData, name: string): string =>
  String(form.get(name) ?? "").trim();

/** An optional text field: null when left empty. */
export const optionalTextOf = (form: FormData, name: string): string | null =>
  textOf(form, name) || null;

/** The checked departments (`departmentIds` checkboxes), without repeats. */
export const departmentIdsOf = (form: FormData): string[] => [
  ...new Set(
    form
      .getAll("departmentIds")
      .filter((value): value is string => typeof value === "string"),
  ),
];

/** What was submitted, for `FormState.values`. */
export const valuesOf = (form: FormData): FormValues => ({
  text: Object.fromEntries(
    [...form.entries()].filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" &&
        entry[0] !== "departmentIds" &&
        !entry[0].startsWith("$"),
    ),
  ),
  departmentIds: departmentIdsOf(form),
});
