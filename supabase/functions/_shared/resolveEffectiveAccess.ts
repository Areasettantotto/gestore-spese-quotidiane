/**
 * Pure effective-access / capability domain contract (BILLING-25).
 *
 * Resolves Product Tier, Access Mode, normalized entitlement candidates,
 * static Base/Pro capabilities, and explicit Demo/Internal mode profiles.
 *
 * Demo/Internal profiles are caller-supplied for domain testability.
 * Production callers should inject canonicalModeCapabilityProfiles.
 * Profile consumption is fail-closed (BILLING-105): missing, empty,
 * unknown, or duplicate capabilities never grant.
 *
 * Does NOT parse Stripe, SQL, ISO dates, Price IDs, grants, or metadata.
 * No DB, Supabase, Deno.env, Stripe SDK, HTTP, or wall-clock.
 * Deterministic: same input → same output.
 */

import { readModeCapabilityProfile } from "./modeCapabilityProfiles.ts";

export type ProductTier = "base" | "pro";

export type AccessMode = "standard" | "demo" | "internal";

export type CommercialAccessSource = "stripe" | "complimentary";

export type Capability =
  | "expense_management"
  | "standard_dashboard"
  | "ai_categorization"
  | "ai_insights"
  | "ai_assistant";

/**
 * Normalized entitlement already classified by an upstream adapter.
 * Source is NOT on the candidate: it is determined by the input slot
 * (`stripeCandidate` vs `complimentaryCandidate`).
 *
 * `expiresAt` is an opaque passthrough (`string | null`). This module
 * does not parse ISO, compare Date, or decide expiry.
 */
export type EntitlementCandidate =
  | { kind: "absent" }
  | { kind: "valid"; tier: ProductTier; expiresAt: string | null }
  | { kind: "invalid" };

export type ModeCapabilityProfiles = {
  readonly demo: readonly Capability[];
  readonly internal: readonly Capability[];
};

export type ResolveEffectiveAccessParams = {
  mode: AccessMode;
  stripeCandidate: EntitlementCandidate;
  complimentaryCandidate: EntitlementCandidate;
  modeProfiles: ModeCapabilityProfiles;
};

type EmptyCapabilities = readonly [];

/**
 * Discriminated result. Impossible combinations (e.g. unentitled + Pro)
 * are excluded at the type level.
 */
export type EffectiveAccess =
  | {
    status: "granted";
    mode: "standard";
    tier: ProductTier;
    source: CommercialAccessSource;
    expiresAt: string | null;
    capabilities: readonly Capability[];
  }
  | {
    status: "granted";
    mode: "demo" | "internal";
    tier: null;
    source: null;
    expiresAt: null;
    capabilities: readonly Capability[];
  }
  | {
    status: "unentitled";
    mode: "standard";
    tier: null;
    source: null;
    expiresAt: null;
    capabilities: EmptyCapabilities;
  }
  | {
    status: "invalid";
    mode: AccessMode;
    tier: null;
    source: null;
    expiresAt: null;
    capabilities: EmptyCapabilities;
  };

const BASE_CAPABILITIES: readonly Capability[] = Object.freeze([
  "expense_management",
  "standard_dashboard",
]);

const PRO_CAPABILITIES: readonly Capability[] = Object.freeze([
  ...BASE_CAPABILITIES,
  "ai_categorization",
  "ai_insights",
  "ai_assistant",
]);

const EMPTY_CAPABILITIES: EmptyCapabilities = Object.freeze([]);

const TIER_CAPABILITIES: Readonly<Record<ProductTier, readonly Capability[]>> =
  Object.freeze({
    base: BASE_CAPABILITIES,
    pro: PRO_CAPABILITIES,
  });

type ValidEntitlement = {
  tier: ProductTier;
  expiresAt: string | null;
};

/**
 * Explicit commercial precedence: Pro outranks Base.
 * Not alphabetical and not a public numeric enum.
 */
function isStrictlyHigherTier(left: ProductTier, right: ProductTier): boolean {
  return left === "pro" && right === "base";
}

export function capabilitiesForTier(tier: ProductTier): readonly Capability[] {
  return TIER_CAPABILITIES[tier];
}

function snapshotCapabilities(
  capabilities: readonly Capability[],
): readonly Capability[] {
  return Object.freeze(capabilities.slice());
}

function grantedStandard(
  source: CommercialAccessSource,
  entitlement: ValidEntitlement,
): EffectiveAccess {
  return {
    status: "granted",
    mode: "standard",
    tier: entitlement.tier,
    source,
    expiresAt: entitlement.expiresAt,
    capabilities: capabilitiesForTier(entitlement.tier),
  };
}

