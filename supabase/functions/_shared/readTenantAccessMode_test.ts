/**
 * Deno tests for readTenantAccessMode (BILLING-84).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/readTenantAccessMode_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import {
  classifyTenantAccessModeLookup,
  readTenantAccessMode,
  type ReadTenantAccessModeResult,
  type TenantAccessModeLookupClient,
  type TenantAccessModeLookupError,
  type TenantAccessModeLookupResponse,
  type TenantAccessModeRow,
} from "./readTenantAccessMode.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from production or historical reports. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";

const KNOWN_PLAN_CODES = ["free", "trial", "paid", "internal", "demo"] as const;

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

function expectSuccess(
  result: ReadTenantAccessModeResult,
): asserts result is Extract<ReadTenantAccessModeResult, { ok: true }> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
  assertEquals(
    Object.keys(result).sort(),
    ["mode", "ok"].sort(),
    "success public fields only",
  );
}

function expectFailure(
  result: ReadTenantAccessModeResult,
  reason: string,
): asserts result is Extract<ReadTenantAccessModeResult, { ok: false }> {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(
    !("mode" in result) &&
      !("plan_code" in result) &&
      !("is_demo" in result) &&
      !("row" in result) &&
      !("data" in result),
    "failure must not return partial mode or raw row",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

type FakeLookupResult = {
  data: unknown;
  error: TenantAccessModeLookupError | null;
};

type FakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
  maybeSingle: boolean;
};

/**
 * Minimal SELECT-only fake: `.from().select().eq().maybeSingle()` → Promise.
 * No insert / update / upsert / delete / single / limit / order.
 * Optionally throws to simulate transport/client failures.
 */
function createFakeClient(
  result:
    | FakeLookupResult
    | TenantAccessModeLookupResponse
    | (() => never),
  calls: FakeCall[],
): TenantAccessModeLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                maybeSingle() {
                  calls.push({
                    table,
                    columns,
                    filters: [{ column, value }],
                    maybeSingle: true,
                  });
                  if (typeof result === "function") {
                    try {
                      result();
                      return Promise.reject(new Error("expected throw"));
                    } catch (err) {
                      return Promise.reject(err);
                    }
                  }
                  return Promise.resolve(result as {
                    data: TenantAccessModeRow | null;
                    error: TenantAccessModeLookupError | null;
                  });
                },
              };
            },
          };
        },
      };
    },
  };
}

function presentRow(
  overrides: Partial<TenantAccessModeRow> = {},
): TenantAccessModeRow {
  return {
    plan_code: "free",
    is_demo: false,
    ...overrides,
  };
}

function assertNoRawLeak(
  result: ReadTenantAccessModeResult,
  forbidden: string[],
): void {
  const serialized = JSON.stringify(result);
  for (const token of forbidden) {
    assert(
      !serialized.includes(token),
      `must not leak ${token} in public result`,
    );
  }
}

Deno.test("A1. free + is_demo=false → standard", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: presentRow({ plan_code: "free", is_demo: false }), error: null },
      [],
    ),
  });
  expectSuccess(result);
  assertEquals(result.mode, "standard", "free maps to standard");
});

Deno.test("A2. trial + is_demo=false → standard", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: presentRow({ plan_code: "trial", is_demo: false }), error: null },
      [],
    ),
  });
  expectSuccess(result);
  assertEquals(result.mode, "standard", "trial maps to standard");
});

Deno.test("A3. paid + is_demo=false → standard", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: presentRow({ plan_code: "paid", is_demo: false }), error: null },
      [],
    ),
  });
  expectSuccess(result);
  assertEquals(result.mode, "standard", "paid maps to standard");
  const serializedPaid = JSON.stringify(result);
  assert(
    !serializedPaid.includes("pro") && !serializedPaid.includes("base"),
    "paid is not a catalog tier",
  );
});

Deno.test("A. free/trial/paid are commercial standard, not catalog labels", async () => {
  for (const plan_code of ["free", "trial", "paid"] as const) {
    const result = await readTenantAccessMode({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: presentRow({ plan_code, is_demo: false }), error: null },
        [],
      ),
    });
    expectSuccess(result);
    assertEquals(result.mode, "standard", `${plan_code} → standard`);
    const serialized = JSON.stringify(result);
    assert(
      !serialized.includes("base") && !serialized.includes("pro"),
      `${plan_code} must not emit catalog-tier labels`,
    );
  }
});

Deno.test("B4. demo + is_demo=false → demo", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: presentRow({ plan_code: "demo", is_demo: false }), error: null },
      [],
    ),
  });
  expectSuccess(result);
  assertEquals(result.mode, "demo", "plan_code demo maps to demo");
});

