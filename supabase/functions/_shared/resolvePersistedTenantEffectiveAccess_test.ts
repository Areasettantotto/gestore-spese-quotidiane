/**
 * Deno tests for resolvePersistedTenantEffectiveAccess (BILLING-83).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/resolvePersistedTenantEffectiveAccess_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import { mapTenantStripeSubscriptionObservationsToCandidate } from "./mapTenantStripeSubscriptionObservationsToCandidate.ts";
import {
  readTenantStripeSubscriptionObservations,
  type TenantStripeSubscriptionObservationLookupClient,
  type TenantStripeSubscriptionObservationLookupError,
  type TenantStripeSubscriptionObservationLookupResponse,
  type TenantStripeSubscriptionObservationRow,
} from "./readTenantStripeSubscriptionObservations.ts";
import {
  type ComplimentaryAccessGrantLookupClient,
  type ComplimentaryAccessGrantLookupError,
  type ComplimentaryAccessGrantRow,
} from "./readTenantComplimentaryAccessCandidate.ts";
import {
  resolveTenantEffectiveAccess,
} from "./resolveTenantEffectiveAccess.ts";
import {
  capabilitiesForTier,
  type AccessMode,
  type Capability,
  type EffectiveAccess,
  type ModeCapabilityProfiles,
  type ProductTier,
} from "./resolveEffectiveAccess.ts";
import {
  resolvePersistedTenantEffectiveAccess,
  type ResolvePersistedTenantEffectiveAccessResult,
} from "./resolvePersistedTenantEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from production or historical reports. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";

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
  result: ResolvePersistedTenantEffectiveAccessResult,
): asserts result is Extract<
  ResolvePersistedTenantEffectiveAccessResult,
  { ok: true }
> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
  assertEquals(
    Object.keys(result).sort(),
    ["effectiveAccess", "ok"].sort(),
    "success public fields only",
  );
}

function expectFailure(
  result: ResolvePersistedTenantEffectiveAccessResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(
    !("effectiveAccess" in result) &&
      !("stripeCandidate" in result) &&
      !("observations" in result) &&
      !("tier" in result) &&
      !("source" in result),
    "failure must not return partial composition output",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

const DEMO_PROFILE: readonly Capability[] = Object.freeze([
  "standard_dashboard",
  "ai_insights",
]);

const INTERNAL_PROFILE: readonly Capability[] = capabilitiesForTier("pro");

const MODE_PROFILES: ModeCapabilityProfiles = {
  demo: DEMO_PROFILE,
  internal: INTERNAL_PROFILE,
};

type StripeFakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
};

type ComplimentaryFakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
  maybeSingle: boolean;
};

type StripeFakeLookupResult = {
  data: unknown;
  error: TenantStripeSubscriptionObservationLookupError | null;
};

type ComplimentaryFakeLookupResult = {
  data: ComplimentaryAccessGrantRow | null;
  error: ComplimentaryAccessGrantLookupError | null;
};

/**
 * Minimal SELECT-only Stripe fake: `.from().select().eq().eq()` → Promise.
 * No insert / update / upsert / delete / single / maybeSingle.
 */
