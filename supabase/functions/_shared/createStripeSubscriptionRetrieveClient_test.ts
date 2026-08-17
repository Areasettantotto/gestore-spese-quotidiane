/**
 * Deno tests for createStripeSubscriptionRetrieveClient (BILLING-09).
 *
 * Run:
 *   deno test --no-lock supabase/functions/_shared/createStripeSubscriptionRetrieveClient_test.ts
 *
 * Instantiates the real Stripe SDK client with a synthetic fixture.
 * Does not read env, call subscriptions.retrieve, or inspect SDK internals.
 */

import { createStripeSubscriptionRetrieveClient } from "./createStripeSubscriptionRetrieveClient.ts";
import type { StripeSubscriptionRetrieveClient } from "./refetchStripeSubscription.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SYNTHETIC_SECRET = "fake-secret-value";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function acceptStripeSubscriptionRetrieveClient(
  client: StripeSubscriptionRetrieveClient,
): StripeSubscriptionRetrieveClient {
  return client;
}

Deno.test("A. factory constructs the BG retrieve port", () => {
  const client: StripeSubscriptionRetrieveClient =
    createStripeSubscriptionRetrieveClient(SYNTHETIC_SECRET);

  assert(
    client !== null && client !== undefined,
    "factory must return a client",
  );
  assert(
    client.subscriptions !== null && client.subscriptions !== undefined,
    "client must expose subscriptions",
  );
  assert(
    typeof client.subscriptions.retrieve === "function",
    "subscriptions.retrieve must be a function",
  );
});

Deno.test("B. result is structurally StripeSubscriptionRetrieveClient", () => {
  const client = acceptStripeSubscriptionRetrieveClient(
    createStripeSubscriptionRetrieveClient(SYNTHETIC_SECRET),
  );

  assert(
    client !== null && client !== undefined,
    "typed helper must accept the factory result",
  );
  assert(
    typeof client.subscriptions.retrieve === "function",
    "port surface remains a retrieve function",
  );
});
