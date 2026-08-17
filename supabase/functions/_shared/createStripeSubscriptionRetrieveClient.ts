/**
 * Server-side factory for the BG Stripe retrieve port.
 *
 * `stripeSecretKey` is already validated by the caller
 * (`resolveStripeSubscriptionSyncRuntimeConfig`). This module does not
 * read env, re-validate the secret, or call subscriptions.retrieve.
 * It only constructs the SDK client and returns the minimum surface
 * required by refetchStripeSubscription.
 */

import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
import type { StripeSubscriptionRetrieveClient } from "./refetchStripeSubscription.ts";

export function createStripeSubscriptionRetrieveClient(
  stripeSecretKey: string,
): StripeSubscriptionRetrieveClient {
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
  return stripe;
}