function createStripeFakeClient(
  result:
    | StripeFakeLookupResult
    | TenantStripeSubscriptionObservationLookupResponse
    | (() => never),
  calls: StripeFakeCall[],
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
                    error:
                      | TenantStripeSubscriptionObservationLookupError
                      | null;
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

/**
 * Minimal SELECT-only complimentary fake: `.from().select().eq().maybeSingle()`.
 */
function createComplimentaryFakeClient(
  result: ComplimentaryFakeLookupResult | (() => never),
  calls: ComplimentaryFakeCall[],
): ComplimentaryAccessGrantLookupClient {
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

function createThrowOnStripeFromClient(
  calls: StripeFakeCall[],
): TenantStripeSubscriptionObservationLookupClient {
  return {
    from(table: string) {
      calls.push({ table, columns: "", filters: [] });
      throw new Error(
        "stripe lookup must not run for non-commercial mode RAW_STRIPE_MODE_LOOKUP",
      );
    },
  };
}

function createThrowOnComplimentaryFromClient(
  calls: ComplimentaryFakeCall[],
): ComplimentaryAccessGrantLookupClient {
  return {
    from(table: string) {
      calls.push({
        table,
        columns: "",
        filters: [],
        maybeSingle: false,
      });
      throw new Error(
        "complimentary lookup must not run for non-commercial mode RAW_MODE_LOOKUP",
      );
    },
  };
}

function stripeRow(
  overrides: Partial<TenantStripeSubscriptionObservationRow> = {},
): TenantStripeSubscriptionObservationRow {
  return {
    product_tier: "base",
    status: "active",
    current_period_end: null,
    ...overrides,
  };
}

function stripeSuccess(
  rows: TenantStripeSubscriptionObservationRow[],
  calls: StripeFakeCall[],
): TenantStripeSubscriptionObservationLookupClient {
  return createStripeFakeClient({ data: rows, error: null }, calls);
}

function complimentaryGrant(
  productTier: ProductTier | null,
  calls: ComplimentaryFakeCall[],
): ComplimentaryAccessGrantLookupClient {
  if (productTier === null) {
    return createComplimentaryFakeClient({ data: null, error: null }, calls);
  }
  return createComplimentaryFakeClient(
    { data: { product_tier: productTier }, error: null },
    calls,
  );
}

async function wrap(params: {
  tenantId?: unknown;
  mode?: AccessMode;
  stripeClient: TenantStripeSubscriptionObservationLookupClient;
  complimentaryClient: ComplimentaryAccessGrantLookupClient;
}): Promise<ResolvePersistedTenantEffectiveAccessResult> {
  return await resolvePersistedTenantEffectiveAccess({
    tenantId: "tenantId" in params ? params.tenantId : TENANT_A,
    mode: params.mode ?? "standard",
    modeProfiles: MODE_PROFILES,
    stripeClient: params.stripeClient,
    complimentaryClient: params.complimentaryClient,
  });
}

async function manualCompose(params: {
  tenantId?: unknown;
  stripeClient: TenantStripeSubscriptionObservationLookupClient;
  complimentaryClient: ComplimentaryAccessGrantLookupClient;
}): Promise<ResolvePersistedTenantEffectiveAccessResult> {
  const tenantId = "tenantId" in params ? params.tenantId : TENANT_A;
  const stripeResult = await readTenantStripeSubscriptionObservations({
    tenantId,
    client: params.stripeClient,
  });
  if (stripeResult.ok === false) {
    return { ok: false, reason: stripeResult.reason };
  }
  const stripeCandidate = mapTenantStripeSubscriptionObservationsToCandidate(
    stripeResult.observations,
  );
  return await resolveTenantEffectiveAccess({
    tenantId,
    client: params.complimentaryClient,
    mode: "standard",
    stripeCandidate,
    modeProfiles: MODE_PROFILES,
  });
}

function expectGrantedStandard(
  access: EffectiveAccess,
  tier: ProductTier,
  source: "stripe" | "complimentary",
): void {
  assert(
    access.status === "granted" && access.mode === "standard",
    `expected granted standard, got ${JSON.stringify(access)}`,
  );
  assertEquals(access.tier, tier, "tier");
  assertEquals(access.source, source, "source");
}

function expectUnentitled(access: EffectiveAccess): void {
  assertEquals(access.status, "unentitled", "status");
  assertEquals(access.tier, null, "tier");
  assertEquals(access.source, null, "source");
}

function expectInvalidAccess(access: EffectiveAccess): void {
  assertEquals(access.status, "invalid", "status");
  assertEquals(access.tier, null, "tier");
  assertEquals(access.source, null, "source");
}

function assertNoPublicInternals(
  result: ResolvePersistedTenantEffectiveAccessResult,
): void {
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("observations") &&
      !serialized.includes("stripeCandidate") &&
      !("observations" in result) &&
      !("stripeCandidate" in result),
    "must not expose reader/mapper internals",
  );
}

Deno.test("A1. Stripe absent + complimentary absent → unentitled", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    stripeClient: stripeSuccess([], stripeCalls),
    complimentaryClient: complimentaryGrant(null, complimentaryCalls),
  });

  expectSuccess(result);
  expectUnentitled(result.effectiveAccess);
  assertEquals(stripeCalls.length, 1, "one Stripe SELECT");
  assertEquals(complimentaryCalls.length, 1, "one complimentary SELECT");
  assertNoPublicInternals(result);
});

