/**
 * Deno tests for resolveEffectiveAccess (BILLING-25).
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/_shared/resolveEffectiveAccess_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import {
  type AccessMode,
  can,
  capabilitiesForTier,
  type Capability,
  type EffectiveAccess,
  type EntitlementCandidate,
  type ModeCapabilityProfiles,
  type ProductTier,
  resolveEffectiveAccess,
  type ResolveEffectiveAccessParams,
} from "./resolveEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

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

const ABSENT: EntitlementCandidate = { kind: "absent" };
const INVALID: EntitlementCandidate = { kind: "invalid" };

function valid(
  tier: ProductTier,
  expiresAt: string | null = null,
): EntitlementCandidate {
  return { kind: "valid", tier, expiresAt };
}

/**
 * Distinct from Base and from Pro so accidental commercial/mode bleed is visible.
 * Intentionally NOT `{ expense_management, standard_dashboard }`.
 */
const DEMO_PROFILE: readonly Capability[] = Object.freeze([
  "standard_dashboard",
  "ai_insights",
]);

const INTERNAL_PROFILE: readonly Capability[] = capabilitiesForTier("pro");

const MODE_PROFILES: ModeCapabilityProfiles = {
  demo: DEMO_PROFILE,
  internal: INTERNAL_PROFILE,
};

function resolve(overrides: {
  mode?: AccessMode;
  stripeCandidate?: EntitlementCandidate;
  complimentaryCandidate?: EntitlementCandidate;
  modeProfiles?: ModeCapabilityProfiles;
}): EffectiveAccess {
  const params: ResolveEffectiveAccessParams = {
    mode: overrides.mode ?? "standard",
    stripeCandidate: overrides.stripeCandidate ?? ABSENT,
    complimentaryCandidate: overrides.complimentaryCandidate ?? ABSENT,
    modeProfiles: overrides.modeProfiles ?? MODE_PROFILES,
  };
  return resolveEffectiveAccess(params);
}

function expectGrantedStandard(
  result: EffectiveAccess,
  tier: ProductTier,
  source: "stripe" | "complimentary",
): asserts result is Extract<
  EffectiveAccess,
  { status: "granted"; mode: "standard" }
> {
  assert(
    result.status === "granted" && result.mode === "standard",
    `expected granted standard, got ${JSON.stringify(result)}`,
  );
  assertEquals(result.tier, tier, "tier");
  assertEquals(result.source, source, "source");
}

function expectUnentitled(result: EffectiveAccess): void {
  assertEquals(result.status, "unentitled", "status");
  assertEquals(result.mode, "standard", "mode");
  assertEquals(result.tier, null, "tier");
  assertEquals(result.source, null, "source");
  assertEquals(result.expiresAt, null, "expiresAt");
  assertEquals(result.capabilities, [], "capabilities");
}

function expectInvalid(result: EffectiveAccess): void {
  assertEquals(result.status, "invalid", "status");
  assertEquals(result.mode, "standard", "mode");
  assertEquals(result.tier, null, "tier");
  assertEquals(result.source, null, "source");
  assertEquals(result.expiresAt, null, "expiresAt");
  assertEquals(result.capabilities, [], "capabilities");
}

const BASE_CAPABILITIES = capabilitiesForTier("base");
const PRO_CAPABILITIES = capabilitiesForTier("pro");

Deno.test("1. standard, no sources → UNENTITLED", () => {
  const result = resolve({
    stripeCandidate: ABSENT,
    complimentaryCandidate: ABSENT,
  });
  expectUnentitled(result);
  assert(!can(result, "expense_management"), "unentitled cannot use Base cap");
  assert(!can(result, "ai_assistant"), "unentitled cannot use IA");
});

