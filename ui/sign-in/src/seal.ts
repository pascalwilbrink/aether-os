import { EncryptJWT, jwtDecrypt, base64url } from "jose";

/**
 * Seals a value into an encrypted, authenticated string (a JWE with
 * `dir` + `A256GCM`, the key derived from `secret` with SHA-256) and opens
 * it again. Used for the apps' cookies: the browser can't read or change them.
 */
async function key(secret: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return new Uint8Array(digest);
}

export async function seal(
  value: Record<string, unknown>,
  secret: string,
  maxAgeSeconds: number,
): Promise<string> {
  return new EncryptJWT({ v: value })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .encrypt(await key(secret));
}

/** The sealed value, or null if it was tampered with, expired, or isn't one. */
export async function unseal<T>(
  sealed: string | undefined,
  secret: string,
): Promise<T | null> {
  if (!sealed) {
    return null;
  }
  try {
    const { payload } = await jwtDecrypt(sealed, await key(secret));
    return (payload.v as T) ?? null;
  } catch {
    return null;
  }
}

/** Random URL-safe value (state, nonce). */
export function randomToken(bytes = 32): string {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(bytes)));
}
