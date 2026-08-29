/**
 * Deno tests for readTenantStripeSubscriptionObservations (BILLING-81).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/readTenantStripeSubscriptionObservations_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import {
  classifyTenantStripeSubscriptionObservationsLookup,
  readTenantStripeSubscriptionObservations,
  type ReadTenantStripeSubscriptionObservationsResult,
  type TenantStripeSubscriptionObservationLookupClient,
  type TenantStripeSubscriptionObservationLookupError,
  type TenantStripeSubscriptionObservationLookupResponse,
  type TenantStripeSubscriptionObservationRow,
} from "./readTenantStripeSubscriptionObservations.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from production or historical reports. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const PERIOD_END = "2023-12-14T22:01:40.000Z";

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
  result: ReadTenantStripeSubscriptionObservationsResult,
): asserts result is Extract<
  ReadTenantStripeSubscriptionObservationsResult,
  { ok: true }
> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: ReadTenantStripeSubscriptionObservationsResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
}

type FakeLookupResult = {
  data: unknown;
  error: TenantStripeSubscriptionObservationLookupError | null;
};

type FakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
};

/**
 * Minimal SELECT-only fake: `.from().select().eq().eq()` → Promise.
 * No insert / update / upsert / delete / single / maybeSingle / limit / order.
 * Optionally throws to simulate transport/client failures.
 */
function createFakeClient(
  result:
    | FakeLookupResult
    | TenantStripeSubscriptionObservationLookupResponse
    | (() => never),
  calls: FakeCall[],
): TenantStripeSubscriptionObservationLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column1: string, value1: string) {
              return {
                eq(column2: string, value2: string) {
                  calls.push({
                    table,
                    columns,
                    filters: [
                      { column: column1, value: value1 },
                      { column: column2, value: value2 },
                    ],
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
                    data: TenantStripeSubscriptionObservationRow[] | null;
                    error: TenantStripeSubscriptionObservationLookupError | null;
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
  overrides: Partial<TenantStripeSubscriptionObservationRow> = {},
): TenantStripeSubscriptionObservationRow {
  return {
    product_tier: "base",
    status: "active",
    current_period_end: PERIOD_END,
    ...overrides,
  };
}

function observationKeys(
  result: Extract<
    ReadTenantStripeSubscriptionObservationsResult,
    { ok: true }
  >,
): string[] {
  const keys = new Set<string>();
  for (const observation of result.observations) {
    for (const key of Object.keys(observation)) {
      keys.add(key);
    }
  }
  return [...keys].sort();
}

Deno.test("1+2+3. Base / Pro / null product_tier are preserved as observations", async () => {
  const cases: Array<{
    product_tier: unknown;
    productTier: "base" | "pro" | null;
  }> = [
    { product_tier: "base", productTier: "base" },
    { product_tier: "pro", productTier: "pro" },
    { product_tier: null, productTier: null },
  ];

  for (const testCase of cases) {
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient(
        {
          data: [presentRow({ product_tier: testCase.product_tier })],
          error: null,
        },
        [],
      ),
    });
    expectSuccess(result);
    assertEquals(result.observations.length, 1, "one observation");
    assertEquals(
      result.observations[0]?.productTier,
      testCase.productTier,
      `product_tier ${String(testCase.product_tier)} preserved`,
    );
    const serializedTier = JSON.stringify(result.observations[0]?.productTier);
    assert(
      serializedTier !== '"free"' && serializedTier !== '"paid"',
      "null/base/pro must not collapse to free/paid",
    );
    assertEquals(
      Object.keys(result.observations[0] ?? {}).sort(),
      ["currentPeriodEnd", "productTier", "status"].sort(),
      "observation public fields only",
    );
  }
});

Deno.test("4. zero rows → success with observations []", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient({ data: [], error: null }, calls),
  });

  expectSuccess(result);
  assertEquals(result.observations, [], "empty observations");
  assertEquals(calls.length, 1, "one SELECT");
  assert(result.ok === true, "no-row is success, not lookup failure");
});

Deno.test("5. one row → one observation", async () => {
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: [presentRow({ product_tier: "pro", status: "trialing" })], error: null },
      [],
    ),
  });

  expectSuccess(result);
  assertEquals(result.observations.length, 1, "exactly one observation");
  assertEquals(
    result.observations[0],
    {
      productTier: "pro",
      status: "trialing",
      currentPeriodEnd: PERIOD_END,
    },
    "single observation mapped",
  );
});

