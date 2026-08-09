/**
 * Deno tests for resolveBillingCustomerTenant (I4.3BF).
 *
 * Run:
 *   deno test supabase/functions/_shared/resolveBillingCustomerTenant_test.ts
 *
 * No network/env/write/run capabilities required.
 */

import {
  classifyTenantBillingCustomerLookup,
  resolveBillingCustomerTenant,
  type BillingCustomerTenantLookupClient,
  type ResolveBillingCustomerTenantResult,
  type TenantBillingCustomerLookupError,
  type TenantBillingCustomerMappingRow,
} from "./resolveBillingCustomerTenant.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from historical reports. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const PROVIDER = "stripe";
const CUSTOMER_ID = "cus_test_resolver_synthetic_001";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\n  actual:   ${actualJson}\n  expected: ${expectedJson}`);
  }
}

function expectSuccess(
  result: ResolveBillingCustomerTenantResult,
): asserts result is Extract<ResolveBillingCustomerTenantResult, { ok: true }> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: ResolveBillingCustomerTenantResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
}

type FakeLookupResult = {
  data: TenantBillingCustomerMappingRow[] | null;
  error: TenantBillingCustomerLookupError | null;
};

type FakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
};

/**
 * Minimal SELECT-only fake: `.from().select().eq().eq()` → Promise.
 * Optionally throws to simulate transport/client failures.
 */
function createFakeClient(
  result: FakeLookupResult | (() => never),
  calls: FakeCall[],
): BillingCustomerTenantLookupClient {
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
                return Promise.resolve(result);
                },
              };
            },
          };
        },
      };
    },
  };
}

Deno.test("1. exactly one valid mapping → tenant_id", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(
    {
      data: [{ tenant_id: TENANT_A }],
      error: null,
    },
    calls,
  );

  const result = await resolveBillingCustomerTenant({
    provider: PROVIDER,
    provider_customer_id: CUSTOMER_ID,
    client,
  });

  expectSuccess(result);
  assertEquals(result.tenant_id, TENANT_A, "tenant_id");
  assertEquals(calls.length, 1, "one lookup");
  assertEquals(calls[0]?.table, "tenant_billing_customers", "table");
  assertEquals(calls[0]?.columns, "tenant_id", "select columns");
  assertEquals(
    calls[0]?.filters,
    [
      { column: "provider", value: PROVIDER },
      { column: "provider_customer_id", value: CUSTOMER_ID },
    ],
    "exact provider + provider_customer_id filters",
  );
});

Deno.test("2. zero mappings → tenant_mapping_not_found", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: [], error: null }, calls);

  const result = await resolveBillingCustomerTenant({
    provider: PROVIDER,
    provider_customer_id: CUSTOMER_ID,
    client,
  });

  expectFailure(result, "tenant_mapping_not_found");
});

Deno.test("3. multiple mappings → tenant_mapping_ambiguous (no first-row pick)", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(
    {
      data: [{ tenant_id: TENANT_A }, { tenant_id: TENANT_B }],
      error: null,
    },
    calls,
  );

  const result = await resolveBillingCustomerTenant({
    provider: PROVIDER,
    provider_customer_id: CUSTOMER_ID,
    client,
  });

  expectFailure(result, "tenant_mapping_ambiguous");
  assert(result.ok === false, "fail-closed");
  assert(
    !("tenant_id" in result),
    "must not return a tenant_id when ambiguous",
  );
});

Deno.test("4. lookup error → tenant_mapping_lookup_failed (no raw error leak)", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(
    {
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    },
    calls,
  );

  const result = await resolveBillingCustomerTenant({
    provider: PROVIDER,
    provider_customer_id: CUSTOMER_ID,
    client,
  });

  expectFailure(result, "tenant_mapping_lookup_failed");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public contract exposes only ok+reason",
  );
});

Deno.test("4b. thrown lookup → tenant_mapping_lookup_failed", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(() => {
    throw new Error("socket hang up with secret=sk_test_do_not_leak");
  }, calls);

  const result = await resolveBillingCustomerTenant({
    provider: PROVIDER,
    provider_customer_id: CUSTOMER_ID,
    client,
  });

  expectFailure(result, "tenant_mapping_lookup_failed");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("sk_test") && !serialized.includes("socket hang"),
    "must not leak raw exception text",
  );
});

Deno.test("5. row with invalid tenant_id → tenant_mapping_invalid", async () => {
  const cases: TenantBillingCustomerMappingRow[] = [
    { tenant_id: null },
    { tenant_id: undefined },
    { tenant_id: "" },
    { tenant_id: 123 },
    { tenant_id: { id: TENANT_A } },
  ];

  for (const row of cases) {
    const result = await resolveBillingCustomerTenant({
      provider: PROVIDER,
      provider_customer_id: CUSTOMER_ID,
      client: createFakeClient({ data: [row], error: null }, []),
    });
    expectFailure(result, "tenant_mapping_invalid");
  }
});

Deno.test("6. invalid provider/customer input → fail-closed", async () => {
  const client = createFakeClient({ data: [{ tenant_id: TENANT_A }], error: null }, []);

  expectFailure(
    await resolveBillingCustomerTenant({
      provider: "",
      provider_customer_id: CUSTOMER_ID,
      client,
    }),
    "invalid_provider",
  );
  expectFailure(
    await resolveBillingCustomerTenant({
      provider: null,
      provider_customer_id: CUSTOMER_ID,
      client,
    }),
    "invalid_provider",
  );
  expectFailure(
    await resolveBillingCustomerTenant({
      provider: 1,
      provider_customer_id: CUSTOMER_ID,
      client,
    }),
    "invalid_provider",
  );
  expectFailure(
    await resolveBillingCustomerTenant({
      provider: PROVIDER,
      provider_customer_id: "",
      client,
    }),
    "invalid_provider_customer_id",
  );
  expectFailure(
    await resolveBillingCustomerTenant({
      provider: PROVIDER,
      provider_customer_id: null,
      client,
    }),
    "invalid_provider_customer_id",
  );
});

Deno.test("6b. no silent casing/whitespace canonicalization of filters", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: [], error: null }, calls);

  await resolveBillingCustomerTenant({
    provider: "Stripe",
    provider_customer_id: " Cus_MixedCase ",
    client,
  });

  assertEquals(
    calls[0]?.filters,
    [
      { column: "provider", value: "Stripe" },
      { column: "provider_customer_id", value: " Cus_MixedCase " },
    ],
    "input identity must be preserved for DB filters",
  );
});

Deno.test("7. classify: never chooses first row when ambiguous", () => {
  const result = classifyTenantBillingCustomerLookup({
    error: null,
    rows: [{ tenant_id: TENANT_A }, { tenant_id: TENANT_B }],
  });
  expectFailure(result, "tenant_mapping_ambiguous");
});

Deno.test("7b. classify: single valid / empty / error / invalid / non-array", () => {
  expectSuccess(
    classifyTenantBillingCustomerLookup({
      error: null,
      rows: [{ tenant_id: TENANT_A }],
    }),
  );
  expectFailure(
    classifyTenantBillingCustomerLookup({ error: null, rows: [] }),
    "tenant_mapping_not_found",
  );
  expectFailure(
    classifyTenantBillingCustomerLookup({
      error: { code: "XX000", message: "internal" },
      rows: [{ tenant_id: TENANT_A }],
    }),
    "tenant_mapping_lookup_failed",
  );
  expectFailure(
    classifyTenantBillingCustomerLookup({
      error: null,
      rows: [{ tenant_id: null }],
    }),
    "tenant_mapping_invalid",
  );
  expectFailure(
    classifyTenantBillingCustomerLookup({ error: null, rows: null }),
    "tenant_mapping_lookup_failed",
  );
});

Deno.test("8. no metadata tenant_id fallback in resolver contract", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: [], error: null }, calls);

  // API accepts only provider + provider_customer_id + client.
  // Even if a caller held a metadata tenant_id, it is not an input and cannot
  // override a missing mapping.
  const metadataTenantId = TENANT_A;
  const result = await resolveBillingCustomerTenant({
    provider: PROVIDER,
    provider_customer_id: CUSTOMER_ID,
    client,
  });

  expectFailure(result, "tenant_mapping_not_found");
  assert(
    metadataTenantId === TENANT_A,
    "metadata tenant remains unused local variable",
  );
  assertEquals(calls.length, 1, "still performs DB lookup only");
  assert(
    !JSON.stringify(calls[0]).includes(metadataTenantId),
    "lookup filters must not include metadata tenant_id",
  );
});