Deno.test("B5. any known plan_code + is_demo=true → demo", async () => {
  for (const plan_code of KNOWN_PLAN_CODES) {
    const result = await readTenantAccessMode({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: presentRow({ plan_code, is_demo: true }), error: null },
        [],
      ),
    });
    expectSuccess(result);
    assertEquals(result.mode, "demo", `${plan_code} + is_demo true → demo`);
  }
});

Deno.test("B6. internal + is_demo=true → demo (is_demo precedes plan_code)", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: presentRow({ plan_code: "internal", is_demo: true }),
        error: null,
      },
      [],
    ),
  });
  expectSuccess(result);
  assertEquals(result.mode, "demo", "is_demo true wins over plan_code internal");
});

Deno.test("C7. internal + is_demo=false → internal", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: presentRow({ plan_code: "internal", is_demo: false }),
        error: null,
      },
      [],
    ),
  });
  expectSuccess(result);
  assertEquals(result.mode, "internal", "internal maps to internal");
});

Deno.test("D8+D9. invalid tenantId → invalid_tenant_id, zero query", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: null, error: null }, calls);

  for (const invalid of [
    null,
    undefined,
    "",
    " ",
    "   ",
    "\t",
    1,
    true,
    {},
    [],
    "not-a-uuid",
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee",
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeeZ",
  ]) {
    calls.length = 0;
    expectFailure(
      await readTenantAccessMode({ tenantId: invalid, client }),
      "invalid_tenant_id",
    );
    assertEquals(calls.length, 0, "must not query on invalid tenantId");
  }
});

Deno.test("D. padded tenantId → invalid_tenant_id, zero query (no trim)", async () => {
  const calls: FakeCall[] = [];
  const paddedTenant = " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ";
  const result = await readTenantAccessMode({
    tenantId: paddedTenant,
    client: createFakeClient({ data: null, error: null }, calls),
  });

  expectFailure(result, "invalid_tenant_id");
  assertEquals(calls.length, 0, "must not query on padded tenantId");
});

Deno.test("E10. tenant missing → tenant_not_found", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient({ data: null, error: null }, calls),
  });

  expectFailure(result, "tenant_not_found");
  assertEquals(calls.length, 1, "one SELECT");
});

Deno.test("E11+E12. lookup DB error → tenant_lookup_failed, sanitized", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: presentRow({ plan_code: "paid", is_demo: false }),
        error: {
          code: "57014",
          message:
            "canceling statement due to statement timeout RAW_DB_DETAIL_ALPHA",
        },
      },
      [],
    ),
  });

  expectFailure(result, "tenant_lookup_failed");
  const serialized = JSON.stringify(result);
  assertEquals(
    serialized,
    '{"ok":false,"reason":"tenant_lookup_failed"}',
    "sanitized",
  );
  assertNoRawLeak(result, [
    "RAW_DB_DETAIL_ALPHA",
    "timeout",
    "57014",
    "paid",
    "plan_code",
    TENANT_A,
  ]);
});

Deno.test("E. query throw/rejection → sanitized lookup_failed", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(() => {
      throw new Error(
        "socket hang up with RAW_EXCEPTION_DETAIL_BETA RAW_PRIVATE_DETAIL_DELTA",
      );
    }, []),
  });

  expectFailure(result, "tenant_lookup_failed");
  assertNoRawLeak(result, [
    "RAW_EXCEPTION_DETAIL_BETA",
    "socket hang",
    "RAW_PRIVATE_DETAIL_DELTA",
  ]);
});

Deno.test("E. missing-row and lookup error are distinct failures", async () => {
  const missing = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient({ data: null, error: null }, []),
  });
  const failed = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: null, error: { code: "XX000", message: "internal RAW_LOOKUP" } },
      [],
    ),
  });

  expectFailure(missing, "tenant_not_found");
  expectFailure(failed, "tenant_lookup_failed");
  assert(
    JSON.stringify(missing) !== JSON.stringify(failed),
    "missing row must not collapse to lookup_failed",
  );
  assertNoRawLeak(failed, ["RAW_LOOKUP", "XX000"]);
});

Deno.test("F13. unknown plan_code → invalid_tenant_access_mode", async () => {
  const unknownCodes: unknown[] = [
    "enterprise",
    "pro",
    "base",
    "PREMIUM",
    "FREE",
    "Paid",
    "DEMO",
    "INTERNAL",
    "paid ",
    " free",
    "demo ",
    "",
    1,
    true,
    {},
    [],
  ];

  for (const plan_code of unknownCodes) {
    const result = await readTenantAccessMode({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: presentRow({ plan_code, is_demo: false }), error: null },
        [],
      ),
    });
    expectFailure(result, "invalid_tenant_access_mode");
    assertNoRawLeak(result, ["enterprise", "pro", "base", "FREE", "paid "]);
  }
});

