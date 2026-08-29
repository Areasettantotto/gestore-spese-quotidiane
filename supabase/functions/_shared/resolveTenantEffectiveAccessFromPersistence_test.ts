/**
 * Deno tests for resolveTenantEffectiveAccessFromPersistence (BILLING-85).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/resolveTenantEffectiveAccessFromPersistence_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import {
  type TenantAccessModeLookupClient,
  type TenantAccessModeLookupError,
  type TenantAccessModeLookupResponse,
  type TenantAccessModeRow,
} from "./readTenantAccessMode.ts";
import {
  type ComplimentaryAccessGrantLookupClient,
  type ComplimentaryAccessGrantLookupError,
  type ComplimentaryAccessGrantRow,
} from "./readTenantComplimentaryAccessCandidate.ts";
import {
  type TenantStripeSubscriptionObservationLookupClient,
  type TenantStripeSubscriptionObservationLookupError,
  type TenantStripeSubscriptionObservationLookupResponse,
  type TenantStripeSubscriptionObservationRow,
} from "./readTenantStripeSubscriptionObservations.ts";
import {
  resolvePersistedTenantEffectiveAccess,
} from "./resolvePersistedTenantEffectiveAccess.ts";
import {
  capabilitiesForTier,
  type Capability,
  type EffectiveAccess,
  type ModeCapabilityProfiles,
  type ProductTier,
} from "./resolveEffectiveAccess.ts";
import {
  resolveTenantEffectiveAccessFromPersistence,
  type ResolveTenantEffectiveAccessFromPersistenceResult,
} from "./resolveTenantEffectiveAccessFromPersistence.ts";

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
  result: ResolveTenantEffectiveAccessFromPersistenceResult,
): asserts result is Extract<
  ResolveTenantEffectiveAccessFromPersistenceResult,
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
  result: ResolveTenantEffectiveAccessFromPersistenceResult,
  reason: string,
): asserts result is Extract<
  ResolveTenantEffectiveAccessFromPersistenceResult,
  { ok: false }
> {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(
    !("effectiveAccess" in result) &&
      !("mode" in result) &&
      !("tier" in result) &&
      !("source" in result) &&
      !("stripeCandidate" in result) &&
      !("observations" in result) &&
      !("plan_code" in result) &&
      !("is_demo" in result),
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

const UNIQUE_DEMO_PROFILE: readonly Capability[] = Object.freeze([
  "ai_assistant",
]);

const UNIQUE_INTERNAL_PROFILE: readonly Capability[] = Object.freeze([
  "expense_management",
]);

const UNIQUE_MODE_PROFILES: ModeCapabilityProfiles = {
  demo: UNIQUE_DEMO_PROFILE,
  internal: UNIQUE_INTERNAL_PROFILE,
};

type AccessModeFakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
  maybeSingle: boolean;
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

type AccessModeFakeLookupResult = {
  data: unknown;
  error: TenantAccessModeLookupError | null;
};

type StripeFakeLookupResult = {
  data: unknown;
  error: TenantStripeSubscriptionObservationLookupError | null;
};

type ComplimentaryFakeLookupResult = {
  data: ComplimentaryAccessGrantRow | null;
  error: ComplimentaryAccessGrantLookupError | null;
};

function createAccessModeFakeClient(
  result:
    | AccessModeFakeLookupResult
    | TenantAccessModeLookupResponse
    | (() => never),
  calls: AccessModeFakeCall[],
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

function createThrowOnAccessModeFromClient(
  calls: AccessModeFakeCall[],
): TenantAccessModeLookupClient {
  return {
    from(table: string) {
      calls.push({
        table,
        columns: "",
        filters: [],
        maybeSingle: false,
      });
      throw new Error(
        "access mode lookup must not run RAW_ACCESS_MODE_FROM",
      );
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
        "stripe lookup must not run RAW_STRIPE_MODE_LOOKUP",
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
        "complimentary lookup must not run RAW_MODE_LOOKUP",
      );
    },
  };
}

function presentAccessModeRow(
  overrides: Partial<TenantAccessModeRow> = {},
): TenantAccessModeRow {
  return {
    plan_code: "free",
    is_demo: false,
    ...overrides,
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

function accessModeSuccess(
  row: TenantAccessModeRow,
  calls: AccessModeFakeCall[],
): TenantAccessModeLookupClient {
  return createAccessModeFakeClient({ data: row, error: null }, calls);
}

async function compose(params: {
  tenantId?: unknown;
  accessModeClient: TenantAccessModeLookupClient;
  stripeClient: TenantStripeSubscriptionObservationLookupClient;
  complimentaryClient: ComplimentaryAccessGrantLookupClient;
  modeProfiles?: ModeCapabilityProfiles;
}): Promise<ResolveTenantEffectiveAccessFromPersistenceResult> {
  return await resolveTenantEffectiveAccessFromPersistence({
    tenantId: "tenantId" in params ? params.tenantId : TENANT_A,
    accessModeClient: params.accessModeClient,
    modeProfiles: params.modeProfiles ?? MODE_PROFILES,
    stripeClient: params.stripeClient,
    complimentaryClient: params.complimentaryClient,
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

function assertNoRawLeak(
  result: ResolveTenantEffectiveAccessFromPersistenceResult,
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

function assertZeroCommercialLookups(
  stripeCalls: StripeFakeCall[],
  complimentaryCalls: ComplimentaryFakeCall[],
): void {
  assertEquals(stripeCalls.length, 0, "zero Stripe lookups");
  assertEquals(complimentaryCalls.length, 0, "zero complimentary lookups");
}

Deno.test("A. AccessMode invalid tenant ID → failure, zero downstream", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];

  for (const invalid of [
    null,
    undefined,
    "",
    " ",
    "not-a-uuid",
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee",
    " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ",
  ]) {
    accessModeCalls.length = 0;
    stripeCalls.length = 0;
    complimentaryCalls.length = 0;
    const result = await compose({
      tenantId: invalid,
      accessModeClient: createAccessModeFakeClient(
        { data: presentAccessModeRow(), error: null },
        accessModeCalls,
      ),
      stripeClient: createThrowOnStripeFromClient(stripeCalls),
      complimentaryClient: createThrowOnComplimentaryFromClient(
        complimentaryCalls,
      ),
    });
    expectFailure(result, "invalid_tenant_id");
    assertEquals(accessModeCalls.length, 0, "AccessMode must not query");
    assertZeroCommercialLookups(stripeCalls, complimentaryCalls);
  }
});

Deno.test("B. AccessMode tenant not found → failure, zero downstream", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await compose({
    accessModeClient: createAccessModeFakeClient(
      { data: null, error: null },
      accessModeCalls,
    ),
    stripeClient: createThrowOnStripeFromClient(stripeCalls),
    complimentaryClient: createThrowOnComplimentaryFromClient(
      complimentaryCalls,
    ),
  });

  expectFailure(result, "tenant_not_found");
  assertEquals(accessModeCalls.length, 1, "one AccessMode SELECT");
  assertZeroCommercialLookups(stripeCalls, complimentaryCalls);
  assert(
    JSON.stringify(result) !==
      JSON.stringify({ ok: true, effectiveAccess: { status: "unentitled" } }),
    "tenant_not_found must not become unentitled",
  );
});

Deno.test("C. AccessMode lookup failure → sanitized failure, zero downstream", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await compose({
    accessModeClient: createAccessModeFakeClient(
      {
        data: presentAccessModeRow({ plan_code: "paid", is_demo: false }),
        error: {
          code: "57014",
          message:
            "canceling statement due to statement timeout RAW_DB_DETAIL_ALPHA",
        },
      },
      [],
    ),
    stripeClient: createThrowOnStripeFromClient(stripeCalls),
    complimentaryClient: createThrowOnComplimentaryFromClient(
      complimentaryCalls,
    ),
  });

  expectFailure(result, "tenant_lookup_failed");
  assertEquals(
    JSON.stringify(result),
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
  assertZeroCommercialLookups(stripeCalls, complimentaryCalls);
});

Deno.test("D. AccessMode persisted state invalid → failure, zero downstream", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await compose({
    accessModeClient: createAccessModeFakeClient(
      {
        data: presentAccessModeRow({ plan_code: "enterprise", is_demo: false }),
        error: null,
      },
      [],
    ),
    stripeClient: createThrowOnStripeFromClient(stripeCalls),
    complimentaryClient: createThrowOnComplimentaryFromClient(
      complimentaryCalls,
    ),
  });

  expectFailure(result, "invalid_tenant_access_mode");
  assertZeroCommercialLookups(stripeCalls, complimentaryCalls);
  assertNoRawLeak(result, ["enterprise", "base", "pro", "standard"]);
});

Deno.test("E. standard → BILLING-83 once with same tenantId, mode, modeProfiles, deps", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const wrapperResult = await compose({
    tenantId: TENANT_B,
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      accessModeCalls,
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ product_tier: "base" })],
      stripeCalls,
    ),
    complimentaryClient: complimentaryGrant(null, complimentaryCalls),
    modeProfiles: UNIQUE_MODE_PROFILES,
  });

  const expected = await resolvePersistedTenantEffectiveAccess({
    tenantId: TENANT_B,
    mode: "standard",
    modeProfiles: UNIQUE_MODE_PROFILES,
    stripeClient: stripeSuccess([stripeRow({ product_tier: "base" })], []),
    complimentaryClient: complimentaryGrant(null, []),
  });

  expectSuccess(wrapperResult);
  assertEquals(wrapperResult, expected, "delegates without reinterpretation");
  expectGrantedStandard(wrapperResult.effectiveAccess, "base", "stripe");
  assertEquals(accessModeCalls.length, 1, "one AccessMode SELECT");
  assertEquals(stripeCalls.length, 1, "BILLING-83 Stripe path once");
  assertEquals(complimentaryCalls.length, 1, "BILLING-83 complimentary path once");
  assertEquals(
    accessModeCalls[0]?.filters,
    [{ column: "id", value: TENANT_B }],
    "AccessMode uses received tenantId",
  );
  assertEquals(
    stripeCalls[0]?.filters[0],
    { column: "tenant_id", value: TENANT_B },
    "Stripe uses the same tenantId",
  );
  assertEquals(
    complimentaryCalls[0]?.filters[0],
    { column: "tenant_id", value: TENANT_B },
    "complimentary uses the same tenantId",
  );
  assertEquals(
    wrapperResult.effectiveAccess.mode,
    "standard",
    "paid AccessMode is standard, not a catalog tier",
  );
  const serialized = JSON.stringify(wrapperResult);
  assert(
    !serialized.includes("plan_code") && !serialized.includes("paid"),
    "must not expose plan_code paid as a tier",
  );
});

Deno.test("F. demo → existing result; zero Stripe/complimentary after AccessMode", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "demo", is_demo: false }),
      accessModeCalls,
    ),
    stripeClient: createThrowOnStripeFromClient(stripeCalls),
    complimentaryClient: createThrowOnComplimentaryFromClient(
      complimentaryCalls,
    ),
  });

  const expected = await resolvePersistedTenantEffectiveAccess({
    tenantId: TENANT_A,
    mode: "demo",
    modeProfiles: MODE_PROFILES,
    stripeClient: createThrowOnStripeFromClient([]),
    complimentaryClient: createThrowOnComplimentaryFromClient([]),
  });

  expectSuccess(result);
  assertEquals(result, expected, "demo matches BILLING-83");
  assertEquals(result.effectiveAccess.mode, "demo", "demo mode");
  assertEquals(result.effectiveAccess.tier, null, "Demo is not a ProductTier");
  assertEquals(result.effectiveAccess.source, null, "Demo has no commercial source");
  assertEquals(result.effectiveAccess.capabilities, DEMO_PROFILE, "demo profile");
  assertEquals(accessModeCalls.length, 1, "one AccessMode SELECT");
  assertZeroCommercialLookups(stripeCalls, complimentaryCalls);
});

Deno.test("G. internal → existing result; zero Stripe/complimentary after AccessMode", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "internal", is_demo: false }),
      accessModeCalls,
    ),
    stripeClient: createThrowOnStripeFromClient(stripeCalls),
    complimentaryClient: createThrowOnComplimentaryFromClient(
      complimentaryCalls,
    ),
  });

  const expected = await resolvePersistedTenantEffectiveAccess({
    tenantId: TENANT_A,
    mode: "internal",
    modeProfiles: MODE_PROFILES,
    stripeClient: createThrowOnStripeFromClient([]),
    complimentaryClient: createThrowOnComplimentaryFromClient([]),
  });

  expectSuccess(result);
  assertEquals(result, expected, "internal matches BILLING-83");
  assertEquals(result.effectiveAccess.mode, "internal", "internal mode");
  assertEquals(result.effectiveAccess.tier, null, "Internal is not a ProductTier");
  assertEquals(
    result.effectiveAccess.source,
    null,
    "Internal has no commercial source",
  );
  assertEquals(
    result.effectiveAccess.capabilities,
    INTERNAL_PROFILE,
    "internal profile",
  );
  assertEquals(accessModeCalls.length, 1, "one AccessMode SELECT");
  assertZeroCommercialLookups(stripeCalls, complimentaryCalls);
});

Deno.test("H. downstream BILLING-83 failure is propagated without fallback", async () => {
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "trial", is_demo: false }),
      [],
    ),
    stripeClient: createStripeFakeClient(
      {
        data: null,
        error: {
          code: "57014",
          message:
            "canceling statement due to statement timeout RAW_DOWNSTREAM_ALPHA",
        },
      },
      [],
    ),
    complimentaryClient: complimentaryGrant("pro", complimentaryCalls),
  });

  expectFailure(result, "stripe_subscription_lookup_failed");
  assertEquals(
    JSON.stringify(result),
    '{"ok":false,"reason":"stripe_subscription_lookup_failed"}',
    "sanitized downstream reason",
  );
  assertEquals(complimentaryCalls.length, 0, "no complimentary after Stripe failure");
  assertNoRawLeak(result, [
    "RAW_DOWNSTREAM_ALPHA",
    "unentitled",
    "pro",
    "standard",
    "trial",
  ]);
  assert(
    result.reason !== "tenant_lookup_failed" &&
      result.reason !== "tenant_not_found" &&
      result.reason !== "invalid_tenant_access_mode",
    "AccessMode success must not absorb a BILLING-83 failure",
  );
});

Deno.test("I. standard + Stripe absent / complimentary valid → existing resolver", async () => {
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const result = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "free", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess([], stripeCalls),
    complimentaryClient: complimentaryGrant("base", complimentaryCalls),
  });

  const expected = await resolvePersistedTenantEffectiveAccess({
    tenantId: TENANT_A,
    mode: "standard",
    modeProfiles: MODE_PROFILES,
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant("base", []),
  });

  expectSuccess(result);
  assertEquals(result, expected, "matches BILLING-83 complimentary path");
  expectGrantedStandard(result.effectiveAccess, "base", "complimentary");
  assertEquals(stripeCalls.length, 1, "Stripe observed");
  assertEquals(complimentaryCalls.length, 1, "complimentary observed");
});

Deno.test("J. standard + Stripe valid → existing resolver", async () => {
  const result = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess([stripeRow({ product_tier: "pro" })], []),
    complimentaryClient: complimentaryGrant(null, []),
  });

  const expected = await resolvePersistedTenantEffectiveAccess({
    tenantId: TENANT_A,
    mode: "standard",
    modeProfiles: MODE_PROFILES,
    stripeClient: stripeSuccess([stripeRow({ product_tier: "pro" })], []),
    complimentaryClient: complimentaryGrant(null, []),
  });

  expectSuccess(result);
  assertEquals(result, expected, "matches BILLING-83 Stripe path");
  expectGrantedStandard(result.effectiveAccess, "pro", "stripe");
});

Deno.test("K. valid tenantId is passed unchanged", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const uppercaseTenant = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEE1";
  const result = await compose({
    tenantId: uppercaseTenant,
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "trial", is_demo: false }),
      accessModeCalls,
    ),
    stripeClient: stripeSuccess([], stripeCalls),
    complimentaryClient: complimentaryGrant(null, complimentaryCalls),
  });

  expectSuccess(result);
  expectUnentitled(result.effectiveAccess);
  assertEquals(
    accessModeCalls[0]?.filters[0]?.value,
    uppercaseTenant,
    "AccessMode filter keeps exact tenantId",
  );
  assertEquals(
    stripeCalls[0]?.filters[0]?.value,
    uppercaseTenant,
    "Stripe filter keeps exact tenantId",
  );
  assertEquals(
    complimentaryCalls[0]?.filters[0]?.value,
    uppercaseTenant,
    "complimentary filter keeps exact tenantId",
  );
  assert(
    accessModeCalls[0]?.filters[0]?.value !== TENANT_A &&
      stripeCalls[0]?.filters[0]?.value !== TENANT_A,
    "must not substitute another tenant",
  );
});

Deno.test("L. modeProfiles is forwarded unchanged and not replaced", async () => {
  const demoResult = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "demo", is_demo: false }),
      [],
    ),
    stripeClient: createThrowOnStripeFromClient([]),
    complimentaryClient: createThrowOnComplimentaryFromClient([]),
    modeProfiles: UNIQUE_MODE_PROFILES,
  });
  const internalResult = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "internal", is_demo: false }),
      [],
    ),
    stripeClient: createThrowOnStripeFromClient([]),
    complimentaryClient: createThrowOnComplimentaryFromClient([]),
    modeProfiles: UNIQUE_MODE_PROFILES,
  });

  expectSuccess(demoResult);
  expectSuccess(internalResult);
  assertEquals(
    demoResult.effectiveAccess.capabilities,
    UNIQUE_DEMO_PROFILE,
    "demo uses caller profiles, not a hardcoded Base/Pro sketch",
  );
  assertEquals(
    internalResult.effectiveAccess.capabilities,
    UNIQUE_INTERNAL_PROFILE,
    "internal uses caller profiles, not a hardcoded Base/Pro sketch",
  );
  assert(
    JSON.stringify(demoResult.effectiveAccess.capabilities) !==
      JSON.stringify(capabilitiesForTier("base")),
    "must not substitute Base capabilities",
  );
  assert(
    JSON.stringify(internalResult.effectiveAccess.capabilities) !==
      JSON.stringify(capabilitiesForTier("pro")),
    "must not substitute Pro capabilities for the unique internal profile",
  );
});

Deno.test("M. AccessMode failure has no partial EffectiveAccess output", async () => {
  const result = await compose({
    accessModeClient: createAccessModeFakeClient(
      { data: null, error: null },
      [],
    ),
    stripeClient: createThrowOnStripeFromClient([]),
    complimentaryClient: complimentaryGrant("pro", []),
  });

  expectFailure(result, "tenant_not_found");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "failure keys",
  );
  assert(
    !("effectiveAccess" in result),
    "must not emit a partial EffectiveAccess",
  );
});

Deno.test("AccessMode lookup precedes any commercial lookup", async () => {
  const order: string[] = [];
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];

  const success = await compose({
    accessModeClient: {
      from(table: string) {
        order.push("access_mode");
        return accessModeSuccess(
          presentAccessModeRow({ plan_code: "free", is_demo: false }),
          accessModeCalls,
        ).from(table);
      },
    },
    stripeClient: {
      from(table: string) {
        order.push("stripe");
        return stripeSuccess([], stripeCalls).from(table);
      },
    },
    complimentaryClient: {
      from(table: string) {
        order.push("complimentary");
        return complimentaryGrant(null, complimentaryCalls).from(table);
      },
    },
  });
  expectSuccess(success);
  assertEquals(
    order,
    ["access_mode", "stripe", "complimentary"],
    "AccessMode before commercial lookups",
  );

  order.length = 0;
  const failed = await compose({
    accessModeClient: {
      from(table: string) {
        order.push("access_mode");
        return createAccessModeFakeClient(
          {
            data: null,
            error: { code: "XX000", message: "internal RAW_ORDER_DETAIL" },
          },
          [],
        ).from(table);
      },
    },
    stripeClient: {
      from(table: string) {
        order.push("stripe");
        return stripeSuccess([], []).from(table);
      },
    },
    complimentaryClient: {
      from(table: string) {
        order.push("complimentary");
        return complimentaryGrant("pro", []).from(table);
      },
    },
  });
  expectFailure(failed, "tenant_lookup_failed");
  assertEquals(order, ["access_mode"], "commercial from() must not run");
  assertNoRawLeak(failed, ["RAW_ORDER_DETAIL", "XX000"]);
});

Deno.test("production wrapper has no DB primitives, env, SDK, auth, or product mapping", () => {
  const source = resolveTenantEffectiveAccessFromPersistence.toString();
  const forbidden = [
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
    "Request",
    "Response",
    "Authorization",
    "service_role",
    "ensureTenantBillingAccess",
    "capabilitiesForTier",
    "Date.now",
    "Date.parse",
    "new Date",
    "Temporal",
    "plan_code",
    "is_demo",
    '"base"',
    '"pro"',
    "standard_dashboard",
    "@/src/",
    "src/features",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `wrapper must not contain ${token}`);
  }
});
