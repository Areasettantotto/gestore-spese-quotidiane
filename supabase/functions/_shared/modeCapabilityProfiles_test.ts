/**
 * Deno tests for canonical ModeCapabilityProfiles (BILLING-105).
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/_shared/modeCapabilityProfiles_test.ts
 *
 * No network/env/read/write capabilities required.
 * Synthetic injected profiles are fixtures — not product policy.
 */

import {
  canonicalModeCapabilityProfiles,
  readModeCapabilityProfile,
} from "./modeCapabilityProfiles.ts";
import {
  can,
  capabilitiesForTier,
  type Capability,
  type EffectiveAccess,
  type EntitlementCandidate,
  type ModeCapabilityProfiles,
  resolveEffectiveAccess,
} from "./resolveEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

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

const APPROVED_CAPABILITIES: readonly Capability[] = Object.freeze([
  "expense_management",
  "standard_dashboard",
  "ai_categorization",
  "ai_insights",
  "ai_assistant",
]);

const ABSENT: EntitlementCandidate = { kind: "absent" };
const VALID_PRO: EntitlementCandidate = {
  kind: "valid",
  tier: "pro",
  expiresAt: "opaque-must-be-ignored-on-mode-override",
};

function expectGrantedMode(
  result: EffectiveAccess,
  mode: "demo" | "internal",
): asserts result is Extract<
  EffectiveAccess,
  { status: "granted"; mode: "demo" | "internal" }
> {
  assert(
    result.status === "granted" && result.mode === mode,
    `expected granted ${mode}, got ${JSON.stringify(result)}`,
  );
  assertEquals(result.tier, null, `${mode} is not a ProductTier`);
  assertEquals(result.source, null, `${mode} has no commercial source`);
  assertEquals(result.expiresAt, null, `${mode} expiresAt`);
}

function expectInvalidMode(
  result: EffectiveAccess,
  mode: "demo" | "internal",
): void {
  assertEquals(result.status, "invalid", "status");
  assertEquals(result.mode, mode, "mode");
  assertEquals(result.tier, null, "tier");
  assertEquals(result.source, null, "source");
  assertEquals(result.expiresAt, null, "expiresAt");
  assertEquals(result.capabilities, [], "capabilities");
  assert(!can(result, "expense_management"), "invalid grants nothing");
}

Deno.test("canonical source: frozen ModeCapabilityProfiles with approved demo/internal sets", () => {
  assert(
    Object.isFrozen(canonicalModeCapabilityProfiles),
    "profiles object is frozen",
  );
  assert(
    Object.isFrozen(canonicalModeCapabilityProfiles.demo),
    "demo profile is frozen",
  );
  assert(
    Object.isFrozen(canonicalModeCapabilityProfiles.internal),
    "internal profile is frozen",
  );
  assertEquals(
    canonicalModeCapabilityProfiles.demo,
    [...APPROVED_CAPABILITIES],
    "demo canonical capabilities",
  );
  assertEquals(
    canonicalModeCapabilityProfiles.internal,
    [...APPROVED_CAPABILITIES],
    "internal canonical capabilities",
  );
  assert(
    canonicalModeCapabilityProfiles.demo !==
      canonicalModeCapabilityProfiles.internal,
    "demo and internal are distinct profile arrays",
  );
  assert(
    canonicalModeCapabilityProfiles.demo !== capabilitiesForTier("pro"),
    "demo is not the ProductTier Pro array identity",
  );
  assert(
    canonicalModeCapabilityProfiles.internal !== capabilitiesForTier("pro"),
    "internal is not the ProductTier Pro array identity",
  );
  assert(
    canonicalModeCapabilityProfiles.demo !== capabilitiesForTier("base"),
    "demo is not the ProductTier Base array",
  );
});

Deno.test("canonical reader is not a catalog-tier or env mapping", () => {
  const source = readModeCapabilityProfile.toString();
  const forbidden = [
    "capabilitiesForTier",
    "Deno.env",
    "VITE_",
    "grantedStandard",
    "canonicalModeCapabilityProfiles",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `reader must not contain ${token}`);
  }
});

