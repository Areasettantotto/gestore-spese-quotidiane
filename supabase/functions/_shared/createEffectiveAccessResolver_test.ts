/**
 * Deno tests for createEffectiveAccessResolver (BILLING-95).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/createEffectiveAccessResolver_test.ts
 *
 * No network/env/read/write capabilities required.
 * Persistence clients are minimal SELECT-only fakes that record the
 * `this` receiver of `.from()` so reference identity can be asserted.
 */

import type {
  ComplimentaryAccessGrantLookupClient,
  ComplimentaryAccessGrantLookupError,
  ComplimentaryAccessGrantRow,
} from "./readTenantComplimentaryAccessCandidate.ts";
import type {
  TenantAccessModeLookupClient,
  TenantAccessModeLookupError,
  TenantAccessModeRow,
} from "./readTenantAccessMode.ts";
import type {
  TenantStripeSubscriptionObservationLookupClient,
  TenantStripeSubscriptionObservationLookupError,
  TenantStripeSubscriptionObservationRow,
} from "./readTenantStripeSubscriptionObservations.ts";
import {
  capabilitiesForTier,
  type Capability,
  type EffectiveAccess,
  type ModeCapabilityProfiles,
} from "./resolveEffectiveAccess.ts";
import type { ResolveEffectiveAccess } from "./handleEffectiveAccessRequest.ts";
import {
  createEffectiveAccessResolver,
  type CreateEffectiveAccessResolverDependencies,
} from "./createEffectiveAccessResolver.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const TENANT_UPPER = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEE1";

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

/** Records each read of `.demo` / `.internal` together with the receiver. */
type ProfileAccess = { key: "demo" | "internal"; receiver: unknown };

function createTrackedModeProfiles(
  accesses: ProfileAccess[],
): ModeCapabilityProfiles {
  return {
    get demo(): readonly Capability[] {
      accesses.push({ key: "demo", receiver: this });
      return UNIQUE_DEMO_PROFILE;
    },
    get internal(): readonly Capability[] {
      accesses.push({ key: "internal", receiver: this });
      return UNIQUE_INTERNAL_PROFILE;
    },
  };
}

type FakeCall = {
  receiver: unknown;
  table: string;
  tenantId: string;
};

type AccessModeFakeResult = {
  data: TenantAccessModeRow | null;
  error: TenantAccessModeLookupError | null;
};

type StripeFakeResult = {
  data: TenantStripeSubscriptionObservationRow[] | null;
  error: TenantStripeSubscriptionObservationLookupError | null;
};

type ComplimentaryFakeResult = {
  data: ComplimentaryAccessGrantRow | null;
  error: ComplimentaryAccessGrantLookupError | null;
};

/** Sequential results: call N returns results[N] (last one repeats). */
function nextResult<T>(results: readonly T[], index: number): T {
  return results[Math.min(index, results.length - 1)] as T;
}

function createAccessModeFake(
  results: readonly AccessModeFakeResult[],
  calls: FakeCall[],
): TenantAccessModeLookupClient {
  return {
    from(table: string) {
      const receiver = this;
      return {
        select(_columns: string) {
          return {
            eq(_column: string, value: string) {
              return {
                maybeSingle() {
                  const index = calls.length;
                  calls.push({ receiver, table, tenantId: value });
                  return Promise.resolve(nextResult(results, index));
                },
              };
            },
          };
        },
      };
    },
  };
}

function createStripeFake(
  results: readonly StripeFakeResult[],
  calls: FakeCall[],
): TenantStripeSubscriptionObservationLookupClient {
  return {
    from(table: string) {
      const receiver = this;
      return {
        select(_columns: string) {
          return {
            eq(_column1: string, value1: string) {
              return {
                eq(_column2: string, _value2: string) {
                  const index = calls.length;
                  calls.push({ receiver, table, tenantId: value1 });
                  return Promise.resolve(nextResult(results, index));
                },
              };
            },
          };
        },
      };
    },
  };
}

function createComplimentaryFake(
  results: readonly ComplimentaryFakeResult[],
  calls: FakeCall[],
): ComplimentaryAccessGrantLookupClient {
  return {
    from(table: string) {
      const receiver = this;
      return {
        select(_columns: string) {
          return {
            eq(_column: string, value: string) {
              return {
                maybeSingle() {
                  const index = calls.length;
                  calls.push({ receiver, table, tenantId: value });
                  return Promise.resolve(nextResult(results, index));
                },
              };
            },
          };
        },
      };
    },
  };
}

function accessModeRow(
  overrides: Partial<TenantAccessModeRow> = {},
): AccessModeFakeResult {
  return { data: { plan_code: "free", is_demo: false, ...overrides }, error: null };
}

