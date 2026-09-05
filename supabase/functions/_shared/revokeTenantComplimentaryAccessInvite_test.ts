/**
 * Deno tests for revokeTenantComplimentaryAccessInvite.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/revokeTenantComplimentaryAccessInvite_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic — not real tenant, operator, or invite values.
 */

import {
  revokeTenantComplimentaryAccessInvite,
  type ComplimentaryInviteRevocationClient,
  type ComplimentaryInviteRevocationFilterBuilder,
  type ComplimentaryInviteRevocationWriteResponse,
  type ComplimentaryInviteRevocationWriteValues,
  type RevokeTenantComplimentaryAccessInviteParams,
  type RevokeTenantComplimentaryAccessInviteResult,
} from "./revokeTenantComplimentaryAccessInvite.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const OPERATOR_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea1";
const OPERATOR_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea2";
const STRANGER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeaf";
const INVITE_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaa1";
const OTHER_INVITE_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaa2";

const FIXED_NOW = new Date("2026-03-26T12:00:00.000Z");
const EXPECTED_REVOKED_AT = FIXED_NOW.toISOString();

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
  "tenant_id",
  "product_tier",
  "token_hash",
  "issued_by",
  "created_at",
  "expires_at",
  "redeemed_at",
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
  result: RevokeTenantComplimentaryAccessInviteResult,
): asserts result is Extract<
  RevokeTenantComplimentaryAccessInviteResult,
  { ok: true }