function unentitled(): EffectiveAccess {
  return {
    status: "unentitled",
    mode: "standard",
    tier: null,
    source: null,
    expiresAt: null,
    capabilities: EMPTY_CAPABILITIES,
  };
}

function invalidStandard(): EffectiveAccess {
  return {
    status: "invalid",
    mode: "standard",
    tier: null,
    source: null,
    expiresAt: null,
    capabilities: EMPTY_CAPABILITIES,
  };
}

function grantedModeProfile(
  mode: "demo" | "internal",
  capabilities: readonly Capability[],
): EffectiveAccess {
  return {
    status: "granted",
    mode,
    tier: null,
    source: null,
    expiresAt: null,
    capabilities: snapshotCapabilities(capabilities),
  };
}

function invalidModeProfile(mode: "demo" | "internal"): EffectiveAccess {
  return {
    status: "invalid",
    mode,
    tier: null,
    source: null,
    expiresAt: null,
    capabilities: EMPTY_CAPABILITIES,
  };
}

function resolveModeProfileAccess(
  mode: "demo" | "internal",
  modeProfiles: ModeCapabilityProfiles,
): EffectiveAccess {
  const profile = readModeCapabilityProfile(modeProfiles, mode);
  if (profile.ok === false) {
    return invalidModeProfile(mode);
  }
  return grantedModeProfile(mode, profile.capabilities);
}

/**
 * Fail-closed per source: unknown kind or unknown tier cannot grant.
 * Does not inspect ISO / Date / provider fields.
 */
function readValidEntitlement(
  candidate: EntitlementCandidate,
): ValidEntitlement | "absent" | "invalid" {
  if (candidate.kind === "absent") {
    return "absent";
  }
  if (candidate.kind === "invalid") {
    return "invalid";
  }
  if (candidate.kind !== "valid") {
    return "invalid";
  }
  if (candidate.tier !== "base" && candidate.tier !== "pro") {
    return "invalid";
  }
  return {
    tier: candidate.tier,
    expiresAt: candidate.expiresAt,
  };
}

/**
 * Standard-mode commercial winner.
 * Higher ProductTier wins. Equal tier → Stripe (deterministic tie-break).
 * Invalid on one source does not cancel a valid independent source.
 */
function resolveStandardAccess(
  stripeCandidate: EntitlementCandidate,
  complimentaryCandidate: EntitlementCandidate,
): EffectiveAccess {
  const stripe = readValidEntitlement(stripeCandidate);
  const complimentary = readValidEntitlement(complimentaryCandidate);

  const stripeValid = stripe !== "absent" && stripe !== "invalid"
    ? stripe
    : null;
  const complimentaryValid =
    complimentary !== "absent" && complimentary !== "invalid"
      ? complimentary
      : null;

  if (stripeValid !== null && complimentaryValid !== null) {
    if (isStrictlyHigherTier(complimentaryValid.tier, stripeValid.tier)) {
      return grantedStandard("complimentary", complimentaryValid);
    }
    return grantedStandard("stripe", stripeValid);
  }

  if (stripeValid !== null) {
    return grantedStandard("stripe", stripeValid);
  }
  if (complimentaryValid !== null) {
    return grantedStandard("complimentary", complimentaryValid);
  }

  if (stripe === "invalid" || complimentary === "invalid") {
    return invalidStandard();
  }

  return unentitled();
}

/**
 * Resolve effective access from already-normalized domain input.
 * Demo/Internal mode profiles precede commercial Stripe/complimentary slots.
 * Invalid Demo/Internal profiles fail closed and do not fall back to
 * persisted entitlement, ProductTier, or the canonical source.
 */
export function resolveEffectiveAccess(
  params: ResolveEffectiveAccessParams,
): EffectiveAccess {
  if (params.mode === "demo") {
    return resolveModeProfileAccess("demo", params.modeProfiles);
  }
  if (params.mode === "internal") {
    return resolveModeProfileAccess("internal", params.modeProfiles);
  }
  return resolveStandardAccess(
    params.stripeCandidate,
    params.complimentaryCandidate,
  );
}

/**
 * Capability check against resolved effective access.
 * UNENTITLED and INVALID are always false. Does not read tier directly.
 */
export function can(
  effectiveAccess: EffectiveAccess,
  capability: Capability,
): boolean {
  if (effectiveAccess.status !== "granted") {
    return false;
  }
  return effectiveAccess.capabilities.includes(capability);
}
