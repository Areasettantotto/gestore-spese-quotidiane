/**
 * Deno tests for createPrivilegedEffectiveAccessResolver (BILLING-101).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/createPrivilegedEffectiveAccessResolver_test.ts
 *
 * Injected B99/B95 factories + in-memory SELECT fakes.
 * No network, env, secrets, or real DB.
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
import type { CreateEffectiveAccessResolverDependencies } from "./createEffectiveAccessResolver.ts";
import type { PrivilegedEffectiveAccessPersistenceConfig } from "./createPrivilegedEffectiveAccessPersistenceClients.ts";
import type { ResolveEffectiveAccess } from "./handleEffectiveAccessRequest.ts";
import {
  capabilitiesForTier,
  type Capability,
  type EffectiveAccess,
  type ModeCapabilityProfiles,
} from "./resolveEffectiveAccess.ts";
import {
  createPrivilegedEffectiveAccessResolver,
  type PrivilegedEffectiveAccessResolverConfig,
} from "./createPrivilegedEffectiveAccessResolver.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SYNTHETIC_URL = "https://b101-privileged.example.invalid";
const SYNTHETIC_KEY = "synthetic-b101-service-role-key-not-a-secret";
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";

/** synthetic fixture — not product policy */
const SYNTHETIC_DEMO_PROFILE: readonly Capability[] = Object.freeze([
  "ai_assistant",
]);

/** synthetic fixture — not product policy */
const SYNTHETIC_INTERNAL_PROFILE: readonly Capability[] = Object.freeze([
  "expense_management",
]);

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

type ProfileAccess = { key: "demo" | "internal"; receiver: unknown };