Deno.test("A. Demo canonical profile → granted; exact capabilities; non-commercial", () => {
  const result = resolveEffectiveAccess({
    mode: "demo",
    stripeCandidate: VALID_PRO,
    complimentaryCandidate: {
      kind: "valid",
      tier: "base",
      expiresAt: "ignored",
    },
    modeProfiles: canonicalModeCapabilityProfiles,
  });
  expectGrantedMode(result, "demo");
  assertEquals(
    result.capabilities,
    [...APPROVED_CAPABILITIES],
    "demo capabilities equal the canonical profile",
  );
  assert(can(result, "expense_management"), "demo expense_management");
  assert(can(result, "ai_assistant"), "demo ai_assistant");
});

Deno.test("B. Internal canonical profile → granted; exact capabilities; non-commercial", () => {
  const result = resolveEffectiveAccess({
    mode: "internal",
    stripeCandidate: VALID_PRO,
    complimentaryCandidate: VALID_PRO,
    modeProfiles: canonicalModeCapabilityProfiles,
  });
  expectGrantedMode(result, "internal");
  assertEquals(
    result.capabilities,
    [...APPROVED_CAPABILITIES],
    "internal capabilities equal the canonical profile",
  );
  assert(can(result, "standard_dashboard"), "internal standard_dashboard");
  assert(can(result, "ai_insights"), "internal ai_insights");
});

Deno.test("C. Standard ignores static Demo/Internal profiles and uses persisted entitlement", () => {
  const profileAccesses: Array<"demo" | "internal"> = [];
  const trackedProfiles: ModeCapabilityProfiles = {
    get demo() {
      profileAccesses.push("demo");
      return canonicalModeCapabilityProfiles.demo;
    },
    get internal() {
      profileAccesses.push("internal");
      return canonicalModeCapabilityProfiles.internal;
    },
  };
  const result = resolveEffectiveAccess({
    mode: "standard",
    stripeCandidate: { kind: "valid", tier: "base", expiresAt: "keep" },
    complimentaryCandidate: ABSENT,
    modeProfiles: trackedProfiles,
  });
  assertEquals(profileAccesses, [], "standard must not read mode profiles");
  assertEquals(result.status, "granted", "standard granted from entitlement");
  assertEquals(result.mode, "standard", "mode");
  if (result.status === "granted" && result.mode === "standard") {
    assertEquals(result.tier, "base", "persisted ProductTier");
    assertEquals(result.source, "stripe", "persisted commercial source");
    assertEquals(result.expiresAt, "keep", "expiresAt passthrough");
    assertEquals(
      result.capabilities,
      capabilitiesForTier("base"),
      "standard uses tier capabilities, not the static mode profile",
    );
  }
});

Deno.test("D. empty profile → fail-closed invalid, not granted []", () => {
  const emptyDemo: ModeCapabilityProfiles = {
    demo: Object.freeze([]),
    internal: canonicalModeCapabilityProfiles.internal,
  };
  const reader = readModeCapabilityProfile(emptyDemo, "demo");
  assertEquals(reader.ok, false, "reader rejects empty");
  if (reader.ok === false) {
    assertEquals(reader.reason, "empty_profile", "reason");
  }

  const result = resolveEffectiveAccess({
    mode: "demo",
    stripeCandidate: VALID_PRO,
    complimentaryCandidate: ABSENT,
    modeProfiles: emptyDemo,
  });
  expectInvalidMode(result, "demo");
});

Deno.test("E. duplicate capability → fail-closed, no silent unique", () => {
  const duplicated: ModeCapabilityProfiles = {
    demo: Object.freeze([
      "expense_management",
      "standard_dashboard",
      "expense_management",
    ]),
    internal: canonicalModeCapabilityProfiles.internal,
  };
  const reader = readModeCapabilityProfile(duplicated, "demo");
  assertEquals(reader.ok, false, "reader rejects duplicate");
  if (reader.ok === false) {
    assertEquals(reader.reason, "duplicate_capability", "reason");
  }

  const result = resolveEffectiveAccess({
    mode: "demo",
    stripeCandidate: ABSENT,
    complimentaryCandidate: ABSENT,
    modeProfiles: duplicated,
  });
  expectInvalidMode(result, "demo");
});