> {
  if (result.ok !== true) {
    throw new Error(
      `expected success, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "revocation"].sort(),
    "public success contract exposes only ok+revocation",
  );
  assertEquals(
    Object.keys(result.revocation).sort(),
    ["id", "revokedAt", "tenantId"].sort(),
    "success revocation exposes only id+tenantId+revokedAt",
  );
}

function expectFailure(
  result: RevokeTenantComplimentaryAccessInviteResult,
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
    !("revocation" in result),
    "failure must not include revocation",
  );
}

type FilterCall = {
  op: "eq" | "is";
  column: string;
  value: string | null;
};

type FakeUpdateCall = {
  method: "update";
  table: string;
  values: Record<string, unknown>;
  filters: FilterCall[];
  selectColumns: string;
};

type FakeTrace = {
  fromTables: string[];
  calls: FakeUpdateCall[];
};

function createFakeClient(
  result: ComplimentaryInviteRevocationWriteResponse | (() => never),
  trace: FakeTrace,
): ComplimentaryInviteRevocationClient {
  const resolveResult = (): Promise<
    ComplimentaryInviteRevocationWriteResponse
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
        update(values: ComplimentaryInviteRevocationWriteValues) {
          const filters: FilterCall[] = [];
          const builder: ComplimentaryInviteRevocationFilterBuilder = {
            eq(column: string, value: string) {
              filters.push({ op: "eq", column, value });
              return builder;
            },
            is(column: string, value: null) {
              filters.push({ op: "is", column, value });
              return builder;
            },
            select(columns: string) {
              return {
                maybeSingle() {
                  trace.calls.push({
                    method: "update",
                    table,
                    values: { ...values },
                    filters: [...filters],
                    selectColumns: columns,
                  });
                  return resolveResult();
                },
              };
            },
          };
          return builder;
        },
      };
      assert(
        !("upsert" in tableApi) && !("onConflict" in tableApi) &&
          !("insert" in tableApi) && !("delete" in tableApi) &&
          !("select" in tableApi),
        "fake table surface must not expose upsert/onConflict/insert/delete/select",
      );
      return tableApi;
    },
  };
}

function emptyTrace(): FakeTrace {
  return { fromTables: [], calls: [] };
}

function confirmedRow(
  overrides: Partial<ComplimentaryInviteRevocationWriteResponse["data"]> = {},
): ComplimentaryInviteRevocationWriteResponse {
  return {
    data: {
      id: INVITE_ID,
      tenant_id: TENANT_A,
      revoked_at: EXPECTED_REVOKED_AT,
      ...overrides,
    },
    error: null,
  };
}

function baseParams(
  client: ComplimentaryInviteRevocationClient,
  overrides: Partial<RevokeTenantComplimentaryAccessInviteParams> = {},
): RevokeTenantComplimentaryAccessInviteParams {
  return {
    client,
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: `${OPERATOR_A},${OPERATOR_B}`,
    inviteId: INVITE_ID,
    tenantId: TENANT_A,
    now: () => FIXED_NOW,
    ...overrides,
  };
}

function assertUpdateCall(
  call: FakeUpdateCall | undefined,
): asserts call is FakeUpdateCall {
  assert(
    call !== undefined && call.method === "update",
    "expected UPDATE call",
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

function assertZeroSideEffects(trace: FakeTrace, message: string): void {
  assertEquals(trace.fromTables.length, 0, `${message}: zero DB from()`);
  assertEquals(trace.calls.length, 0, `${message}: zero UPDATE`);
}

function assertFailureDoesNotExposeSecrets(
  result: RevokeTenantComplimentaryAccessInviteResult,
  distinctive: string,
): void {
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes(distinctive),
    "failure must not expose distinctive secret/token/DB text",
  );
  assert(
    !serialized.includes("service_role"),
    "failure must not mention service_role",
  );
  assert(
    !serialized.includes("tenant_memberships"),
    "failure must not mention tenant_memberships",
  );
  assert(
    !serialized.includes("VITE_"),
    "failure must not mention VITE_",
  );
}

function assertConditionalRevokeFilters(filters: FilterCall[]): void {
  assertEquals(
    filters,
    [
      { op: "eq", column: "id", value: INVITE_ID },
      { op: "eq", column: "tenant_id", value: TENANT_A },
      { op: "is", column: "redeemed_at", value: null },
      { op: "is", column: "revoked_at", value: null },
    ],
    "UPDATE pins invite+tenant and unused/unrevoked guards",
  );
}

Deno.test("1. unused invite matching tenant → success with server revoked_at", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  const result = await revokeTenantComplimentaryAccessInvite(
    baseParams(client),
  );

  expectSuccess(result);
  assertEquals(result.revocation.id, INVITE_ID, "invite id");
  assertEquals(result.revocation.tenantId, TENANT_A, "tenantId");
  assertEquals(
    result.revocation.revokedAt,
    EXPECTED_REVOKED_AT,
    "revokedAt from confirmation",
  );
  assertEquals(trace.calls.length, 1, "exactly one UPDATE");
  assertUpdateCall(trace.calls[0]);
  assertEquals(
    trace.calls[0].table,
    "tenant_complimentary_access_invites",
    "table 010",
  );
  assertNoCollateralTables(trace.fromTables);
});

Deno.test("2. UPDATE writes only revoked_at from the server clock", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  await revokeTenantComplimentaryAccessInvite(baseParams(client));

  assertUpdateCall(trace.calls[0]);
  assertEquals(
    Object.keys(trace.calls[0].values).sort(),
    ["revoked_at"],
    "UPDATE SET is only revoked_at",
  );
  assertEquals(
    trace.calls[0].values,
    { revoked_at: EXPECTED_REVOKED_AT },
    "revoked_at is the injected server clock ISO",
  );
  assertNoForbiddenKeys(trace.calls[0].values);
  assert(
    !Object.prototype.hasOwnProperty.call(trace.calls[0].values, "redeemed_at"),
    "must not write redeemed_at",
  );
});

Deno.test("3. writer uses redeemed_at IS NULL and revoked_at IS NULL", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  await revokeTenantComplimentaryAccessInvite(baseParams(client));

  assertUpdateCall(trace.calls[0]);
  assertConditionalRevokeFilters(trace.calls[0].filters);
  assertEquals(
    trace.calls[0].selectColumns,
    "id, tenant_id, revoked_at",
    "confirmation select is minimal",
  );
});

Deno.test("4. 0-row UPDATE (not found / redeemed / revoked / tenant miss) → invite_not_revocable", async () => {
  const trace = emptyTrace();
  const result = await revokeTenantComplimentaryAccessInvite(
    baseParams(createFakeClient({ data: null, error: null }, trace)),
  );

  expectFailure(result, "invite_not_revocable");
  assertEquals(trace.calls.length, 1, "one conditional UPDATE was attempted");
  assertUpdateCall(trace.calls[0]);
  assertConditionalRevokeFilters(trace.calls[0].filters);
  assertNoCollateralTables(trace.fromTables);
  assert(
    !("revocation" in result),
    "miss must not report a revocation",
  );
});

Deno.test("5. tenant mismatch uses the requested tenant_id in WHERE, not a cross-tenant id-only update", async () => {
  const trace = emptyTrace();
  const result = await revokeTenantComplimentaryAccessInvite(
    baseParams(createFakeClient({ data: null, error: null }, trace), {
      tenantId: TENANT_B,
    }),
  );

  expectFailure(result, "invite_not_revocable");
  assertUpdateCall(trace.calls[0]);
  assertEquals(
    trace.calls[0].filters,
    [
      { op: "eq", column: "id", value: INVITE_ID },
      { op: "eq", column: "tenant_id", value: TENANT_B },
      { op: "is", column: "redeemed_at", value: null },
      { op: "is", column: "revoked_at", value: null },
    ],
    "tenant_id from the request is required in the same UPDATE",
  );
});

Deno.test("6. invalid invite id → zero write", async () => {
  for (
    const invalid of [
      null,
      undefined,
      "",
      " ",
      "not-a-uuid",
      " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ",
      1,
      true,
      {},
      [],
      OTHER_INVITE_ID.replace("c", "z"),
    ]
  ) {
    const trace = emptyTrace();
    const result = await revokeTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        inviteId: invalid,
      }),
    );
    expectFailure(result, "invalid_invite_id");
    assertZeroSideEffects(trace, "invalid invite id");
    assertFailureDoesNotExposeSecrets(result, "service_role");
  }
});

Deno.test("7. invalid tenant id → zero write", async () => {
  for (
    const invalid of [
      null,
      undefined,
      "",
      " ",
      "not-a-uuid",
      " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ",
      1,
      true,
      {},
      [],
    ]
  ) {
    const trace = emptyTrace();
    const result = await revokeTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        tenantId: invalid,
      }),
    );
    expectFailure(result, "invalid_tenant_id");
    assertZeroSideEffects(trace, "invalid tenant");
  }
});

Deno.test("8. forbidden operator → zero write", async () => {
  const trace = emptyTrace();
  const result = await revokeTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(confirmedRow(), trace), {
      callerUserId: STRANGER,
    }),
  );
  expectFailure(result, "forbidden");
  assertZeroSideEffects(trace, "forbidden");
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("admin"), "must not mention tenant admin");
  assert(!serialized.includes("billing"), "must not mention tenant billing");
});

Deno.test("9. authority unconfigured → zero write", async () => {
  for (const configured of [undefined, null, "", " ", "   "]) {
    const trace = emptyTrace();
    const result = await revokeTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        configuredOperatorUserIds: configured,
      }),
    );
    expectFailure(result, "authority_unconfigured");
    assertZeroSideEffects(trace, "authority unconfigured");
  }
});

Deno.test("10. authority invalid config → zero write", async () => {
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
    const result = await revokeTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        configuredOperatorUserIds: configured,
      }),
    );
    expectFailure(result, "authority_invalid_config");
    assertZeroSideEffects(trace, "authority invalid config");
  }
});

Deno.test("11. invalid caller → zero write", async () => {
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
    const result = await revokeTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), {
        callerUserId: invalid,
      }),
    );
    expectFailure(result, "invalid_caller_user_id");
    assertZeroSideEffects(trace, "invalid caller");
  }
});

Deno.test("12. invalid clock → zero write", async () => {
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
    const result = await revokeTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(confirmedRow(), trace), { now }),
    );
    expectFailure(result, "invalid_clock");
    assertZeroSideEffects(trace, "invalid clock");
    assertFailureDoesNotExposeSecrets(result, "RAW_CLOCK_DETAIL");
  }
});

Deno.test("13. DB error is sanitized and does not leak grant or secret text", async () => {
  const result = await revokeTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "57014",
            message:
              "statement timeout RAW_DB_DETAIL_REVOKE service_role VITE_SECRET",
          },
        },
        emptyTrace(),
      ),
    ),
  );

  expectFailure(result, "complimentary_invite_persistence_failed");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_REVOKE") &&
      !serialized.includes("57014") &&
      !serialized.includes("timeout") &&
      !serialized.includes("service_role") &&
      !serialized.includes("VITE_SECRET"),
    "must not leak raw DB details or secrets",
  );
});

Deno.test("14. confirmation id/tenant mismatch is fail-closed", async () => {
  const mismatches: ComplimentaryInviteRevocationWriteResponse[] = [
    confirmedRow({ id: OTHER_INVITE_ID }),
    confirmedRow({ tenant_id: TENANT_B }),
    confirmedRow({ revoked_at: null }),
    confirmedRow({ revoked_at: "not-a-date" }),
    confirmedRow({ revoked_at: "" }),
    { data: {}, error: null },
  ];
  for (const response of mismatches) {
    const result = await revokeTenantComplimentaryAccessInvite(
      baseParams(createFakeClient(response, emptyTrace())),
    );
    expectFailure(result, "complimentary_invite_persistence_failed");
    assert(
      !("revocation" in result),
      "unconfirmed persistence must not return a revocation",
    );
  }
});

Deno.test("15. Date revoked_at confirmation is accepted as ISO", async () => {
  const when = new Date("2026-03-26T15:30:00.000Z");
  const result = await revokeTenantComplimentaryAccessInvite(
    baseParams(createFakeClient(confirmedRow({ revoked_at: when }), emptyTrace())),
  );
  expectSuccess(result);
  assertEquals(
    result.revocation.revokedAt,
    when.toISOString(),
    "Date revoked_at becomes ISO",
  );
});

Deno.test("16. persistence throw is fail-closed", async () => {
  const result = await revokeTenantComplimentaryAccessInvite(
    baseParams(
      createFakeClient(() => {
        throw new Error("RAW_CLIENT_THROW env=SECRET_VALUE");
      }, emptyTrace()),
    ),
  );
  expectFailure(result, "complimentary_invite_persistence_failed");
  assertFailureDoesNotExposeSecrets(result, "RAW_CLIENT_THROW");
  assertFailureDoesNotExposeSecrets(result, "SECRET_VALUE");
});

Deno.test("17. writer source has no grant write, Stripe, membership, VITE_, or token path", () => {
  const source = revokeTenantComplimentaryAccessInvite.toString();
  for (
    const forbidden of [
      "tenant_complimentary_access_grants",
      "persistTenantComplimentaryAccessGrant",
      "tenant_memberships",
      "Stripe",
      "STRIPE_",
      "VITE_",
      "SUPABASE_SERVICE_ROLE_KEY",
      "console.log",
      "token_hash",
      "rawToken",
      ".insert(",
      ".upsert(",
      ".delete(",
    ]
  ) {
    assert(
      !source.includes(forbidden),
      `writer must not contain ${forbidden}`,
    );
  }
  assert(source.includes("redeemed_at"), "must guard redeemed_at");
  assert(source.includes("revoked_at"), "must write/guard revoked_at");
});
