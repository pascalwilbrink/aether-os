"use client";

import { useSyncExternalStore } from "react";

const EVENT = "iris-storage";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A value remembered in this browser (localStorage), as React state that
 * follows changes from other tabs too; null before hydration and when
 * storage is blocked.
 */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
}

/** Remembers a value (if storage allows) and tells every `useStoredValue`. */
export function storeValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}
