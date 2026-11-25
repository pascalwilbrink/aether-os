/** The person's choice of look: light, dark, or the system's. */
export type Theme = "system" | "light" | "dark";

/** A stored theme, or the system's when there's none (or it's not one). */
export function themeOf(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/**
 * A script for the page's <head> that puts the stored theme on <html>
 * before the first paint, so a dark page never flashes light. `ThemeSwitch`
 * changes it later; both read and write `storageKey` in localStorage.
 */
export function themeScript(storageKey: string): string {
  return `try{var t=localStorage.getItem(${JSON.stringify(storageKey)});document.documentElement.className=t==="light"||t==="dark"?t:"system"}catch(e){}`;
}