Deno.test("2. Stripe Base → Base / stripe; Base yes, IA no", () => {
  const result = resolve({
    stripeCandidate: valid("base", "opaque-expiry-not-parsed"),
    complimentaryCandidate: ABSENT,
  });
  expectGrantedStandard(result, "base", "stripe");
  assertEquals(result.capabilities, BASE_CAPABILITIES, "Base capabilities");
  assertEquals(
    result.expiresAt,
    "opaque-expiry-not-parsed",
    "expiresAt passthrough",
  );
  assert(can(result, "expense_management"), "Base expense_management");
  assert(can(result, "standard_dashboard"), "Base standard_dashboard");
  assert(!can(result, "ai_categorization"), "Base has no ai_categorization");
  assert(!can(result, "ai_insights"), "Base has no ai_insights");
  assert(!can(result, "ai_assistant"), "Base has no ai_assistant");
});

Deno.test("3. Stripe Pro → Pro / stripe; Base + IA", () => {
  const result = resolve({
    stripeCandidate: valid("pro"),
    complimentaryCandidate: ABSENT,
  });
  expectGrantedStandard(result, "pro", "stripe");
  assertEquals(result.capabilities, PRO_CAPABILITIES, "Pro capabilities");
  assert(can(result, "expense_management"), "Pro includes Base");
  assert(can(result, "standard_dashboard"), "Pro includes Base dashboard");
  assert(can(result, "ai_categorization"), "Pro ai_categorization");
  assert(can(result, "ai_insights"), "Pro ai_insights");
  assert(can(result, "ai_assistant"), "Pro ai_assistant");
});

Deno.test("4. complimentary Base → Base / complimentary", () => {
  const result = resolve({
    stripeCandidate: ABSENT,
    complimentaryCandidate: valid("base"),
  });
  expectGrantedStandard(result, "base", "complimentary");
  assertEquals(result.capabilities, BASE_CAPABILITIES, "Base capabilities");
});

Deno.test("5. complimentary Pro → Pro / complimentary", () => {
  const result = resolve({
    stripeCandidate: ABSENT,
    complimentaryCandidate: valid("pro"),
  });
  expectGrantedStandard(result, "pro", "complimentary");
  assertEquals(result.capabilities, PRO_CAPABILITIES, "Pro capabilities");
});

Deno.test("6. Stripe Base + complimentary Pro → Pro / complimentary", () => {
  const result = resolve({
    stripeCandidate: valid("base"),
    complimentaryCandidate: valid("pro"),
  });
  expectGrantedStandard(result, "pro", "complimentary");
  assertEquals(result.capabilities, PRO_CAPABILITIES, "winner Pro caps");
});

Deno.test("7. Stripe Pro + complimentary Base → Pro / stripe", () => {
  const result = resolve({
    stripeCandidate: valid("pro"),
    complimentaryCandidate: valid("base"),
  });
  expectGrantedStandard(result, "pro", "stripe");
  assertEquals(result.capabilities, PRO_CAPABILITIES, "winner Pro caps");
});

Deno.test("8. same tier on both sources → stripe tie-break", () => {
  const bothPro = resolve({
    stripeCandidate: valid("pro", "stripe-pro-expiry"),
    complimentaryCandidate: valid("pro", "complimentary-pro-expiry"),
  });
  expectGrantedStandard(bothPro, "pro", "stripe");
  assertEquals(bothPro.expiresAt, "stripe-pro-expiry", "tie-break uses Stripe");

  const bothBase = resolve({
    stripeCandidate: valid("base"),
    complimentaryCandidate: valid("base"),
  });
  expectGrantedStandard(bothBase, "base", "stripe");
});

Deno.test("9. Stripe valid + complimentary invalid → Stripe remains", () => {
  const proStripe = resolve({
    stripeCandidate: valid("pro"),
    complimentaryCandidate: INVALID,
  });
  expectGrantedStandard(proStripe, "pro", "stripe");
  assert(can(proStripe, "ai_assistant"), "valid Stripe Pro is not cancelled");

  const baseStripe = resolve({
    stripeCandidate: valid("base"),
    complimentaryCandidate: INVALID,
  });
  expectGrantedStandard(baseStripe, "base", "stripe");
});