Deno.test("6+7+8. multi-row preserves every row; no current-row selection; canceled/past_due kept", async () => {
  const rows = [
    presentRow({ product_tier: "base", status: "canceled" }),
    presentRow({ product_tier: "pro", status: "past_due" }),
    presentRow({ product_tier: null, status: "incomplete" }),
  ];
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient({ data: rows, error: null }, []),
  });

  expectSuccess(result);
  assertEquals(result.observations.length, 3, "all rows preserved");
  assertEquals(
    result.observations,
    [
      { productTier: "base", status: "canceled", currentPeriodEnd: PERIOD_END },
      { productTier: "pro", status: "past_due", currentPeriodEnd: PERIOD_END },
      { productTier: null, status: "incomplete", currentPeriodEnd: PERIOD_END },
    ],
    "multi-row observations in SELECT order without preference",
  );
  assert(
    !("current" in result) && !("candidate" in result),
    "must not select a current subscription or candidate",
  );
  assert(
    result.observations.some((observation) => observation.status === "canceled") &&
      result.observations.some((observation) => observation.status === "past_due"),
    "must not drop canceled/past_due rows",
  );
  assertEquals(
    result.observations.filter((observation) => observation.productTier === "pro")
      .length,
    1,
    "must not collapse Base/Pro into one row",
  );
});

Deno.test("9+10. status preserved exactly; no trim or lowercase", async () => {
  const statuses = ["active", "Active", "ACTIVE", " past_due", "canceled "];
  for (const status of statuses) {
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: [presentRow({ status })], error: null },
        [],
      ),
    });
    expectSuccess(result);
    assertEquals(
      result.observations[0]?.status,
      status,
      "status preserved without trim/lowercase",
    );
    assert(
      result.observations[0]?.status !== status.trim().toLowerCase() ||
        status === status.trim().toLowerCase(),
      "must not canonicalize status",
    );
  }
});

Deno.test("11+12. current_period_end string and null preserved; not expiresAt", async () => {
  const isoResult = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: [presentRow({ current_period_end: PERIOD_END })], error: null },
      [],
    ),
  });
  expectSuccess(isoResult);
  assertEquals(
    isoResult.observations[0]?.currentPeriodEnd,
    PERIOD_END,
    "ISO timestamptz preserved",
  );
  assert(
    !("expiresAt" in (isoResult.observations[0] ?? {})),
    "must not map current_period_end to expiresAt",
  );

  const nullResult = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: [presentRow({ current_period_end: null })], error: null },
      [],
    ),
  });
  expectSuccess(nullResult);
  assertEquals(
    nullResult.observations[0]?.currentPeriodEnd,
    null,
    "null current_period_end preserved",
  );
});

Deno.test("13+14+15+16. exact table, tenant filter, provider=stripe, minimal projection", async () => {
  const calls: FakeCall[] = [];
  await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_B,
    client: createFakeClient({ data: [], error: null }, calls),
  });

  assertEquals(calls.length, 1, "one SELECT");
  assertEquals(calls[0]?.table, "tenant_subscriptions", "table");
  assertEquals(
    calls[0]?.columns,
    "product_tier,status,current_period_end",
    "minimal projection",
  );
  assertEquals(
    calls[0]?.filters,
    [
      { column: "tenant_id", value: TENANT_B },
      { column: "provider", value: "stripe" },
    ],
    "exact tenant_id + provider=stripe filters",
  );
  assert(
    calls[0]?.filters[0]?.value !== TENANT_A,
    "must not substitute another tenant",
  );
});

