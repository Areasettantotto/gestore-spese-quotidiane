/**
 * Deno tests for refetchStripeSubscription (I4.3BG).
 *
 * Run:
 *   deno test supabase/functions/_shared/refetchStripeSubscription_test.ts
 *
 * No network/env/write/run capabilities required.
 */

import {
  refetchStripeSubscription,
  type RefetchStripeSubscriptionResult,
  type StripeSubscriptionRetrieveClient,
} from "./refetchStripeSubscription.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SUB_ID = "sub_test_refetch_synthetic_001";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\n  actual:   ${actualJson}\n  expected: ${expectedJson}`);
  }
}

function expectSuccess(
  result: RefetchStripeSubscriptionResult,
): asserts result is Extract<RefetchStripeSubscriptionResult, { ok: true }> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: RefetchStripeSubscriptionResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
}

type FakeRetrieveMode =
  | { kind: "resolve"; value: unknown }
  | { kind: "reject"; error: unknown }
  | { kind: "throw_sync"; error: unknown }
  | { kind: "sequence"; values: unknown[] };

type FakeCall = { id: string };

/**
 * Minimal Stripe-shaped fake: `stripe.subscriptions.retrieve(id)`.
 * Zero network; behavior driven by mode.
 */
function createFakeStripe(
  mode: FakeRetrieveMode,
  calls: FakeCall[],
): StripeSubscriptionRetrieveClient {
  let sequenceIndex = 0;
  return {
    subscriptions: {
      retrieve(id: string) {
        calls.push({ id });
        if (mode.kind === "throw_sync") {
          throw mode.error;
        }
        if (mode.kind === "reject") {
          return Promise.reject(mode.error);
        }
        if (mode.kind === "sequence") {
          const value = mode.values[sequenceIndex];
          sequenceIndex += 1;
          return Promise.resolve(value);
        }
        return Promise.resolve(mode.value);
      },
    },
  };
}

Deno.test("1. valid provider_subscription_id → retrieve once with exact id", async () => {
  const calls: FakeCall[] = [];
  const providerPayload = {
    id: SUB_ID,
    object: "subscription",
    status: "active",
    customer: "cus_test_1",
  };
  const stripe = createFakeStripe({ kind: "resolve", value: providerPayload }, calls);

  const result = await refetchStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
  });

  expectSuccess(result);
  assertEquals(calls.length, 1, "retrieve called exactly once");
  assertEquals(calls[0]?.id, SUB_ID, "exact provider_subscription_id");
});

Deno.test("2. provider result returned without reinterpretation", async () => {
  const calls: FakeCall[] = [];
  const providerPayload = {
    id: SUB_ID,
    object: "subscription",
    status: "past_due",
    customer: "cus_test_1",
    metadata: { plan_code: "pro_monthly", secret_marker: "keep_as_is" },
    items: { data: [{ price: { id: "price_x" } }] },
  };
  const stripe = createFakeStripe({ kind: "resolve", value: providerPayload }, calls);

  const result = await refetchStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
  });

  expectSuccess(result);
  assert(
    result.subscription === providerPayload,
    "must return the same provider object reference (no remap/clone reinterpretation)",
  );
  assertEquals(result.subscription, providerPayload, "payload equality");
});

Deno.test("3. empty provider_subscription_id → fail-closed, retrieve not called", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    { kind: "resolve", value: { id: SUB_ID } },
    calls,
  );

  expectFailure(
    await refetchStripeSubscription({
      provider_subscription_id: "",
      stripe,
    }),
    "invalid_provider_subscription_id",
  );
  assertEquals(calls.length, 0, "retrieve must not be called");
});

Deno.test("4. whitespace-only provider_subscription_id → fail-closed, retrieve not called", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    { kind: "resolve", value: { id: SUB_ID } },
    calls,
  );

  for (const invalid of [" ", "   ", "\t", "\n", " \t "]) {
    expectFailure(
      await refetchStripeSubscription({
        provider_subscription_id: invalid,
        stripe,
      }),
      "invalid_provider_subscription_id",
    );
  }
  assertEquals(calls.length, 0, "retrieve must not be called for whitespace-only");
});

Deno.test("5. external whitespace is not silently trim-normalized", async () => {
  const calls: FakeCall[] = [];
  const padded = ` ${SUB_ID} `;
  const providerPayload = { id: padded, object: "subscription" };
  const stripe = createFakeStripe({ kind: "resolve", value: providerPayload }, calls);

  const result = await refetchStripeSubscription({
    provider_subscription_id: padded,
    stripe,
  });

  expectSuccess(result);
  assertEquals(calls.length, 1, "retrieve called once");
  assertEquals(
    calls[0]?.id,
    padded,
    "padded id must be passed exactly — no silent trim",
  );
  assert(
    calls[0]?.id !== SUB_ID,
    "must not collapse padded id to trimmed form",
  );
});

