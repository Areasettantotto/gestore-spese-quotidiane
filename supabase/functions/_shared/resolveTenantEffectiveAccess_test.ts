/**
 * Deno tests for resolveTenantEffectiveAccess.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/resolveTenantEffectiveAccess_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import {
  readTenantComplimentaryAccessCandidate,
  type ComplimentaryAccessGrantLookupClient,
  type ComplimentaryAccessGrantLookupError,
  type ComplimentaryAccessGrantRow,
} from "./readTenantComplimentaryAccessCandidate.ts";
import {
  capabilitiesForTier,
  resolveEffectiveAccess,
  type AccessMode,
  type Capability,
  type EffectiveAccess,
  type EntitlementCandidate,
  type ModeCapabilityProfiles,
  type ProductTier,
} from "./resolveEffectiveAccess.ts";
import {
  resolveTenantEffectiveAccess,
  type ResolveTenantEffectiveAccessResult,
} from "./resolveTenantEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from historical reports. */
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
  result: ResolveTenantEffectiveAccessResult,
): asserts result is Extract<
  ResolveTenantEffectiveAccessResult,
  { ok: true }
> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: ResolveTenantEffectiveAccessResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(
    !("effectiveAccess" in result),
    "failure must not return partial effective access",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

const ABSENT: EntitlementCandidate = { kind: "absent" };
const INVALID: EntitlementCandidate = { kind: "invalid" };

function valid(
  tier: ProductTier,
  expiresAt: string | null = null,
): EntitlementCandidate {
  return { kind: "valid", tier, expiresAt };
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

type FakeLookupResult = {
  data: ComplimentaryAccessGrantRow | null;
  error: ComplimentaryAccessGrantLookupError | null;
};

type FakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
  maybeSingle: boolean;
};

/**
 * Minimal SELECT-only fake: `.from().select().eq().maybeSingle()` → Promise.
 * Optionally throws to simulate transport/client failures.
 * Does not expose insert/update/upsert/delete.
 */
function createFakeClient(
  result: FakeLookupResult | (() => never),
  calls: FakeCall[],
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

function domainEquivalent(params: {
  mode?: AccessMode;
  stripeCandidate: EntitlementCandidate;
  complimentaryCandidate: EntitlementCandidate;
}): EffectiveAccess {
  return resolveEffectiveAccess({
    mode: params.mode ?? "standard",
    stripeCandidate: params.stripeCandidate,
    complimentaryCandidate: params.complimentaryCandidate,
    modeProfiles: MODE_PROFILES,
  });
}

async function compose(params: {
  tenantId?: unknown;
  client: ComplimentaryAccessGrantLookupClient;
  stripeCandidate?: EntitlementCandidate;
  mode?: AccessMode;
}): Promise<ResolveTenantEffectiveAccessResult> {
  return await resolveTenantEffectiveAccess({
    tenantId: "tenantId" in params ? params.tenantId : TENANT_A,
    client: params.client,
    mode: params.mode ?? "standard",
    stripeCandidate: params.stripeCandidate ?? ABSENT,
    modeProfiles: MODE_PROFILES,
  });
}

function assertSelectOnlyComplimentary(calls: FakeCall[]): void {
  assert(calls.length >= 1, "expected at least one SELECT");
  for (const call of calls) {
    assertEquals(
      call.table,
      "tenant_complimentary_access_grants",
      "complimentary grant table only",
    );
    assert(call.maybeSingle === true, "maybeSingle used");
    assert(
      call.table !== "tenant_subscriptions" &&
        call.table !== "tenant_billing_customers" &&
        call.table !== "billing_events",
      "must not query Stripe commercial storage",
    );
  }
}

Deno.test("1. complimentary Base enters the complimentary slot", async () => {
  const calls: FakeCall[] = [];
  const stripeCandidate = ABSENT;
  const result = await compose({
    client: createFakeClient(
      { data: { product_tier: "base" }, error: null },
      calls,
    ),
    stripeCandidate,
  });

  expectSuccess(result);
  assertEquals(
    result.effectiveAccess,
    domainEquivalent({
      stripeCandidate,
      complimentaryCandidate: { kind: "valid", tier: "base", expiresAt: null },
    }),
    "composition matches domain resolver with the same Base candidate",
  );
  assertSelectOnlyComplimentary(calls);
});

Deno.test("2. complimentary Pro enters the complimentary slot", async () => {
  const stripeCandidate = ABSENT;
  const result = await compose({
    client: createFakeClient(
      { data: { product_tier: "pro" }, error: null },
      [],
    ),
    stripeCandidate,
  });

  expectSuccess(result);
  assertEquals(
    result.effectiveAccess,
    domainEquivalent({
      stripeCandidate,
      complimentaryCandidate: { kind: "valid", tier: "pro", expiresAt: null },
    }),
    "composition matches domain resolver with the same Pro candidate",
  );
});

Deno.test("3. complimentary absent is passed through; no invented default", async () => {
  const calls: FakeCall[] = [];
  const stripeCandidate = ABSENT;
  const result = await compose({
    client: createFakeClient({ data: null, error: null }, calls),
    stripeCandidate,
  });

  expectSuccess(result);
  assertEquals(
    result.effectiveAccess,
    domainEquivalent({
      stripeCandidate,
      complimentaryCandidate: { kind: "absent" },
    }),
    "absent complimentary is forwarded as absent",
  );
  assertEquals(result.effectiveAccess.status, "unentitled", "no default grant");
  assertEquals(result.effectiveAccess.tier, null, "no invented tier");
  assertEquals(result.effectiveAccess.source, null, "no invented source");
  assertSelectOnlyComplimentary(calls);
});

Deno.test("4. complimentary DB failure is fail-closed, not absent", async () => {
  const stripeCandidate = valid("pro", "stripe-pro-expiry");
  const absentWouldGrant = domainEquivalent({
    stripeCandidate,
    complimentaryCandidate: ABSENT,
  });
  assertEquals(absentWouldGrant.status, "granted", "sanity: absent would grant Stripe");

  const result = await compose({
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
    stripeCandidate,
  });

  expectFailure(result, "complimentary_access_grant_lookup_failed");
  assert(
    JSON.stringify(result) !== JSON.stringify({
      ok: true,
      effectiveAccess: absentWouldGrant,
    }),
    "lookup failure must not collapse to absent and grant Stripe",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_ALPHA") &&
      !serialized.includes("timeout") &&
      !serialized.includes("57014"),
    "must not leak raw DB error details",
  );
});

Deno.test("5. invalid complimentary tier is fail-closed", async () => {
  const stripeCandidate = valid("base");
  const invalidAsDomainWouldKeepStripe = domainEquivalent({
    stripeCandidate,
    complimentaryCandidate: INVALID,
  });
  assertEquals(
    invalidAsDomainWouldKeepStripe.status,
    "granted",
    "sanity: domain invalid does not cancel a valid Stripe source",
  );

  const invalidTiers: unknown[] = [
    "free",
    "paid",
    "trial",
    "demo",
    "internal",
    "enterprise",
    "BASE",
    "Pro",
  ];

  for (const product_tier of invalidTiers) {
    const result = await compose({
      client: createFakeClient(
        { data: { product_tier }, error: null },
        [],
      ),
      stripeCandidate,
    });
    expectFailure(result, "complimentary_access_grant_invalid");
    assert(
      JSON.stringify(result) !== JSON.stringify({
        ok: true,
        effectiveAccess: invalidAsDomainWouldKeepStripe,
      }),
      "reader invalid must not become a domain invalid candidate that grants Stripe",
    );
  }
});

Deno.test("6. tenantId received from the caller is passed unchanged", async () => {
  const calls: FakeCall[] = [];
  await compose({
    tenantId: TENANT_B,
    client: createFakeClient({ data: null, error: null }, calls),
  });

  assertEquals(calls.length, 1, "one SELECT");
  assertEquals(
    calls[0]?.filters,
    [{ column: "tenant_id", value: TENANT_B }],
    "query pinned to received tenantId",
  );
  assert(
    calls[0]?.filters[0]?.value !== TENANT_A,
    "must not substitute another tenant",
  );

  const paddedCalls: FakeCall[] = [];
  const paddedTenant = " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ";
  await compose({
    tenantId: paddedTenant,
    client: createFakeClient({ data: null, error: null }, paddedCalls),
  });
  assertEquals(
    paddedCalls[0]?.filters,
    [{ column: "tenant_id", value: paddedTenant }],
    "input identity must be preserved for DB filters",
  );
});

Deno.test("7. stripeCandidate is forwarded unchanged; no Stripe lookup", async () => {
  const calls: FakeCall[] = [];
  const stripeCandidate = Object.freeze(
    valid("base", "stripe-opaque-expiry-marker"),
  );
  const result = await compose({
    client: createFakeClient({ data: null, error: null }, calls),
    stripeCandidate,
  });

  expectSuccess(result);
  assertEquals(
    result.effectiveAccess,
    domainEquivalent({
      stripeCandidate,
      complimentaryCandidate: ABSENT,
    }),
    "same stripeCandidate reaches the domain resolver",
  );
  assertEquals(
    result.effectiveAccess.expiresAt,
    "stripe-opaque-expiry-marker",
    "opaque Stripe expiry is preserved",
  );
  assertSelectOnlyComplimentary(calls);
  assertEquals(calls.length, 1, "exactly one complimentary SELECT");
});

Deno.test("8. precedence matches the domain resolver with the same inputs", async () => {
  const stripeCandidate = valid("base", "stripe-base-expiry");
  const result = await compose({
    client: createFakeClient(
      { data: { product_tier: "pro" }, error: null },
      [],
    ),
    stripeCandidate,
  });

  expectSuccess(result);
  assertEquals(
    result.effectiveAccess,
    domainEquivalent({
      stripeCandidate,
      complimentaryCandidate: { kind: "valid", tier: "pro", expiresAt: null },
    }),
    "composition must not encode a second precedence",
  );
});

Deno.test("9. source is produced by the resolver, not caller or DB", async () => {
  const result = await compose({
    client: createFakeClient(
      { data: { product_tier: "base" }, error: null },
      [],
    ),
    stripeCandidate: ABSENT,
  });

  expectSuccess(result);
  const expected = domainEquivalent({
    stripeCandidate: ABSENT,
    complimentaryCandidate: { kind: "valid", tier: "base", expiresAt: null },
  });
  assertEquals(result.effectiveAccess.source, expected.source, "source");
  assertEquals(
    result.effectiveAccess.source,
    "complimentary",
    "source comes from the complimentary slot",
  );
});

Deno.test("10. no-row is success/absent; query error is not no-row", async () => {
  const noRow = await compose({
    client: createFakeClient({ data: null, error: null }, []),
  });
  expectSuccess(noRow);
  assertEquals(noRow.effectiveAccess.status, "unentitled", "no-row → unentitled");

  const readerAbsent = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient({ data: null, error: null }, []),
  });
  if (readerAbsent.ok !== true) {
    throw new Error("reader no-row is success");
  }
  assertEquals(readerAbsent.candidate.kind, "absent", "reader absent");

  const lookupFailed = await compose({
    client: createFakeClient(
      {
        data: null,
        error: { code: "XX000", message: "internal RAW_LOOKUP_DETAIL" },
      },
      [],
    ),
  });
  expectFailure(lookupFailed, "complimentary_access_grant_lookup_failed");
  assert(
    lookupFailed.ok !== noRow.ok ||
      JSON.stringify(lookupFailed) !== JSON.stringify(noRow),
    "error and no-row must be distinct results",
  );
});

