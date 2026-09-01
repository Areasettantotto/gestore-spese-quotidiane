/**
 * Pure HTTP-safe presentation of already-resolved EffectiveAccess (BILLING-88).
 *
 * Domain result → public DTO. Explicit allowlist only.
 * Does NOT authorize, resolve entitlement, compute capabilities, or emit HTTP.
 * No persistence, env, providers, membership, or wall-clock.
 */

import type { EffectiveAccess } from "./resolveEffectiveAccess.ts";

type PublicEffectiveAccessKeys =
  | "status"
  | "mode"
  | "tier"
  | "source"
  | "expiresAt"
  | "capabilities";

/**
 * Public EffectiveAccess payload. Same discriminated union as the domain
 * type, restricted to the allowlisted fields.
 */
export type EffectiveAccessPayload =
  | Pick<
    Extract<EffectiveAccess, { status: "granted"; mode: "standard" }>,
    PublicEffectiveAccessKeys
  >
  | Pick<
    Extract<EffectiveAccess, { status: "granted"; mode: "demo" | "internal" }>,
    PublicEffectiveAccessKeys
  >
  | Pick<
    Extract<EffectiveAccess, { status: "unentitled" }>,
    PublicEffectiveAccessKeys
  >
  | Pick<
    Extract<EffectiveAccess, { status: "invalid" }>,
    PublicEffectiveAccessKeys
  >;

function copyAllowlistedFields<T extends EffectiveAccess>(
  effectiveAccess: T,
): Pick<T, PublicEffectiveAccessKeys> {
  return {
    status: effectiveAccess.status,
    mode: effectiveAccess.mode,
    tier: effectiveAccess.tier,
    source: effectiveAccess.source,
    expiresAt: effectiveAccess.expiresAt,
    capabilities: effectiveAccess.capabilities,
  };
}

/**
 * Copy only the public EffectiveAccess fields onto a new object.
 * Does not spread the input, mutate it, or reinterpret domain values.
 */
export function serializeEffectiveAccess(
  effectiveAccess: EffectiveAccess,
): EffectiveAccessPayload {
  switch (effectiveAccess.status) {
    case "granted":
      if (effectiveAccess.mode === "standard") {
        return copyAllowlistedFields(effectiveAccess);
      }
      return copyAllowlistedFields(effectiveAccess);
    case "unentitled":
      return copyAllowlistedFields(effectiveAccess);
    case "invalid":
      return copyAllowlistedFields(effectiveAccess);
  }
}
