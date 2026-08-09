/**
 * Provider-authoritative Stripe Subscription re-fetch (I4.3BG / K2 primitive).
 *
 * Trust boundary: provider_subscription_id → Stripe subscriptions.retrieve(...)
 * → raw provider result. No webhook/event/payload fallback, no memoization,
 * no DB, no normalize, no tenant resolve, no W_sub/CAS.
 *
 * Every invocation performs an independent retrieve so a future CAS failure
 * can safely call this primitive again for a fresh provider snapshot.
 */

export type RefetchStripeSubscriptionFailureReason =
  | "invalid_provider_subscription_id"
  | "stripe_subscription_refetch_failed"
  | "stripe_subscription_refetch_invalid";

export type RefetchStripeSubscriptionResult =
  | { ok: true; subscription: unknown }
  | { ok: false; reason: RefetchStripeSubscriptionFailureReason };

/**
 * Structural subset of the Stripe Node/Deno SDK client surface:
 *   stripe.subscriptions.retrieve(id)
 *
 * Compatible with a real `Stripe` instance (e.g. stripe@14 used in
 * stripe-webhook) without cast or adapter: the SDK exposes
 * `subscriptions.retrieve(id, ...optional)` returning a Promise of a
 * Subscription object, which is structurally assignable to this type
 * (`PromiseLike<unknown>` accepts the richer SDK return).
 *
 * This module never constructs Stripe or reads Deno.env — the caller
 * supplies an already-initialized client (or a test fake).
 */
export type StripeSubscriptionRetrieveClient = {
  subscriptions: {
    retrieve: (id: string) => PromiseLike<unknown>;
  };
};

export type RefetchStripeSubscriptionParams = {
  provider_subscription_id: unknown;
  stripe: StripeSubscriptionRetrieveClient;
};

function fail(
  reason: RefetchStripeSubscriptionFailureReason,
): RefetchStripeSubscriptionResult {
  return { ok: false, reason };
}

/**
 * Exact-identity validation: non-empty string that is not whitespace-only.
 * Does not trim/lower-case the value used for retrieve — identity is preserved.
 * Whitespace-only is rejected (fail-closed) without calling the provider.
 */
function isValidProviderSubscriptionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim().length > 0;
}

/**
 * Re-fetch a Stripe Subscription from the provider-authoritative API.
 * Returns the provider payload unchanged on success (normalization is separate).
 */
export async function refetchStripeSubscription(
  params: RefetchStripeSubscriptionParams,
): Promise<RefetchStripeSubscriptionResult> {
  if (!isValidProviderSubscriptionId(params.provider_subscription_id)) {
    return fail("invalid_provider_subscription_id");
  }

  // Exact identity — no toLowerCase / trim canonicalization before retrieve.
  const providerSubscriptionId = params.provider_subscription_id;

  let retrieved: unknown;
  try {
    retrieved = await params.stripe.subscriptions.retrieve(providerSubscriptionId);
  } catch {
    // Do not surface raw Stripe error, request id, stack, or secrets.
    return fail("stripe_subscription_refetch_failed");
  }

  // Minimal usability gate for a value that can be handed to the normalizer.
  // Deep Subscription validation belongs to normalizeStripeSubscription.
  if (retrieved === null || retrieved === undefined) {
    return fail("stripe_subscription_refetch_invalid");
  }

  return { ok: true, subscription: retrieved };
}
