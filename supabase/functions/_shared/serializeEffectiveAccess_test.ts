/**
 * Deno tests for serializeEffectiveAccess (BILLING-88).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/serializeEffectiveAccess_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are already-resolved EffectiveAccess values — not policy.
 */

import type {
  Capability,
  EffectiveAccess,
} from "./resolveEffectiveAccess.ts";
import {
  type EffectiveAccessPayload,
  serializeEffectiveAccess,
} from "./serializeEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void) => void;
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

const PUBLIC_KEYS = [
  "status",
  "mode",
  "tier",
  "source",
  "expiresAt",
  "capabilities",
] as const;

const BASE_CAPABILITIES: readonly Capability[] = Object.freeze([
  "expense_management",
  "standard_dashboard",
]);

const PRO_CAPABILITIES: readonly Capability[] = Object.freeze([
  "expense_management",
  "standard_dashboard",
  "ai_categorization",
  "ai_insights",
  "ai_assistant",
]);

/** Distinct from Base and from Pro so accidental remapping is visible. */
const DEMO_CAPABILITIES: readonly Capability[] = Object.freeze([
  "standard_dashboard",
  "ai_insights",
]);

const STANDARD_STRIPE_BASE: EffectiveAccess = {
  status: "granted",
  mode: "standard",
  tier: "base",
  source: "stripe",
  expiresAt: "opaque-expiry-keep-exact",
  capabilities: BASE_CAPABILITIES,
};

const STANDARD_STRIPE_PRO: EffectiveAccess = {
  status: "granted",
  mode: "standard",
  tier: "pro",
  source: "stripe",
  expiresAt: null,
  capabilities: PRO_CAPABILITIES,
};

const STANDARD_COMPLIMENTARY_PRO: EffectiveAccess = {
  status: "granted",
  mode: "standard",
  tier: "pro",
  source: "complimentary",
  expiresAt: "complimentary-expiry-keep-exact",
  capabilities: PRO_CAPABILITIES,
};

const DEMO_GRANTED: EffectiveAccess = {
  status: "granted",
  mode: "demo",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: DEMO_CAPABILITIES,
};

const INTERNAL_GRANTED: EffectiveAccess = {
  status: "granted",
  mode: "internal",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: PRO_CAPABILITIES,
};

const UNENTITLED: EffectiveAccess = {
  status: "unentitled",
  mode: "standard",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: Object.freeze([]),
};

const INVALID: EffectiveAccess = {
  status: "invalid",
  mode: "standard",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: Object.freeze([]),
};

function assertAllowlistedKeys(payload: EffectiveAccessPayload): void {
  assertEquals(
    Object.getOwnPropertyNames(payload),
    [...PUBLIC_KEYS],
    "own keys must be the public allowlist, insertion order",
  );
}

function assertPublicFields(
  payload: EffectiveAccessPayload,
  expected: EffectiveAccess,
): void {
  assertEquals(payload.status, expected.status, "status");
  assertEquals(payload.mode, expected.mode, "mode");
  assertEquals(payload.tier, expected.tier, "tier");
  assertEquals(payload.source, expected.source, "source");
  assertEquals(payload.expiresAt, expected.expiresAt, "expiresAt");
  assertEquals(payload.capabilities, expected.capabilities, "capabilities");
  assert(
    payload.capabilities === expected.capabilities,
    "capabilities must be the same already-resolved array, not rebuilt",
  );
  assertAllowlistedKeys(payload);
}

Deno.test("A. standard / stripe / base → public fields preserved", () => {
  const payload = serializeEffectiveAccess(STANDARD_STRIPE_BASE);
  assertPublicFields(payload, STANDARD_STRIPE_BASE);
  assertEquals(payload.mode, "standard", "mode remains standard");
  assertEquals(payload.tier, "base", "tier remains base");
  assertEquals(payload.source, "stripe", "source remains stripe");
});

Deno.test("B. standard / stripe / pro → public fields preserved", () => {
  const payload = serializeEffectiveAccess(STANDARD_STRIPE_PRO);
  assertPublicFields(payload, STANDARD_STRIPE_PRO);
  assertEquals(payload.mode, "standard", "mode remains standard");
  assertEquals(payload.tier, "pro", "tier remains pro");
  assertEquals(payload.source, "stripe", "source remains stripe");
});

Deno.test("C. complimentary → source preserved", () => {
  const payload = serializeEffectiveAccess(STANDARD_COMPLIMENTARY_PRO);
  assertPublicFields(payload, STANDARD_COMPLIMENTARY_PRO);
  assertEquals(payload.source, "complimentary", "source remains complimentary");
  assertEquals(payload.tier, "pro", "tier not reinterpreted");
});

Deno.test("D. Demo → mode preserved without invented tier", () => {
  const payload = serializeEffectiveAccess(DEMO_GRANTED);
  assertPublicFields(payload, DEMO_GRANTED);
  assertEquals(payload.mode, "demo", "mode remains demo");
  assertEquals(payload.tier, null, "Demo has no ProductTier");
  assertEquals(payload.source, null, "Demo has no commercial source");
});