Deno.test("11. fake client exposes only the SELECT seam; no mutation", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(
    { data: { product_tier: "base" }, error: null },
    calls,
  );

  assert(
    !("insert" in client) &&
      !("update" in client) &&
      !("upsert" in client) &&
      !("delete" in client),
    "client surface has no mutation methods",
  );

  const result = await compose({ client });
  expectSuccess(result);
  assertEquals(calls.length, 1, "one SELECT");
  assertEquals(calls[0]?.columns, "product_tier", "select product_tier only");
  assertSelectOnlyComplimentary(calls);
});

Deno.test("12. reader failure does not return resolver output", async () => {
  const stripeCandidate = valid("pro");
  const resolverIfReached = domainEquivalent({
    stripeCandidate,
    complimentaryCandidate: ABSENT,
  });

  const result = await compose({
    client: createFakeClient(() => {
      throw new Error(
        "socket hang up with RAW_EXCEPTION_DETAIL_BETA RAW_PRIVATE_DETAIL_DELTA",
      );
    }, []),
    stripeCandidate,
  });

  expectFailure(result, "complimentary_access_grant_lookup_failed");
  assert(
    JSON.stringify(result) !== JSON.stringify({
      ok: true,
      effectiveAccess: resolverIfReached,
    }),
    "resolver output must not appear when the reader fails",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_EXCEPTION_DETAIL_BETA") &&
      !serialized.includes("socket hang") &&
      !serialized.includes("RAW_PRIVATE_DETAIL_DELTA"),
    "must not leak raw exception text",
  );
});

