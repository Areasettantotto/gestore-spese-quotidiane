/**
 * Cryptographic primitives for complimentary invite bearer tokens.
 *
 * Raw token: 32 CSPRNG bytes encoded as unpadded base64url. Opaque; no
 * tenant, tier, issuer, timestamp, or email is embedded.
 * Persisted hash: SHA-256 of the raw token UTF-8 bytes, lowercase hex.
 *
 * Does not persist, log, read env, touch the network, or open a database.
 * Authorization and invite writes live elsewhere.
 */

const RAW_TOKEN_BYTE_LENGTH = 32;
const TOKEN_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;

export type ComplimentaryInviteTokenPair = {
  rawToken: string;
  tokenHash: string;
};

export type HashComplimentaryInviteTokenFailureReason = "invalid_raw_token";

export type HashComplimentaryInviteTokenResult =
  | { ok: true; tokenHash: string }
  | { ok: false; reason: HashComplimentaryInviteTokenFailureReason };

function fail(
  reason: HashComplimentaryInviteTokenFailureReason,
): HashComplimentaryInviteTokenResult {
  return { ok: false, reason };
}

function succeed(tokenHash: string): HashComplimentaryInviteTokenResult {
  return { ok: true, tokenHash };
}

function isUsableRawToken(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function toLowerHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

async function sha256Utf8LowerHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toLowerHex(new Uint8Array(digest));
}

/**
 * Hash a caller-supplied raw bearer token for lookup against token_hash.
 * Fail-closed on non-string, empty, and whitespace-only input.
 * Does not trim: leading or trailing whitespace is part of the hashed value.
 * Never returns the raw token.
 */
export async function hashComplimentaryInviteToken(
  rawToken: unknown,
): Promise<HashComplimentaryInviteTokenResult> {
  if (!isUsableRawToken(rawToken)) {
    return fail("invalid_raw_token");
  }

  const tokenHash = await sha256Utf8LowerHex(rawToken);
  if (!TOKEN_HASH_HEX_PATTERN.test(tokenHash)) {
    return fail("invalid_raw_token");
  }

  return succeed(tokenHash);
}

/**
 * Generate a one-time complimentary invite bearer token and its persistable hash.
 * The raw token is returned only to the immediate caller; it is never stored here.
 */
export async function generateComplimentaryInviteToken(): Promise<
  ComplimentaryInviteTokenPair
> {
  const bytes = new Uint8Array(RAW_TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  const rawToken = encodeBase64Url(bytes);
  const hashed = await hashComplimentaryInviteToken(rawToken);
  if (hashed.ok === false) {
    throw new Error("invite token hash failed");
  }
  return { rawToken, tokenHash: hashed.tokenHash };
}
