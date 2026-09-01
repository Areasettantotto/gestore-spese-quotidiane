/**
 * Deno tests for resolveHttpSafeTenantEffectiveAccessFromPersistence
 * (BILLING-93).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/resolveHttpSafeTenantEffectiveAccessFromPersistence_test.ts
 *
 * No network/env/read/write capabilities required.
 * Persistence clients are the same test doubles used by BILLING-85.
 */

import { adaptEffectiveAccessPersistenceResult } from "./adaptEffectiveAccessPersistenceResult.ts";
import {
  type ComplimentaryAccessGrantLookupClient,
  type ComplimentaryAccessGrantLookupError,
  type ComplimentaryAccessGrantRow,
} from "./readTenantComplimentaryAccessCandidate.ts";
import {
  type TenantAccessModeLookupClient,
  type TenantAccessModeLookupError,
  type TenantAccessModeLookupResponse,
  type TenantAccessModeRow,
} from "./readTenantAccessMode.ts";
import {
  type TenantStripeSubscriptionObservationLookupClient,
  type TenantStripeSubscriptionObservationLookupError,
  type TenantStripeSubscriptionObservationLookupResponse,
  type TenantStripeSubscriptionObservationRow,
} from "./readTenantStripeSubscriptionObservations.ts";
import {
  capabilitiesForTier,
  type Capability,
  type EffectiveAccess,
  type ModeCapabilityProfiles,
  type ProductTier,
} from "./resolveEffectiveAccess.ts";
import { type ResolveEffectiveAccess } from "./handleEffectiveAccessRequest.ts";
import {
  resolveTenantEffectiveAccessFromPersistence,
  type ResolveTenantEffectiveAccessFromPersistenceParams,
} from "./resolveTenantEffectiveAccessFromPersistence.ts";
import { resolveHttpSafeTenantEffectiveAccessFromPersistence } from "./resolveHttpSafeTenantEffectiveAccessFromPersistence.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from production or historical reports. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";

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

type Scenario = {
  tenantId?: unknown;
  accessModeClient: TenantAccessModeLookupClient;
  stripeClient: TenantStripeSubscriptionObservationLookupClient;
  complimentaryClient: ComplimentaryAccessGrantLookupClient;
  modeProfiles?: ModeCapabilityProfiles;
};

function toParams(scenario: Scenario): ResolveTenantEffectiveAccessFromPersistenceParams {
  return {
    tenantId: "tenantId" in scenario ? scenario.tenantId : TENANT_A,
    accessModeClient: scenario.accessModeClient,
    modeProfiles: scenario.modeProfiles ?? UNIQUE_MODE_PROFILES,
    stripeClient: scenario.stripeClient,
    complimentaryClient: scenario.complimentaryClient,
  };
}

async function compose(
  scenario: Scenario,
): Promise<EffectiveAccess | Response> {
  return await resolveHttpSafeTenantEffectiveAccessFromPersistence(
    toParams(scenario),
  );
}

async function persistThenAdapt(
  scenario: Scenario,
): Promise<EffectiveAccess | Response> {
  const persisted = await resolveTenantEffectiveAccessFromPersistence(
    toParams(scenario),
  );
  return adaptEffectiveAccessPersistenceResult(persisted);
}

async function readBody(response: Response): Promise<unknown> {
  return JSON.parse(await response.text());
}

