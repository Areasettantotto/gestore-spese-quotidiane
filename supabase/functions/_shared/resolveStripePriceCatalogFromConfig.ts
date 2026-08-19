/**
 * Pure Stripe Price catalog builder from caller-supplied raw config
 * (BILLING-29).
 *
 * Transforms `{ proMonthlyPriceId: unknown }` into a readonly catalog of
 * known commercial Price descriptors. Completely unwired: does not read
 * Deno.env, accept secrets, construct Stripe, call the network, look up
 * catalog entries, or import checkout / webhook / normalizer / runtime
 * config.
 *
 * Current commercial surface: exactly one required slot, Pro monthly.
 * Duplicate-slot detection is intentionally omitted until a second
 * configurable slot exists.
 */

import type { KnownStripePrice } from "./resolveKnownStripePrice.ts";

export type ResolveStripePriceCatalogFromConfigParams = {
  readonly proMonthlyPriceId: unknown;
};

export type ResolveStripePriceCatalogFromConfigFailureReason =
  "invalid_pro_monthly_price_id";

export type ResolveStripePriceCatalogFromConfigResult =
  | { ok: true; catalog: readonly KnownStripePrice[] }
  | { ok: false; reason: ResolveStripePriceCatalogFromConfigFailureReason };

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
 * Fail-closed: an invalid Pro monthly Price ID never yields an empty or
 * partial catalog.
 */
export function resolveStripePriceCatalogFromConfig(
  params: ResolveStripePriceCatalogFromConfigParams,
): ResolveStripePriceCatalogFromConfigResult {
  if (!isExactNonEmptyPriceId(params.proMonthlyPriceId)) {
    return fail("invalid_pro_monthly_price_id");
  }

  const catalog: readonly KnownStripePrice[] = [
    {
      priceId: params.proMonthlyPriceId,
      tier: "pro",
      interval: "monthly",
    },
  ];

  return { ok: true, catalog };
}