function createTrackedModeProfiles(
  accesses: ProfileAccess[],
): ModeCapabilityProfiles {
  return {
    get demo(): readonly Capability[] {
      accesses.push({ key: "demo", receiver: this });
      return SYNTHETIC_DEMO_PROFILE;
    },
    get internal(): readonly Capability[] {
      accesses.push({ key: "internal", receiver: this });
      return SYNTHETIC_INTERNAL_PROFILE;
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

function nextResult<T>(results: readonly T[], index: number): T {
  const result = results[Math.min(index, results.length - 1)];
  if (result === undefined) {
    throw new Error("fake results must not be empty");
  }
  return result;
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

type PersistenceClients = Pick<
  CreateEffectiveAccessResolverDependencies,
  "accessModeClient" | "stripeClient" | "complimentaryClient"
>;

type InMemoryPersistence = {
  clients: PersistenceClients;
  accessModeCalls: FakeCall[];
  stripeCalls: FakeCall[];
  complimentaryCalls: FakeCall[];
};

function createInMemoryPersistence(
  accessMode: readonly AccessModeFakeResult[],
  stripe: readonly StripeFakeResult[] = [stripeRows([])],
  complimentary: readonly ComplimentaryFakeResult[] = [NO_GRANT],
): InMemoryPersistence {
  const accessModeCalls: FakeCall[] = [];
  const stripeCalls: FakeCall[] = [];
  const complimentaryCalls: FakeCall[] = [];
  return {
    clients: {
      accessModeClient: createAccessModeFake(accessMode, accessModeCalls),
      stripeClient: createStripeFake(stripe, stripeCalls),
      complimentaryClient: createComplimentaryFake(
        complimentary,
        complimentaryCalls,
      ),
    },
    accessModeCalls,
    stripeCalls,
    complimentaryCalls,
  };
}

type PersistenceFactoryCall = {
  supabaseUrl: string;
  serviceRoleKey: string;
  argumentCount: number;
  keys: string[];
};

type ResolverFactoryCall = {
  dependencies: CreateEffectiveAccessResolverDependencies;
};

const SENTINEL_RESOLVER: ResolveEffectiveAccess = (_tenantId) =>
  Promise.resolve({
    status: "unentitled",
    mode: "standard",
    tier: null,
    source: null,
    expiresAt: null,
    capabilities: [],
  });

function expectDomain(
  value: EffectiveAccess | Response,
  messagePrefix: string,
): asserts value is EffectiveAccess {
  assert(!(value instanceof Response), `${messagePrefix} must not be a Response`);
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${messagePrefix} must be an EffectiveAccess object`,
  );
}

Deno.test("1. factory returns a ResolveEffectiveAccess-compatible function", () => {
  const persistence = createInMemoryPersistence([accessModeRow()]);
  const resolver: ResolveEffectiveAccess = createPrivilegedEffectiveAccessResolver(
    {
      supabaseUrl: SYNTHETIC_URL,
      serviceRoleKey: SYNTHETIC_KEY,
      modeProfiles: createTrackedModeProfiles([]),
    },
    {
      createPersistenceClients: () => persistence.clients,
      createResolver: () => SENTINEL_RESOLVER,
    },
  );
  assert(typeof resolver === "function", "resolver is a function");
  assertEquals(resolver.length, 1, "resolver takes exactly tenantId");
});

Deno.test("2–8. B99 once; URL/key pass-through; B95 once; client and profile identity; resolver identity", () => {
  const persistence = createInMemoryPersistence([accessModeRow()]);
  const persistenceCalls: PersistenceFactoryCall[] = [];
  const resolverCalls: ResolverFactoryCall[] = [];
  const profileAccesses: ProfileAccess[] = [];
  const modeProfiles = createTrackedModeProfiles(profileAccesses);

  const config: PrivilegedEffectiveAccessResolverConfig = {
    supabaseUrl: SYNTHETIC_URL,
    serviceRoleKey: SYNTHETIC_KEY,
    modeProfiles,
  };

  const resolver = createPrivilegedEffectiveAccessResolver(config, {
    createPersistenceClients: (
      persistenceConfig: PrivilegedEffectiveAccessPersistenceConfig,
      ...rest: unknown[]
    ) => {
      persistenceCalls.push({
        supabaseUrl: persistenceConfig.supabaseUrl,
        serviceRoleKey: persistenceConfig.serviceRoleKey,
        argumentCount: 1 + rest.length,
        keys: Object.keys(persistenceConfig).sort(),
      });
      return persistence.clients;
    },
    createResolver: (dependencies) => {
      resolverCalls.push({ dependencies });
      return SENTINEL_RESOLVER;
    },
  });

  assertEquals(persistenceCalls.length, 1, "B99 factory invoked exactly once");
  assert(
    persistenceCalls[0]?.supabaseUrl === SYNTHETIC_URL,
    "supabaseUrl passed byte-identical",
  );
  assert(
    persistenceCalls[0]?.supabaseUrl === config.supabaseUrl,
    "supabaseUrl is the caller's exact string",
  );
  assert(
    persistenceCalls[0]?.serviceRoleKey === SYNTHETIC_KEY,
    "serviceRoleKey passed byte-identical",
  );
  assert(
    persistenceCalls[0]?.serviceRoleKey === config.serviceRoleKey,
    "serviceRoleKey is the caller's exact string",
  );
  assertEquals(
    persistenceCalls[0]?.argumentCount,
    1,
    "B99 receives only persistence config; no createClient seam forwarded",
  );
  assertEquals(
    persistenceCalls[0]?.keys,
    ["serviceRoleKey", "supabaseUrl"],
    "B99 config has only URL and key; modeProfiles not forwarded",
  );

  assertEquals(resolverCalls.length, 1, "B95 factory invoked exactly once");
  const bound = resolverCalls[0]?.dependencies;
  assert(bound !== undefined, "B95 received dependencies");
  assert(
    bound.accessModeClient === persistence.clients.accessModeClient,
    "accessModeClient identity from B99",
  );
  assert(
    bound.stripeClient === persistence.clients.stripeClient,
    "stripeClient identity from B99",
  );
  assert(
    bound.complimentaryClient === persistence.clients.complimentaryClient,
    "complimentaryClient identity from B99",
  );
  assert(
    bound.modeProfiles === modeProfiles,
    "modeProfiles passed to B95 by reference identity",
  );
  assert(
    resolver === SENTINEL_RESOLVER,
    "output is exactly the B95 resolver; no wrapper",
  );
});

Deno.test("9–10. factory construction does not read modeProfiles or query", () => {
  const persistence = createInMemoryPersistence([accessModeRow()]);
  const profileAccesses: ProfileAccess[] = [];
  const modeProfiles = createTrackedModeProfiles(profileAccesses);

  createPrivilegedEffectiveAccessResolver(
    {
      supabaseUrl: SYNTHETIC_URL,
      serviceRoleKey: SYNTHETIC_KEY,
      modeProfiles,
    },
    {
      createPersistenceClients: () => persistence.clients,
      createResolver: (dependencies) => {
        assert(
          dependencies.modeProfiles === modeProfiles,
          "B95 bind receives the same modeProfiles reference",
        );
        return SENTINEL_RESOLVER;
      },
    },
  );

  assertEquals(
    profileAccesses,
    [],
    "factory construction must not read .demo or .internal",
  );
  assertEquals(persistence.accessModeCalls.length, 0, "no AccessMode query");
  assertEquals(persistence.stripeCalls.length, 0, "no Stripe query");
  assertEquals(
    persistence.complimentaryCalls.length,
    0,
    "no complimentary query",
  );
});

Deno.test("A. STANDARD: Base entitlement ignores synthetic modeProfiles", async () => {
  const persistence = createInMemoryPersistence(
    [accessModeRow({ plan_code: "paid" })],
    [stripeRows([stripeRow({ product_tier: "base" })])],
  );
  const profileAccesses: ProfileAccess[] = [];
  const modeProfiles = createTrackedModeProfiles(profileAccesses);

  const resolver = createPrivilegedEffectiveAccessResolver(
    {
      supabaseUrl: SYNTHETIC_URL,
      serviceRoleKey: SYNTHETIC_KEY,
      modeProfiles,
    },
    {
      createPersistenceClients: () => persistence.clients,
    },
  );

  assertEquals(
    profileAccesses,
    [],
    "real B95 bind must not read modeProfiles",
  );
  assertEquals(
    persistence.accessModeCalls.length,
    0,
    "real B95 bind must not query",
  );

  const resolved = await resolver(TENANT_A);
  expectDomain(resolved, "A. standard Base");
  assertEquals(resolved.mode, "standard", "standard mode");
  assertEquals(resolved.status, "granted", "granted");
  assertEquals(resolved.tier, "base", "Base tier");
  assertEquals(resolved.source, "stripe", "Stripe source");
  assertEquals(
    resolved.capabilities,
    capabilitiesForTier("base"),
    "standard uses existing Base mapping",
  );
  assertEquals(
    profileAccesses,
    [],
    "standard path does not consume synthetic modeProfiles",
  );
  assert(
    JSON.stringify(resolved.capabilities) !==
      JSON.stringify(SYNTHETIC_DEMO_PROFILE) &&
      JSON.stringify(resolved.capabilities) !==
        JSON.stringify(SYNTHETIC_INTERNAL_PROFILE),
    "standard capabilities are not the synthetic demo/internal fixtures",
  );
});

Deno.test("B. DEMO: synthetic caller-supplied profile pass-through — not product policy", async () => {
  const persistence = createInMemoryPersistence([
    accessModeRow({ plan_code: "demo" }),
  ]);
  const profileAccesses: ProfileAccess[] = [];
  const modeProfiles = createTrackedModeProfiles(profileAccesses);

  const resolver = createPrivilegedEffectiveAccessResolver(
    {
      supabaseUrl: SYNTHETIC_URL,
      serviceRoleKey: SYNTHETIC_KEY,
      modeProfiles,
    },
    {
      createPersistenceClients: () => persistence.clients,
    },
  );

  const resolved = await resolver(TENANT_A);
  expectDomain(resolved, "B. demo");
  assertEquals(resolved.mode, "demo", "demo mode");
  assertEquals(resolved.status, "granted", "granted");
  assertEquals(
    resolved.capabilities,
    SYNTHETIC_DEMO_PROFILE,
    "synthetic demo capabilities returned unchanged",
  );
  assert(
    profileAccesses.some(
      (access) => access.key === "demo" && access.receiver === modeProfiles,
    ),
    ".demo read on the caller's exact modeProfiles object",
  );
  assert(
    JSON.stringify(resolved.capabilities) !==
      JSON.stringify(capabilitiesForTier("base")) &&
      JSON.stringify(resolved.capabilities) !==
        JSON.stringify(capabilitiesForTier("pro")),
    "synthetic demo profile is not Base/Pro mapping",
  );
});

Deno.test("config requires supabaseUrl, serviceRoleKey, and modeProfiles", () => {
  type ConfigKey = keyof PrivilegedEffectiveAccessResolverConfig;
  type Unexpected = Exclude<
    ConfigKey,
    "supabaseUrl" | "serviceRoleKey" | "modeProfiles"
  >;
  type Missing = Exclude<
    "supabaseUrl" | "serviceRoleKey" | "modeProfiles",
    ConfigKey
  >;
  type FieldsAreOptional =
    Partial<PrivilegedEffectiveAccessResolverConfig> extends
      PrivilegedEffectiveAccessResolverConfig ? true : false;

  const noUnexpected: [Unexpected] extends [never] ? true : false = true;
  const noMissing: [Missing] extends [never] ? true : false = true;
  const required: FieldsAreOptional extends false ? true : false = true;

  assert(noUnexpected && noMissing && required, "config keys are exact and required");
});

Deno.test("11–20. production factory has no env, auth, HTTP, query, policy, or unsafe cast", () => {
  const source = createPrivilegedEffectiveAccessResolver.toString();
  const required = [
    "createPrivilegedEffectiveAccessPersistenceClients",
    "createEffectiveAccessResolver",
    "modeProfiles",
  ];
  for (const token of required) {
    assert(source.includes(token), `factory must contain ${token}`);
  }

  const forbidden = [
    "Deno.env",
    "Deno.serve",
    "createClient",
    "adaptSupabaseClientToEffectiveAccessPersistenceClients",
    ".from(",
    ".select(",
    ".eq(",
    ".rpc(",
    "authorizeTenantEffectiveAccess",
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "handleEffectiveAccessRequest",
    "serializeEffectiveAccess",
    "capabilitiesForTier",
    '"expense_management"',
    '"standard_dashboard"',
    '"ai_categorization"',
    '"ai_insights"',
    '"ai_assistant"',
    "console.log",
    "console.error",
    "as any",
    "as unknown as",
    "@ts-ignore",
    "@ts-expect-error",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `factory must not contain ${token}`);
  }
});
