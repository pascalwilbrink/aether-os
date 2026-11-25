const MESSAGES: Record<string, string> = {
  access_denied:
    "You can't enter that organization: you're not a member, or it's suspended.",
  expired: "That sign-in took too long. Please try again.",
  "sign-in-failed": "Signing in failed. Please try again.",
  "pistis-unavailable":
    "Pistis, which signs you in, can't be reached right now. It may still be starting: try again in a moment.",
};

/** A message for an `?error=` code from the sign-in flow. */
export function Notice({ error }: { error: string | undefined }) {
  if (!error) {
    return null;
  }
  return (
    <p
      role="alert"
      className="mb-6 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {MESSAGES[error] ?? "Something went wrong. Please try again."}
    </p>
  );
}