Deno.test("F. unknown capability → fail-closed, not skipped", () => {
  const unknown: ModeCapabilityProfiles = {
    demo: canonicalModeCapabilityProfiles.demo,
    internal: Object.freeze([
      "expense_management",
      "not_a_capability",
    ]) as unknown as readonly Capability[],
  };
  const reader = readModeCapabilityProfile(unknown, "internal");
  assertEquals(reader.ok, false, "reader rejects unknown");
  if (reader.ok === false) {
    assertEquals(reader.reason, "unknown_capability", "reason");
  }

  const result = resolveEffectiveAccess({
    mode: "internal",
    stripeCandidate: VALID_PRO,
    complimentaryCandidate: ABSENT,
    modeProfiles: unknown,
  });
  expectInvalidMode(result, "internal");
});

Deno.test("G. missing / incomplete mode-profile → fail-closed", () => {
  const missingObject = readModeCapabilityProfile(undefined, "demo");
  assertEquals(missingObject.ok, false, "undefined profiles");
  if (missingObject.ok === false) {
    assertEquals(missingObject.reason, "missing_profile", "undefined reason");
  }

  const missingNull = readModeCapabilityProfile(null, "internal");
  assertEquals(missingNull.ok, false, "null profiles");
  if (missingNull.ok === false) {
    assertEquals(missingNull.reason, "missing_profile", "null reason");
  }

  const incomplete = { internal: canonicalModeCapabilityProfiles.internal };
  const missingKey = readModeCapabilityProfile(incomplete, "demo");
  assertEquals(missingKey.ok, false, "missing demo key");
  if (missingKey.ok === false) {
    assertEquals(missingKey.reason, "missing_profile", "incomplete reason");
  }

  const nonArray = readModeCapabilityProfile(
    { demo: "expense_management", internal: canonicalModeCapabilityProfiles.internal },
    "demo",
  );
  assertEquals(nonArray.ok, false, "non-array profile");
  if (nonArray.ok === false) {
    assertEquals(nonArray.reason, "missing_profile", "non-array reason");
  }

  const result = resolveEffectiveAccess({
    mode: "demo",
    stripeCandidate: VALID_PRO,
    complimentaryCandidate: ABSENT,
    modeProfiles: incomplete as unknown as ModeCapabilityProfiles,
  });
  expectInvalidMode(result, "demo");
});

Deno.test("invalid profiles are not replaced by the canonical source", () => {
  const emptyInternal: ModeCapabilityProfiles = {
    demo: canonicalModeCapabilityProfiles.demo,
    internal: Object.freeze([]),
  };
  const result = resolveEffectiveAccess({
    mode: "internal",
    stripeCandidate: ABSENT,
    complimentaryCandidate: ABSENT,
    modeProfiles: emptyInternal,
  });
  expectInvalidMode(result, "internal");
  assert(
    JSON.stringify(result.capabilities) !==
      JSON.stringify(canonicalModeCapabilityProfiles.internal),
    "must not substitute the canonical Internal profile",
  );
});

Deno.test("domain injection still accepts a valid non-canonical fixture", () => {
  const synthetic: ModeCapabilityProfiles = {
    demo: Object.freeze(["standard_dashboard", "ai_insights"]),
    internal: Object.freeze(["expense_management"]),
  };
  const result = resolveEffectiveAccess({
    mode: "demo",
    stripeCandidate: VALID_PRO,
    complimentaryCandidate: ABSENT,
    modeProfiles: synthetic,
  });
  expectGrantedMode(result, "demo");
  assertEquals(
    result.capabilities,
    ["standard_dashboard", "ai_insights"],
    "injected fixture is not rewritten to the canonical set",
  );
});

Deno.test("canonical object mutation is rejected", () => {
  let threw = false;
  try {
    (canonicalModeCapabilityProfiles as { demo: readonly Capability[] }).demo =
      Object.freeze(["expense_management"]);
  } catch {
    threw = true;
  }
  assert(threw, "assignment to frozen profiles must throw");
  assertEquals(
    canonicalModeCapabilityProfiles.demo,
    [...APPROVED_CAPABILITIES],
    "canonical demo remains the approved set",
  );
});