Deno.test("17+18. projection omits Stripe identities and plan_code", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: [{
          ...presentRow(),
          provider_subscription_id: "sub_must_not_leak",
          provider_customer_id: "cus_must_not_leak",
          price_id: "price_must_not_leak",
          plan_code: "paid",
        } as TenantStripeSubscriptionObservationRow],
        error: null,
      },
      calls,
    ),
  });

  expectSuccess(result);
  const columns = calls[0]?.columns ?? "";
  assert(
    !columns.includes("plan_code") &&
      !columns.includes("provider_subscription_id") &&
      !columns.includes("provider_customer_id") &&
      !columns.includes("price") &&
      !columns.includes("id"),
    "must not project plan_code or Stripe identities",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("sub_must_not_leak") &&
      !serialized.includes("cus_must_not_leak") &&
      !serialized.includes("price_must_not_leak") &&
      !serialized.includes("plan_code") &&
      !serialized.includes("paid"),
    "must not return extra identity/plan_code fields",
  );
  assertEquals(
    observationKeys(result),
    ["currentPeriodEnd", "productTier", "status"].sort(),
    "public observation keys only",
  );
});

Deno.test("19. invalid tenantId → invalid_tenant_id, zero query", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: [], error: null }, calls);

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
      await readTenantStripeSubscriptionObservations({
        tenantId: invalid,
        client,
      }),
      "invalid_tenant_id",
    );
    assertEquals(calls.length, 0, "must not query on invalid tenantId");
  }
});

Deno.test("20. padded tenantId → invalid_tenant_id, zero query", async () => {
  const calls: FakeCall[] = [];
  const paddedTenant = " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ";
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: paddedTenant,
    client: createFakeClient({ data: [], error: null }, calls),
  });

  expectFailure(result, "invalid_tenant_id");
  assertEquals(calls.length, 0, "must not query on padded tenantId");
});

Deno.test("21. invalid product_tier → stripe_subscription_observation_invalid", async () => {
  const invalidTiers: unknown[] = [
    "free",
    "paid",
    "trial",
    "demo",
    "internal",
    "BASE",
    "Pro",
    "base ",
    " pro",
    "",
    undefined,
    1,
    true,
    {},
    [],
  ];

  for (const product_tier of invalidTiers) {
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: [presentRow({ product_tier })], error: null },
        [],
      ),
    });
    expectFailure(result, "stripe_subscription_observation_invalid");
    assert(
      !("observations" in result),
      "must not return observations when product_tier is invalid",
    );
  }
});

Deno.test("22+23. malformed / whitespace-only status → observation_invalid", async () => {
  const invalidStatuses: unknown[] = [
    null,
    undefined,
    "",
    " ",
    "   ",
    "\t",
    "\n",
    1,
    true,
    {},
    [],
  ];

  for (const status of invalidStatuses) {
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: [presentRow({ status })], error: null },
        [],
      ),
    });
    expectFailure(result, "stripe_subscription_observation_invalid");
    assert(
      !("observations" in result),
      "must not return observations when status is malformed",
    );
  }
});

Deno.test("24. malformed current_period_end → observation_invalid", async () => {
  const invalidEnds: unknown[] = [
    undefined,
    "",
    " ",
    "not-a-date",
    1_700_000_000,
    true,
    {},
    [],
  ];

  for (const current_period_end of invalidEnds) {
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: [presentRow({ current_period_end })], error: null },
        [],
      ),
    });
    expectFailure(result, "stripe_subscription_observation_invalid");
    assert(
      !("observations" in result),
      "must not return observations when current_period_end is malformed",
    );
  }
});

Deno.test("25. malformed row null/array/primitive → observation_invalid", async () => {
  const malformedRows: unknown[] = [null, [], "row", 1, true];

  for (const row of malformedRows) {
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: [row as TenantStripeSubscriptionObservationRow], error: null },
        [],
      ),
    });
    expectFailure(result, "stripe_subscription_observation_invalid");
    assert(
      !("observations" in result),
      "must not return observations for a malformed row",
    );
  }
});

Deno.test("26. one malformed row among many → entire failure, no partial success", async () => {
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: [
          presentRow({ product_tier: "base", status: "active" }),
          presentRow({ product_tier: "paid", status: "active" }),
          presentRow({ product_tier: "pro", status: "canceled" }),
        ],
        error: null,
      },
      [],
    ),
  });

  expectFailure(result, "stripe_subscription_observation_invalid");
  assert(
    !("observations" in result),
    "must not return a partial observations array",
  );
});

