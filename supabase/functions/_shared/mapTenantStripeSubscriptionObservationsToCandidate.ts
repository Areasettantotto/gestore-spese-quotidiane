/**
 * Pure Stripe observations → EntitlementCandidate policy mapper (BILLING-82).
 *
 * Set-based commercial/lifecycle policy over already-validated
 * TenantStripeSubscriptionObservation[]. Does not choose a physical
 * current row, parse dates, or wire resolveTenantEffectiveAccess.
 *
 * No DB, Supabase, Deno.env, Stripe SDK, HTTP, or wall-clock.
 */

import type { TenantStripeSubscriptionObservation } from "./readTenantStripeSubscriptionObservations.ts";
import type {
  EntitlementCandidate,
  ProductTier,
} from "./resolveEffectiveAccess.ts";

const ENTITLEMENT_BEARING_STATUSES = new Set<string>([
  "active",
  "trialing",
  "past_due",
]);

const NO_ENTITLEMENT_STATUSES = new Set<string>([
  "unpaid",
  "incomplete",
  "paused",
  "suspended",
  "canceled",
  "incomplete_expired",
]);

function isProductTier(
  value: TenantStripeSubscriptionObservation["productTier"],
): value is ProductTier {
  return value === "base" || value === "pro";
}

function absent(): EntitlementCandidate {
  return { kind: "absent" };
}

function invalid(): EntitlementCandidate {
  return { kind: "invalid" };
}

function valid(tier: ProductTier): EntitlementCandidate {
  return { kind: "valid", tier, expiresAt: null };
}

/**
 * Map persisted Stripe subscription observations to one EntitlementCandidate.
 *
 * Status matching is exact and case-sensitive. currentPeriodEnd is ignored.
 * expiresAt is always null on a valid candidate.
 */
export function mapTenantStripeSubscriptionObservationsToCandidate(
  observations: readonly TenantStripeSubscriptionObservation[],
): EntitlementCandidate {
  let entitledTier: ProductTier | null = null;

  for (const observation of observations) {
    const status = observation.status;

    if (ENTITLEMENT_BEARING_STATUSES.has(status)) {
      if (!isProductTier(observation.productTier)) {
        return invalid();
      }
      if (entitledTier === null) {
        entitledTier = observation.productTier;
      } else if (entitledTier !== observation.productTier) {
        return invalid();
      }
      continue;
    }

    if (NO_ENTITLEMENT_STATUSES.has(status)) {
      continue;
    }

    return invalid();
  }

  if (entitledTier === null) {
    return absent();
  }

  return valid(entitledTier);
}
