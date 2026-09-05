/**
 * Canonical runtime ModeCapabilityProfiles source (BILLING-105).
 *
 * Versioned server-side policy for AccessMode demo / internal only.
 * Does NOT map commercial catalog tiers, payment providers, grants,
 * env, or UI labels. Does NOT grant standard-mode access. Standard
 * continues on persisted EffectiveAccess / entitlement.
 *
 * Caller-supplied profiles remain injectable at the domain primitive for
 * tests. This module is the production source those callers should use.
 * Invalid profiles are rejected; they are never repaired, uniqued, or
 * replaced with this canonical source.
 */

import type {
  Capability,
  ModeCapabilityProfiles,
} from "./resolveEffectiveAccess.ts";

export type ReadModeCapabilityProfileFailureReason =
  | "missing_profile"
  | "empty_profile"
  | "unknown_capability"
  | "duplicate_capability";

export type ReadModeCapabilityProfileResult =
  | { ok: true; capabilities: readonly Capability[] }
  | { ok: false; reason: ReadModeCapabilityProfileFailureReason };

/**
 * AccessMode demo / internal technical capabilities.
 * Explicit list — not a catalog-tier mapping.
 */
const CANONICAL_DEMO_CAPABILITIES: readonly Capability[] = Object.freeze([
  "expense_management",
  "standard_dashboard",
  "ai_categorization",
  "ai_insights",
  "ai_assistant",
]);

const CANONICAL_INTERNAL_CAPABILITIES: readonly Capability[] = Object.freeze([
  "expense_management",
  "standard_dashboard",
  "ai_categorization",
  "ai_insights",
  "ai_assistant",
]);

function isKnownCapability(value: unknown): value is Capability {
  return (
    value === "expense_management" ||
    value === "standard_dashboard" ||
    value === "ai_categorization" ||
    value === "ai_insights" ||
    value === "ai_assistant"
  );
}

function fail(
  reason: ReadModeCapabilityProfileFailureReason,
): ReadModeCapabilityProfileResult {
  return { ok: false, reason };
}

function succeed(
  capabilities: readonly Capability[],
): ReadModeCapabilityProfileResult {
  return { ok: true, capabilities: Object.freeze(capabilities.slice()) };
}

function isProfilesRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read and validate one AccessMode profile from a profiles object.
 * Fail-closed: missing, empty, unknown, and duplicate capabilities are
 * rejected. No silent unique, skip, or canonical substitution.
 */
export function readModeCapabilityProfile(
  modeProfiles: unknown,
  mode: "demo" | "internal",
): ReadModeCapabilityProfileResult {
  if (!isProfilesRecord(modeProfiles)) {
    return fail("missing_profile");
  }

  const profile = modeProfiles[mode];
  if (profile === undefined) {
    return fail("missing_profile");
  }
  if (!Array.isArray(profile)) {
    return fail("missing_profile");
  }
  if (profile.length === 0) {
    return fail("empty_profile");
  }

  const seen = new Set<Capability>();
  for (const item of profile) {
    if (!isKnownCapability(item)) {
      return fail("unknown_capability");
    }
    if (seen.has(item)) {
      return fail("duplicate_capability");
    }
    seen.add(item);
  }

  return succeed(profile);
}

function requireCanonicalProfile(
  capabilities: readonly Capability[],
  mode: "demo" | "internal",
): readonly Capability[] {
  const result = readModeCapabilityProfile(
    { demo: capabilities, internal: capabilities },
    mode,
  );
  if (result.ok === false) {
    throw new Error(`canonical ${mode} ModeCapabilityProfile is invalid`);
  }
  return capabilities;
}

requireCanonicalProfile(CANONICAL_DEMO_CAPABILITIES, "demo");
requireCanonicalProfile(CANONICAL_INTERNAL_CAPABILITIES, "internal");

/**
 * Production ModeCapabilityProfiles. Frozen; not a catalog-tier mapping.
 * Future top-level EffectiveAccess wiring should inject this object.
 */
export const canonicalModeCapabilityProfiles: ModeCapabilityProfiles =
  Object.freeze({
    demo: CANONICAL_DEMO_CAPABILITIES,
    internal: CANONICAL_INTERNAL_CAPABILITIES,
  });