function expectDomain(
  value: EffectiveAccess | Response,
  messagePrefix: string,
): asserts value is EffectiveAccess {
  assert(
    !(value instanceof Response),
    `${messagePrefix} must not be a Response`,
  );
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${messagePrefix} must be an EffectiveAccess object`,
  );
  assert(
    !("data" in value),
    `${messagePrefix} must not wrap EffectiveAccess in { data }`,
  );
  assert(
    !("ok" in value),
    `${messagePrefix} must not return the persistence Result envelope`,
  );
}

async function expectUnprocessable(
  value: EffectiveAccess | Response,
  messagePrefix: string,
): Promise<void> {
  assert(value instanceof Response, `${messagePrefix} expected Response`);
  assertEquals(value.status, 422, `${messagePrefix} status 422`);
  const body = await readBody(value);
  assertEquals(
    body,
    {
      error: {
        code: "UNPROCESSABLE_ENTITY",
        message: "Invalid tenant identifier.",
      },
    },
    `${messagePrefix} Pattern-A envelope from adapter`,
  );
}

async function expectInternalError(
  value: EffectiveAccess | Response,
  messagePrefix: string,
): Promise<void> {
  assert(value instanceof Response, `${messagePrefix} expected Response`);
  assertEquals(value.status, 500, `${messagePrefix} status 500`);
  assert(
    value.status !== 404 &&
      value.status !== 403 &&
      value.status !== 502 &&
      value.status !== 503,
    `${messagePrefix} must not use 403/404/502/503`,
  );
  const body = await readBody(value);
  assertEquals(
    body,
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    },
    `${messagePrefix} Pattern-A envelope from adapter`,
  );
}

async function expectSameAsIndependentAdapter(
  composed: EffectiveAccess | Response,
  independent: EffectiveAccess | Response,
  messagePrefix: string,
): Promise<void> {
  if (composed instanceof Response || independent instanceof Response) {
    assert(
      composed instanceof Response && independent instanceof Response,
      `${messagePrefix} Response vs domain mismatch`,
    );
    assertEquals(
      composed.status,
      independent.status,
      `${messagePrefix} status matches persist→adapt`,
    );
    assertEquals(
      await readBody(composed),
      await readBody(independent),
      `${messagePrefix} body matches persist→adapt`,
    );
    return;
  }
  expectDomain(composed, messagePrefix);
  expectDomain(independent, `${messagePrefix} independent`);
  assertEquals(composed, independent, `${messagePrefix} value matches persist→adapt`);
}

Deno.test("1. composition is persistence wrapper then adapter; params forwarded as-is", () => {
  const source = resolveHttpSafeTenantEffectiveAccessFromPersistence.toString();
  assert(
    source.includes("resolveTenantEffectiveAccessFromPersistence(params)"),
    "must call the BILLING-85 wrapper with the same params object",
  );
  assert(
    source.includes("adaptEffectiveAccessPersistenceResult(persisted)"),
    "must adapt the persistence result",
  );
  assert(
    source.indexOf("resolveTenantEffectiveAccessFromPersistence(params)") <
      source.indexOf("adaptEffectiveAccessPersistenceResult(persisted)"),
    "persistence must run before adaptation",
  );
  assert(
    !source.includes("{ ...params }") &&
      !source.includes("{...params}"),
    "must not clone the params object",
  );
  assertEquals(
    (source.match(/resolveTenantEffectiveAccessFromPersistence\(/g) ?? []).length,
    1,
    "exactly one persistence wrapper call",
  );
  assertEquals(
    (source.match(/adaptEffectiveAccessPersistenceResult\(/g) ?? []).length,
    1,
    "exactly one adaptation",
  );
});

Deno.test("2. tenantId reaches the wrapper unchanged", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const uppercaseTenant = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEE1";
  const composed = await compose({
    tenantId: uppercaseTenant,
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "trial", is_demo: false }),
      accessModeCalls,
    ),
    stripeClient: stripeSuccess([], stripeCalls),
    complimentaryClient: complimentaryGrant(null, complimentaryCalls),
  });

  expectDomain(composed, "2. tenantId");
  assertEquals(composed.status, "unentitled", "2. unentitled success domain");
  assertEquals(
    accessModeCalls[0]?.filters[0]?.value,
    uppercaseTenant,
    "AccessMode keeps exact tenantId",
  );
  assertEquals(
    stripeCalls[0]?.filters[0]?.value,
    uppercaseTenant,
    "Stripe keeps exact tenantId",
  );
  assertEquals(
    complimentaryCalls[0]?.filters[0]?.value,
    uppercaseTenant,
    "complimentary keeps exact tenantId",
  );
  assertEquals(accessModeCalls.length, 1, "one persistence AccessMode SELECT");
});

Deno.test("3. ModeCapabilityProfiles reach the wrapper as the caller-supplied value", async () => {
  const composed = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "demo", is_demo: false }),
      [],
    ),
    stripeClient: createStripeFakeClient({ data: [], error: null }, []),
    complimentaryClient: complimentaryGrant(null, []),
    modeProfiles: UNIQUE_MODE_PROFILES,
  });

  expectDomain(composed, "3. profiles");
  assertEquals(composed.mode, "demo", "demo mode");
  assertEquals(
    composed.capabilities,
    UNIQUE_DEMO_PROFILE,
    "caller-supplied demo profile, not a hardcoded Base/Pro list",
  );
  assert(
    JSON.stringify(composed.capabilities) !==
      JSON.stringify(capabilitiesForTier("base")),
    "must not substitute Base capabilities",
  );
  assert(
    JSON.stringify(composed.capabilities) !==
      JSON.stringify(capabilitiesForTier("pro")),
    "must not substitute Pro capabilities",
  );
});

Deno.test("4. granted Base/Pro success is EffectiveAccess, not Response", async () => {
  const baseIndependent = await persistThenAdapt({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ product_tier: "base" })],
      [],
    ),
    complimentaryClient: complimentaryGrant(null, []),
  });
  const baseComposed = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ product_tier: "base" })],
      [],
    ),
    complimentaryClient: complimentaryGrant(null, []),
  });
  await expectSameAsIndependentAdapter(baseComposed, baseIndependent, "4. Base");
  expectDomain(baseComposed, "4. Base");
  assertEquals(baseComposed.status, "granted", "4. Base granted");
  assertEquals(baseComposed.tier, "base", "4. Base tier");
  assertEquals(baseComposed.source, "stripe", "4. Base source");

  const proIndependent = await persistThenAdapt({
    tenantId: TENANT_B,
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ product_tier: "pro" })],
      [],
    ),
    complimentaryClient: complimentaryGrant(null, []),
  });
  const proComposed = await compose({
    tenantId: TENANT_B,
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ product_tier: "pro" })],
      [],
    ),
    complimentaryClient: complimentaryGrant(null, []),
  });
  await expectSameAsIndependentAdapter(proComposed, proIndependent, "4. Pro");
  expectDomain(proComposed, "4. Pro");
  assertEquals(proComposed.status, "granted", "4. Pro granted");
  assertEquals(proComposed.tier, "pro", "4. Pro tier");
  assertEquals(proComposed.source, "stripe", "4. Pro source");
});

Deno.test("5. unentitled success is EffectiveAccess, not Response", async () => {
  const independent = await persistThenAdapt({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "trial", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  const composed = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "trial", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  await expectSameAsIndependentAdapter(composed, independent, "5. unentitled");
  expectDomain(composed, "5. unentitled");
  assertEquals(composed.status, "unentitled", "5. status");
  assertEquals(composed.tier, null, "5. tier");
  assertEquals(composed.source, null, "5. source");
});

Deno.test("6. invalid domain success is EffectiveAccess, not Response", async () => {
  const independent = await persistThenAdapt({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "free", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ status: "unknown" })],
      [],
    ),
    complimentaryClient: complimentaryGrant(null, []),
  });
  const composed = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "free", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ status: "unknown" })],
      [],
    ),
    complimentaryClient: complimentaryGrant(null, []),
  });
  await expectSameAsIndependentAdapter(composed, independent, "6. invalid");
  expectDomain(composed, "6. invalid");
  assertEquals(composed.status, "invalid", "6. status");
});

Deno.test("7. invalid_tenant_id → adapter 422, not a BILLING-93 mapping", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const independent = await persistThenAdapt({
    tenantId: "not-a-uuid",
    accessModeClient: createAccessModeFakeClient(
      { data: presentAccessModeRow(), error: null },
      [],
    ),
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  const composed = await compose({
    tenantId: "not-a-uuid",
    accessModeClient: createAccessModeFakeClient(
      { data: presentAccessModeRow(), error: null },
      accessModeCalls,
    ),
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  assert(composed instanceof Response, "7. composed is Response");
  await expectUnprocessable(composed.clone(), "7. invalid_tenant_id");
  await expectSameAsIndependentAdapter(
    composed,
    independent,
    "7. persist→adapt",
  );
  assertEquals(accessModeCalls.length, 0, "invalid tenantId does not query");
});

Deno.test("8. tenant_lookup_failed → adapter 500 INTERNAL_ERROR", async () => {
  const independent = await persistThenAdapt({
    accessModeClient: createAccessModeFakeClient(
      {
        data: presentAccessModeRow(),
        error: { code: "57014", message: "timeout RAW_LOOKUP" },
      },
      [],
    ),
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  const composed = await compose({
    accessModeClient: createAccessModeFakeClient(
      {
        data: presentAccessModeRow(),
        error: { code: "57014", message: "timeout RAW_LOOKUP" },
      },
      [],
    ),
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  assert(composed instanceof Response, "8. composed is Response");
  await expectInternalError(composed.clone(), "8. tenant_lookup_failed");
  await expectSameAsIndependentAdapter(
    composed,
    independent,
    "8. persist→adapt",
  );
});

Deno.test("9. tenant_not_found → opaque 500, not 404/403", async () => {
  const composed = await compose({
    accessModeClient: createAccessModeFakeClient(
      { data: null, error: null },
      [],
    ),
    stripeClient: stripeSuccess([], []),
    complimentaryClient: complimentaryGrant(null, []),
  });
  await expectInternalError(composed, "9. tenant_not_found");
});

Deno.test("10. commercial persistence failures → opaque 500", async () => {
  const stripeFailed = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      [],
    ),
    stripeClient: createStripeFakeClient(
      {
        data: null,
        error: { code: "57014", message: "timeout RAW_STRIPE" },
      },
      [],
    ),
    complimentaryClient: complimentaryGrant("pro", []),
  });
  await expectInternalError(stripeFailed, "10. stripe lookup");

  const complimentaryFailed = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "free", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess([], []),
    complimentaryClient: createComplimentaryFakeClient(
      {
        data: null,
        error: { code: "57014", message: "timeout RAW_COMPLIMENTARY" },
      },
      [],
    ),
  });
  await expectInternalError(complimentaryFailed, "10. complimentary lookup");
});

Deno.test("11. success is not serialized and has no { data } envelope", async () => {
  const composed = await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      [],
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ product_tier: "base" })],
      [],
    ),
    complimentaryClient: complimentaryGrant(null, []),
  });
  expectDomain(composed, "11. serialization");
  assertEquals(
    Object.keys(composed).sort(),
    ["capabilities", "expiresAt", "mode", "source", "status", "tier"].sort(),
    "domain keys only",
  );
  const source = resolveHttpSafeTenantEffectiveAccessFromPersistence.toString();
  assert(
    !source.includes("serializeEffectiveAccess") &&
      !source.includes("jsonResponse") &&
      !source.includes("JSON.stringify"),
    "must not serialize",
  );
});

Deno.test("12–13. no auth, audience, client creation, or env", () => {
  const source = resolveHttpSafeTenantEffectiveAccessFromPersistence.toString();
  const forbidden = [
    "Deno.env",
    "createClient",
    "service_role",
    "parseAuthHeader",
    "getAuthenticatedUser",
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "tenant_memberships",
    "serializeEffectiveAccess",
    "jsonResponse",
    "Deno.serve",
    "internalError",
    "unprocessableEntity",
    "UPSTREAM_ERROR",
    "SERVICE_UNAVAILABLE",
    "plan_code",
    "handleEffectiveAccessRequest",
    "capabilitiesForTier",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `composition must not contain ${token}`);
  }
});

Deno.test("14. each invocation runs the persistence wrapper once", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      accessModeCalls,
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ product_tier: "base" })],
      stripeCalls,
    ),
    complimentaryClient: complimentaryGrant(null, complimentaryCalls),
  });
  assertEquals(accessModeCalls.length, 1, "one AccessMode SELECT");
  assertEquals(stripeCalls.length, 1, "one Stripe SELECT");
  assertEquals(complimentaryCalls.length, 1, "one complimentary SELECT");

  await compose({
    accessModeClient: accessModeSuccess(
      presentAccessModeRow({ plan_code: "paid", is_demo: false }),
      accessModeCalls,
    ),
    stripeClient: stripeSuccess(
      [stripeRow({ product_tier: "pro" })],
      stripeCalls,
    ),
    complimentaryClient: complimentaryGrant(null, complimentaryCalls),
  });
  assertEquals(accessModeCalls.length, 2, "second invoke is a new wrapper call");
  assertEquals(stripeCalls.length, 2, "no retry on the first invoke");
  assertEquals(complimentaryCalls.length, 2, "no retry on the first invoke");
});

Deno.test("15. bindable as ResolveEffectiveAccess without calling the HTTP core", async () => {
  const accessModeCalls: AccessModeFakeCall[] = [];
  const stripeCalls: StripeFakeCall[] = [];
  const complimentaryCalls: ComplimentaryFakeCall[] = [];
  const resolveEffectiveAccess: ResolveEffectiveAccess = (tenantId) =>
    resolveHttpSafeTenantEffectiveAccessFromPersistence({
      tenantId,
      accessModeClient: accessModeSuccess(
        presentAccessModeRow({ plan_code: "paid", is_demo: false }),
        accessModeCalls,
      ),
      modeProfiles: UNIQUE_MODE_PROFILES,
      stripeClient: stripeSuccess(
        [stripeRow({ product_tier: "base" })],
        stripeCalls,
      ),
      complimentaryClient: complimentaryGrant(null, complimentaryCalls),
    });

  const resolved = await resolveEffectiveAccess(TENANT_A);
  expectDomain(resolved, "15. bound resolver");
  assertEquals(resolved.status, "granted", "15. granted");
  assertEquals(accessModeCalls.length, 1, "15. one persistence call");
  const source = resolveHttpSafeTenantEffectiveAccessFromPersistence.toString();
  assert(
    !source.includes("handleEffectiveAccessRequest("),
    "must not invoke the HTTP core",
  );
});
