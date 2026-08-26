/**
 * Pure known Stripe price catalog resolvers (BILLING-27 / BILLING-32 / BILLING-58).
 *
 * - resolveKnownStripePrice: exact Price ID + catalog → descriptor
 * - resolveKnownStripePriceForSelection: tier + interval, or a canonical
 *   commercial slot, + catalog → descriptor
 *
 * Does NOT read Deno.env, construct Stripe, call the network, import
 * checkout/webhook, normalize subscriptions, or produce entitlements.
 * The catalog source is the caller's responsibility.
 * Canonical slots never invent Price IDs or fall back across tier/interval.
 */

import type { ProductTier } from "./resolveEffectiveAccess.ts";

export type BillingInterval = "monthly" | "annual";

/**
 * Canonical commercial slots. Not plan_code, not HTTP aliases, not Price IDs.
 * Historical checkout alias `pro` is not a selector slot.
 */
export type CommercialPriceSelection =
  | "base_monthly"
  | "base_annual"
  | "pro_monthly"
  | "pro_annual";

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

export type ResolveKnownStripePriceForSelectionParams =
  | {
    readonly tier: ProductTier;
    readonly interval: BillingInterval;
    readonly catalog: readonly KnownStripePrice[];
  }
  | {
    readonly selection: CommercialPriceSelection;
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

type SelectionAxes = {
  readonly tier: ProductTier;
  readonly interval: BillingInterval;
};

function failWith<R extends string>(reason: R): { ok: false; reason: R } {
  return { ok: false, reason };
}

/**
 * Exact ProductTier + BillingInterval for a canonical slot.
 * Unknown tokens (including historical HTTP alias `pro`) are rejected.
 */
function axesForCommercialSelection(
  selection: string,
): SelectionAxes | null {
  switch (selection) {
    case "base_monthly":
      return { tier: "base", interval: "monthly" };
    case "base_annual":
      return { tier: "base", interval: "annual" };
    case "pro_monthly":
      return { tier: "pro", interval: "monthly" };
    case "pro_annual":
      return { tier: "pro", interval: "annual" };
    default:
      return null;
  }
}

function selectionAxesFromParams(
  params: ResolveKnownStripePriceForSelectionParams,
): SelectionAxes | null {
  if ("selection" in params) {
    return axesForCommercialSelection(params.selection);
  }
  return { tier: params.tier, interval: params.interval };
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
 * Resolve a commercially typed selection against a known catalog.
 * Accepts ProductTier + BillingInterval, or a canonical commercial slot
 * that maps onto those axes. Fail-closed: an invalid catalog is never
 * partially authoritative, and a unique matching descriptor is required.
 * Does not pick by order, invent Price IDs, or fall back across axes.
 */
export function resolveKnownStripePriceForSelection(
  params: ResolveKnownStripePriceForSelectionParams,
): ResolveKnownStripePriceForSelectionResult {
  const catalogFailure = validateKnownStripePriceCatalog(params.catalog);
  if (catalogFailure !== null) {
    return failWith(catalogFailure);
  }

  const axes = selectionAxesFromParams(params);
  if (axes === null) {
    return failWith("unsupported_selection");
  }

  let match: KnownStripePrice | null = null;
  for (const entry of params.catalog) {
    if (entry.tier !== axes.tier || entry.interval !== axes.interval) {
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
