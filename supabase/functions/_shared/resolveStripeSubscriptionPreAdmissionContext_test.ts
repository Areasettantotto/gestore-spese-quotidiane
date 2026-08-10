/**
 * Deno tests for resolveStripeSubscriptionPreAdmissionContext (I4.3BL).
 *
 * Orchestration / identity / ownership — not a full BJ/BF/BI suite replica.
 *
 * Run:
 *   deno test supabase/functions/_shared/resolveStripeSubscriptionPreAdmissionContext_test.ts
 *
 * No network/env/write/run capabilities required.
 */

import {
  resolveStripeSubscriptionPreAdmissionContext,
  type ResolveStripeSubscriptionPreAdmissionContextResult,
} from "./resolveStripeSubscriptionPreAdmissionContext.ts";
import type { StripeSubscriptionRetrieveClient } from "./refetchStripeSubscription.ts";
import type { StripeSubscriptionLike } from "./normalizeStripeSubscription.ts";
import type {
  BillingCustomerTenantLookupClient,
  TenantBillingCustomerLookupError,
  TenantBillingCustomerMappingRow,
} from "./resolveBillingCustomerTenant.ts";
import type {
  TenantSubscriptionObservationLookupClient,
  TenantSubscriptionObservationLookupError,
  TenantSubscriptionObservationRow,
} from "./readTenantSubscriptionObservation.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic fixtures — neutral sentinels; not credential/path-like. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const SUB_ID_A = "sub_test_preadmit_synthetic_a";
const SUB_ID_B = "sub_test_preadmit_synthetic_b";
const CUSTOMER_ID = "cus_test_preadmit_synthetic_001";
const SUPPORTED_PRICE = "price_test_pro_monthly_supported";
const CONFIG = { supportedProMonthlyPriceId: SUPPORTED_PRICE };
const CONFIG_OTHER = { supportedProMonthlyPriceId: "price_test_other_unsupported" };

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
  result: ResolveStripeSubscriptionPreAdmissionContextResult,
): asserts result is Extract<
  ResolveStripeSubscriptionPreAdmissionContextResult,
  { ok: true }
> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: ResolveStripeSubscriptionPreAdmissionContextResult,
  stage: string,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.stage, stage, "failure stage");
  assertEquals(result.reason, reason, "failure reason");
}

// --- Fake Stripe (BJ/BG surface) ---

type FakeRetrieveMode =
  | { kind: "resolve"; value: unknown }
  | { kind: "reject"; error: unknown };

type StripeCall = { id: string };

function createFakeStripe(
  mode: FakeRetrieveMode,
  calls: StripeCall[],
): StripeSubscriptionRetrieveClient {
  return {
    subscriptions: {
      retrieve(id: string) {
        calls.push({ id });
        if (mode.kind === "reject") {
          return Promise.reject(mode.error);
        }
        return Promise.resolve(mode.value);
      },
    },
  };
}

function validRawSubscription(
  overrides: Partial<StripeSubscriptionLike> = {},
): StripeSubscriptionLike {
  return {
    id: SUB_ID_A,
    customer: CUSTOMER_ID,
    status: "active",
    current_period_start: 1_700_000_000,
    current_period_end: 1_700_267_200,
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { plan_code: "pro_monthly" },
    items: {
      data: [{ price: { id: SUPPORTED_PRICE } }],
    },
    ...overrides,
  };
}

// --- Fake BF client ---

type BfLookupResult = {
  data: TenantBillingCustomerMappingRow[] | null;
  error: TenantBillingCustomerLookupError | null;
};

type BfCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
};

function createFakeBfClient(
  result: BfLookupResult | (() => never),
  calls: BfCall[],
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

// --- Fake BI client ---

type BiLookupResult = {
  data: TenantSubscriptionObservationRow[] | null;
  error: TenantSubscriptionObservationLookupError | null;
};

type BiCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
};

function createFakeBiClient(
  result: BiLookupResult | (() => never),
  calls: BiCall[],
): TenantSubscriptionObservationLookupClient {
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

function presentRow(
  overrides: Partial<TenantSubscriptionObservationRow> = {},
): TenantSubscriptionObservationRow {
  return {
    tenant_id: TENANT_A,
    last_applied_provider_event_created_at: null,
    last_applied_provider_event_id: null,
    ...overrides,
  };
}

function bfSuccessTenantA(): BfLookupResult {
  return { data: [{ tenant_id: TENANT_A }], error: null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("1. success: BI ROW_ABSENT → tenant A + row_absent", async () => {
  const stripeCalls: StripeCall[] = [];
  const bfCalls: BfCall[] = [];
  const biCalls: BiCall[] = [];

  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription() },
      stripeCalls,
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), bfCalls),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [], error: null },
      biCalls,
    ),
  });

  expectSuccess(result);
  assertEquals(result.tenant_id, TENANT_A, "tenant_id from BF");
  assertEquals(result.observation, { kind: "row_absent" }, "ROW_ABSENT");
  assertEquals(
    result.normalized_subscription.provider_subscription_id,
    SUB_ID_A,
    "normalized subscription id",
  );
  assertEquals(
    result.normalized_subscription.provider_customer_id,
    CUSTOMER_ID,
    "normalized customer id",
  );
  assertEquals(stripeCalls.length, 1, "BJ retrieve once");
  assertEquals(bfCalls.length, 1, "BF once");
  assertEquals(biCalls.length, 1, "BI once");
});

