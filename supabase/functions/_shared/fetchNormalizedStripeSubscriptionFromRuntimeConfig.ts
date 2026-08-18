/**
 * Orchestrator: raw runtime config → Stripe retrieve client → fresh
 * normalized subscription (BILLING-10).
 *
 * Composes existing fail-closed boundaries only:
 *   resolveStripeSubscriptionSyncRuntimeConfig
 *   → createStripeSubscriptionRetrieveClient
 *   → fetchNormalizedStripeSubscription
 *
 * Does not read Deno.env / process.env / import.meta.env, import
 * stripe-webhook, bootstrap events, pre-admission, tenant mapping,
 * or Supabase. Does not validate provider_subscription_id here —
 * identity fail-closed remains in BJ/BG.
 *
 * Runtime uses createStripeSubscriptionRetrieveClient by default.
 * An optional factory seam allows deterministic tests without a
 * provider call.
 */

import { createStripeSubscriptionRetrieveClient } from "./createStripeSubscriptionRetrieveClient.ts";
import {
  fetchNormalizedStripeSubscription,
  type FetchNormalizedStripeSubscriptionResult,
} from "./fetchNormalizedStripeSubscription.ts";
import {
  resolveStripeSubscriptionSyncRuntimeConfig,
  type ResolveStripeSubscriptionSyncRuntimeConfigResult,
} from "./resolveStripeSubscriptionSyncRuntimeConfig.ts";

export type FetchNormalizedStripeSubscriptionFromRuntimeConfigParams = {
  provider_subscription_id: unknown;
  stripeSecretKey: unknown;
  supportedProMonthlyPriceId: unknown;
};

export type FetchNormalizedStripeSubscriptionFromRuntimeConfigResult =
  | Extract<ResolveStripeSubscriptionSyncRuntimeConfigResult, { ok: false }>
  | FetchNormalizedStripeSubscriptionResult;

/**
 * Resolve runtime config, construct the Stripe retrieve client, then
 * fetch + normalize a fresh provider subscription. Config failure is
 * returned unchanged; BJ success/failure is returned unchanged.
 */
export async function fetchNormalizedStripeSubscriptionFromRuntimeConfig(
  params: FetchNormalizedStripeSubscriptionFromRuntimeConfigParams,
  createRetrieveClient: typeof createStripeSubscriptionRetrieveClient =
    createStripeSubscriptionRetrieveClient,
): Promise<FetchNormalizedStripeSubscriptionFromRuntimeConfigResult> {
  const configResult = resolveStripeSubscriptionSyncRuntimeConfig({
    stripeSecretKey: params.stripeSecretKey,
    supportedProMonthlyPriceId: params.supportedProMonthlyPriceId,
  });

  if (configResult.ok === false) {
    return configResult;
  }

  const stripe = createRetrieveClient(
    configResult.stripeSecretKey,
  );

  return await fetchNormalizedStripeSubscription({
    provider_subscription_id: params.provider_subscription_id,
    stripe,
    config: {
      supportedProMonthlyPriceId: configResult.supportedProMonthlyPriceId,
    },
  });
}
