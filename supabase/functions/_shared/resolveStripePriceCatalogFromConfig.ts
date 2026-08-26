/**
 * Pure Stripe Price catalog builder from caller-supplied raw config
 * (BILLING-29 / BILLING-59).
 *
 * Transforms caller-supplied Price ID slots into a readonly catalog of
 * known commercial Price descriptors. Completely unwired: does not read
 * Deno.env, accept secrets, construct Stripe, call the network, look up
 * catalog entries, invent Price IDs, fall back across slots, or import
 * checkout / webhook / normalizer / runtime config.
 *
 * Required slot: Pro monthly (`proMonthlyPriceId`). Optional additive
 * slots, when supplied: Base monthly, Base annual, Pro annual.
 * An omitted optional slot yields no entry for that slot.
 * Duplicate Price IDs across slots are not rejected here; that remains
 * the downstream catalog validator's responsibility.
 *
 * Catalog append order (deterministic, not commercial authority):
 * base monthly, base annual, pro monthly, pro annual.
 */

import type { KnownStripePrice } from "./resolveKnownStripePrice.ts";

export type ResolveStripePriceCatalogFromConfigParams = {
  readonly proMonthlyPriceId: unknown;
  readonly baseMonthlyPriceId?: unknown;
  readonly baseAnnualPriceId?: unknown;
  readonly proAnnualPriceId?: unknown;
};

export type ResolveStripePriceCatalogFromConfigFailureReason =
  | "invalid_pro_monthly_price_id"
  | "invalid_base_monthly_price_id"
  | "invalid_base_annual_price_id"
  | "invalid_pro_annual_price_id";

export type ResolveStripePriceCatalogFromConfigResult =
  | { ok: true; catalog: readonly KnownStripePrice[] }
  | { ok: false; reason: ResolveStripePriceCatalogFromConfigFailureReason };

type CatalogSlot = {
  readonly read: (
    params: ResolveStripePriceCatalogFromConfigParams,
  ) => unknown;
  readonly required: boolean;
  readonly tier: KnownStripePrice["tier"];
  readonly interval: KnownStripePrice["interval"];
  readonly invalidReason: ResolveStripePriceCatalogFromConfigFailureReason;
};

const CATALOG_SLOTS: readonly CatalogSlot[] = [
  {
    read: (params) => params.baseMonthlyPriceId,
    required: false,
    tier: "base",
    interval: "monthly",
    invalidReason: "invalid_base_monthly_price_id",
  },
  {
    read: (params) => params.baseAnnualPriceId,
    required: false,
    tier: "base",
    interval: "annual",
    invalidReason: "invalid_base_annual_price_id",
  },
  {
    read: (params) => params.proMonthlyPriceId,
    required: true,
    tier: "pro",
    interval: "monthly",
    invalidReason: "invalid_pro_monthly_price_id",
  },
  {
    read: (params) => params.proAnnualPriceId,
    required: false,
    tier: "pro",
    interval: "annual",
    invalidReason: "invalid_pro_annual_price_id",
  },
];

function fail(
  reason: ResolveStripePriceCatalogFromConfigFailureReason,
): ResolveStripePriceCatalogFromConfigResult {
  return { ok: false, reason };
}

/**
 * Exact Price ID identity: string, non-empty, not whitespace-only, and
 * without leading/trailing whitespace. No trim/lowercase/canonicalization
 * and no `price_` prefix check. Padding is rejected, not repaired.
 * Internal whitespace is accepted when outer identity is already exact.
 */
function isExactNonEmptyPriceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim().length > 0 && value === value.trim();
}

/**
 * Build the known Stripe Price catalog from raw caller-supplied config.
 * Fail-closed: an invalid configured Price ID never yields an empty or
 * partial catalog. Unconfigured optional slots are omitted, not filled.
 */
export function resolveStripePriceCatalogFromConfig(
  params: ResolveStripePriceCatalogFromConfigParams,
): ResolveStripePriceCatalogFromConfigResult {
  const entries: KnownStripePrice[] = [];

  for (const slot of CATALOG_SLOTS) {
    const value = slot.read(params);
    if (!slot.required && value === undefined) {
      continue;
    }
    if (!isExactNonEmptyPriceId(value)) {
      return fail(slot.invalidReason);
    }
    entries.push({
      priceId: value,
      tier: slot.tier,
      interval: slot.interval,
    });
  }

  return { ok: true, catalog: entries };
}