Deno.test("F14. missing/null plan_code → invalid_tenant_access_mode", async () => {
  const invalidCodes: unknown[] = [null, undefined];

  for (const plan_code of invalidCodes) {
    const result = await readTenantAccessMode({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: presentRow({ plan_code, is_demo: false }), error: null },
        [],
      ),
    });
    expectFailure(result, "invalid_tenant_access_mode");
  }

  const missingProperty = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: { is_demo: false }, error: null },
      [],
    ),
  });
  expectFailure(missingProperty, "invalid_tenant_access_mode");
});

Deno.test("F15. invalid is_demo shape → invalid_tenant_access_mode", async () => {
  const invalidFlags: unknown[] = [
    null,
    undefined,
    "true",
    "false",
    1,
    0,
    "1",
    {},
    [],
  ];

  for (const is_demo of invalidFlags) {
    const result = await readTenantAccessMode({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: presentRow({ plan_code: "paid", is_demo }), error: null },
        [],
      ),
    });
    expectFailure(result, "invalid_tenant_access_mode");
  }

  const missingProperty = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: { plan_code: "paid" }, error: null },
      [],
    ),
  });
  expectFailure(missingProperty, "invalid_tenant_access_mode");
});

Deno.test("F. unknown plan_code + is_demo=true still fails closed", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: presentRow({ plan_code: "enterprise", is_demo: true }), error: null },
      [],
    ),
  });
  expectFailure(result, "invalid_tenant_access_mode");
  assert(
    JSON.stringify(result) !== JSON.stringify({ ok: true, mode: "demo" }),
    "is_demo true must not grant demo when plan_code is unknown",
  );
});

Deno.test("F. no frontend-style fallback to free/standard on unknown plan_code", async () => {
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: presentRow({ plan_code: "unknown", is_demo: false }), error: null },
      [],
    ),
  });
  expectFailure(result, "invalid_tenant_access_mode");
  assert(
    JSON.stringify(result) !== JSON.stringify({ ok: true, mode: "standard" }),
    "must not copy parseTenantPlanCode fallback to free/standard",
  );
});

Deno.test("G16+G17+G18. tenantId is passed unchanged; query uses requested id; no default tenant", async () => {
  const calls: FakeCall[] = [];
  await readTenantAccessMode({
    tenantId: TENANT_B,
    client: createFakeClient(
      { data: presentRow({ plan_code: "free", is_demo: false }), error: null },
      calls,
    ),
  });

  assertEquals(calls.length, 1, "one SELECT");
  assertEquals(calls[0]?.table, "tenants", "tenants table");
  assertEquals(calls[0]?.columns, "plan_code,is_demo", "minimal projection");
  assertEquals(calls[0]?.maybeSingle, true, "maybeSingle used");
  assertEquals(
    calls[0]?.filters,
    [{ column: "id", value: TENANT_B }],
    "query pinned to received tenantId on tenants.id",
  );
  assert(
    calls[0]?.filters[0]?.value !== TENANT_A,
    "must not substitute another tenant",
  );
  assertEquals(
    calls[0]?.filters[0]?.column,
    "id",
    "tenants PK column is id, not tenant_id",
  );
});

Deno.test("G. uppercase UUID identity is preserved in the filter", async () => {
  const calls: FakeCall[] = [];
  const uppercaseTenant = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEE1";
  const result = await readTenantAccessMode({
    tenantId: uppercaseTenant,
    client: createFakeClient(
      { data: presentRow({ plan_code: "trial", is_demo: false }), error: null },
      calls,
    ),
  });

  expectSuccess(result);
  assertEquals(
    calls[0]?.filters,
    [{ column: "id", value: uppercaseTenant }],
    "must not lowercase the tenant id used for the filter",
  );
});

Deno.test("G. exactly one tenants SELECT; no commercial or membership tables", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: presentRow({ plan_code: "paid", is_demo: false }), error: null },
      calls,
    ),
  });

  expectSuccess(result);
  assertEquals(calls.length, 1, "exactly one SELECT");
  assertEquals(calls[0]?.table, "tenants", "tenants only");
  for (const forbidden of [
    "tenant_subscriptions",
    "tenant_complimentary_access_grants",
    "billing_events",
    "profiles",
    "tenant_memberships",
  ]) {
    assert(calls[0]?.table !== forbidden, `must not query ${forbidden}`);
  }
});

