/**
 * Deno tests for createTenantComplimentaryAccessInvite.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/createTenantComplimentaryAccessInvite_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic — not real tenant, operator, or bearer values.
 */

import {
  generateComplimentaryInviteToken,
} from "./complimentaryInviteToken.ts";
import {
  COMPLIMENTARY_INVITE_LIFETIME_MS,
  createTenantComplimentaryAccessInvite,
  type ComplimentaryInviteInsertWriteValues,
  type ComplimentaryInvitePersistenceClient,
  type ComplimentaryInvitePersistenceWriteResponse,
  type CreateTenantComplimentaryAccessInviteParams,
  type CreateTenantComplimentaryAccessInviteResult,
} from "./createTenantComplimentaryAccessInvite.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const OPERATOR_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea1";
const OPERATOR_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea2";
const STRANGER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeaf";
const INVITE_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaa1";

const TOKEN_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;
const SYNTHETIC_RAW_TOKEN = "synthetic-invite-raw-token-fixture";
const SYNTHETIC_TOKEN_HASH =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const FIXED_NOW = new Date("2026-03-26T12:00:00.000Z");
const EXPECTED_EXPIRES_AT = new Date(
  FIXED_NOW.getTime() + COMPLIMENTARY_INVITE_LIFETIME_MS,
);

const FORBIDDEN_TABLES = [
  "tenant_complimentary_access_grants",
  "tenant_memberships",
  "profiles",
  "tenant_subscriptions",
  "tenant_billing_customers",
  "billing_events",
  "auth.users",
] as const;

const FORBIDDEN_WRITE_KEYS = [
  "id",
  "created_at",
  "redeemed_at",
  "revoked_at",
  "rawToken",
  "raw_token",
  "token",
  "source",
  "recipient",
  "email",
  "membership",
  "granted_at",
  "granted_by",
  "plan_code",
  "provider",
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
  result: CreateTenantComplimentaryAccessInviteResult,
): asserts result is Extract<
  CreateTenantComplimentaryAccessInviteResult,
  { ok: true }
