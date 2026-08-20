/**
 * Pure known Stripe price catalog resolvers (BILLING-27 / BILLING-32).
 *
 * - resolveKnownStripePrice: exact Price ID + catalog → descriptor
 * - resolveKnownStripePriceForSelection: tier + interval + catalog → descriptor
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

export type ResolveKnownStripePriceForSelectionParams = {
  readonly tier: ProductTier;
  readonly interval: BillingInterval;
  readonly catalog: readonly KnownStripePrice[];
};

export type ResolveKnownStripePriceForSelectionFailureReason =
  | "invalid_catalog_entry"
  | "duplicate_price_id"
  | "unsupported_selection"
  | "duplicate_selection";

export type ResolveKnownStripePriceForSelectionResult =
  | { ok: true; value: KnownStripePrice }
  | { ok: false; reason: ResolveKnownStripePriceForSelectionFailureReason };

type CatalogValidationFailure = "invalid_catalog_entry" | "duplicate_price_id";

function failWith<R extends string>(reason: R): { ok: false; reason: R } {
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
 * Shared catalog policy for both resolvers.
 * Invalid entries take precedence over duplicate exact Price IDs.
 * An empty catalog is structurally valid at this boundary.
 */
function validateKnownStripePriceCatalog(
  catalog: readonly KnownStripePrice[],
): CatalogValidationFailure | null {
  for (const entry of catalog) {
    if (!isExactNonEmptyPriceId(entry.priceId)) {
      return "invalid_catalog_entry";
    }
  }

  const seenPriceIds = new Set<string>();
  for (const entry of catalog) {
    if (seenPriceIds.has(entry.priceId)) {
      return "duplicate_price_id";
    }
    seenPriceIds.add(entry.priceId);
  }

  return null;
}

/**
 * Resolve a requested Stripe Price ID against a known catalog.
 * Fail-closed: an invalid catalog is never partially authoritative.
 */
export function resolveKnownStripePrice(
  params: ResolveKnownStripePriceParams,
): ResolveKnownStripePriceResult {
  if (!isExactNonEmptyPriceId(params.priceId)) {
    return failWith("invalid_price_id");
  }

  const catalogFailure = validateKnownStripePriceCatalog(params.catalog);
  if (catalogFailure !== null) {
    return failWith(catalogFailure);
  }

  for (const entry of params.catalog) {
    if (entry.priceId === params.priceId) {
      return { ok: true, value: entry };
    }
  }

  return failWith("unknown_price");
}

/**
 * Resolve a commercially typed tier + interval against a known catalog.
 * Fail-closed: an invalid catalog is never partially authoritative, and
 * a unique matching descriptor is required. Does not pick by order.
 */
export function resolveKnownStripePriceForSelection(
  params: ResolveKnownStripePriceForSelectionParams,
): ResolveKnownStripePriceForSelectionResult {
  const catalogFailure = validateKnownStripePriceCatalog(params.catalog);
  if (catalogFailure !== null) {
    return failWith(catalogFailure);
  }

  let match: KnownStripePrice | null = null;
  for (const entry of params.catalog) {
    if (entry.tier !== params.tier || entry.interval !== params.interval) {
      continue;
    }
    if (match !== null) {
      return failWith("duplicate_selection");
    }
    match = entry;
  }

  if (match === null) {
    return failWith("unsupported_selection");
  }

  return { ok: true, value: match };
}
