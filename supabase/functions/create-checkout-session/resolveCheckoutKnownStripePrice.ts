/**
 * Pure checkout-local composition of the Pro monthly Price catalog builder
 * and the commercial selector (BILLING-34).
 *
 * Transforms caller-supplied raw Pro monthly Price config + typed
 * selection into a KnownStripePrice descriptor, or a fail-closed failure.
 *
 * Reuses resolveStripePriceCatalogFromConfig and
 * resolveKnownStripePriceForSelection. Does not duplicate validation,
 * read Deno.env, trim or repair Price IDs, call Stripe, or know HTTP
 * aliases / request-response.
 */

import type { ProductTier } from "../_shared/resolveEffectiveAccess.ts";
import {
  type BillingInterval,
  type KnownStripePrice,
  resolveKnownStripePriceForSelection,
  type ResolveKnownStripePriceForSelectionFailureReason,
} from "../_shared/resolveKnownStripePrice.ts";
import {
  resolveStripePriceCatalogFromConfig,
  type ResolveStripePriceCatalogFromConfigFailureReason,
} from "../_shared/resolveStripePriceCatalogFromConfig.ts";

export type ResolveCheckoutKnownStripePriceParams = {
  readonly proMonthlyPriceId: unknown;
  readonly tier: ProductTier;
  readonly interval: BillingInterval;
};

export type ResolveCheckoutKnownStripePriceFailureReason =
  | ResolveStripePriceCatalogFromConfigFailureReason
  | ResolveKnownStripePriceForSelectionFailureReason;

export type ResolveCheckoutKnownStripePriceResult =
  | { ok: true; value: KnownStripePrice }
  | { ok: false; reason: ResolveCheckoutKnownStripePriceFailureReason };

export function resolveCheckoutKnownStripePrice(
  params: ResolveCheckoutKnownStripePriceParams,
): ResolveCheckoutKnownStripePriceResult {
  const catalogResult = resolveStripePriceCatalogFromConfig({
    proMonthlyPriceId: params.proMonthlyPriceId,
  });
  if (catalogResult.ok === false) {
    return { ok: false, reason: catalogResult.reason };
  }

  return resolveKnownStripePriceForSelection({
    tier: params.tier,
    interval: params.interval,
    catalog: catalogResult.catalog,
  });
}
