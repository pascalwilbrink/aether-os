/** Signs out of Iris and Pistis (a POST, see app/auth/sign-out). */
export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button
        type="submit"
        className="text-sm text-zinc-600 underline dark:text-zinc-400"
      >
        Sign out
      </button>
    </form>
  );
}
