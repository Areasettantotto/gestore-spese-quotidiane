/**
 * Checkout-local composition of the Stripe Price catalog builder and
 * the commercial selector (BILLING-34 / BILLING-63).
 *
 * Transforms caller-supplied raw Price config + a canonical commercial
 * slot into a KnownStripePrice descriptor, or a fail-closed failure.
 *
 * Also exposes the checkout HTTP plan_code allowlist, including the
 * historical alias `pro` → `pro_monthly`. Other tokens are not aliases.
 *
 * Reuses resolveStripePriceCatalogFromConfig and
 * resolveKnownStripePriceForSelection. Does not duplicate the
 * tier/interval matrix, read Deno.env, trim or repair Price IDs, call
 * Stripe, or invent HTTP status payloads.
 */

import {
  type CommercialPriceSelection,
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
  readonly baseMonthlyPriceId?: unknown;
  readonly baseAnnualPriceId?: unknown;
  readonly proAnnualPriceId?: unknown;
  readonly selection: CommercialPriceSelection;
};

export type ResolveCheckoutKnownStripePriceFailureReason =
  | ResolveStripePriceCatalogFromConfigFailureReason
  | ResolveKnownStripePriceForSelectionFailureReason;

export type ResolveCheckoutKnownStripePriceResult =
  | { ok: true; value: KnownStripePrice }
  | { ok: false; reason: ResolveCheckoutKnownStripePriceFailureReason };

export type NormalizeCheckoutPlanCodeResult =
  | { ok: true; planCode: CommercialPriceSelection }
  | { ok: false };

function isCommercialPriceSelection(
  value: string,
): value is CommercialPriceSelection {
  return value === "base_monthly" || value === "base_annual" ||
    value === "pro_monthly" || value === "pro_annual";
}

/**
 * Allowlisted checkout plan_code → canonical commercial slot.
 * Historical HTTP alias `pro` maps to `pro_monthly`. No other aliases.
 */
export function normalizeCheckoutPlanCode(
  planCode: unknown,
): NormalizeCheckoutPlanCodeResult {
  if (typeof planCode !== "string") {
    return { ok: false };
  }

  const normalizedInput = planCode.trim().toLowerCase();
  if (normalizedInput === "pro") {
    return { ok: true, planCode: "pro_monthly" };
  }
  if (isCommercialPriceSelection(normalizedInput)) {
    return { ok: true, planCode: normalizedInput };
  }

  return { ok: false };
}

export function resolveCheckoutKnownStripePrice(
  params: ResolveCheckoutKnownStripePriceParams,
): ResolveCheckoutKnownStripePriceResult {
  const catalogResult = resolveStripePriceCatalogFromConfig({
    proMonthlyPriceId: params.proMonthlyPriceId,
    baseMonthlyPriceId: params.baseMonthlyPriceId,
    baseAnnualPriceId: params.baseAnnualPriceId,
    proAnnualPriceId: params.proAnnualPriceId,
  });
  if (catalogResult.ok === false) {
    return { ok: false, reason: catalogResult.reason };
  }

  return resolveKnownStripePriceForSelection({
    selection: params.selection,
    catalog: catalogResult.catalog,
  });
}
