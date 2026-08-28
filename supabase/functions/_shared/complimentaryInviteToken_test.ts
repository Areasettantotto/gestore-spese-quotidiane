/**
 * Deno tests for complimentary invite token primitives.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/complimentaryInviteToken_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic; no real bearer tokens or PII.
 */

import {
  generateComplimentaryInviteToken,
  hashComplimentaryInviteToken,
  type HashComplimentaryInviteTokenFailureReason,
  type HashComplimentaryInviteTokenResult,
} from "./complimentaryInviteToken.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const TOKEN_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_ALPHABET_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RAW_TOKEN_BYTE_LENGTH = 32;
const EXPECTED_UNPADDED_BASE64URL_LENGTH = Math.ceil(
  (RAW_TOKEN_BYTE_LENGTH * 4) / 3,
);

const SYNTHETIC_FIXTURE = "abc";
const SYNTHETIC_FIXTURE_SHA256_HEX =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const DISTINCTIVE_SECRET = "synthetic-raw-token-must-not-leak";
const UNIQUENESS_SAMPLE_SIZE = 64;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}\n  actual:   ${actualJson}\n  expected: ${expectedJson}`,
    );
  }
}

function expectHashSuccess(
  result: HashComplimentaryInviteTokenResult,
): asserts result is Extract<
  HashComplimentaryInviteTokenResult,
  { ok: true }
> {
  if (result.ok !== true) {
    throw new Error(
      `expected hash success, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "tokenHash"].sort(),
    "public hash success contract exposes only ok+tokenHash",
  );
  assert(
    !("rawToken" in result),
    "hash success must not return rawToken",
  );
}