Deno.test("2. success: BI ROW_PRESENT same tenant", async () => {
  const bfCalls: BfCall[] = [];
  const biCalls: BiCall[] = [];
  const stripeCalls: StripeCall[] = [];

  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription() },
      stripeCalls,
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), bfCalls),
    tenantSubscriptionObservationClient: createFakeBiClient(
      {
        data: [
          presentRow({
            tenant_id: TENANT_A,
            last_applied_provider_event_created_at: 1_700_000_100,
            last_applied_provider_event_id: "evt_test_preadmit_001",
          }),
        ],
        error: null,
      },
      biCalls,
    ),
  });

  expectSuccess(result);
  assertEquals(result.tenant_id, TENANT_A, "tenant_id");
  assertEquals(result.observation.kind, "row_present", "ROW_PRESENT");
  if (result.observation.kind === "row_present") {
    assertEquals(result.observation.tenant_id, TENANT_A, "observation tenant");
  }
});

Deno.test("3. ROW_PRESENT NULL/NULL stays ROW_PRESENT (not absent)", async () => {
  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription() },
      [],
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), []),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [presentRow()], error: null },
      [],
    ),
  });

  expectSuccess(result);
  assertEquals(result.observation.kind, "row_present", "must stay present");
  if (result.observation.kind === "row_present") {
    assertEquals(
      result.observation.last_applied_provider_event_created_at,
      null,
      "W created_at null",
    );
    assertEquals(
      result.observation.last_applied_provider_event_id,
      null,
      "W event_id null",
    );
  }
});

Deno.test("4. ownership mismatch → subscription_ownership_mismatch", async () => {
  const biCalls: BiCall[] = [];

  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription() },
      [],
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), []),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [presentRow({ tenant_id: TENANT_B })], error: null },
      biCalls,
    ),
  });

  expectFailure(result, "ownership", "subscription_ownership_mismatch");
  assert(
    !("tenant_id" in result) && !("normalized_subscription" in result),
    "must not expose success context on ownership mismatch",
  );
  assertEquals(biCalls.length, 1, "BI was called before ownership check");
});

Deno.test("5. identity mismatch → BF/BI not called", async () => {
  const stripeCalls: StripeCall[] = [];
  const bfCalls: BfCall[] = [];
  const biCalls: BiCall[] = [];

  // Bootstrap A; provider returns subscription id B → BE normalizes to B.
  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription({ id: SUB_ID_B }) },
      stripeCalls,
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), bfCalls),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [], error: null },
      biCalls,
    ),
  });

  expectFailure(result, "identity", "subscription_identity_mismatch");
  assertEquals(stripeCalls.length, 1, "BJ retrieve ran");
  assertEquals(bfCalls.length, 0, "BF must not run after identity mismatch");
  assertEquals(biCalls.length, 0, "BI must not run after identity mismatch");
});

Deno.test("6. BJ refetch failure preserved; BF/BI not called", async () => {
  const bfCalls: BfCall[] = [];
  const biCalls: BiCall[] = [];

  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "reject", error: { message: "RAW_PROVIDER_TRANSPORT" } },
      [],
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), bfCalls),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [], error: null },
      biCalls,
    ),
  });

  expectFailure(result, "refetch", "stripe_subscription_refetch_failed");
  assertEquals(bfCalls.length, 0, "BF not called");
  assertEquals(biCalls.length, 0, "BI not called");
});

Deno.test("7. BJ normalize failure preserved; BF/BI not called", async () => {
  const bfCalls: BfCall[] = [];
  const biCalls: BiCall[] = [];

  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      {
        kind: "resolve",
        value: validRawSubscription({ status: "not_a_real_status" }),
      },
      [],
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), bfCalls),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [], error: null },
      biCalls,
    ),
  });

  expectFailure(result, "normalize", "unsupported_status");
  assertEquals(bfCalls.length, 0, "BF not called");
  assertEquals(biCalls.length, 0, "BI not called");
});

Deno.test("8. BF failure preserved; BI not called", async () => {
  const biCalls: BiCall[] = [];

  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription() },
      [],
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(
      { data: [], error: null },
      [],
    ),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [], error: null },
      biCalls,
    ),
  });

  expectFailure(result, "resolve_tenant", "tenant_mapping_not_found");
  assertEquals(biCalls.length, 0, "BI not called after BF failure");
});