Deno.test("A2. Stripe absent + complimentary Base → Base complimentary", async () => {
  const result = await wrap({
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant("base", []),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "base", "complimentary");
});

Deno.test("A3. Stripe absent + complimentary Pro → Pro complimentary", async () => {
  const result = await wrap({
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant("pro", []),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "pro", "complimentary");
});

Deno.test("B4. Stripe Base + complimentary absent → Base stripe", async () => {
  const result = await wrap({
    stripeClient: stripeSuccess([stripeRow({ product_tier: "base" })], []),
    complimentaryClient: complimentaryGrant(null, []),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "base", "stripe");
});

Deno.test("B5. Stripe Pro + complimentary absent → Pro stripe", async () => {
  const result = await wrap({
    stripeClient: stripeSuccess([stripeRow({ product_tier: "pro" })], []),
    complimentaryClient: complimentaryGrant(null, []),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "pro", "stripe");
});

Deno.test("B6. Stripe Base + complimentary Pro → Pro complimentary", async () => {
  const result = await wrap({
    stripeClient: stripeSuccess([stripeRow({ product_tier: "base" })], []),
    complimentaryClient: complimentaryGrant("pro", []),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "pro", "complimentary");
});

Deno.test("B7. Stripe Pro + complimentary Base → Pro stripe", async () => {
  const result = await wrap({
    stripeClient: stripeSuccess([stripeRow({ product_tier: "pro" })], []),
    complimentaryClient: complimentaryGrant("base", []),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "pro", "stripe");
});

Deno.test("B8. Stripe Base + complimentary Base → Base stripe tie-break", async () => {
  const result = await wrap({
    stripeClient: stripeSuccess([stripeRow({ product_tier: "base" })], []),
    complimentaryClient: complimentaryGrant("base", []),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "base", "stripe");
});

Deno.test("B9. Stripe Pro + complimentary Pro → Pro stripe tie-break", async () => {
  const result = await wrap({
    stripeClient: stripeSuccess([stripeRow({ product_tier: "pro" })], []),
    complimentaryClient: complimentaryGrant("pro", []),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "pro", "stripe");
});

Deno.test("C10. semantic invalid + complimentary absent → EffectiveAccess invalid", async () => {
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    stripeClient: stripeSuccess([
      stripeRow({ product_tier: "base", status: "active" }),
      stripeRow({ product_tier: "pro", status: "active" }),
    ], []),
    complimentaryClient: complimentaryGrant(null, complimentaryCalls),
  });

  expectSuccess(result);
  expectInvalidAccess(result.effectiveAccess);
  assertEquals(
    complimentaryCalls.length,
    1,
    "semantic invalid still delegates to resolveTenantEffectiveAccess",
  );
  assert(result.ok === true, "candidate invalid is not a wrapper failure");
});

Deno.test("C11. semantic invalid + complimentary Base → Base complimentary", async () => {
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    stripeClient: stripeSuccess([
      stripeRow({ product_tier: "base", status: "active" }),
      stripeRow({ product_tier: "pro", status: "active" }),
    ], []),
    complimentaryClient: complimentaryGrant("base", complimentaryCalls),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "base", "complimentary");
  assertEquals(complimentaryCalls.length, 1, "delegated composition ran");
});

Deno.test("C12. semantic invalid + complimentary Pro → Pro complimentary", async () => {
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    stripeClient: stripeSuccess([
      stripeRow({ product_tier: "base", status: "active" }),
      stripeRow({ product_tier: "pro", status: "active" }),
    ], []),
    complimentaryClient: complimentaryGrant("pro", complimentaryCalls),
  });

  expectSuccess(result);
  expectGrantedStandard(result.effectiveAccess, "pro", "complimentary");
  assertEquals(complimentaryCalls.length, 1, "delegated composition ran");
});

async function expectReaderFailureStopsComposition(
  stripeClient: TenantStripeSubscriptionObservationLookupClient,
  stripeCalls: StripeFakeCall[],
  reason: string,
): Promise<void> {
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    stripeClient,
    complimentaryClient: complimentaryGrant("pro", complimentaryCalls),
  });

  expectFailure(result, reason);
  assertEquals(
    complimentaryCalls.length,
    0,
    "reader failure must not query complimentary",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("pro") &&
      serialized === `{"ok":false,"reason":"${reason}"}`,
    "sanitized failure only; complimentary Pro must not win",
  );
  void stripeCalls;
}

Deno.test("D13. invalid_tenant_id reader failure stops composition", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    tenantId: "not-a-uuid",
    stripeClient: stripeSuccess([stripeRow()], stripeCalls),
    complimentaryClient: complimentaryGrant("pro", complimentaryCalls),
  });

  expectFailure(result, "invalid_tenant_id");
  assertEquals(stripeCalls.length, 0, "Stripe reader must not query");
  assertEquals(complimentaryCalls.length, 0, "complimentary must not query");
});