Deno.test("E. Internal → mode preserved without invented tier", () => {
  const payload = serializeEffectiveAccess(INTERNAL_GRANTED);
  assertPublicFields(payload, INTERNAL_GRANTED);
  assertEquals(payload.mode, "internal", "mode remains internal");
  assertEquals(payload.tier, null, "Internal is not ProductTier Pro");
  assertEquals(payload.source, null, "Internal has no commercial source");
});

Deno.test("F. status preserved exactly (granted / unentitled / invalid)", () => {
  assertEquals(
    serializeEffectiveAccess(STANDARD_STRIPE_BASE).status,
    "granted",
    "granted",
  );
  assertEquals(
    serializeEffectiveAccess(UNENTITLED).status,
    "unentitled",
    "unentitled",
  );
  assertEquals(serializeEffectiveAccess(INVALID).status, "invalid", "invalid");
});

Deno.test("G. capabilities present → preserved without calculation", () => {
  const payload = serializeEffectiveAccess(STANDARD_STRIPE_PRO);
  assertEquals(payload.capabilities, [...PRO_CAPABILITIES], "same sequence");
  assert(
    payload.capabilities === STANDARD_STRIPE_PRO.capabilities,
    "must not rebuild capability lists",
  );
});

Deno.test("H. capabilities never optional on the domain type; empty array preserved", () => {
  const unentitledPayload = serializeEffectiveAccess(UNENTITLED);
  assertEquals(unentitledPayload.capabilities, [], "unentitled empty caps");
  assert(
    unentitledPayload.capabilities === UNENTITLED.capabilities,
    "empty capabilities array passthrough",
  );

  const invalidPayload = serializeEffectiveAccess(INVALID);
  assertEquals(invalidPayload.capabilities, [], "invalid empty caps");
  assert(
    "capabilities" in invalidPayload,
    "capabilities remains present, not omitted",
  );
});

Deno.test("I. expiresAt present → value preserved exactly", () => {
  const payload = serializeEffectiveAccess(STANDARD_STRIPE_BASE);
  assertEquals(
    payload.expiresAt,
    "opaque-expiry-keep-exact",
    "expiresAt passthrough",
  );
});

Deno.test("J. expiresAt is always present as string | null; null is preserved", () => {
  const payload = serializeEffectiveAccess(STANDARD_STRIPE_PRO);
  assertEquals(payload.expiresAt, null, "null expiresAt not invented");
  assert("expiresAt" in payload, "expiresAt remains present, not omitted");
});

Deno.test("K. extra runtime properties via cast must not appear in output", () => {
  const malicious = {
    status: "granted",
    mode: "standard",
    tier: "base",
    source: "stripe",
    expiresAt: null,
    capabilities: BASE_CAPABILITIES,
    stripe_customer_id: "cus_malicious_not_public",
    tenant_id: "tenant-must-not-leak",
    plan_code: "paid",
    secret: "super-secret-value",
  } as EffectiveAccess;

  const payload = serializeEffectiveAccess(malicious);
  const json = JSON.stringify(payload);

  assert(!("stripe_customer_id" in payload), "no stripe_customer_id key");
  assert(!("tenant_id" in payload), "no tenant_id key");
  assert(!("plan_code" in payload), "no plan_code key");
  assert(!("secret" in payload), "no secret key");
  assert(!json.includes("cus_malicious_not_public"), "no Stripe customer id");
  assert(!json.includes("tenant-must-not-leak"), "no tenant_id value");
  assert(!json.includes("plan_code"), "no plan_code name");
  assert(!json.includes("paid"), "no paid plan_code value");
  assert(!json.includes("super-secret-value"), "no secret value");
  assertAllowlistedKeys(payload);
});

Deno.test("L. input is not mutated", () => {
  const input: EffectiveAccess = {
    status: "granted",
    mode: "standard",
    tier: "base",
    source: "stripe",
    expiresAt: "opaque-expiry-keep-exact",
    capabilities: BASE_CAPABILITIES,
  };
  const before = JSON.stringify(input);
  serializeEffectiveAccess(input);
  assertEquals(JSON.stringify(input), before, "input JSON unchanged");
  assertEquals(input.tier, "base", "input.tier unchanged");
  assertEquals(input.capabilities, BASE_CAPABILITIES, "input caps unchanged");
});

Deno.test("M. output is a new object, not the input reference", () => {
  const payload = serializeEffectiveAccess(STANDARD_STRIPE_BASE);
  assert(payload !== STANDARD_STRIPE_BASE, "must return a new object");
});

Deno.test("N. no standard→base / paid→pro / free→base remapping", () => {
  const payload = serializeEffectiveAccess(STANDARD_STRIPE_BASE);
  const json = JSON.stringify(payload);

  assertEquals(payload.mode, "standard", "standard is not converted to base");
  assertEquals(payload.tier, "base", "base remains lowercase ProductTier");
  assert(!json.includes("paid"), "must not emit paid");
  assert(!json.includes("free"), "must not emit free");
  assert(!json.includes("Base"), "must not emit display Base");
  assert(!json.includes("Pro"), "must not emit display Pro");
});
