/**
 * Deno tests for redeemTenantComplimentaryAccessInvite.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/redeemTenantComplimentaryAccessInvite_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic — not real bearer tokens or tenant values.
 */

import {
  hashComplimentaryInviteToken,
} from "./complimentaryInviteToken.ts";
import {
  redeemTenantComplimentaryAccessInvite,
  type ComplimentaryInviteRedemptionRpcClient,
  type ComplimentaryInviteRedemptionRpcResponse,
  type RedeemTenantComplimentaryAccessInviteParams,
  type RedeemTenantComplimentaryAccessInviteResult,
} from "./redeemTenantComplimentaryAccessInvite.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const INVITE_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaa1";
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const REDEEMED_AT = "2026-03-26T12:00:00.000Z";

const SYNTHETIC_RAW_TOKEN = "synthetic-redeem-raw-token-must-not-leak";
const DISTINCTIVE_SECRET = "RAW_RPC_SECRET_DETAIL_MUST_NOT_LEAK";
const SYNTHETIC_FIXTURE = "abc";
const SYNTHETIC_FIXTURE_SHA256_HEX =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const TOKEN_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;

const RPC_NAME = "redeem_tenant_complimentary_access_invite";

const DOMAIN_FAILURE_REASONS = [
  "token_not_found",
  "invite_already_redeemed",
  "invite_revoked",
  "invite_expired",
] as const;

function assert(condition: boolean, message: string): asserts condition {
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

function expectSuccess(
  result: RedeemTenantComplimentaryAccessInviteResult,
): asserts result is Extract<
  RedeemTenantComplimentaryAccessInviteResult,
  { ok: true }
> {
  if (result.ok !== true) {
    throw new Error(`expected success, got ${JSON.stringify(result)}`);
  }
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "redemption"].sort(),
    "public success contract exposes only ok+redemption",
  );
  assertEquals(
    Object.keys(result.redemption).sort(),
    ["inviteId", "productTier", "redeemedAt", "tenantId"].sort(),
    "success redemption exposes only inviteId+tenantId+productTier+redeemedAt",
  );
}