Deno.test("27+29. DB error → lookup_failed; raw text not exposed", async () => {
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: null,
        error: {
          code: "57014",
          message:
            "canceling statement due to statement timeout RAW_DB_DETAIL_ALPHA",
        },
      },
      [],
    ),
  });

  expectFailure(result, "stripe_subscription_lookup_failed");
  assert(
    !("observations" in result),
    "must not collapse query error to empty observations",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public contract exposes only ok+reason",
  );
  const serialized = JSON.stringify(result);
  assertEquals(
    serialized,
    '{"ok":false,"reason":"stripe_subscription_lookup_failed"}',
    "sanitized",
  );
  assert(
    !serialized.includes("RAW_DB_DETAIL_ALPHA") &&
      !serialized.includes("timeout") &&
      !serialized.includes("57014"),
    "must not leak raw DB error details",
  );
});

Deno.test("28. query throw/rejection → sanitized lookup_failed", async () => {
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(() => {
      throw new Error(
        "socket hang up with RAW_EXCEPTION_DETAIL_BETA RAW_PRIVATE_DETAIL_DELTA",
      );
    }, []),
  });

  expectFailure(result, "stripe_subscription_lookup_failed");
  assert(
    !("observations" in result),
    "must not collapse transport failure to empty observations",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_EXCEPTION_DETAIL_BETA") &&
      !serialized.includes("socket hang") &&
      !serialized.includes("RAW_PRIVATE_DETAIL_DELTA"),
    "must not leak raw exception text",
  );
});

Deno.test("30. malformed / non-array data → lookup_failed, not empty observations", async () => {
  const malformedData: unknown[] = [
    null,
    { product_tier: "base" },
    "rows",
    1,
    true,
  ];

  for (const data of malformedData) {
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient({ data, error: null }, []),
    });
    expectFailure(result, "stripe_subscription_lookup_failed");
    assert(
      !("observations" in result),
      "non-array data is lookup failure, not zero-row success",
    );
  }
});

Deno.test("31. fake client has no mutation methods", () => {
  const client = createFakeClient({ data: [], error: null }, []);
  const fromResult = client.from("tenant_subscriptions");
  assert(!("insert" in fromResult), "no insert");
  assert(!("update" in fromResult), "no update");
  assert(!("upsert" in fromResult), "no upsert");
  assert(!("delete" in fromResult), "no delete");
  assert(!("rpc" in fromResult), "no rpc");

  const selectResult = fromResult.select(
    "product_tier,status,current_period_end",
  );
  assert(!("insert" in selectResult), "select builder has no insert");
  assert(!("update" in selectResult), "select builder has no update");
  assert(!("upsert" in selectResult), "select builder has no upsert");
  assert(!("delete" in selectResult), "select builder has no delete");
  assert(!("maybeSingle" in selectResult), "no maybeSingle on select");
  assert(!("single" in selectResult), "no single on select");
  assert(!("limit" in selectResult), "no limit on select");
  assert(!("order" in selectResult), "no order on select");

  const firstEq = selectResult.eq("tenant_id", TENANT_A);
  assert(!("maybeSingle" in firstEq), "no maybeSingle after first eq");
  assert(!("single" in firstEq), "no single after first eq");
  assert(!("limit" in firstEq), "no limit after first eq");
  assert(!("order" in firstEq), "no order after first eq");
  assert(!("insert" in firstEq), "no insert after first eq");
});

Deno.test("32. no collateral tables; tenant_subscriptions only", async () => {
  const calls: FakeCall[] = [];
  await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient({ data: [], error: null }, calls),
  });

  assertEquals(calls.length, 1, "exactly one query");
  assertEquals(calls[0]?.table, "tenant_subscriptions", "subscription table");
  const forbidden = [
    "tenant_complimentary_access_grants",
    "tenant_complimentary_access_invites",
    "tenant_billing_customers",
    "billing_events",
    "tenant_memberships",
    "profiles",
    "tenants",
    "auth.users",
  ];
  for (const table of forbidden) {
    assert(calls[0]?.table !== table, `must not query ${table}`);
  }
});