Deno.test("D14. stripe_subscription_lookup_failed stops composition", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  await expectReaderFailureStopsComposition(
    createStripeFakeClient(
      {
        data: null,
        error: {
          code: "57014",
          message:
            "canceling statement due to statement timeout RAW_DB_DETAIL_ALPHA",
        },
      },
      stripeCalls,
    ),
    stripeCalls,
    "stripe_subscription_lookup_failed",
  );
});

Deno.test("D15. stripe_subscription_observation_invalid stops composition", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  await expectReaderFailureStopsComposition(
    createStripeFakeClient(
      {
        data: [stripeRow({ product_tier: "paid" })],
        error: null,
      },
      stripeCalls,
    ),
    stripeCalls,
    "stripe_subscription_observation_invalid",
  );
});

Deno.test("D16. DB/raw error detail does not leak", async () => {
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    stripeClient: createStripeFakeClient(
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
    complimentaryClient: complimentaryGrant("pro", complimentaryCalls),
  });

  expectFailure(result, "stripe_subscription_lookup_failed");
  const serialized = JSON.stringify(result);
  assertEquals(
    serialized,
    '{"ok":false,"reason":"stripe_subscription_lookup_failed"}',
    "sanitized",
  );
  assert(
    !serialized.includes("RAW_DB_DETAIL_ALPHA") &&
      !serialized.includes("timeout") &&
      !serialized.includes("57014") &&
      !serialized.includes("pro") &&
      !serialized.includes(TENANT_A),
    "must not leak raw DB error, tenant id, or fallback tier",
  );
  assertEquals(complimentaryCalls.length, 0, "no complimentary after lookup failure");
});

Deno.test("E17. mode=demo: zero commercial queries; Demo semantics", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    mode: "demo",
    stripeClient: createThrowOnStripeFromClient(stripeCalls),
    complimentaryClient: createThrowOnComplimentaryFromClient(
      complimentaryCalls,
    ),
  });

  expectSuccess(result);
  const expected = await resolveTenantEffectiveAccess({
    tenantId: TENANT_A,
    client: createThrowOnComplimentaryFromClient([]),
    mode: "demo",
    stripeCandidate: { kind: "absent" },
    modeProfiles: MODE_PROFILES,
  });
  assertEquals(result, expected, "demo matches resolveTenantEffectiveAccess");
  assertEquals(result.effectiveAccess.mode, "demo", "demo mode");
  assertEquals(result.effectiveAccess.tier, null, "Demo is not a ProductTier");
  assertEquals(result.effectiveAccess.source, null, "Demo has no commercial source");
  assertEquals(stripeCalls.length, 0, "demo must not query Stripe");
  assertEquals(complimentaryCalls.length, 0, "demo must not query complimentary");
});

Deno.test("E18. mode=internal: zero commercial queries; Internal semantics", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await wrap({
    mode: "internal",
    stripeClient: createThrowOnStripeFromClient(stripeCalls),
    complimentaryClient: createThrowOnComplimentaryFromClient(
      complimentaryCalls,
    ),
  });

  expectSuccess(result);
  const expected = await resolveTenantEffectiveAccess({
    tenantId: TENANT_A,
    client: createThrowOnComplimentaryFromClient([]),
    mode: "internal",
    stripeCandidate: { kind: "absent" },
    modeProfiles: MODE_PROFILES,
  });
  assertEquals(result, expected, "internal matches resolveTenantEffectiveAccess");
  assertEquals(result.effectiveAccess.mode, "internal", "internal mode");
  assertEquals(result.effectiveAccess.tier, null, "Internal is not a ProductTier");
  assertEquals(
    result.effectiveAccess.source,
    null,
    "Internal has no commercial source",
  );
  assertEquals(stripeCalls.length, 0, "internal must not query Stripe");
  assertEquals(
    complimentaryCalls.length,
    0,
    "internal must not query complimentary",
  );
});

