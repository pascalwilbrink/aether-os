/**
 * A form's text fields, so an action can return what was submitted: React
 * resets a form after its action, and a refused one should show the
 * person's input again (as `defaultValue`s).
 */
export const valuesOf = (form: FormData): Record<string, string> =>
  Object.fromEntries(
    [...form.entries()].filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
