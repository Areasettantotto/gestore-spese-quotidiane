/**
 * Composer: provider-authoritative Stripe Subscription refetch → normalize (I4.3BJ / K2).
 *
 * Order is non-negotiable: refetchStripeSubscription (BG) THEN
 * normalizeStripeSubscription (BE). Fail-closed at either stage.
 *
 * No webhook/event/payload fallback, no DB, no tenant/ownership, no W_sub,
 * no Deno.env, no Stripe SDK import, no memoization.
 */

import {
  normalizeStripeSubscription,
  type NormalizeStripeSubscriptionConfig,
  type NormalizeStripeSubscriptionFailureReason,
  type NormalizedStripeSubscription,
  type StripeSubscriptionLike,
} from "./normalizeStripeSubscription.ts";
import {
  refetchStripeSubscription,
  type RefetchStripeSubscriptionFailureReason,
  type StripeSubscriptionRetrieveClient,
} from "./refetchStripeSubscription.ts";

export type FetchNormalizedStripeSubscriptionStage = "refetch" | "normalize";

export type FetchNormalizedStripeSubscriptionResult =
  | { ok: true; value: NormalizedStripeSubscription }
  | {
    ok: false;
    stage: "refetch";
    reason: RefetchStripeSubscriptionFailureReason;
  }
  | {
    ok: false;
    stage: "normalize";
    reason: NormalizeStripeSubscriptionFailureReason;
  };

export type FetchNormalizedStripeSubscriptionParams = {
  provider_subscription_id: unknown;
  stripe: StripeSubscriptionRetrieveClient;
  /** Forwarded verbatim to normalizeStripeSubscription — never read from env here. */
  config: NormalizeStripeSubscriptionConfig;
};

/**
 * Fresh provider retrieve → normalize. On refetch failure, normalization is not called.
 */
export async function fetchNormalizedStripeSubscription(
  params: FetchNormalizedStripeSubscriptionParams,
): Promise<FetchNormalizedStripeSubscriptionResult> {
  const refetchResult = await refetchStripeSubscription({
    provider_subscription_id: params.provider_subscription_id,
    stripe: params.stripe,
  });

  if (refetchResult.ok === false) {
    return {
      ok: false,
      stage: "refetch",
      reason: refetchResult.reason,
    };
  }

  // Raw provider result from BG is the sole input to BE (structural SubscriptionLike).
  // No remap / clone / event.data.object substitute.
  const normalizeResult = normalizeStripeSubscription(
    refetchResult.subscription as StripeSubscriptionLike,
    params.config,
  );

  if (normalizeResult.ok === false) {
    return {
      ok: false,
      stage: "normalize",
      reason: normalizeResult.reason,
    };
  }

  return { ok: true, value: normalizeResult.value };
}
