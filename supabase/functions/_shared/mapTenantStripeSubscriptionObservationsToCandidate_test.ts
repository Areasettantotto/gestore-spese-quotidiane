/**
 * Deno tests for mapTenantStripeSubscriptionObservationsToCandidate (BILLING-82).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/mapTenantStripeSubscriptionObservationsToCandidate_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import { mapTenantStripeSubscriptionObservationsToCandidate } from "./mapTenantStripeSubscriptionObservationsToCandidate.ts";
import type { TenantStripeSubscriptionObservation } from "./readTenantStripeSubscriptionObservations.ts";
import type {
  EntitlementCandidate,
  ProductTier,
} from "./resolveEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const PERIOD_FUTURE = "2099-06-15T12:00:00.000Z";
const PERIOD_PAST = "2001-03-04T08:30:00.000Z";

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

function observation(
  status: string,
  productTier: ProductTier | null = "base",
  currentPeriodEnd: string | null = null,
): TenantStripeSubscriptionObservation {
  return { productTier, status, currentPeriodEnd };
}

function map(
  observations: readonly TenantStripeSubscriptionObservation[],
): EntitlementCandidate {
  return mapTenantStripeSubscriptionObservationsToCandidate(observations);
}

function expectAbsent(candidate: EntitlementCandidate): void {
  assertEquals(candidate, { kind: "absent" }, "absent candidate");
  assertEquals(Object.keys(candidate), ["kind"], "absent public fields");
}

function expectInvalid(candidate: EntitlementCandidate): void {
  assertEquals(candidate, { kind: "invalid" }, "invalid candidate");
  assertEquals(Object.keys(candidate), ["kind"], "invalid public fields");
}

function expectValid(
  candidate: EntitlementCandidate,
  tier: ProductTier,
): void {
  assertEquals(
    candidate,
    { kind: "valid", tier, expiresAt: null },
    `valid ${tier}`,
  );
  assertEquals(
    Object.keys(candidate).sort(),
    ["expiresAt", "kind", "tier"].sort(),
    "valid public fields",
  );
}

function assertNoForbiddenCandidateFields(
  candidate: EntitlementCandidate,
): void {
  const forbidden = [
    "source",
    "status",
    "currentPeriodEnd",
    "provider",
    "tenantId",
    "warning",
    "reason",
  ];
  for (const field of forbidden) {
    assert(!(field in candidate), `candidate must not expose ${field}`);
  }
}

Deno.test("1. empty observations → absent", () => {
  const candidate = map([]);
  expectAbsent(candidate);
  assertNoForbiddenCandidateFields(candidate);
});

Deno.test("2+3. single active Base / Pro → valid tier, expiresAt null", () => {
  expectValid(map([observation("active", "base")]), "base");
  expectValid(map([observation("active", "pro")]), "pro");
});

Deno.test("4+5. trialing Base / Pro → valid tier, expiresAt null", () => {
  expectValid(map([observation("trialing", "base")]), "base");
  expectValid(map([observation("trialing", "pro")]), "pro");
});

Deno.test("6+7. past_due Base / Pro → valid tier, expiresAt null", () => {
  expectValid(map([observation("past_due", "base")]), "base");
  expectValid(map([observation("past_due", "pro")]), "pro");
});

Deno.test("8–13. each no-entitlement status → absent", () => {
  const statuses = [
    "unpaid",
    "incomplete",
    "paused",
    "suspended",
    "canceled",
    "incomplete_expired",
  ] as const;
  for (const status of statuses) {
    expectAbsent(map([observation(status, "pro")]));
  }
});

Deno.test("14. mix of only no-entitlement statuses → absent", () => {
  expectAbsent(
    map([
      observation("unpaid", "pro"),
      observation("canceled", "base"),
      observation("paused", "pro"),
      observation("incomplete", null),
      observation("suspended", "base"),
      observation("incomplete_expired", "pro"),
    ]),
  );
});

Deno.test("15+16. unknown and arbitrary unrecognized status → invalid", () => {
  expectInvalid(map([observation("unknown", "base")]));
  expectInvalid(map([observation("foo", "pro")]));
  expectInvalid(map([observation("past-due", "base")]));
  expectInvalid(map([observation("active[spazio]", "base")]));
});

Deno.test("17. non-canonical casing → invalid", () => {
  expectInvalid(map([observation("Active", "base")]));
  expectInvalid(map([observation("ACTIVE", "pro")]));
  expectInvalid(map([observation("Past_Due", "base")]));
  expectInvalid(map([observation("TRIALING", "pro")]));
});

Deno.test("18. padded status → invalid", () => {
  expectInvalid(map([observation("active ", "base")]));
  expectInvalid(map([observation(" past_due", "pro")]));
  expectInvalid(map([observation(" trialing", "base")]));
});

Deno.test("19–21. entitlement-bearing + productTier null → invalid", () => {
  expectInvalid(map([observation("active", null)]));
  expectInvalid(map([observation("trialing", null)]));
  expectInvalid(map([observation("past_due", null)]));
});

Deno.test("22. no-entitlement + productTier null → absent", () => {
  expectAbsent(map([observation("canceled", null)]));
  expectAbsent(map([observation("unpaid", null)]));
  expectAbsent(map([observation("incomplete", null)]));
  expectAbsent(map([observation("paused", null)]));
});

Deno.test("23–25. same-tier entitlement-bearing mix → valid that tier", () => {
  expectValid(
    map([
      observation("active", "base"),
      observation("active", "base"),
    ]),
    "base",
  );
  expectValid(
    map([
      observation("active", "pro"),
      observation("trialing", "pro"),
      observation("past_due", "pro"),
    ]),
    "pro",
  );
  expectValid(
    map([
      observation("active", "base"),
      observation("trialing", "base"),
      observation("past_due", "base"),
    ]),
    "base",
  );
});

Deno.test("26–28. Base/Pro conflict among entitlement-bearing rows → invalid", () => {
  expectInvalid(
    map([
      observation("active", "base"),
      observation("active", "pro"),
    ]),
  );
  expectInvalid(
    map([
      observation("active", "base"),
      observation("past_due", "pro"),
    ]),
  );
  expectInvalid(
    map([
      observation("trialing", "base"),
      observation("active", "pro"),
    ]),
  );
});

Deno.test("29–31. no-entitlement other tier does not degrade a valid entitled row", () => {
  expectValid(
    map([
      observation("active", "base"),
      observation("unpaid", "pro"),
    ]),
    "base",
  );
  expectValid(
    map([
      observation("active", "base"),
      observation("canceled", "pro"),
    ]),
    "base",
  );
  expectValid(
    map([
      observation("past_due", "pro"),
      observation("incomplete", "base"),
    ]),
    "pro",
  );
});

Deno.test("32+33. unknown invalidates the whole set", () => {
  expectInvalid(
    map([
      observation("active", "base"),
      observation("unknown", "pro"),
    ]),
  );
  expectInvalid(
    map([
      observation("canceled", "base"),
      observation("unpaid", "pro"),
      observation("unknown", null),
    ]),
  );
});

Deno.test("34–36. currentPeriodEnd is ignored; expiresAt stays null", () => {
  expectValid(
    map([observation("active", "base", PERIOD_FUTURE)]),
    "base",
  );
  expectValid(
    map([observation("active", "base", PERIOD_PAST)]),
    "base",
  );
  expectValid(
    map([observation("active", "base", null)]),
    "base",
  );
});

Deno.test("37. trialing/past_due do not use currentPeriodEnd as expiry", () => {
  const trialingFuture = map([
    observation("trialing", "pro", PERIOD_FUTURE),
  ]);
  expectValid(trialingFuture, "pro");

  const trialingPast = map([
    observation("trialing", "base", PERIOD_PAST),
  ]);
  expectValid(trialingPast, "base");

  const pastDueFuture = map([
    observation("past_due", "pro", PERIOD_FUTURE),
  ]);
  expectValid(pastDueFuture, "pro");

  const pastDuePast = map([
    observation("past_due", "base", PERIOD_PAST),
  ]);
  expectValid(pastDuePast, "base");
});

Deno.test("38. same set in different order → same candidate", () => {
  const a = observation("canceled", "pro");
  const b = observation("active", "base");
  const c = observation("unpaid", "pro");
  const d = observation("trialing", "base");

  const forward = map([a, b, c, d]);
  const reversed = map([d, c, b, a]);
  const shuffled = map([c, d, a, b]);

  expectValid(forward, "base");
  assertEquals(reversed, forward, "reversed order");
  assertEquals(shuffled, forward, "shuffled order");
});

Deno.test("39. input is not mutated", () => {
  const observations: TenantStripeSubscriptionObservation[] = [
    observation("active", "base", PERIOD_FUTURE),
    observation("canceled", "pro", PERIOD_PAST),
  ];
  const snapshot = JSON.parse(JSON.stringify(observations));
  Object.freeze(observations);
  Object.freeze(observations[0]);
  Object.freeze(observations[1]);

  const candidate = map(observations);
  expectValid(candidate, "base");
  assertEquals(observations, snapshot, "observations array and items unchanged");
});

Deno.test("40–43. candidate public fields only; no source/warning/status", () => {
  const validBase = map([observation("active", "base", PERIOD_FUTURE)]);
  expectValid(validBase, "base");
  assertNoForbiddenCandidateFields(validBase);

  const absentCandidate = map([observation("canceled", "pro")]);
  expectAbsent(absentCandidate);
  assertNoForbiddenCandidateFields(absentCandidate);

  const invalidCandidate = map([observation("unknown", "base")]);
  expectInvalid(invalidCandidate);
  assertNoForbiddenCandidateFields(invalidCandidate);
});

Deno.test("44. no Pro > Base precedence; conflict is fail-closed", () => {
  const conflict = map([
    observation("active", "base"),
    observation("active", "pro"),
  ]);
  expectInvalid(conflict);
  assert(
    conflict.kind !== "valid",
    "must not pick Pro over Base",
  );

  const pastDueProVsActiveBase = map([
    observation("past_due", "pro"),
    observation("active", "base"),
  ]);
  expectInvalid(pastDueProVsActiveBase);
});

Deno.test("45. no current/latest/first/last row selection", () => {
  const firstIsCanceled = map([
    observation("canceled", "pro"),
    observation("active", "base"),
  ]);
  expectValid(firstIsCanceled, "base");

  const lastIsCanceled = map([
    observation("active", "base"),
    observation("canceled", "pro"),
  ]);
  expectValid(lastIsCanceled, "base");

  const firstIsUnpaidPro = map([
    observation("unpaid", "pro"),
    observation("past_due", "base"),
    observation("incomplete", "pro"),
  ]);
  expectValid(firstIsUnpaidPro, "base");
});

Deno.test("source boundary: no I/O, clock, tenant, Stripe, or resolver wiring", () => {
  assertEquals(
    mapTenantStripeSubscriptionObservationsToCandidate.length,
    1,
    "mapper takes only observations",
  );

  const source = mapTenantStripeSubscriptionObservationsToCandidate.toString();
  const forbidden = [
    "createClient",
    "Deno.env",
    'from "stripe"',
    "from 'stripe'",
    "npm:stripe",
    "new Stripe",
    "tenant_memberships",
    "tenant_complimentary_access_grants",
    "resolveTenantEffectiveAccess",
    "Date.now",
    "Date.parse",
    "new Date",
    "Temporal",
    "updated_at",
    "created_at",
    "provider_subscription_id",
    "plan_code",
    "sort(",
    "service_role",
    "fetch(",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `mapper must not use ${token}`);
  }
});