Deno.test("13. invalid tenantId fails closed without querying", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: null, error: null }, calls);

  for (const invalid of [null, undefined, "", " ", "   ", "\t", 1, true, {}, []]) {
    calls.length = 0;
    const result = await compose({ tenantId: invalid, client });
    expectFailure(result, "invalid_tenant_id");
    assertEquals(calls.length, 0, "must not query on invalid tenantId");
  }
});

/**
 * Throws as soon as a complimentary table access starts.
 * Used to prove Demo/Internal never touch the grant table.
 */
function createThrowOnQueryClient(
  calls: FakeCall[],
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

Deno.test("14. demo bypasses complimentary lookup", async () => {
  const calls: FakeCall[] = [];
  const stripeCandidate = valid("pro", "stripe-ignored-by-demo");
  const result = await compose({
    mode: "demo",
    client: createThrowOnQueryClient(calls),
    stripeCandidate,
  });

  expectSuccess(result);
  assertEquals(
    result.effectiveAccess,
    domainEquivalent({
      mode: "demo",
      stripeCandidate,
      complimentaryCandidate: ABSENT,
    }),
    "demo matches the domain resolver with the same inputs",
  );
  assertEquals(calls.length, 0, "demo must not query complimentary grants");
});

Deno.test("15. internal bypasses complimentary lookup", async () => {
  const calls: FakeCall[] = [];
  const stripeCandidate = valid("base", "stripe-ignored-by-internal");
  const result = await compose({
    mode: "internal",
    client: createThrowOnQueryClient(calls),
    stripeCandidate,
  });

  expectSuccess(result);
  assertEquals(
    result.effectiveAccess,
    domainEquivalent({
      mode: "internal",
      stripeCandidate,
      complimentaryCandidate: ABSENT,
    }),
    "internal matches the domain resolver with the same inputs",
  );
  assertEquals(calls.length, 0, "internal must not query complimentary grants");
});

Deno.test("17. standard still looks up complimentary once and stays fail-closed", async () => {
  const successCalls: FakeCall[] = [];
  const success = await compose({
    mode: "standard",
    client: createFakeClient(
      { data: { product_tier: "base" }, error: null },
      successCalls,
    ),
  });
  expectSuccess(success);
  assertEquals(successCalls.length, 1, "exactly one complimentary SELECT");
  assertEquals(
    successCalls[0]?.table,
    "tenant_complimentary_access_grants",
    "standard queries the complimentary grant table",
  );

  const failCalls: FakeCall[] = [];
  const failed = await compose({
    mode: "standard",
    stripeCandidate: valid("pro"),
    client: createFakeClient(() => {
      throw new Error("statement timeout RAW_STANDARD_LOOKUP");
    }, failCalls),
  });
  expectFailure(failed, "complimentary_access_grant_lookup_failed");
  assertEquals(failCalls.length, 1, "standard still attempted the lookup");
  assertEquals(
    failCalls[0]?.table,
    "tenant_complimentary_access_grants",
    "failure path queried complimentary grants",
  );
});