> {
  if (result.ok !== true) {
    throw new Error(
      `expected success, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(
    Object.keys(result).sort(),
    ["invite", "ok"].sort(),
    "public success contract exposes only ok+invite",
  );
  assertEquals(
    Object.keys(result.invite).sort(),
    ["expiresAt", "id", "productTier", "rawToken", "tenantId"].sort(),
    "success invite exposes only id+tenantId+productTier+expiresAt+rawToken",
  );
  assert(
    !("tokenHash" in result) && !("tokenHash" in result.invite),
    "success must not expose tokenHash",
  );
}

function expectFailure(
  result: CreateTenantComplimentaryAccessInviteResult,
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
    !("invite" in result) && !("rawToken" in result),
    "failure must not include invite or rawToken",
  );
}

type FakeInsertCall = {
  method: "insert";
  table: string;
  values: Record<string, unknown>;
  selectColumns: string;
};

type FakeTrace = {
  fromTables: string[];
  calls: FakeInsertCall[];
};

function createFakeClient(
  result: ComplimentaryInvitePersistenceWriteResponse | (() => never),
  trace: FakeTrace,
): ComplimentaryInvitePersistenceClient {
  const resolveResult = (): Promise<
    ComplimentaryInvitePersistenceWriteResponse
  > => {
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

  return {
    from(table: string) {
      trace.fromTables.push(table);
      const tableApi = {
        insert(values: ComplimentaryInviteInsertWriteValues) {
          return {
            select(columns: string) {
              return {
                maybeSingle() {
                  trace.calls.push({
                    method: "insert",
                    table,
                    values: { ...values },
                    selectColumns: columns,
                  });
                  return resolveResult();
                },
              };
            },
          };
        },
      };
      assert(
        !("upsert" in tableApi) && !("onConflict" in tableApi) &&
          !("update" in tableApi) && !("delete" in tableApi) &&
          !("select" in tableApi),
        "fake table surface must not expose upsert/onConflict/update/delete/select",
      );
      return tableApi;
    },
  };
}

function emptyTrace(): FakeTrace {
  return { fromTables: [], calls: [] };
}

function confirmedRow(
  overrides: Partial<ComplimentaryInvitePersistenceWriteResponse["data"]> = {},
): ComplimentaryInvitePersistenceWriteResponse {
  return {
    data: {
      id: INVITE_ID,
      tenant_id: TENANT_A,
      product_tier: "base",
      expires_at: EXPECTED_EXPIRES_AT.toISOString(),
      ...overrides,
    },
    error: null,
  };
}

function trackingGenerator(pair?: {
  rawToken: string;
  tokenHash: string;
}): {
  generateToken: typeof generateComplimentaryInviteToken;
  calls: number;
} {
  const state = { calls: 0 };
  const generateToken: typeof generateComplimentaryInviteToken = async () => {
    state.calls += 1;
    if (pair) {
      return pair;
    }
    return await generateComplimentaryInviteToken();
  };
  return {
    generateToken,
    get calls() {
      return state.calls;
    },
  };
}

function syntheticPair(): { rawToken: string; tokenHash: string } {
  return {
    rawToken: SYNTHETIC_RAW_TOKEN,
    tokenHash: SYNTHETIC_TOKEN_HASH,
  };
}

function baseParams(
  client: ComplimentaryInvitePersistenceClient,
  overrides: Partial<CreateTenantComplimentaryAccessInviteParams> = {},
): CreateTenantComplimentaryAccessInviteParams {
  return {
    client,
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: `${OPERATOR_A},${OPERATOR_B}`,
    tenantId: TENANT_A,
    productTier: "base",
    now: () => FIXED_NOW,
    ...overrides,
  };
}

function assertInsertCall(
  call: FakeInsertCall | undefined,
): asserts call is FakeInsertCall {
  assert(
    call !== undefined && call.method === "insert",
    "expected INSERT call",
  );
}

function assertNoForbiddenKeys(values: Record<string, unknown>): void {
  for (const key of FORBIDDEN_WRITE_KEYS) {
    assert(
      !Object.prototype.hasOwnProperty.call(values, key),
      `payload must not include ${key}`,
    );
  }
}

function assertNoCollateralTables(fromTables: string[]): void {
  for (const table of fromTables) {
    assertEquals(
      table,
      "tenant_complimentary_access_invites",
      "only the complimentary invite table may be touched",
    );
    for (const forbidden of FORBIDDEN_TABLES) {
      assert(table !== forbidden, `must not query ${forbidden}`);
    }
  }
}

function assertZeroSideEffects(
  trace: FakeTrace,
  tokenCalls: number,
  message: string,
): void {
  assertEquals(trace.fromTables.length, 0, `${message}: zero DB from()`);
  assertEquals(trace.calls.length, 0, `${message}: zero INSERT`);
  assertEquals(tokenCalls, 0, `${message}: zero token generation`);
}

function assertFailureDoesNotExposeSecrets(
  result: CreateTenantComplimentaryAccessInviteResult,
  distinctive: string,
): void {
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes(distinctive),
    "failure must not expose distinctive secret/token/DB text",
  );
  assert(
    !serialized.includes(SYNTHETIC_RAW_TOKEN),
    "failure must not expose the synthetic raw token",
  );
  assert(
    !serialized.includes(SYNTHETIC_TOKEN_HASH),
    "failure must not expose tokenHash",
  );
  assert(
    !serialized.includes("service_role"),
    "failure must not mention service_role",
  );
  assert(
    !serialized.includes("tenant_memberships"),
    "failure must not mention tenant_memberships",
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

Deno.test("1. Base valid → authority pass → insert → success", async () => {
  const trace = emptyTrace();
  const tokens = trackingGenerator();
  const client = createFakeClient(confirmedRow(), trace);

  const result = await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: tokens.generateToken }),
  );

  expectSuccess(result);
  assertEquals(result.invite.id, INVITE_ID, "invite id from confirmation");
  assertEquals(result.invite.tenantId, TENANT_A, "tenantId");
  assertEquals(result.invite.productTier, "base", "productTier base");
  assertEquals(trace.calls.length, 1, "exactly one INSERT");
  assertEquals(tokens.calls, 1, "token generated once");
  assertInsertCall(trace.calls[0]);
  assertEquals(
    trace.calls[0].table,
    "tenant_complimentary_access_invites",
    "table 010",
  );
});

Deno.test("2. Pro valid → success", async () => {
  const trace = emptyTrace();
  const tokens = trackingGenerator();
  const client = createFakeClient(
    confirmedRow({ product_tier: "pro" }),
    trace,
  );

  const result = await createTenantComplimentaryAccessInvite(
    baseParams(client, {
      productTier: "pro",
      generateToken: tokens.generateToken,
    }),
  );

  expectSuccess(result);
  assertEquals(result.invite.productTier, "pro", "productTier pro");
  assertInsertCall(trace.calls[0]);
  assertEquals(trace.calls[0].values.product_tier, "pro", "insert pro");
  assertEquals(tokens.calls, 1, "token generated once");
});

Deno.test("3. issued_by is the authorized caller", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: trackingGenerator().generateToken }),
  );

  assertInsertCall(trace.calls[0]);
  assertEquals(
    trace.calls[0].values.issued_by,
    OPERATOR_A,
    "issued_by equals callerUserId",
  );
  assert(
    trace.calls[0].values.issued_by !== STRANGER,
    "issued_by must not be a substitute identity",
  );
});

Deno.test("4. insert contains only the authorized columns", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: trackingGenerator().generateToken }),
  );

  assertInsertCall(trace.calls[0]);
  assertEquals(
    Object.keys(trace.calls[0].values).sort(),
    ["expires_at", "issued_by", "product_tier", "tenant_id", "token_hash"].sort(),
    "INSERT columns are tenant_id+product_tier+token_hash+issued_by+expires_at",
  );
  assertNoForbiddenKeys(trace.calls[0].values);
  assertEquals(
    trace.calls[0].selectColumns,
    "id, tenant_id, product_tier, expires_at",
    "confirmation select omits token_hash",
  );
});

Deno.test("5. raw token is never in the DB payload", async () => {
  const trace = emptyTrace();
  const tokens = trackingGenerator(syntheticPair());
  const client = createFakeClient(confirmedRow(), trace);

  const result = await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: tokens.generateToken }),
  );

  expectSuccess(result);
  const payload = JSON.stringify(trace.calls[0]?.values);
  assert(
    !payload.includes(SYNTHETIC_RAW_TOKEN),
    "INSERT payload must not contain the raw token",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(trace.calls[0]?.values, "rawToken"),
    "INSERT must not have a rawToken column",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(trace.calls[0]?.values, "raw_token"),
    "INSERT must not have a raw_token column",
  );
});

Deno.test("6+7. tokenHash is in the DB payload and matches 64-char hex", async () => {
  const trace = emptyTrace();
  const tokens = trackingGenerator();
  const client = createFakeClient(confirmedRow(), trace);

  const result = await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: tokens.generateToken }),
  );

  expectSuccess(result);
  assertInsertCall(trace.calls[0]);
  const tokenHash = trace.calls[0].values.token_hash;
  assert(typeof tokenHash === "string", "token_hash is a string");
  assert(
    TOKEN_HASH_HEX_PATTERN.test(tokenHash),
    "token_hash must match ^[0-9a-f]{64}$",
  );
});

Deno.test("8. expires_at is exactly +604800000 ms from the injected clock", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: trackingGenerator().generateToken }),
  );

  assertInsertCall(trace.calls[0]);
  assertEquals(
    trace.calls[0].values.expires_at,
    EXPECTED_EXPIRES_AT.toISOString(),
    "expires_at ISO is now + 7*24h",
  );
  const persistedMs = new Date(
    String(trace.calls[0].values.expires_at),
  ).getTime();
  assertEquals(
    persistedMs - FIXED_NOW.getTime(),
    604800000,
    "elapsed ms is exactly 604800000",
  );
});

Deno.test("9+10+11. insert does not write created_at, redeemed_at, or revoked_at", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: trackingGenerator().generateToken }),
  );

  assertInsertCall(trace.calls[0]);
  const values = trace.calls[0].values;
  assert(
    !Object.prototype.hasOwnProperty.call(values, "created_at"),
    "must not write created_at",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(values, "redeemed_at"),
    "must not write redeemed_at",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(values, "revoked_at"),
    "must not write revoked_at",
  );
});

Deno.test("12+13. invalid tenant → zero DB and zero token generation", async () => {
  for (
    const invalid of [
      null,
      undefined,
      "",
      " ",
      "   ",
      "\t",
      "not-a-uuid",
      "tenant-a",
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee",
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeeZ",
      " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ",
      1,
      true,
      {},
      [],
    ]
  ) {
    const trace = emptyTrace();
    const tokens = trackingGenerator(syntheticPair());
    const result = await createTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        tenantId: invalid,
        generateToken: tokens.generateToken,
      }),
    );
    expectFailure(result, "invalid_tenant_id");
    assertZeroSideEffects(trace, tokens.calls, "invalid tenant");
    assertFailureDoesNotExposeSecrets(result, SYNTHETIC_RAW_TOKEN);
  }
});

Deno.test("14+15. invalid tier → zero DB and zero token generation", async () => {
  const invalidTiers: unknown[] = [
    "free",
    "paid",
    "demo",
    "internal",
    "BASE",
    "PRO",
    "Pro",
    "standard",
    "trial",
    "base ",
    " pro",
    "",
    null,
    undefined,
    1,
    true,
    {},
    [],
  ];
  for (const productTier of invalidTiers) {
    const trace = emptyTrace();
    const tokens = trackingGenerator(syntheticPair());
    const result = await createTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        productTier,
        generateToken: tokens.generateToken,
      }),
    );
    expectFailure(result, "invalid_product_tier");
    assertZeroSideEffects(trace, tokens.calls, "invalid tier");
    assertFailureDoesNotExposeSecrets(result, SYNTHETIC_RAW_TOKEN);
  }
});

Deno.test("16+17. authority forbidden → zero DB and zero token generation", async () => {
  const trace = emptyTrace();
  const tokens = trackingGenerator(syntheticPair());
  const result = await createTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(confirmedRow(), trace), {
      callerUserId: STRANGER,
      generateToken: tokens.generateToken,
    }),
  );
  expectFailure(result, "forbidden");
  assertZeroSideEffects(trace, tokens.calls, "forbidden");
  assertFailureDoesNotExposeSecrets(result, SYNTHETIC_RAW_TOKEN);
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("admin"), "must not mention tenant admin");
  assert(!serialized.includes("billing"), "must not mention tenant billing");
});

Deno.test("18. authority unconfigured → zero DB/token", async () => {
  for (const configured of [undefined, null, "", " ", "   "]) {
    const trace = emptyTrace();
    const tokens = trackingGenerator(syntheticPair());
    const result = await createTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        configuredOperatorUserIds: configured,
        generateToken: tokens.generateToken,
      }),
    );
    expectFailure(result, "authority_unconfigured");
    assertZeroSideEffects(trace, tokens.calls, "authority unconfigured");
  }
});

Deno.test("19. authority invalid config → zero DB/token", async () => {
  const invalidConfigs: unknown[] = [
    `${OPERATOR_A},not-a-uuid`,
    `${OPERATOR_A},*`,
    "*",
    1,
    true,
    { ids: OPERATOR_A },
    `${OPERATOR_A},`,
    `,${OPERATOR_A}`,
  ];
  for (const configured of invalidConfigs) {
    const trace = emptyTrace();
    const tokens = trackingGenerator(syntheticPair());
    const result = await createTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        configuredOperatorUserIds: configured,
        generateToken: tokens.generateToken,
      }),
    );
    expectFailure(result, "authority_invalid_config");
    assertZeroSideEffects(trace, tokens.calls, "authority invalid config");
  }
});

Deno.test("20. invalid caller → zero DB/token", async () => {
  for (
    const invalid of [
      null,
      undefined,
      "",
      " ",
      "not-a-uuid",
      " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea1 ",
      1,
      true,
      {},
    ]
  ) {
    const trace = emptyTrace();
    const tokens = trackingGenerator(syntheticPair());
    const result = await createTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        callerUserId: invalid,
        generateToken: tokens.generateToken,
      }),
    );
    expectFailure(result, "invalid_caller_user_id");
    assertZeroSideEffects(trace, tokens.calls, "invalid caller");
  }
});

Deno.test("21. invalid clock → zero DB/token", async () => {
  const invalidClocks: Array<() => Date> = [
    () => new Date(Number.NaN),
    () => new Date("not-a-date"),
    () => new Date(Number.POSITIVE_INFINITY),
    () => new Date(Number.NEGATIVE_INFINITY),
    () => {
      throw new Error("clock boom RAW_CLOCK_DETAIL");
    },
    (() => 1) as unknown as () => Date,
    (() => "2026-03-26T12:00:00.000Z") as unknown as () => Date,
  ];
  for (const now of invalidClocks) {
    const trace = emptyTrace();
    const tokens = trackingGenerator(syntheticPair());
    const result = await createTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        now,
        generateToken: tokens.generateToken,
      }),
    );
    expectFailure(result, "invalid_clock");
    assertZeroSideEffects(trace, tokens.calls, "invalid clock");
    assertFailureDoesNotExposeSecrets(result, "RAW_CLOCK_DETAIL");
    assertFailureDoesNotExposeSecrets(result, "2026-03-26T12:00:00.000Z");
  }
});

Deno.test("22+23. DB generic error is sanitized and does not expose raw token", async () => {
  const tokens = trackingGenerator(syntheticPair());
  const result = await createTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "57014",
            message:
              `statement timeout RAW_DB_DETAIL_INSERT_GENERIC ${SYNTHETIC_RAW_TOKEN}`,
          },
        },
        emptyTrace(),
      ),
      { generateToken: tokens.generateToken },
    ),
  );

  expectFailure(result, "complimentary_invite_persistence_failed");
  assertEquals(tokens.calls, 1, "token was generated before the DB error");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_INSERT_GENERIC") &&
      !serialized.includes("57014") &&
      !serialized.includes("timeout") &&
      !serialized.includes(SYNTHETIC_RAW_TOKEN) &&
      !serialized.includes(SYNTHETIC_TOKEN_HASH),
    "must not leak raw DB details or raw token",
  );
});

Deno.test("24+25. 23505 is token conflict and is not retried", async () => {
  const trace = emptyTrace();
  const tokens = trackingGenerator(syntheticPair());
  const client = createFakeClient(
    {
      data: null,
      error: {
        code: "23505",
        message: `duplicate key value RAW_DB_DETAIL_INSERT_CONFLICT ${SYNTHETIC_RAW_TOKEN}`,
      },
    },
    trace,
  );

  const result = await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: tokens.generateToken }),
  );

  expectFailure(result, "complimentary_invite_token_conflict");
  assertEquals(trace.calls.length, 1, "exactly one INSERT; no retry");
  assertEquals(tokens.calls, 1, "token generated once; no regeneration retry");
  assertInsertCall(trace.calls[0]);
  assertFailureDoesNotExposeSecrets(result, "RAW_DB_DETAIL_INSERT_CONFLICT");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("23505") && !serialized.includes("duplicate"),
    "must not leak unique-violation details",
  );
});

Deno.test("26+27. empty/null success row is fail-closed and does not return raw token", async () => {
  const emptyShapes: ComplimentaryInvitePersistenceWriteResponse[] = [
    { data: null, error: null },
    { data: {}, error: null },
    {
      data: {
        tenant_id: TENANT_A,
        product_tier: "base",
        expires_at: EXPECTED_EXPIRES_AT.toISOString(),
      },
      error: null,
    },
  ];
  for (const response of emptyShapes) {
    const tokens = trackingGenerator(syntheticPair());
    const result = await createTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(response, emptyTrace()), {
        generateToken: tokens.generateToken,
      }),
    );
    expectFailure(result, "complimentary_invite_persistence_failed");
    assertEquals(tokens.calls, 1, "token generated but persistence unconfirmed");
    assertFailureDoesNotExposeSecrets(result, SYNTHETIC_RAW_TOKEN);
    assert(
      !("invite" in result),
      "unconfirmed persistence must not return an invite",
    );
  }
});

Deno.test("28+29. success returns raw token once and never tokenHash", async () => {
  const tokens = trackingGenerator(syntheticPair());
  const result = await createTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(confirmedRow(), emptyTrace()), {
      generateToken: tokens.generateToken,
    }),
  );

  expectSuccess(result);
  assertEquals(result.invite.rawToken, SYNTHETIC_RAW_TOKEN, "raw token once");
  const serialized = JSON.stringify(result);
  assertEquals(
    countOccurrences(serialized, SYNTHETIC_RAW_TOKEN),
    1,
    "raw token appears exactly once in the success result",
  );
  assert(
    !serialized.includes(SYNTHETIC_TOKEN_HASH),
    "success result must not contain tokenHash",
  );
  assert(
    !serialized.includes("tokenHash") && !serialized.includes("token_hash"),
    "success result must not name tokenHash",
  );
});

Deno.test("30. no env, network, createClient, Stripe, or membership", async () => {
  const trace = emptyTrace();
  await createTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(confirmedRow(), trace), {
      generateToken: trackingGenerator().generateToken,
    }),
  );

  assertNoCollateralTables(trace.fromTables);
  const source = createTenantComplimentaryAccessInvite.toString();
  for (
    const forbidden of [
      "Deno.env",
      "createClient",
      "fetch(",
      "ensureTenantBillingAccess",
      "persistTenantComplimentaryAccessGrant",
      "tenant_memberships",
      "service_role",
      "Stripe",
      "console.log",
    ]
  ) {
    assert(
      !source.includes(forbidden),
      `service body must not reference ${forbidden}`,
    );
  }
});

Deno.test("31. tenant ID is exact/pinned in the INSERT payload", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(
    confirmedRow({ tenant_id: TENANT_B }),
    trace,
  );

  await createTenantComplimentaryAccessInvite(
    baseParams(client, {
      tenantId: TENANT_B,
      generateToken: trackingGenerator().generateToken,
    }),
  );

  assertInsertCall(trace.calls[0]);
  assertEquals(
    trace.calls[0].values.tenant_id,
    TENANT_B,
    "payload tenant_id matches caller",
  );
  assert(
    trace.calls[0].values.tenant_id !== TENANT_A,
    "must not substitute another tenant",
  );
});

Deno.test("32. product tier is exact/pinned in the INSERT payload", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(
    confirmedRow({ product_tier: "pro" }),
    trace,
  );

  await createTenantComplimentaryAccessInvite(
    baseParams(client, {
      productTier: "pro",
      generateToken: trackingGenerator().generateToken,
    }),
  );

  assertInsertCall(trace.calls[0]);
  assertEquals(trace.calls[0].values.product_tier, "pro", "pinned pro");
});

Deno.test("33. clock arithmetic is timezone/DST independent", async () => {
  const dstWindowNow = new Date("2026-03-28T00:30:00.000Z");
  const expected = new Date(dstWindowNow.getTime() + 604800000);
  const trace = emptyTrace();
  const client = createFakeClient(
    confirmedRow({ expires_at: expected.toISOString() }),
    trace,
  );

  await createTenantComplimentaryAccessInvite(
    baseParams(client, {
      now: () => dstWindowNow,
      generateToken: trackingGenerator().generateToken,
    }),
  );

  assertInsertCall(trace.calls[0]);
  assertEquals(
    trace.calls[0].values.expires_at,
    "2026-04-04T00:30:00.000Z",
    "UTC +7*24h across a DST boundary stays 00:30Z",
  );
  assertEquals(
    new Date(String(trace.calls[0].values.expires_at)).getTime() -
      dstWindowNow.getTime(),
    604800000,
    "elapsed ms remains 604800000 across DST",
  );
});

Deno.test("34. 7-day lifetime constant is 604800000 ms", () => {
  assertEquals(
    COMPLIMENTARY_INVITE_LIFETIME_MS,
    7 * 24 * 60 * 60 * 1000,
    "7 * 24 * 60 * 60 * 1000",
  );
  assertEquals(
    COMPLIMENTARY_INVITE_LIFETIME_MS,
    604800000,
    "604800000 ms",
  );
  assertEquals(
    COMPLIMENTARY_INVITE_LIFETIME_MS / (60 * 60 * 1000),
    168,
    "168 hours",
  );
});

Deno.test("35. no grant 009 write; INSERT only on 010", async () => {
  const trace = emptyTrace();
  await createTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(confirmedRow(), trace), {
      generateToken: trackingGenerator().generateToken,
    }),
  );

  assertEquals(trace.fromTables.length, 1, "one from()");
  assertEquals(
    trace.fromTables[0],
    "tenant_complimentary_access_invites",
    "010 table only",
  );
  assert(
    !trace.fromTables.includes("tenant_complimentary_access_grants"),
    "must not write grant 009",
  );
  assertEquals(trace.calls.length, 1, "one mutation");
  assertInsertCall(trace.calls[0]);
});

Deno.test("thrown client error is sanitized persistence_failed without raw token", async () => {
  const trace = emptyTrace();
  const tokens = trackingGenerator(syntheticPair());
  const client = createFakeClient(() => {
    throw new Error(
      `socket hang up RAW_EXCEPTION_DETAIL_INVITE env=SECRET_VALUE ${SYNTHETIC_RAW_TOKEN}`,
    );
  }, trace);

  const result = await createTenantComplimentaryAccessInvite(
    baseParams(client, { generateToken: tokens.generateToken }),
  );

  expectFailure(result, "complimentary_invite_persistence_failed");
  assertEquals(trace.calls.length, 1, "injected client was used");
  assertEquals(tokens.calls, 1, "token generated before the throw");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_EXCEPTION_DETAIL_INVITE") &&
      !serialized.includes("SECRET_VALUE") &&
      !serialized.includes("socket hang") &&
      !serialized.includes(SYNTHETIC_RAW_TOKEN),
    "must not leak exception text or raw token",
  );
});

Deno.test("token generator throw is fail-closed, zero DB, no secret leak", async () => {
  const trace = emptyTrace();
  const state = { calls: 0 };
  const generateToken = async () => {
    state.calls += 1;
    throw new Error(
      `RAW_TOKEN_GENERATOR_SECRET_DETAIL rawToken=${SYNTHETIC_RAW_TOKEN} tokenHash=${SYNTHETIC_TOKEN_HASH} stack=TRACE`,
    );
  };

  let rejected = false;
  let result: CreateTenantComplimentaryAccessInviteResult;
  try {
    result = await createTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), { generateToken }),
    );
  } catch {
    rejected = true;
    throw new Error("Promise must not reject on token generator throw");
  }

  assert(!rejected, "Promise must not reject");
  expectFailure(result, "complimentary_invite_token_generation_failed");
  assertEquals(trace.fromTables.length, 0, "zero DB from()");
  assertEquals(trace.calls.length, 0, "zero INSERT");
  assertEquals(state.calls, 1, "token generator called exactly once");
  const serialized = JSON.stringify(result);
  assertEquals(
    serialized,
    '{"ok":false,"reason":"complimentary_invite_token_generation_failed"}',
    "sanitized token generation failure",
  );
  assert(
    !serialized.includes("RAW_TOKEN_GENERATOR_SECRET_DETAIL") &&
      !serialized.includes("stack=TRACE") &&
      !serialized.includes(SYNTHETIC_RAW_TOKEN) &&
      !serialized.includes(SYNTHETIC_TOKEN_HASH),
    "must not leak generator message, stack/detail, raw token, or tokenHash",
  );
});

Deno.test("mismatched confirmation tenant is fail-closed without raw token", async () => {
  const tokens = trackingGenerator(syntheticPair());
  const result = await createTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(confirmedRow({ tenant_id: TENANT_B }), emptyTrace()),
      { generateToken: tokens.generateToken },
    ),
  );
  expectFailure(result, "complimentary_invite_persistence_failed");
  assertFailureDoesNotExposeSecrets(result, SYNTHETIC_RAW_TOKEN);
});

Deno.test("success with real token primitive returns a hex hash in DB only", async () => {
  const trace = emptyTrace();
  const result = await createTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(confirmedRow(), trace)),
  );

  expectSuccess(result);
  assert(result.invite.rawToken.length > 0, "raw token present after persist");
  assertInsertCall(trace.calls[0]);
  const tokenHash = trace.calls[0].values.token_hash;
  assert(
    typeof tokenHash === "string" && TOKEN_HASH_HEX_PATTERN.test(tokenHash),
    "persisted token_hash is 64-char hex",
  );
  const payload = JSON.stringify(trace.calls[0].values);
  assert(
    !payload.includes(result.invite.rawToken),
    "real raw token must not be persisted",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes(String(tokenHash)),
    "success result must not echo tokenHash",
  );
  assertEquals(
    countOccurrences(serialized, result.invite.rawToken),
    1,
    "real raw token appears once",
  );
});