Deno.test("E19. Demo/Internal ignore a Stripe client that would fail if called", async () => {
  for (const mode of ["demo", "internal"] as const) {
    const stripeCalls: StripeFakeCall[] = [];
    const complimentaryCalls: ComplimentaryFakeCall[] = [];
    const result = await wrap({
      mode,
      stripeClient: createStripeFakeClient(() => {
        throw new Error("stripe must not be called RAW_STRIPE_FAIL_IF_HIT");
      }, stripeCalls),
      complimentaryClient: createComplimentaryFakeClient(() => {
        throw new Error("complimentary must not be called RAW_COMPLIMENTARY_FAIL");
      }, complimentaryCalls),
    });

    expectSuccess(result);
    assertEquals(result.effectiveAccess.mode, mode, `${mode} mode`);
    assertEquals(stripeCalls.length, 0, `${mode} Stripe calls`);
    assertEquals(complimentaryCalls.length, 0, `${mode} complimentary calls`);
    const serialized = JSON.stringify(result);
    assert(
      !serialized.includes("RAW_STRIPE_FAIL_IF_HIT") &&
        !serialized.includes("RAW_COMPLIMENTARY_FAIL"),
      "failing commercial clients must not run",
    );
  }
});

Deno.test("F20. invalid tenantId standard → fail closed, zero complimentary", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const client = stripeSuccess([], stripeCalls);
  const complimentary = complimentaryGrant("pro", complimentaryCalls);

  for (const invalid of [
    null,
    undefined,
    "",
    " ",
    "not-a-uuid",
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee",
    " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ",
  ]) {
    stripeCalls.length = 0;
    complimentaryCalls.length = 0;
    const result = await wrap({
      tenantId: invalid,
      stripeClient: client,
      complimentaryClient: complimentary,
    });
    expectFailure(result, "invalid_tenant_id");
    assertEquals(stripeCalls.length, 0, "must not query Stripe");
    assertEquals(complimentaryCalls.length, 0, "must not query complimentary");
  }
});

Deno.test("F21. invalid tenantId demo/internal follows existing resolver; zero commercial queries", async () => {
  for (const mode of ["demo", "internal"] as const) {
    const stripeCalls: StripeFakeCall[] = [];
    const complimentaryCalls: ComplimentaryFakeCall[] = [];
    const result = await wrap({
      tenantId: "not-a-uuid",
      mode,
      stripeClient: createThrowOnStripeFromClient(stripeCalls),
      complimentaryClient: createThrowOnComplimentaryFromClient(
        complimentaryCalls,
      ),
    });
    const expected = await resolveTenantEffectiveAccess({
      tenantId: "not-a-uuid",
      client: createThrowOnComplimentaryFromClient([]),
      mode,
      stripeCandidate: { kind: "absent" },
      modeProfiles: MODE_PROFILES,
    });
    assertEquals(
      result,
      expected,
      `${mode} invalid tenantId matches existing resolver`,
    );
    assertEquals(stripeCalls.length, 0, `${mode} Stripe calls`);
    assertEquals(complimentaryCalls.length, 0, `${mode} complimentary calls`);
  }
});

Deno.test("F22. exact tenantId is passed unchanged to the Stripe reader", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  await wrap({
    tenantId: TENANT_B,
    stripeClient: stripeSuccess([], stripeCalls),
    complimentaryClient: complimentaryGrant(null, complimentaryCalls),
  });

  assertEquals(stripeCalls.length, 1, "one Stripe SELECT");
  assertEquals(
    stripeCalls[0]?.filters[0],
    { column: "tenant_id", value: TENANT_B },
    "Stripe filter uses received tenantId",
  );
  assert(
    stripeCalls[0]?.filters[0]?.value !== TENANT_A,
    "must not substitute another tenant",
  );
  assertEquals(
    complimentaryCalls[0]?.filters[0],
    { column: "tenant_id", value: TENANT_B },
    "complimentary filter uses the same tenantId",
  );
});

Deno.test("G23. wrapper matches manual reader → mapper → resolveTenantEffectiveAccess", async () => {
  const rows = [
    stripeRow({ product_tier: "base", status: "active" }),
    stripeRow({ product_tier: "pro", status: "canceled" }),
  ];
  const wrapperResult = await wrap({
    stripeClient: stripeSuccess(rows, []),
    complimentaryClient: complimentaryGrant("pro", []),
  });
  const manual = await manualCompose({
    stripeClient: stripeSuccess(rows, []),
    complimentaryClient: complimentaryGrant("pro", []),
  });
  assertEquals(wrapperResult, manual, "wrapper equals manual composition");
});

