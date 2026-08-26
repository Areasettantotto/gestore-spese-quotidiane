/**
 * Pure fail-closed validation of subscription-sync runtime configuration
 * (BILLING-04 / BILLING-38 / BILLING-60).
 *
 * Transforms caller-supplied raw values into a typed config: validates
 * the Stripe secret, then builds the known Price catalog via
 * resolveStripePriceCatalogFromConfig. Does not read Deno.env /
 * process.env / import.meta.env, construct Stripe, call the network,
 * import stripe-webhook, retrieve, or use Supabase.
 *
 * Required slot: Pro monthly (`supportedProMonthlyPriceId`). Optional
 * additive slots, when supplied: Base monthly, Base annual, Pro annual.
 * Omitted optional slots are not filled and are not errors.
 *
 * Env names used by future wiring (documented only; not read here):
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_ID_PRO_MONTHLY
 */

import type { KnownStripePrice } from "./resolveKnownStripePrice.ts";
import {
  resolveStripePriceCatalogFromConfig,
  type ResolveStripePriceCatalogFromConfigFailureReason,
} from "./resolveStripePriceCatalogFromConfig.ts";

export type ResolveStripeSubscriptionSyncRuntimeConfigParams = {
  stripeSecretKey: unknown;
  supportedProMonthlyPriceId: unknown;
  supportedBaseMonthlyPriceId?: unknown;
  supportedBaseAnnualPriceId?: unknown;
  supportedProAnnualPriceId?: unknown;
};

export type ResolveStripeSubscriptionSyncRuntimeConfigFailureReason =
  | "invalid_stripe_secret_key"
  | "invalid_supported_pro_monthly_price_id"
  | "invalid_supported_base_monthly_price_id"
  | "invalid_supported_base_annual_price_id"
  | "invalid_supported_pro_annual_price_id";

export type ResolveStripeSubscriptionSyncRuntimeConfigResult =
  | {
    ok: true;
    stripeSecretKey: string;
    catalog: readonly KnownStripePrice[];
  }
  | {
    ok: false;
    reason: ResolveStripeSubscriptionSyncRuntimeConfigFailureReason;
  };

const CATALOG_FAILURE_REASON_MAP: {
  readonly [
    K in ResolveStripePriceCatalogFromConfigFailureReason
  ]: ResolveStripeSubscriptionSyncRuntimeConfigFailureReason;
} = {
  invalid_pro_monthly_price_id: "invalid_supported_pro_monthly_price_id",
  invalid_base_monthly_price_id: "invalid_supported_base_monthly_price_id",
  invalid_base_annual_price_id: "invalid_supported_base_annual_price_id",
  invalid_pro_annual_price_id: "invalid_supported_pro_annual_price_id",
};

function fail(
  reason: ResolveStripeSubscriptionSyncRuntimeConfigFailureReason,
): ResolveStripeSubscriptionSyncRuntimeConfigResult {
  return { ok: false, reason };
}

/**
 * Runtime config secret: non-empty, not whitespace-only, and without
 * leading/trailing whitespace. No coercion and no silent normalization
 * (padded values fail closed; `trim()` is never returned). The original
 * exact value is used only after it already satisfies these rules.
 */
function isNonEmptyNonWhitespaceString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim().length > 0 && value === value.trim();
}

/**
 * Validate Stripe secret key and build the known Price catalog for a
 * subscription sync runtime. Fail-closed: on any unreliable signal returns
 * `{ ok: false, reason }` with no partial value, no secret, no Price ID,
 * and no catalog in the payload.
 *
 * Catalog builder failures are mapped to the public runtime reasons:
 * `invalid_pro_monthly_price_id` → `invalid_supported_pro_monthly_price_id`
 * (legacy), and the three optional slots to their `invalid_supported_*`
 * counterparts. Builder reasons are never forwarded unchanged.
 */
export function resolveStripeSubscriptionSyncRuntimeConfig(
  params: ResolveStripeSubscriptionSyncRuntimeConfigParams,
): ResolveStripeSubscriptionSyncRuntimeConfigResult {
  if (!isNonEmptyNonWhitespaceString(params.stripeSecretKey)) {
    return fail("invalid_stripe_secret_key");
  }

  const catalogResult = resolveStripePriceCatalogFromConfig({
    proMonthlyPriceId: params.supportedProMonthlyPriceId,
    baseMonthlyPriceId: params.supportedBaseMonthlyPriceId,
    baseAnnualPriceId: params.supportedBaseAnnualPriceId,
    proAnnualPriceId: params.supportedProAnnualPriceId,
  });
  if (catalogResult.ok === false) {
    return fail(CATALOG_FAILURE_REASON_MAP[catalogResult.reason]);
  }

  return {
    ok: true,
    stripeSecretKey: params.stripeSecretKey,
    catalog: catalogResult.catalog,
  };
}
