/**
 * Pure fail-closed bootstrap of customer.subscription.* events (BILLING-02).
 *
 * Reads only `type` and `data.object.id` from a Stripe-like event and, when
 * valid, returns the exact `provider_subscription_id`. No DB, env, network,
 * Stripe retrieve, Supabase, tenant/metadata, or commercial provider state.
 *
 * Not wired into stripe-webhook. Identity continuity with I4.3BL requires the
 * extracted id to be preserved exactly (no trim / coerce / fallback).
 */

export type ExtractStripeSubscriptionEventBootstrapFailureReason =
  | "unsupported_event_type"
  | "invalid_subscription_object"
  | "invalid_provider_subscription_id";

export type ExtractStripeSubscriptionEventBootstrapResult =
  | { ok: true; provider_subscription_id: string }
  | { ok: false; reason: ExtractStripeSubscriptionEventBootstrapFailureReason };

/**
 * Structural event shape (type + data.object). Intentionally loose —
 * validation is fail-closed inside the extractor. Callers may pass a verified
 * Stripe Event; only `type` and `data.object.id` are read.
 */
export type StripeSubscriptionEventLike = {
  type?: unknown;
  data?: unknown;
};

const SUPPORTED_SUBSCRIPTION_EVENT_TYPES = new Set<string>([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function fail(
  reason: ExtractStripeSubscriptionEventBootstrapFailureReason,
): ExtractStripeSubscriptionEventBootstrapResult {
  return { ok: false, reason };
}

/**
 * Exact-identity validation: non-empty string that is not whitespace-only.
 * Does not trim/lower-case the returned identity — identity is preserved.
 * Whitespace-only is rejected (fail-closed). Same rule as
 * refetchStripeSubscription / readTenantSubscriptionObservation for this id.
 */
function isValidProviderSubscriptionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Extract provider_subscription_id from a customer.subscription.* event.
 * Fail-closed: on any unreliable signal returns `{ ok: false, reason }`
 * with no partial value.
 */
export function extractStripeSubscriptionEventBootstrap(
  event: StripeSubscriptionEventLike,
): ExtractStripeSubscriptionEventBootstrapResult {
  if (!isPlainObject(event)) {
    return fail("unsupported_event_type");
  }

  const eventType = event.type;
  if (
    typeof eventType !== "string" ||
    !SUPPORTED_SUBSCRIPTION_EVENT_TYPES.has(eventType)
  ) {
    return fail("unsupported_event_type");
  }

  if (!isPlainObject(event.data)) {
    return fail("invalid_subscription_object");
  }

  const subscriptionObject = event.data.object;
  if (!isPlainObject(subscriptionObject)) {
    return fail("invalid_subscription_object");
  }

  const providerSubscriptionId = subscriptionObject.id;
  if (!isValidProviderSubscriptionId(providerSubscriptionId)) {
    return fail("invalid_provider_subscription_id");
  }

  // Exact identity — no toLowerCase / trim canonicalization.
  return { ok: true, provider_subscription_id: providerSubscriptionId };
}
