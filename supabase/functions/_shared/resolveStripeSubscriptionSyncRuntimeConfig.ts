/**
 * Pure fail-closed validation of subscription-sync runtime configuration
 * (BILLING-04).
 *
 * Transforms two caller-supplied raw values into a typed config. Does not
 * read Deno.env / process.env / import.meta.env, construct Stripe, call
 * the network, import stripe-webhook, retrieve, or use Supabase.
 *
 * Env names used by future wiring (documented only; not read here):
 *   STRIPE_SECRET_KEY
 *   STRIPE_PRICE_ID_PRO_MONTHLY
 */

export type ResolveStripeSubscriptionSyncRuntimeConfigParams = {
  stripeSecretKey: unknown;
  supportedProMonthlyPriceId: unknown;
};

export type ResolveStripeSubscriptionSyncRuntimeConfigFailureReason =
  | "invalid_stripe_secret_key"
  | "invalid_supported_pro_monthly_price_id";

export type ResolveStripeSubscriptionSyncRuntimeConfigResult =
  | {
    ok: true;
    stripeSecretKey: string;
    supportedProMonthlyPriceId: string;
  }
  | {
    ok: false;
    reason: ResolveStripeSubscriptionSyncRuntimeConfigFailureReason;
  };

function fail(
  reason: ResolveStripeSubscriptionSyncRuntimeConfigFailureReason,
): ResolveStripeSubscriptionSyncRuntimeConfigResult {
  return { ok: false, reason };
}

/**
 * Runtime config string: non-empty, not whitespace-only, and without
 * leading/trailing whitespace. No coercion and no silent normalization
 * (padded values fail closed; `trim()` is never returned). The original
 * exact value is used only after it already satisfies these rules.
 */
function isNonEmptyNonWhitespaceString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim().length > 0 && value === value.trim();
}

/**
 * Validate Stripe secret key + supported Pro Monthly price id for a future
 * subscription sync runtime. Fail-closed: on any unreliable signal returns
 * `{ ok: false, reason }` with no partial value and no secret in the payload.
 */
export function resolveStripeSubscriptionSyncRuntimeConfig(
  params: ResolveStripeSubscriptionSyncRuntimeConfigParams,
): ResolveStripeSubscriptionSyncRuntimeConfigResult {
  if (!isNonEmptyNonWhitespaceString(params.stripeSecretKey)) {
    return fail("invalid_stripe_secret_key");
  }

  if (!isNonEmptyNonWhitespaceString(params.supportedProMonthlyPriceId)) {
    return fail("invalid_supported_pro_monthly_price_id");
  }

  // Exact values — no trim / prefix / test-vs-live canonicalization.
  return {
    ok: true,
    stripeSecretKey: params.stripeSecretKey,
    supportedProMonthlyPriceId: params.supportedProMonthlyPriceId,
  };
}