Deno.test("9. BI failure preserved; no ownership success", async () => {
  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription() },
      [],
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), []),
    tenantSubscriptionObservationClient: createFakeBiClient(
      {
        data: null,
        error: { code: "RAW_DB", message: "RAW_LOOKUP_DETAIL" },
      },
      [],
    ),
  });

  expectFailure(
    result,
    "observe_subscription",
    "subscription_observation_lookup_failed",
  );
  assert(
    !("observation" in result) && !("tenant_id" in result),
    "must not return ownership success context on BI failure",
  );
});

Deno.test("10. provenance: BF customer id + BI subscription id from normalized", async () => {
  const bfCalls: BfCall[] = [];
  const biCalls: BiCall[] = [];
  const normalizedCustomer = "cus_test_preadmit_from_normalized";
  const normalizedSub = SUB_ID_A;

  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: normalizedSub,
    stripe: createFakeStripe(
      {
        kind: "resolve",
        value: validRawSubscription({
          id: normalizedSub,
          customer: normalizedCustomer,
        }),
      },
      [],
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), bfCalls),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [], error: null },
      biCalls,
    ),
  });

  expectSuccess(result);
  assertEquals(bfCalls.length, 1, "BF called once");
  assertEquals(biCalls.length, 1, "BI called once");
  assertEquals(
    bfCalls[0]?.filters,
    [
      { column: "provider", value: "stripe" },
      { column: "provider_customer_id", value: normalizedCustomer },
    ],
    "BF uses normalized provider_customer_id exactly",
  );
  assertEquals(
    biCalls[0]?.filters,
    [
      { column: "provider", value: "stripe" },
      { column: "provider_subscription_id", value: normalizedSub },
    ],
    "BI uses normalized provider_subscription_id exactly",
  );
});

Deno.test("11. config forwarded to BJ/BE (no Deno.env)", async () => {
  // Wrong config → normalize unsupported_price (proves config forwarding).
  const resultWrong = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription() },
      [],
    ),
    config: CONFIG_OTHER,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), []),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [], error: null },
      [],
    ),
  });
  expectFailure(resultWrong, "normalize", "unsupported_price");

  // Correct config → success.
  const resultOk = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe: createFakeStripe(
      { kind: "resolve", value: validRawSubscription() },
      [],
    ),
    config: CONFIG,
    billingCustomerTenantClient: createFakeBfClient(bfSuccessTenantA(), []),
    tenantSubscriptionObservationClient: createFakeBiClient(
      { data: [], error: null },
      [],
    ),
  });
  expectSuccess(resultOk);
});

Deno.test("12. sequencing: no BF/BI before BJ success + identity", async () => {
  const bfCalls: BfCall[] = [];
  const biCalls: BiCall[] = [];
  const order: string[] = [];

  const stripe: StripeSubscriptionRetrieveClient = {
    subscriptions: {
      retrieve(id: string) {
        order.push("stripe");
        assertEquals(id, SUB_ID_A, "retrieve identity");
        assertEquals(bfCalls.length, 0, "BF before retrieve complete");
        assertEquals(biCalls.length, 0, "BI before retrieve complete");
        return Promise.resolve(validRawSubscription());
      },
    },
  };

  const bfClient: BillingCustomerTenantLookupClient = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column1: string, value1: string) {
              return {
                eq(column2: string, value2: string) {
                  order.push("bf");
                  bfCalls.push({
                    table,
                    columns,
                    filters: [
                      { column: column1, value: value1 },
                      { column: column2, value: value2 },
                    ],
                  });
                  assert(
                    order[0] === "stripe",
                    "BF must run only after Stripe retrieve",
                  );
                  assertEquals(biCalls.length, 0, "BI must not precede BF");
                  return Promise.resolve(bfSuccessTenantA());
                },
              };
            },
          };
        },
      };
    },
  };

  const biClient: TenantSubscriptionObservationLookupClient = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column1: string, value1: string) {
              return {
                eq(column2: string, value2: string) {
                  order.push("bi");
                  biCalls.push({
                    table,
                    columns,
                    filters: [
                      { column: column1, value: value1 },
                      { column: column2, value: value2 },
                    ],
                  });
                  assertEquals(order, ["stripe", "bf", "bi"], "full sequence");
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await resolveStripeSubscriptionPreAdmissionContext({
    provider_subscription_id: SUB_ID_A,
    stripe,
    config: CONFIG,
    billingCustomerTenantClient: bfClient,
    tenantSubscriptionObservationClient: biClient,
  });

  expectSuccess(result);
  assertEquals(order, ["stripe", "bf", "bi"], "BJ → BF → BI order");
}
);