Deno.test("H. production reader has no catalog-tier, Stripe, complimentary, env, HTTP, or clock policy", () => {
  const source = [
    readTenantAccessMode.toString(),
    classifyTenantAccessModeLookup.toString(),
  ].join("\n");

  const forbidden = [
    "ProductTier",
    "ModeCapabilityProfiles",
    "resolveTenantEffectiveAccess",
    "resolvePersistedTenantEffectiveAccess",
    "resolveEffectiveAccess(",
    "capabilitiesForTier",
    "Date.now",
    "Date.parse",
    "new Date",
    "Temporal",
    "createClient",
    "Deno.env",
    "fetch(",
    "npm:stripe",
    "new Stripe",
    'from "stripe"',
    "from 'stripe'",
    "Request",
    "Response",
    "Authorization",
    "service_role",
    "@/src/",
    "src/features",
    "isDemoTenant",
    "getPlanBadgeLabel",
    "parseTenantPlanCode",
    '"base"',
    '"pro"',
    "complimentary",
    "stripeCandidate",
    "current_period_end",
    "product_tier",
    "tenant_subscriptions",
    "tenant_complimentary_access_grants",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `production reader must not contain ${token}`);
  }
});

Deno.test("I. success and failure public contracts; no raw row", async () => {
  const success = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: {
          ...presentRow({ plan_code: "paid", is_demo: false }),
          name: "must-not-leak",
          subscription_status: "active",
        } as TenantAccessModeRow,
        error: null,
      },
      [],
    ),
  });

  expectSuccess(success);
  assertEquals(success.mode, "standard", "mode");
  assertEquals(
    Object.keys(success).sort(),
    ["mode", "ok"].sort(),
    "success fields",
  );
  const successJson = JSON.stringify(success);
  assert(
    !successJson.includes("plan_code") &&
      !successJson.includes("is_demo") &&
      !successJson.includes("must-not-leak") &&
      !successJson.includes("subscription_status") &&
      !successJson.includes("paid"),
    "success must not expose the tenants row",
  );

  const failure = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: presentRow({ plan_code: "enterprise", is_demo: false }),
        error: null,
      },
      [],
    ),
  });
  expectFailure(failure, "invalid_tenant_access_mode");
  assertEquals(
    JSON.stringify(failure),
    '{"ok":false,"reason":"invalid_tenant_access_mode"}',
    "failure sanitized",
  );
});

Deno.test("classify: error wins over a present row; null data is not_found", () => {
  expectFailure(
    classifyTenantAccessModeLookup({
      error: { code: "PGRST116", message: "JSON object requested RAW_PGRST" },
      data: presentRow({ plan_code: "paid", is_demo: false }),
    }),
    "tenant_lookup_failed",
  );

  expectFailure(
    classifyTenantAccessModeLookup({
      error: null,
      data: null,
    }),
    "tenant_not_found",
  );

  const classified = classifyTenantAccessModeLookup({
    error: null,
    data: presentRow({ plan_code: "internal", is_demo: false }),
  });
  expectSuccess(classified);
  assertEquals(classified.mode, "internal", "classify internal");
});

Deno.test("classify: array data (multiple-row envelope) is lookup_failed, not first-row", () => {
  const result = classifyTenantAccessModeLookup({
    error: null,
    data: [
      presentRow({ plan_code: "paid", is_demo: false }),
      presentRow({ plan_code: "demo", is_demo: true }),
    ] as unknown as TenantAccessModeRow,
  });
  expectFailure(result, "tenant_lookup_failed");
  assert(
    JSON.stringify(result) !== JSON.stringify({ ok: true, mode: "standard" }),
    "must not pick the first row",
  );
});

Deno.test("envelope missing error is lookup_failed, never tenant_not_found", async () => {
  const malformed = { data: null } as unknown as FakeLookupResult;
  assert(
    !Object.prototype.hasOwnProperty.call(malformed, "error"),
    "fixture omits the error property",
  );

  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(malformed, []),
  });
  expectFailure(result, "tenant_lookup_failed");
});

Deno.test("envelope error: undefined is lookup_failed, never success", async () => {
  const malformed = {
    data: presentRow(),
    error: undefined,
  } as unknown as FakeLookupResult;
  assert(
    Object.prototype.hasOwnProperty.call(malformed, "error"),
    "fixture keeps an explicit undefined error property",
  );

  const result = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: createFakeClient(malformed, []),
  });
  expectFailure(result, "tenant_lookup_failed");
});

Deno.test("malformed lookup envelope (null/primitive/array/missing data) → lookup_failed", async () => {
  const malformedEnvelopes: unknown[] = [
    null,
    1,
    true,
    "envelope",
    [],
    { error: null },
  ];

  for (const envelope of malformedEnvelopes) {
    const result = await readTenantAccessMode({
      tenantId: TENANT_A,
      client: createFakeClient(
        envelope as unknown as TenantAccessModeLookupResponse,
        [],
      ),
    });
    expectFailure(result, "tenant_lookup_failed");
  }
});

Deno.test("fake client exposes only the SELECT seam; no mutation", () => {
  const client = createFakeClient({ data: null, error: null }, []);
  assert(
    !("insert" in client) &&
      !("update" in client) &&
      !("upsert" in client) &&
      !("delete" in client),
    "client surface has no mutation methods",
  );
});