Deno.test("6. provider reject → fail-closed stable reason", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    {
      kind: "reject",
      error: {
        type: "StripeInvalidRequestError",
        message: "No such subscription: sub_missing req_leak_me",
        requestId: "req_do_not_leak",
        statusCode: 404,
      },
    },
    calls,
  );

  const result = await refetchStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
  });

  expectFailure(result, "stripe_subscription_refetch_failed");
  assertEquals(calls.length, 1, "retrieve attempted once");
});

Deno.test("7. provider throw sync → fail-closed", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    {
      kind: "throw_sync",
      error: new Error("sync boom with secret=sk_test_do_not_leak"),
    },
    calls,
  );

  const result = await refetchStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
  });

  expectFailure(result, "stripe_subscription_refetch_failed");
  assertEquals(calls.length, 1, "retrieve invoked before sync throw");
});

Deno.test("8. raw provider error does not appear in public result", async () => {
  const secretMarker = "sk_test_secret_must_not_appear";
  const requestId = "req_leak_marker_xyz";
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    {
      kind: "reject",
      error: {
        message: `Stripe failure ${secretMarker}`,
        requestId,
        raw: { secret: secretMarker },
      },
    },
    calls,
  );

  const result = await refetchStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
  });

  expectFailure(result, "stripe_subscription_refetch_failed");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public contract exposes only ok+reason",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes(secretMarker) && !serialized.includes(requestId),
    "must not leak raw provider error / request id / secrets",
  );
});

Deno.test("9. no webhook/event/payload fallback inputs in contract", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    { kind: "reject", error: new Error("provider down") },
    calls,
  );

  // API accepts only provider_subscription_id + stripe client.
  // A caller holding a webhook subscription object cannot inject it as fallback.
  const webhookSubscription = {
    id: SUB_ID,
    object: "subscription",
    status: "active",
    from_webhook_event: true,
  };

  const result = await refetchStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
  });

  expectFailure(result, "stripe_subscription_refetch_failed");
  assert(
    webhookSubscription.from_webhook_event === true,
    "webhook payload remains an unused local — not a fallback path",
  );
  assert(
    !("event" in (result as object)) && !("payload" in (result as object)),
    "result must not carry event/payload fallback fields",
  );
});

Deno.test("10. two consecutive invocations → two distinct retrieves (no memoization)", async () => {
  const calls: FakeCall[] = [];
  const first = { id: SUB_ID, n: 1 };
  const second = { id: SUB_ID, n: 2 };
  const stripe = createFakeStripe(
    { kind: "sequence", values: [first, second] },
    calls,
  );

  const result1 = await refetchStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
  });
  const result2 = await refetchStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
  });

  expectSuccess(result1);
  expectSuccess(result2);
  assertEquals(calls.length, 2, "two independent retrieves");
  assertEquals(calls[0]?.id, SUB_ID, "first retrieve id");
  assertEquals(calls[1]?.id, SUB_ID, "second retrieve id");
  assert(
    result1.subscription === first && result2.subscription === second,
    "each invocation returns its own provider response",
  );
  assert(
    result1.subscription !== result2.subscription,
    "must not reuse/memoize previous provider snapshot",
  );
});

Deno.test("11. null/undefined provider response → stripe_subscription_refetch_invalid", async () => {
  for (const value of [null, undefined]) {
    const calls: FakeCall[] = [];
    const stripe = createFakeStripe({ kind: "resolve", value }, calls);

    const result = await refetchStripeSubscription({
      provider_subscription_id: SUB_ID,
      stripe,
    });

    expectFailure(result, "stripe_subscription_refetch_invalid");
    assertEquals(calls.length, 1, "retrieve was attempted");
  }
});

Deno.test("12. non-string provider_subscription_id → invalid, retrieve not called", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    { kind: "resolve", value: { id: SUB_ID } },
    calls,
  );

  for (const invalid of [null, undefined, 1, true, { id: SUB_ID }, ["sub_x"]]) {
    expectFailure(
      await refetchStripeSubscription({
        provider_subscription_id: invalid,
        stripe,
      }),
      "invalid_provider_subscription_id",
    );
  }
  assertEquals(calls.length, 0, "retrieve must not be called for non-string input");
});
