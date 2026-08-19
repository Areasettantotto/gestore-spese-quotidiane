/**
 * Pure known Stripe price catalog resolver (BILLING-27).
 *
 * Resolves an exact Price ID against a caller-supplied catalog into a
 * commercial descriptor `{ priceId, tier, interval }`.
 *
 * Does NOT read Deno.env, construct Stripe, call the network, import
 * checkout/webhook, normalize subscriptions, or produce entitlements.
 * The catalog source is the caller's responsibility.
 */

import type { ProductTier } from "./resolveEffectiveAccess.ts";

export type BillingInterval = "monthly" | "annual";

export type KnownStripePrice = {
  readonly priceId: string;
  readonly tier: ProductTier;
  readonly interval: BillingInterval;
};

export type ResolveKnownStripePriceParams = {
  readonly priceId: string;
  readonly catalog: readonly KnownStripePrice[];
};

export type ResolveKnownStripePriceFailureReason =
  | "invalid_price_id"
  | "invalid_catalog_entry"
  | "duplicate_price_id"
  | "unknown_price";

export type ResolveKnownStripePriceResult =
  | { ok: true; value: KnownStripePrice }
  | { ok: false; reason: ResolveKnownStripePriceFailureReason };

function fail(
  reason: ResolveKnownStripePriceFailureReason,
): ResolveKnownStripePriceResult {
  return { ok: false, reason };
}

/**
 * Exact Price ID identity: non-empty, no leading/trailing whitespace.
 * No trim/lowercase/canonicalization. Padding is rejected, not repaired.
 */
function isExactNonEmptyPriceId(value: string): boolean {
  return value.length > 0 && value === value.trim();
}

/**
 * Resolve a requested Stripe Price ID against a known catalog.
 * Fail-closed: an invalid catalog is never partially authoritative.
 */
export function resolveKnownStripePrice(
  params: ResolveKnownStripePriceParams,
): ResolveKnownStripePriceResult {
  if (!isExactNonEmptyPriceId(params.priceId)) {
    return fail("invalid_price_id");
  }

  for (const entry of params.catalog) {
    if (!isExactNonEmptyPriceId(entry.priceId)) {
      return fail("invalid_catalog_entry");
    }
  }

  const seenPriceIds = new Set<string>();
  for (const entry of params.catalog) {
    if (seenPriceIds.has(entry.priceId)) {
      return fail("duplicate_price_id");
    }
    seenPriceIds.add(entry.priceId);
  }

  for (const entry of params.catalog) {
    if (entry.priceId === params.priceId) {
      return { ok: true, value: entry };
    }
  }

  return fail("unknown_price");
}
