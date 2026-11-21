import type { ApiTypes } from '@hephaestus/core';

export type UntrustedInput = ApiTypes.UntrustedInput;

/** `{{name}}` of an untrusted input (names have dots, unlike template inputs'). */
const REFERENCE = /\{\{\s*([a-z][a-z0-9._-]{0,63})\s*\}\}/g;

/**
 * Text with its untrusted inputs filled in (docs/git.md, Untrusted input):
 * each `{{name}}` of an input becomes its value, or what `wrap` makes of it
 * (the agent's prompt marks it as data). One pass, so a value naming another
 * input is never filled in again; other `{{…}}` stay as they are.
 */
export function fillUntrusted(
  text: string,
  inputs: readonly UntrustedInput[],
  wrap: (input: UntrustedInput) => string = (input) => input.value,
): string {
  if (inputs.length === 0) return text;
  const byName = new Map(inputs.map((input) => [input.name, input]));
  return text.replace(REFERENCE, (whole, name: string) => {
    const input = byName.get(name);
    return input ? wrap(input) : whole;
  });
}

/** Whether the text names one of the inputs. */
export function namesUntrusted(
  text: string,
  inputs: readonly UntrustedInput[],
): boolean {
  return fillUntrusted(text, inputs, () => '\u0000').includes('\u0000');
}