Deno.test("10. Stripe invalid + complimentary valid → complimentary remains", () => {
  const proComplimentary = resolve({
    stripeCandidate: INVALID,
    complimentaryCandidate: valid("pro"),
  });
  expectGrantedStandard(proComplimentary, "pro", "complimentary");
  assert(
    can(proComplimentary, "ai_assistant"),
    "valid complimentary Pro is not cancelled",
  );

  const baseComplimentary = resolve({
    stripeCandidate: INVALID,
    complimentaryCandidate: valid("base"),
  });
  expectGrantedStandard(baseComplimentary, "base", "complimentary");
});

Deno.test("11. invalid without another valid source → INVALID; can false", () => {
  const stripeInvalid = resolve({
    stripeCandidate: INVALID,
    complimentaryCandidate: ABSENT,
  });
  expectInvalid(stripeInvalid);
  assert(!can(stripeInvalid, "expense_management"), "invalid grants nothing");
  assert(!can(stripeInvalid, "ai_assistant"), "invalid grants no IA");

  const complimentaryInvalid = resolve({
    stripeCandidate: ABSENT,
    complimentaryCandidate: INVALID,
  });
  expectInvalid(complimentaryInvalid);

  const bothInvalid = resolve({
    stripeCandidate: INVALID,
    complimentaryCandidate: INVALID,
  });
  expectInvalid(bothInvalid);
});

Deno.test("12. Demo mode uses explicit profile; ignores commercial candidates", () => {
  const result = resolve({
    mode: "demo",
    stripeCandidate: valid("pro"),
    complimentaryCandidate: valid("base"),
  });
  assertEquals(result.status, "granted", "demo is granted via mode profile");
  assertEquals(result.mode, "demo", "mode");
  assertEquals(result.tier, null, "Demo is not a ProductTier");
  assertEquals(result.source, null, "Demo has no commercial source");
  assertEquals(result.expiresAt, null, "expiresAt");
  assertEquals(result.capabilities, [...DEMO_PROFILE], "explicit Demo profile");
  assert(!can(result, "expense_management"), "Demo profile is not Base");
  assert(can(result, "standard_dashboard"), "Demo profile dashboard");
  assert(can(result, "ai_insights"), "Demo profile may include selected IA");
  assert(!can(result, "ai_assistant"), "Demo profile is not Pro");
  assert(!can(result, "ai_categorization"), "Demo profile is not Pro");
});

Deno.test("13. Internal mode uses explicit profile; not ProductTier Pro", () => {
  const result = resolve({
    mode: "internal",
    stripeCandidate: valid("base"),
    complimentaryCandidate: valid("base"),
  });
  assertEquals(
    result.status,
    "granted",
    "internal is granted via mode profile",
  );
  assertEquals(result.mode, "internal", "mode");
  assertEquals(result.tier, null, "Internal is not ProductTier Pro");
  assertEquals(result.source, null, "Internal has no commercial source");
  assertEquals(result.expiresAt, null, "expiresAt");
  assertEquals(
    result.capabilities,
    [...INTERNAL_PROFILE],
    "explicit Internal profile (Pro-equivalent by policy, not by tier)",
  );
  assert(can(result, "expense_management"), "internal profile Base cap");
  assert(can(result, "ai_assistant"), "internal profile IA from policy");
});

Deno.test("14. can(): granted allowed / missing / unentitled / invalid", () => {
  const granted = resolve({ stripeCandidate: valid("base") });
  assert(can(granted, "expense_management"), "granted allowed → true");
  assert(!can(granted, "ai_assistant"), "capability assente → false");

  const none = resolve({
    stripeCandidate: ABSENT,
    complimentaryCandidate: ABSENT,
  });
  assert(!can(none, "expense_management"), "unentitled → false");

  const invalid = resolve({ stripeCandidate: INVALID });
  assert(!can(invalid, "expense_management"), "invalid → false");
});
