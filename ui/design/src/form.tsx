/** Shared form styling, so every form looks the same. */
export const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700";
export const buttonClass =
  "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50";
export const secondaryButtonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function FormError({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
      {error}
    </p>
  ) : null;
}