Deno.test("G24. multi-row / order semantics remain those of BILLING-82", async () => {
  const forward = [
    stripeRow({ product_tier: "pro", status: "canceled" }),
    stripeRow({ product_tier: "base", status: "active" }),
    stripeRow({ product_tier: "pro", status: "unpaid" }),
  ];
  const reversed = [...forward].reverse();

  const forwardResult = await wrap({
    stripeClient: stripeSuccess(forward, []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  const reversedResult = await wrap({
    stripeClient: stripeSuccess(reversed, []),
    complimentaryClient: complimentaryGrant(null, []),
  });

  expectSuccess(forwardResult);
  expectGrantedStandard(forwardResult.effectiveAccess, "base", "stripe");
  assertEquals(
    reversedResult,
    forwardResult,
    "row order must not change the mapped candidate",
  );
});

Deno.test("G25+G26+H27–H30. production wrapper has no duplicated policy, DB, clock, or SDK", () => {
  const source = resolvePersistedTenantEffectiveAccess.toString();
  const statusTokens = [
    '"active"',
    '"trialing"',
    '"past_due"',
    '"unpaid"',
    '"incomplete"',
    '"paused"',
    '"suspended"',
    '"canceled"',
    '"incomplete_expired"',
    '"unknown"',
  ];
  for (const token of statusTokens) {
    assert(!source.includes(token), `must not encode status ${token}`);
  }

  const forbidden = [
    "Date.now",
    "Date.parse",
    "new Date",
    "Temporal",
    "currentPeriodEnd",
    ".from(",
    ".select(",
    ".eq(",
    ".single(",
    ".maybeSingle(",
    "insert(",
    "update(",
    "upsert(",
    "delete(",
    "createClient",
    "Deno.env",
    "fetch(",
    "npm:stripe",
    "new Stripe",
    'from "stripe"',
    "from 'stripe'",
    "plan_code",
    "is_demo",
    "AccessMode",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `wrapper must not use ${token}`);
  }
});

Deno.test("H. Stripe lookup precedes complimentary; lookup failure skips complimentary", async () => {
  const order: string[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];

  const stripeClient: TenantStripeSubscriptionObservationLookupClient = {
    from(table: string) {
      order.push("stripe");
      return createStripeFakeClient({ data: [], error: null }, stripeCalls)
        .from(table);
    },
  };
  const complimentaryClient: ComplimentaryAccessGrantLookupClient = {
    from(table: string) {
      order.push("complimentary");
      return createComplimentaryFakeClient({ data: null, error: null }, complimentaryCalls)
        .from(table);
    },
  };

  const success = await wrap({ stripeClient, complimentaryClient });
  expectSuccess(success);
  assertEquals(order, ["stripe", "complimentary"], "Stripe before complimentary");

  order.length = 0;
  stripeCalls.length = 0;
  complimentaryCalls.length = 0;
  const failed = await wrap({
    stripeClient: createStripeFakeClient(
      {
        data: null,
        error: { code: "XX000", message: "internal RAW_ORDER_DETAIL" },
      },
      stripeCalls,
    ),
    complimentaryClient: {
      from(table: string) {
        order.push("complimentary");
        return createComplimentaryFakeClient({ data: null, error: null }, complimentaryCalls)
          .from(table);
      },
    },
  });
  expectFailure(failed, "stripe_subscription_lookup_failed");
  assertEquals(order, [], "complimentary from() must not run after Stripe failure");
  assertEquals(complimentaryCalls.length, 0, "zero complimentary calls");
});

Deno.test("I31+I32. reader failure vs success public contracts", async () => {
  const failure = await wrap({
    stripeClient: createStripeFakeClient(
      {
        data: [stripeRow({ status: "" })],
        error: null,
      },
      [],
    ),
    complimentaryClient: complimentaryGrant("base", []),
  });
  expectFailure(failure, "stripe_subscription_observation_invalid");
  assertNoPublicInternals(failure);

  const success = await wrap({
    stripeClient: stripeSuccess([stripeRow({ product_tier: "pro" })], []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  expectSuccess(success);
  assertNoPublicInternals(success);
  expectGrantedStandard(success.effectiveAccess, "pro", "stripe");
});