function stripeRows(
  rows: TenantStripeSubscriptionObservationRow[],
): StripeFakeResult {
  return { data: rows, error: null };
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

const NO_GRANT: ComplimentaryFakeResult = { data: null, error: null };

type Harness = {
  dependencies: CreateEffectiveAccessResolverDependencies;
  accessModeCalls: FakeCall[];
  stripeCalls: FakeCall[];
  complimentaryCalls: FakeCall[];
  profileAccesses: ProfileAccess[];
};

function harness(
  accessMode: readonly AccessModeFakeResult[],
  stripe: readonly StripeFakeResult[] = [stripeRows([])],
  complimentary: readonly ComplimentaryFakeResult[] = [NO_GRANT],
): Harness {
  const accessModeCalls: FakeCall[] = [];
  const stripeCalls: FakeCall[] = [];
  const complimentaryCalls: FakeCall[] = [];
  const profileAccesses: ProfileAccess[] = [];
  return {
    dependencies: {
      accessModeClient: createAccessModeFake(accessMode, accessModeCalls),
      modeProfiles: createTrackedModeProfiles(profileAccesses),
      stripeClient: createStripeFake(stripe, stripeCalls),
      complimentaryClient: createComplimentaryFake(
        complimentary,
        complimentaryCalls,
      ),
    },
    accessModeCalls,
    stripeCalls,
    complimentaryCalls,
    profileAccesses,
  };
}

function expectDomain(
  value: EffectiveAccess | Response,
  messagePrefix: string,
): asserts value is EffectiveAccess {
  assert(!(value instanceof Response), `${messagePrefix} must not be a Response`);
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${messagePrefix} must be an EffectiveAccess object`,
  );
  assert(!("data" in value), `${messagePrefix} must not be wrapped in { data }`);
  assert(!("ok" in value), `${messagePrefix} must not be the persistence Result`);
}

async function readBody(response: Response): Promise<unknown> {
  return JSON.parse(await response.text());
}

Deno.test("1. factory returns a ResolveEffectiveAccess-compatible function", () => {
  const h = harness([accessModeRow({ plan_code: "trial" })]);
  const resolver: ResolveEffectiveAccess = createEffectiveAccessResolver(
    h.dependencies,
  );
  assert(typeof resolver === "function", "resolver is a function");
  assertEquals(resolver.length, 1, "resolver takes exactly tenantId");
});

Deno.test("2. tenantId forwarded byte-identical to every persistence client", async () => {
  const h = harness([accessModeRow({ plan_code: "trial" })]);
  const resolver = createEffectiveAccessResolver(h.dependencies);

  const resolved = await resolver(TENANT_UPPER);
  expectDomain(resolved, "2. tenantId");
  assertEquals(h.accessModeCalls[0]?.tenantId, TENANT_UPPER, "AccessMode tenantId");
  assertEquals(h.stripeCalls[0]?.tenantId, TENANT_UPPER, "Stripe tenantId");
  assertEquals(
    h.complimentaryCalls[0]?.tenantId,
    TENANT_UPPER,
    "complimentary tenantId",
  );
});

Deno.test("3–5. accessModeClient, stripeClient, complimentaryClient are the same references", async () => {
  const h = harness([accessModeRow({ plan_code: "trial" })]);
  const resolver = createEffectiveAccessResolver(h.dependencies);
  await resolver(TENANT_A);

  assertEquals(h.accessModeCalls.length, 1, "AccessMode called once");
  assert(
    h.accessModeCalls[0]?.receiver === h.dependencies.accessModeClient,
    "accessModeClient `.from()` receiver is the caller's exact object",
  );
  assertEquals(h.stripeCalls.length, 1, "Stripe called once");
  assert(
    h.stripeCalls[0]?.receiver === h.dependencies.stripeClient,
    "stripeClient `.from()` receiver is the caller's exact object",
  );
  assertEquals(h.complimentaryCalls.length, 1, "complimentary called once");
  assert(
    h.complimentaryCalls[0]?.receiver === h.dependencies.complimentaryClient,
    "complimentaryClient `.from()` receiver is the caller's exact object",
  );
});

Deno.test("6. modeProfiles is the same reference and read only when the domain needs it", async () => {
  const h = harness([accessModeRow({ plan_code: "demo" })]);
  const resolver = createEffectiveAccessResolver(h.dependencies);
  assertEquals(
    h.profileAccesses.length,
    0,
    "factory must not read/clone modeProfiles at bind time",
  );

  const resolved = await resolver(TENANT_A);
  expectDomain(resolved, "6. demo");
  assertEquals(resolved.mode, "demo", "demo mode");
  assertEquals(resolved.capabilities, UNIQUE_DEMO_PROFILE, "caller demo profile");
  assert(
    h.profileAccesses.some(
      (a) => a.key === "demo" && a.receiver === h.dependencies.modeProfiles,
    ),
    "`.demo` read on the caller's exact modeProfiles object",
  );
  assert(
    h.profileAccesses.every((a) => a.receiver === h.dependencies.modeProfiles),
    "no profile read on a cloned object",
  );
  assert(
    JSON.stringify(resolved.capabilities) !==
      JSON.stringify(capabilitiesForTier("base")) &&
      JSON.stringify(resolved.capabilities) !==
        JSON.stringify(capabilitiesForTier("pro")),
    "no Base/Pro substitution for demo",
  );
});

Deno.test("6b. standard mode never touches modeProfiles (no eager default)", async () => {
  const h = harness([accessModeRow({ plan_code: "trial" })]);
  const resolver = createEffectiveAccessResolver(h.dependencies);
  const resolved = await resolver(TENANT_A);
  expectDomain(resolved, "6b. standard");
  assertEquals(resolved.mode, "standard", "standard mode");
  assertEquals(h.profileAccesses, [], "modeProfiles untouched in standard mode");
});

Deno.test("7. granted Stripe Base/Pro and complimentary preserved", async () => {
  const base = createEffectiveAccessResolver(
    harness(
      [accessModeRow({ plan_code: "paid" })],
      [stripeRows([stripeRow({ product_tier: "base" })])],
    ).dependencies,
  );
  const baseResolved = await base(TENANT_A);
  expectDomain(baseResolved, "7. Base");
  assertEquals(baseResolved.status, "granted", "Base granted");
  assertEquals(baseResolved.tier, "base", "Base tier");
  assertEquals(baseResolved.source, "stripe", "Base source");
  assertEquals(baseResolved.capabilities, capabilitiesForTier("base"), "Base caps");

  const pro = createEffectiveAccessResolver(
    harness(
      [accessModeRow({ plan_code: "paid" })],
      [stripeRows([stripeRow({ product_tier: "pro" })])],
    ).dependencies,
  );
  const proResolved = await pro(TENANT_B);
  expectDomain(proResolved, "7. Pro");
  assertEquals(proResolved.tier, "pro", "Pro tier");
  assertEquals(proResolved.source, "stripe", "Pro source");

  const complimentary = createEffectiveAccessResolver(
    harness(
      [accessModeRow({ plan_code: "free" })],
      [stripeRows([])],
      [{ data: { product_tier: "pro" }, error: null }],
    ).dependencies,
  );
  const complimentaryResolved = await complimentary(TENANT_A);
  expectDomain(complimentaryResolved, "7. complimentary");
  assertEquals(complimentaryResolved.status, "granted", "complimentary granted");
  assertEquals(complimentaryResolved.tier, "pro", "complimentary Pro");
  assertEquals(
    complimentaryResolved.source,
    "complimentary",
    "complimentary source preserved — no Stripe-only degradation",
  );
});

Deno.test("8. unentitled preserved as EffectiveAccess", async () => {
  const resolver = createEffectiveAccessResolver(
    harness([accessModeRow({ plan_code: "trial" })]).dependencies,
  );
  const resolved = await resolver(TENANT_A);
  expectDomain(resolved, "8. unentitled");
  assertEquals(resolved.status, "unentitled", "status");
  assertEquals(resolved.tier, null, "tier");
  assertEquals(resolved.source, null, "source");
  assertEquals(resolved.capabilities, [], "empty capabilities");
});

Deno.test("9. domain invalid preserved as EffectiveAccess", async () => {
  const resolver = createEffectiveAccessResolver(
    harness(
      [accessModeRow({ plan_code: "free" })],
      [stripeRows([stripeRow({ status: "unknown" })])],
    ).dependencies,
  );
  const resolved = await resolver(TENANT_A);
  expectDomain(resolved, "9. invalid");
  assertEquals(resolved.status, "invalid", "status");
});

Deno.test("10. invalid_tenant_id → 422 via existing chain; no client queried", async () => {
  const h = harness([accessModeRow()]);
  const resolver = createEffectiveAccessResolver(h.dependencies);
  const resolved = await resolver("not-a-uuid");
  assert(resolved instanceof Response, "422 is a Response");
  assertEquals(resolved.status, 422, "status 422");
  assertEquals(
    await readBody(resolved),
    {
      error: {
        code: "UNPROCESSABLE_ENTITY",
        message: "Invalid tenant identifier.",
      },
    },
    "adapter envelope unchanged",
  );
  assertEquals(h.accessModeCalls.length, 0, "no AccessMode query");
  assertEquals(h.stripeCalls.length, 0, "no Stripe query");
  assertEquals(h.complimentaryCalls.length, 0, "no complimentary query");
});

Deno.test("11. persistence lookup failure → opaque 500 via existing chain", async () => {
  const lookupFailed = createEffectiveAccessResolver(
    harness([
      { data: null, error: { code: "57014", message: "timeout RAW_LOOKUP" } },
    ]).dependencies,
  );
  const failed = await lookupFailed(TENANT_A);
  assert(failed instanceof Response, "500 is a Response");
  assertEquals(failed.status, 500, "status 500");
  assertEquals(
    await readBody(failed),
    { error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
    "adapter envelope unchanged",
  );

  const complimentaryFailed = createEffectiveAccessResolver(
    harness(
      [accessModeRow({ plan_code: "free" })],
      [stripeRows([])],
      [{
        data: null,
        error: { code: "57014", message: "timeout RAW_COMPLIMENTARY" },
      }],
    ).dependencies,
  );
  const complimentary = await complimentaryFailed(TENANT_A);
  assert(complimentary instanceof Response, "complimentary failure is a Response");
  assertEquals(complimentary.status, 500, "complimentary failure is 500 — not Stripe-only");
  const body = await complimentary.text();
  assert(!body.includes("RAW_COMPLIMENTARY"), "raw message not leaked");
  assert(!body.includes("RAW_LOOKUP"), "raw message not leaked");
});

Deno.test("12–13. one composition per invocation; two invocations are independent, no cache", async () => {
  const h = harness([
    accessModeRow({ plan_code: "trial" }),
    accessModeRow({ plan_code: "demo" }),
  ]);
  const resolver = createEffectiveAccessResolver(h.dependencies);

  const first = await resolver(TENANT_A);
  expectDomain(first, "13. first");
  assertEquals(first.status, "unentitled", "first invocation result");
  assertEquals(h.accessModeCalls.length, 1, "one AccessMode SELECT");
  assertEquals(h.stripeCalls.length, 1, "one Stripe SELECT");
  assertEquals(h.complimentaryCalls.length, 1, "one complimentary SELECT");

  const second = await resolver(TENANT_A);
  expectDomain(second, "13. second");
  assertEquals(second.mode, "demo", "second invocation re-reads persistence");
  assertEquals(h.accessModeCalls.length, 2, "second AccessMode SELECT — no caching");
  assertEquals(h.stripeCalls.length, 1, "demo mode: no extra Stripe call, no retry");
  assertEquals(h.complimentaryCalls.length, 1, "demo mode: no extra complimentary call");
  assert(first !== second, "results are distinct objects");
});

Deno.test("14–17. source scan: no auth, audience, env, client creation, serializer, HTTP, mappings, defaults", () => {
  const h = harness([accessModeRow()]);
  const factorySource = createEffectiveAccessResolver.toString();
  const resolverSource = createEffectiveAccessResolver(h.dependencies).toString();
  const forbidden = [
    "Deno.env",
    "Deno.serve",
    "createClient",
    "createUserScopedClient",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
    "parseAuthHeader",
    "getAuthenticatedUser",
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "tenant_memberships",
    '"admin"',
    '"billing"',
    '"user"',
    "serializeEffectiveAccess",
    "jsonResponse",
    "JSON.stringify",
    "Response(",
    "handleEffectiveAccessRequest(",
    "internalError",
    "unprocessableEntity",
    "invalid_tenant_id",
    "tenant_lookup_failed",
    "tenant_not_found",
    "adaptEffectiveAccessPersistenceResult",
    "capabilitiesForTier",
    "expense_management",
    "standard_dashboard",
    "ai_categorization",
    "ai_insights",
    "ai_assistant",
    "...dependencies",
    "Object.assign",
    "structuredClone",
    "??",
    "||",
  ];
  for (const source of [factorySource, resolverSource]) {
    for (const token of forbidden) {
      assert(!source.includes(token), `binder must not contain ${token}`);
    }
  }
  assertEquals(
    (factorySource.match(/resolveHttpSafeTenantEffectiveAccessFromPersistence\(/g) ?? [])
      .length,
    1,
    "exactly one delegation target",
  );
  for (
    const forwarded of [
      "tenantId",
      "accessModeClient: dependencies.accessModeClient",
      "modeProfiles: dependencies.modeProfiles",
      "stripeClient: dependencies.stripeClient",
      "complimentaryClient: dependencies.complimentaryClient",
    ]
  ) {
    assert(factorySource.includes(forwarded), `must forward ${forwarded}`);
  }
});