function expectFailure(
  result: RedeemTenantComplimentaryAccessInviteResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(
      `expected failure ${reason}, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(result.reason, reason, "failure reason");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
  assert(
    !("redemption" in result) && !("inviteId" in result) &&
      !("tenantId" in result) && !("productTier" in result) &&
      !("redeemedAt" in result),
    "failure must not include invite data",
  );
}

type FakeRpcCall = {
  fn: string;
  args: Record<string, unknown>;
};

type FakeTrace = {
  calls: FakeRpcCall[];
};

function createFakeClient(
  result: ComplimentaryInviteRedemptionRpcResponse | (() => never),
  trace: FakeTrace,
): ComplimentaryInviteRedemptionRpcClient {
  const resolveResult = (): Promise<ComplimentaryInviteRedemptionRpcResponse> => {
    if (typeof result === "function") {
      try {
        result();
        return Promise.reject(new Error("expected throw"));
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return Promise.resolve(result);
  };

  const client = {
    rpc(fn: string, args: { p_token_hash: string }) {
      trace.calls.push({
        fn,
        args: { ...args },
      });
      return resolveResult();
    },
  };
  assert(
    !("from" in client) && !("insert" in client) && !("update" in client) &&
      !("upsert" in client) && !("delete" in client),
    "fake client must not expose table write surface",
  );
  return client;
}

function emptyTrace(): FakeTrace {
  return { calls: [] };
}

function successRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: true,
    reason: null,
    invite_id: INVITE_ID,
    tenant_id: TENANT_A,
    product_tier: "base",
    redeemed_at: REDEEMED_AT,
    ...overrides,
  };
}

function failureRow(
  reason: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ok: false,
    reason,
    invite_id: null,
    tenant_id: null,
    product_tier: null,
    redeemed_at: null,
    ...overrides,
  };
}

function rpcData(
  rows: unknown,
): ComplimentaryInviteRedemptionRpcResponse {
  return { data: rows, error: null };
}

function trackingHasher(impl?: typeof hashComplimentaryInviteToken): {
  hashRawToken: typeof hashComplimentaryInviteToken;
  inputs: unknown[];
} {
  const inputs: unknown[] = [];
  const hashRawToken: typeof hashComplimentaryInviteToken = async (rawToken) => {
    inputs.push(rawToken);
    if (impl) {
      return await impl(rawToken);
    }
    return await hashComplimentaryInviteToken(rawToken);
  };
  return { hashRawToken, inputs };
}

function baseParams(
  client: ComplimentaryInviteRedemptionRpcClient,
  overrides: Partial<RedeemTenantComplimentaryAccessInviteParams> = {},
): RedeemTenantComplimentaryAccessInviteParams {
  return {
    client,
    rawToken: SYNTHETIC_RAW_TOKEN,
    ...overrides,
  };
}

function assertZeroRpc(trace: FakeTrace, message: string): void {
  assertEquals(trace.calls.length, 0, `${message}: zero RPC`);
}

function assertSingleRpc(trace: FakeTrace, tokenHash: string): void {
  assertEquals(trace.calls.length, 1, "exactly one RPC");
  assertEquals(trace.calls[0]?.fn, RPC_NAME, "exact RPC function name");
  assertEquals(
    Object.keys(trace.calls[0]?.args ?? {}).sort(),
    ["p_token_hash"],
    "RPC args expose only p_token_hash",
  );
  assertEquals(
    trace.calls[0]?.args.p_token_hash,
    tokenHash,
    "p_token_hash matches BILLING-73 hash",
  );
  const payload = JSON.stringify(trace.calls[0]?.args);
  assert(
    !payload.includes(SYNTHETIC_RAW_TOKEN),
    "RPC args must not contain the raw token",
  );
}

function assertNoSensitiveLeak(
  result: RedeemTenantComplimentaryAccessInviteResult,
  extra: string[] = [],
): void {
  const serialized = JSON.stringify(result);
  for (
    const needle of [
      SYNTHETIC_RAW_TOKEN,
      DISTINCTIVE_SECRET,
      "service_role",
      "SQLSTATE",
      "PGRST",
      ...extra,
    ]
  ) {
    assert(!serialized.includes(needle), `must not leak ${needle}`);
  }
}

function inspectWrapperSource(): string {
  return redeemTenantComplimentaryAccessInvite.toString();
}

Deno.test("1-3. non-string, empty, and whitespace-only raw token → invalid_raw_token, zero RPC", async () => {
  const invalidInputs: unknown[] = [
    null,
    undefined,
    1,
    true,
    false,
    { rawToken: SYNTHETIC_RAW_TOKEN },
    [SYNTHETIC_RAW_TOKEN],
    "",
    " ",
    "   ",
    "\t",
    "\n",
    " \t\n ",
  ];
  for (const rawToken of invalidInputs) {
    const trace = emptyTrace();
    const hasher = trackingHasher();
    const result = await redeemTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(rpcData([successRow()]), trace), {
        rawToken,
        hashRawToken: hasher.hashRawToken,
      }),
    );
    expectFailure(result, "invalid_raw_token");
    assertZeroRpc(trace, "invalid raw token");
    assertEquals(hasher.inputs.length, 1, "hash helper called once");
    assertEquals(hasher.inputs[0], rawToken, "hash helper receives exact input");
    assertNoSensitiveLeak(result);
  }
});

Deno.test("4+9+10. valid token uses BILLING-73, exact RPC name, one call", async () => {
  const hashed = await hashComplimentaryInviteToken(SYNTHETIC_RAW_TOKEN);
  assert(hashed.ok === true, "fixture hashes");
  assert(
    TOKEN_HASH_HEX_PATTERN.test(hashed.tokenHash),
    "BILLING-73 hash is 64-char hex",
  );

  const trace = emptyTrace();
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(rpcData([successRow()]), trace)),
  );

  expectSuccess(result);
  assertSingleRpc(trace, hashed.tokenHash);
});

Deno.test("5. token with surrounding spaces is hashed without trim", async () => {
  const spaced = ` ${SYNTHETIC_FIXTURE} `;
  const expected = await hashComplimentaryInviteToken(spaced);
  const trimmed = await hashComplimentaryInviteToken(SYNTHETIC_FIXTURE);
  assert(expected.ok === true && trimmed.ok === true, "both hash");
  assert(
    expected.tokenHash !== trimmed.tokenHash,
    "whitespace must change the hash",
  );

  const hasher = trackingHasher();
  const trace = emptyTrace();
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(rpcData([successRow()]), trace), {
      rawToken: spaced,
      hashRawToken: hasher.hashRawToken,
    }),
  );

  expectSuccess(result);
  assertEquals(hasher.inputs[0], spaced, "exact spaced input, no trim");
  assertSingleRpc(trace, expected.tokenHash);
});

Deno.test("6. hash helper throw → token_hash_failed, zero RPC, no leak", async () => {
  const trace = emptyTrace();
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(rpcData([successRow()]), trace), {
      hashRawToken: async () => {
        throw new Error(
          `RAW_HASH_THROW ${DISTINCTIVE_SECRET} rawToken=${SYNTHETIC_RAW_TOKEN} stack=TRACE`,
        );
      },
    }),
  );

  expectFailure(result, "complimentary_invite_token_hash_failed");
  assertZeroRpc(trace, "hash throw");
  assertEquals(
    JSON.stringify(result),
    '{"ok":false,"reason":"complimentary_invite_token_hash_failed"}',
    "sanitized hash failure",
  );
  assertNoSensitiveLeak(result, ["RAW_HASH_THROW", "stack=TRACE"]);
});

Deno.test("7+8. raw token is not passed to RPC; hash is p_token_hash", async () => {
  const expected = await hashComplimentaryInviteToken(SYNTHETIC_FIXTURE);
  assert(expected.ok === true, "fixture hashes");
  assertEquals(
    expected.tokenHash,
    SYNTHETIC_FIXTURE_SHA256_HEX,
    "known SHA-256 of abc",
  );

  const hasher = trackingHasher();
  const trace = emptyTrace();
  await redeemTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(rpcData([successRow()]), trace), {
      rawToken: SYNTHETIC_FIXTURE,
      hashRawToken: hasher.hashRawToken,
    }),
  );

  assertEquals(hasher.inputs[0], SYNTHETIC_FIXTURE, "hash input is raw token");
  assertSingleRpc(trace, SYNTHETIC_FIXTURE_SHA256_HEX);
  assert(
    !Object.prototype.hasOwnProperty.call(trace.calls[0]?.args, "rawToken"),
    "RPC must not have rawToken",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(trace.calls[0]?.args, "token"),
    "RPC must not have token",
  );
});

Deno.test("11. domain failure is not retried", async () => {
  const trace = emptyTrace();
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(rpcData([failureRow("token_not_found")]), trace),
    ),
  );
  expectFailure(result, "token_not_found");
  assertEquals(trace.calls.length, 1, "no retry on domain failure");
});

Deno.test("12+14+15. RPC error != null → rpc_failed sanitized, no retry", async () => {
  const hashed = await hashComplimentaryInviteToken(SYNTHETIC_RAW_TOKEN);
  assert(hashed.ok === true, "fixture hashes");
  const trace = emptyTrace();
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "42501",
            message: `permission denied ${DISTINCTIVE_SECRET} ${SYNTHETIC_RAW_TOKEN}`,
            details: `SQLSTATE 42501 hint=GRANT ${hashed.tokenHash}`,
            hint: "Grant execute to service_role PGRST301",
          },
        },
        trace,
      ),
    ),
  );

  expectFailure(result, "complimentary_invite_redemption_rpc_failed");
  assertEquals(trace.calls.length, 1, "no retry on transport error");
  assertEquals(
    JSON.stringify(result),
    '{"ok":false,"reason":"complimentary_invite_redemption_rpc_failed"}',
    "sanitized RPC failure",
  );
  assertNoSensitiveLeak(result, [
    "42501",
    "permission denied",
    hashed.tokenHash,
    "GRANT",
    "hint",
  ]);
});

Deno.test("13. RPC throw → rpc_failed sanitized", async () => {
  const trace = emptyTrace();
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(() => {
        throw new Error(
          `socket hang up ${DISTINCTIVE_SECRET} ${SYNTHETIC_RAW_TOKEN}`,
        );
      }, trace),
    ),
  );

  expectFailure(result, "complimentary_invite_redemption_rpc_failed");
  assertEquals(trace.calls.length, 1, "RPC was attempted once");
  assertNoSensitiveLeak(result, ["socket hang"]);
});

Deno.test("16-19. domain failure reasons are preserved without invite data", async () => {
  for (const reason of DOMAIN_FAILURE_REASONS) {
    const trace = emptyTrace();
    const result = await redeemTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(rpcData([failureRow(reason)]), trace)),
    );
    expectFailure(result, reason);
    assertEquals(trace.calls.length, 1, `${reason}: one RPC`);
    assertNoSensitiveLeak(result);
    assert(
      !("invite_id" in result) && !("tenant_id" in result),
      `${reason}: no invite data`,
    );
  }
});

Deno.test("20+22-28. Base success maps snake_case fields and hides secrets", async () => {
  const hashed = await hashComplimentaryInviteToken(SYNTHETIC_RAW_TOKEN);
  assert(hashed.ok === true, "fixture hashes");
  const trace = emptyTrace();
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(
        rpcData([successRow({ grant_kind: "complimentary", issued_by: "x" })]),
        trace,
      ),
    ),
  );

  expectSuccess(result);
  assertEquals(result.redemption.inviteId, INVITE_ID, "inviteId mapping");
  assertEquals(result.redemption.tenantId, TENANT_A, "tenantId mapping");
  assertEquals(result.redemption.productTier, "base", "productTier base");
  assertEquals(result.redemption.redeemedAt, REDEEMED_AT, "redeemedAt mapping");
  assertEquals(trace.calls.length, 1, "exact one-row success uses one RPC");

  const serialized = JSON.stringify(result);
  assert(!serialized.includes(SYNTHETIC_RAW_TOKEN), "no rawToken");
  assert(!serialized.includes(hashed.tokenHash), "no tokenHash");
  assert(!serialized.includes("grant_kind"), "no grant_kind");
  assert(!serialized.includes("issued_by"), "no issued_by");
  assert(!serialized.includes("tokenHash"), "must not name tokenHash");
  assert(!serialized.includes("rawToken"), "must not name rawToken");
});

Deno.test("21. Pro success maps productTier pro", async () => {
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(
        rpcData([successRow({ product_tier: "pro" })]),
        emptyTrace(),
      ),
    ),
  );
  expectSuccess(result);
  assertEquals(result.redemption.productTier, "pro", "productTier pro");
});

Deno.test("30-43. malformed RPC payloads are invalid_response and never success", async () => {
  const hashed = await hashComplimentaryInviteToken(SYNTHETIC_RAW_TOKEN);
  assert(hashed.ok === true, "fixture hashes");

  const cases: Array<{ name: string; response: ComplimentaryInviteRedemptionRpcResponse }> = [
    { name: "data null", response: { data: null, error: null } },
    { name: "data empty", response: { data: [], error: null } },
    {
      name: "multiple rows",
      response: { data: [successRow(), successRow()], error: null },
    },
    { name: "non-object row", response: { data: ["not-a-row"], error: null } },
    { name: "array row", response: { data: [[]], error: null } },
    { name: "null row", response: { data: [null], error: null } },
    {
      name: "invalid ok",
      response: { data: [successRow({ ok: "true" })], error: null },
    },
    {
      name: "success reason non-null",
      response: { data: [successRow({ reason: "token_not_found" })], error: null },
    },
    {
      name: "missing invite_id",
      response: {
        data: [successRow({ invite_id: undefined })],
        error: null,
      },
    },
    {
      name: "invalid invite_id",
      response: { data: [successRow({ invite_id: "not-a-uuid" })], error: null },
    },
    {
      name: "padded invite_id",
      response: {
        data: [successRow({ invite_id: ` ${INVITE_ID} ` })],
        error: null,
      },
    },
    {
      name: "missing tenant_id",
      response: {
        data: [successRow({ tenant_id: undefined })],
        error: null,
      },
    },
    {
      name: "invalid tenant_id",
      response: { data: [successRow({ tenant_id: "tenant-a" })], error: null },
    },
    {
      name: "invalid product_tier free",
      response: { data: [successRow({ product_tier: "free" })], error: null },
    },
    {
      name: "invalid product_tier BASE",
      response: { data: [successRow({ product_tier: "BASE" })], error: null },
    },
    {
      name: "invalid product_tier paid",
      response: { data: [successRow({ product_tier: "paid" })], error: null },
    },
    {
      name: "missing redeemed_at",
      response: {
        data: [successRow({ redeemed_at: undefined })],
        error: null,
      },
    },
    {
      name: "invalid redeemed_at",
      response: { data: [successRow({ redeemed_at: "not-a-date" })], error: null },
    },
    {
      name: "empty redeemed_at",
      response: { data: [successRow({ redeemed_at: "" })], error: null },
    },
    {
      name: "unknown domain failure reason",
      response: { data: [failureRow("invite_not_redeemable")], error: null },
    },
    {
      name: "failure invite_id non-null",
      response: {
        data: [failureRow("token_not_found", { invite_id: INVITE_ID })],
        error: null,
      },
    },
    {
      name: "failure tenant_id non-null",
      response: {
        data: [failureRow("invite_revoked", { tenant_id: TENANT_A })],
        error: null,
      },
    },
    {
      name: "failure product_tier non-null",
      response: {
        data: [failureRow("invite_expired", { product_tier: "base" })],
        error: null,
      },
    },
    {
      name: "failure redeemed_at non-null",
      response: {
        data: [failureRow("invite_already_redeemed", { redeemed_at: REDEEMED_AT })],
        error: null,
      },
    },
    {
      name: "bare object data",
      response: { data: successRow(), error: null },
    },
  ];

  for (const { name, response } of cases) {
    const trace = emptyTrace();
    const result = await redeemTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(response, trace)),
    );
    expectFailure(result, "complimentary_invite_redemption_invalid_response");
    assertEquals(result.ok, false, `${name}: never success`);
    assertEquals(trace.calls.length, 1, `${name}: one RPC, no retry`);
    assertNoSensitiveLeak(result, [hashed.tokenHash]);
  }
});

Deno.test("envelope missing error field is invalid_response, never success, one RPC", async () => {
  const trace = emptyTrace();
  const malformed = { data: [successRow()] } as ComplimentaryInviteRedemptionRpcResponse;
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(malformed, trace)),
  );

  expectFailure(result, "complimentary_invite_redemption_invalid_response");
  assertEquals(result.ok, false, "missing error must never succeed");
  assertEquals(trace.calls.length, 1, "exactly one RPC");
  assert(
    !Object.prototype.hasOwnProperty.call(malformed, "error"),
    "fixture omits the error property",
  );
});

Deno.test("envelope with error undefined is invalid_response, never success, one RPC", async () => {
  const trace = emptyTrace();
  const malformed = {
    data: [successRow()],
    error: undefined,
  } as unknown as ComplimentaryInviteRedemptionRpcResponse;
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(malformed, trace)),
  );

  expectFailure(result, "complimentary_invite_redemption_invalid_response");
  assertEquals(result.ok, false, "undefined error must never succeed");
  assertEquals(trace.calls.length, 1, "exactly one RPC");
  assert(
    Object.prototype.hasOwnProperty.call(malformed, "error"),
    "fixture keeps an explicit undefined error property",
  );
  assertEquals(malformed.error, undefined, "error is undefined, not null");
});

Deno.test("44-47. wrapper source has no table writes, auth, operator allowlist, env, IAM, or Stripe", () => {
  const source = inspectWrapperSource();
  for (
    const forbidden of [
      ".from(",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      "Deno.env",
      "createClient",
      "fetch(",
      "authorizeComplimentaryGrantOperator",
      "COMPLIMENTARY_GRANT_OPERATOR_USER_IDS",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "tenant_memberships",
      "profiles",
      "default_tenant_id",
      "auth.users",
      "Stripe",
      "STRIPE_",
      "billing_events",
      "tenant_subscriptions",
      "console.log",
      "console.error",
    ]
  ) {
    assert(!source.includes(forbidden), `wrapper must not reference ${forbidden}`);
  }
});

Deno.test("48-50. failure and success serialization hide raw token and DB errors", async () => {
  const hashed = await hashComplimentaryInviteToken(SYNTHETIC_RAW_TOKEN);
  assert(hashed.ok === true, "fixture hashes");

  const failure = await redeemTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(
        {
          data: [{ ok: true, reason: null }],
          error: null,
        },
        emptyTrace(),
      ),
    ),
  );
  expectFailure(failure, "complimentary_invite_redemption_invalid_response");
  assertNoSensitiveLeak(failure, [hashed.tokenHash]);

  const success = await redeemTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(rpcData([successRow()]), emptyTrace())),
  );
  expectSuccess(success);
  assertNoSensitiveLeak(success, [hashed.tokenHash]);
});

Deno.test("hash helper unexpected failure reason is hash_failed, zero RPC", async () => {
  const trace = emptyTrace();
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(rpcData([successRow()]), trace), {
      hashRawToken: async () => ({
        ok: false,
        reason: " complimentary_invite_token_generation_failed" as never,
      }),
    }),
  );
  expectFailure(result, "complimentary_invite_token_hash_failed");
  assertZeroRpc(trace, "unexpected hash reason");
});

Deno.test("Date redeemed_at is accepted and mapped to ISO", async () => {
  const when = new Date("2026-04-01T08:15:30.000Z");
  const result = await redeemTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(
        rpcData([successRow({ redeemed_at: when })]),
        emptyTrace(),
      ),
    ),
  );
  expectSuccess(result);
  assertEquals(
    result.redemption.redeemedAt,
    "2026-04-01T08:15:30.000Z",
    "Date redeemed_at becomes ISO",
  );
});