Deno.test("33+34+35+36. no EntitlementCandidate / resolver / status policy / current-row pick", async () => {
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: [
          presentRow({ product_tier: "base", status: "canceled" }),
          presentRow({ product_tier: "pro", status: "active" }),
        ],
        error: null,
      },
      [],
    ),
  });

  expectSuccess(result);
  assertEquals(Object.keys(result).sort(), ["observations", "ok"].sort(), "envelope");
  for (const observation of result.observations) {
    assert(
      !("kind" in observation) &&
        !("tier" in observation) &&
        !("expiresAt" in observation),
      "observation is not an EntitlementCandidate",
    );
  }
  assert(
    result.observations.length === 2 &&
      result.observations[0]?.status === "canceled" &&
      result.observations[1]?.status === "active",
    "statuses remain observations, not valid/absent/invalid",
  );
  assert(
    !("effectiveAccess" in result) &&
      !("stripeCandidate" in result) &&
      !("current" in result),
    "must not compose effective access or pick current row",
  );
});

Deno.test("classify: error wins; empty is success; non-array lookup_failed", () => {
  expectFailure(
    classifyTenantStripeSubscriptionObservationsLookup({
      error: { code: "XX000", message: "internal RAW_CLASSIFY_DETAIL" },
      data: [presentRow()],
    }),
    "stripe_subscription_lookup_failed",
  );

  const absent = classifyTenantStripeSubscriptionObservationsLookup({
    error: null,
    data: [],
  });
  expectSuccess(absent);
  assertEquals(absent.observations, [], "empty → success []");

  expectFailure(
    classifyTenantStripeSubscriptionObservationsLookup({
      error: null,
      data: null,
    }),
    "stripe_subscription_lookup_failed",
  );

  const classified = classifyTenantStripeSubscriptionObservationsLookup({
    error: null,
    data: [presentRow({ product_tier: "pro" })],
  });
  expectSuccess(classified);
  assertEquals(classified.observations[0]?.productTier, "pro", "classify Pro");
});

Deno.test("error wins over present rows; DB error is not zero-row", async () => {
  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: [presentRow({ product_tier: "pro" })],
        error: {
          code: "PGRST116",
          message: "JSON object requested request_id=req_abc RAW_REQUEST_DETAIL",
        },
      },
      [],
    ),
  });

  expectFailure(result, "stripe_subscription_lookup_failed");
  assert(
    !("observations" in result),
    "non-null error must not return observations",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("PGRST") &&
      !serialized.includes("request_id") &&
      !serialized.includes("RAW_REQUEST_DETAIL") &&
      !serialized.includes("pro"),
    "no raw request/token/row leak",
  );
});

Deno.test("envelope missing error is lookup_failed, never empty observations success", async () => {
  const calls: FakeCall[] = [];
  const malformed = { data: [] } as unknown as FakeLookupResult;
  assert(
    !Object.prototype.hasOwnProperty.call(malformed, "error"),
    "fixture omits the error property",
  );

  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(malformed, calls),
  });

  expectFailure(result, "stripe_subscription_lookup_failed");
  assert(
    !("observations" in result),
    "missing error must never succeed as observations: []",
  );
  assertEquals(calls.length, 1, "query ran; failure is envelope, not skip");
});

Deno.test("envelope error: undefined is lookup_failed, never success", async () => {
  const malformed = {
    data: [],
    error: undefined,
  } as unknown as FakeLookupResult;
  assert(
    Object.prototype.hasOwnProperty.call(malformed, "error"),
    "fixture keeps an explicit undefined error property",
  );
  assertEquals(malformed.error, undefined, "error is undefined, not null");

  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_A,
    client: createFakeClient(malformed, []),
  });

  expectFailure(result, "stripe_subscription_lookup_failed");
  assert(
    !("observations" in result),
    "undefined error must never succeed as observations: []",
  );
});

Deno.test("envelope falsy non-null error is lookup_failed", async () => {
  const falsyErrors: unknown[] = [0, false, "", Number.NaN];

  for (const error of falsyErrors) {
    const malformed = {
      data: [presentRow()],
      error,
    } as unknown as FakeLookupResult;
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient(malformed, []),
    });
    expectFailure(result, "stripe_subscription_lookup_failed");
    assert(
      !("observations" in result),
      "falsy non-null error must not classify data",
    );
  }
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
    const result = await readTenantStripeSubscriptionObservations({
      tenantId: TENANT_A,
      client: createFakeClient(
        envelope as unknown as TenantStripeSubscriptionObservationLookupResponse,
        [],
      ),
    });
    expectFailure(result, "stripe_subscription_lookup_failed");
    assert(
      !("observations" in result),
      "malformed envelope must never succeed",
    );
  }
});