function expectHashFailure(
  result: HashComplimentaryInviteTokenResult,
  reason: HashComplimentaryInviteTokenFailureReason,
): void {
  if (result.ok !== false) {
    throw new Error(
      `expected hash failure ${reason}, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(result.reason, reason, "failure reason");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public hash failure contract exposes only ok+reason",
  );
}

function assertFailureDoesNotExposeInput(
  result: HashComplimentaryInviteTokenResult,
  input: unknown,
): void {
  const serialized = JSON.stringify(result);
  if (typeof input === "string" && input.length > 0) {
    assert(
      !serialized.includes(input),
      "failure must not expose the raw token",
    );
  }
  if (input !== null && typeof input === "object") {
    const nested = JSON.stringify(input);
    assert(
      !serialized.includes(nested),
      "failure must not expose object input",
    );
    if (
      "rawToken" in input &&
      typeof (input as { rawToken: unknown }).rawToken === "string"
    ) {
      const leaked = (input as { rawToken: string }).rawToken;
      assert(
        !serialized.includes(leaked),
        "failure must not expose nested rawToken",
      );
    }
  }
  assert(
    !serialized.includes(DISTINCTIVE_SECRET),
    "failure must not expose distinctive secret fixtures",
  );
}

function inspectExportedSource(): string {
  return [
    generateComplimentaryInviteToken.toString(),
    hashComplimentaryInviteToken.toString(),
  ].join("\n");
}

Deno.test("1. generation returns a non-empty raw token", async () => {
  const generated = await generateComplimentaryInviteToken();
  assert(typeof generated.rawToken === "string", "rawToken is a string");
  assert(generated.rawToken.length > 0, "rawToken is non-empty");
});

Deno.test("2. generation returns a non-empty tokenHash", async () => {
  const generated = await generateComplimentaryInviteToken();
  assert(typeof generated.tokenHash === "string", "tokenHash is a string");
  assert(generated.tokenHash.length > 0, "tokenHash is non-empty");
});

Deno.test("3. tokenHash matches lowercase 64-char hex", async () => {
  const generated = await generateComplimentaryInviteToken();
  assert(
    TOKEN_HASH_HEX_PATTERN.test(generated.tokenHash),
    "tokenHash must match ^[0-9a-f]{64}$",
  );
});

Deno.test("4. raw token uses only the base64url alphabet", async () => {
  const generated = await generateComplimentaryInviteToken();
  assert(
    BASE64URL_ALPHABET_PATTERN.test(generated.rawToken),
    "raw token must use only A-Z a-z 0-9 - _",
  );
});

Deno.test("5. raw token does not contain + / = or whitespace", async () => {
  const generated = await generateComplimentaryInviteToken();
  assert(!generated.rawToken.includes("+"), "raw token must not contain +");
  assert(!generated.rawToken.includes("/"), "raw token must not contain /");
  assert(!generated.rawToken.includes("="), "raw token must not contain =");
  assert(
    !/\s/.test(generated.rawToken),
    "raw token must not contain whitespace",
  );
});

Deno.test(
  "6. 32-byte raw entropy implies unpadded base64url length 43",
  async () => {
    assertEquals(
      EXPECTED_UNPADDED_BASE64URL_LENGTH,
      43,
      "ceil(32 * 4 / 3) is 43 unpadded base64url characters",
    );
    const generated = await generateComplimentaryInviteToken();
    assertEquals(
      generated.rawToken.length,
      EXPECTED_UNPADDED_BASE64URL_LENGTH,
      "raw token length matches 32-byte unpadded base64url",
    );
  },
);

Deno.test("7. two consecutive generations produce different raw tokens", async () => {
  const first = await generateComplimentaryInviteToken();
  const second = await generateComplimentaryInviteToken();
  assert(
    first.rawToken !== second.rawToken,
    "consecutive raw tokens must differ",
  );
});

Deno.test("8. two consecutive generations produce different hashes", async () => {
  const first = await generateComplimentaryInviteToken();
  const second = await generateComplimentaryInviteToken();
  assert(
    first.tokenHash !== second.tokenHash,
    "consecutive token hashes must differ",
  );
});

Deno.test(
  "9. hashComplimentaryInviteToken(generated.rawToken) matches generated.tokenHash",
  async () => {
    const generated = await generateComplimentaryInviteToken();
    const rehashed = await hashComplimentaryInviteToken(generated.rawToken);
    expectHashSuccess(rehashed);
    assertEquals(
      rehashed.tokenHash,
      generated.tokenHash,
      "rehash of generated raw token must match generation hash",
    );
  },
);

Deno.test("10. hash is deterministic on a synthetic fixture", async () => {
  const first = await hashComplimentaryInviteToken(SYNTHETIC_FIXTURE);
  const second = await hashComplimentaryInviteToken(SYNTHETIC_FIXTURE);
  expectHashSuccess(first);
  expectHashSuccess(second);
  assertEquals(first.tokenHash, second.tokenHash, "same input same hash");
  assertEquals(
    first.tokenHash,
    SYNTHETIC_FIXTURE_SHA256_HEX,
    "UTF-8 SHA-256 hex of synthetic fixture abc",
  );
});

Deno.test("11. hashes of different tokens differ", async () => {
  const first = await hashComplimentaryInviteToken("alpha-token");
  const second = await hashComplimentaryInviteToken("beta-token");
  expectHashSuccess(first);
  expectHashSuccess(second);
  assert(
    first.tokenHash !== second.tokenHash,
    "different raw tokens must produce different hashes",
  );
});

Deno.test("12. uppercase and lowercase raw tokens are distinct inputs", async () => {
  const lower = await hashComplimentaryInviteToken("abCdef");
  const upper = await hashComplimentaryInviteToken("ABCDEF");
  const mixed = await hashComplimentaryInviteToken("abcdef");
  expectHashSuccess(lower);
  expectHashSuccess(upper);
  expectHashSuccess(mixed);
  assert(lower.tokenHash !== upper.tokenHash, "abCdef !== ABCDEF");
  assert(mixed.tokenHash !== upper.tokenHash, "abcdef !== ABCDEF");
  assert(lower.tokenHash !== mixed.tokenHash, "abCdef !== abcdef");
});

Deno.test("13. leading and trailing whitespace is not trimmed before hash", async () => {
  const plain = await hashComplimentaryInviteToken(SYNTHETIC_FIXTURE);
  const leading = await hashComplimentaryInviteToken(` ${SYNTHETIC_FIXTURE}`);
  const trailing = await hashComplimentaryInviteToken(`${SYNTHETIC_FIXTURE} `);
  const both = await hashComplimentaryInviteToken(` ${SYNTHETIC_FIXTURE} `);
  expectHashSuccess(plain);
  expectHashSuccess(leading);
  expectHashSuccess(trailing);
  expectHashSuccess(both);
  assert(
    leading.tokenHash !== plain.tokenHash,
    "leading whitespace must change the hash",
  );
  assert(
    trailing.tokenHash !== plain.tokenHash,
    "trailing whitespace must change the hash",
  );
  assert(
    both.tokenHash !== plain.tokenHash,
    "surrounding whitespace must change the hash",
  );
  assert(
    leading.tokenHash !== trailing.tokenHash,
    "leading and trailing whitespace are distinct",
  );
});

Deno.test("14. empty string fails closed", async () => {
  const result = await hashComplimentaryInviteToken("");
  expectHashFailure(result, "invalid_raw_token");
  assertFailureDoesNotExposeInput(result, "");
});

Deno.test("15. whitespace-only string fails closed", async () => {
  for (const blank of [" ", "   ", "\t", "\n", " \t\n "]) {
    const result = await hashComplimentaryInviteToken(blank);
    expectHashFailure(result, "invalid_raw_token");
    assertFailureDoesNotExposeInput(result, blank);
  }
});

Deno.test("16. null, undefined, and non-string fail closed", async () => {
  const invalidInputs: unknown[] = [
    null,
    undefined,
    1,
    true,
    false,
    { rawToken: DISTINCTIVE_SECRET },
    [DISTINCTIVE_SECRET],
  ];
  for (const input of invalidInputs) {
    const result = await hashComplimentaryInviteToken(input);
    expectHashFailure(result, "invalid_raw_token");
    assertFailureDoesNotExposeInput(result, input);
  }
});

Deno.test("17. failure does not expose the raw token", async () => {
  const objectInput = { rawToken: DISTINCTIVE_SECRET };
  const result = await hashComplimentaryInviteToken(objectInput);
  expectHashFailure(result, "invalid_raw_token");
  assertFailureDoesNotExposeInput(result, objectInput);
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes(DISTINCTIVE_SECRET),
    "serialized failure must not contain the distinctive secret",
  );
});

Deno.test("18. helper does not use DB, env, or network", () => {
  assertEquals(
    generateComplimentaryInviteToken.length,
    0,
    "generation takes no caller arguments",
  );
  const source = inspectExportedSource();
  for (
    const forbidden of [
      "Deno.env",
      "createClient",
      "fetch(",
      "localStorage",
      "tenant_memberships",
      "persistTenantComplimentaryAccessGrant",
      "authorizeComplimentaryGrantOperator",
      "COMPLIMENTARY_GRANT_OPERATOR_USER_IDS",
      "console.log",
      "Stripe",
    ]
  ) {
    assert(
      !source.includes(forbidden),
      `exported helpers must not reference ${forbidden}`,
    );
  }
});

Deno.test("19. generated token is opaque: no UUID, tenant, or tier embedding", async () => {
  const generated = await generateComplimentaryInviteToken();
  assert(
    !UUID_PATTERN.test(generated.rawToken),
    "raw token must not be a UUID",
  );
  const source = inspectExportedSource();
  for (
    const forbidden of [
      "tenant_id",
      "product_tier",
      "issued_by",
      "expires_at",
    ]
  ) {
    assert(
      !source.includes(forbidden),
      `generation must not embed ${forbidden}`,
    );
  }
  assertEquals(
    Object.keys(generated).sort(),
    ["rawToken", "tokenHash"].sort(),
    "generation public contract is rawToken+tokenHash only",
  );
});

Deno.test("20. repeated generation on a small sample yields unique tokens", async () => {
  const rawTokens = new Set<string>();
  const hashes = new Set<string>();
  for (let i = 0; i < UNIQUENESS_SAMPLE_SIZE; i++) {
    const generated = await generateComplimentaryInviteToken();
    assert(
      BASE64URL_ALPHABET_PATTERN.test(generated.rawToken),
      "sample raw token stays in the base64url alphabet",
    );
    assert(
      TOKEN_HASH_HEX_PATTERN.test(generated.tokenHash),
      "sample tokenHash stays 64-char lowercase hex",
    );
    rawTokens.add(generated.rawToken);
    hashes.add(generated.tokenHash);
  }
  assertEquals(
    rawTokens.size,
    UNIQUENESS_SAMPLE_SIZE,
    "sample raw tokens must be unique",
  );
  assertEquals(
    hashes.size,
    UNIQUENESS_SAMPLE_SIZE,
    "sample token hashes must be unique",
  );
});
