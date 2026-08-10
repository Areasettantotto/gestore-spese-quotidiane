/**
 * Deno tests for fetchNormalizedStripeSubscription (I4.3BJ).
 *
 * Composition order and fail-closed staging — not a full BE/BG suite replica.
 *
 * Run:
 *   deno test supabase/functions/_shared/fetchNormalizedStripeSubscription_test.ts
 *
 * No network/env/write/run capabilities required.
 */

import {
  fetchNormalizedStripeSubscription,
  type FetchNormalizedStripeSubscriptionResult,
} from "./fetchNormalizedStripeSubscription.ts";
import type { StripeSubscriptionRetrieveClient } from "./refetchStripeSubscription.ts";
import type { StripeSubscriptionLike } from "./normalizeStripeSubscription.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SUB_ID = "sub_test_compose_synthetic_001";
const SUPPORTED_PRICE = "price_test_pro_monthly_supported";
const CONFIG = { supportedProMonthlyPriceId: SUPPORTED_PRICE };

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
  result: FetchNormalizedStripeSubscriptionResult,
): asserts result is Extract<FetchNormalizedStripeSubscriptionResult, { ok: true }> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: FetchNormalizedStripeSubscriptionResult,
  stage: "refetch" | "normalize",
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.stage, stage, "failure stage");
  assertEquals(result.reason, reason, "failure reason");
}

type FakeRetrieveMode =
  | { kind: "resolve"; value: unknown }
  | { kind: "reject"; error: unknown }
  | { kind: "throw_sync"; error: unknown }
  | { kind: "sequence"; values: unknown[] };

type FakeCall = { id: string };

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

function validRawSubscription(
  overrides: Partial<StripeSubscriptionLike> = {},
): StripeSubscriptionLike {
  return {
    id: SUB_ID,
    customer: "cus_test_compose_1",
    status: "active",
    current_period_start: 1_700_000_000,
    current_period_end: 1_700_267_200,
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { plan_code: "pro_monthly" },
    items: {
      data: [{ price: { id: SUPPORTED_PRICE } }],
    },
    ...overrides,
  };
}

Deno.test("1. success: refetch + normalize → Normalized Subscription", async () => {
  const calls: FakeCall[] = [];
  const raw = validRawSubscription();
  const stripe = createFakeStripe({ kind: "resolve", value: raw }, calls);

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
    config: CONFIG,
  });

  expectSuccess(result);
  assertEquals(calls.length, 1, "retrieve once");
  assertEquals(result.value.provider_subscription_id, SUB_ID, "subscription id");
  assertEquals(result.value.provider_customer_id, "cus_test_compose_1", "customer");
  assertEquals(result.value.plan_code, "paid", "NP-A plan_code");
  assertEquals(result.value.status, "active", "status");
  assertEquals(result.value.cancel_at_period_end, false, "cancel_at_period_end");
});

Deno.test("2. invalid provider_subscription_id → refetch stage, retrieve not called", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    { kind: "resolve", value: validRawSubscription() },
    calls,
  );

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: "",
    stripe,
    config: CONFIG,
  });

  expectFailure(result, "refetch", "invalid_provider_subscription_id");
  assertEquals(calls.length, 0, "retrieve must not be called");
});

Deno.test("3. provider retrieve reject → refetch stage, no normalize success", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    {
      kind: "reject",
      error: {
        message: "No such subscription RAW_PROVIDER_DETAIL_ALPHA",
        providerReference: "RAW_PROVIDER_REFERENCE_GAMMA",
      },
    },
    calls,
  );

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
    config: CONFIG,
  });

  expectFailure(result, "refetch", "stripe_subscription_refetch_failed");
  assertEquals(calls.length, 1, "retrieve attempted");
  assert(result.ok === false && !("value" in result), "no normalize success path");
});

Deno.test("4. provider response null/undefined → refetch stage", async () => {
  for (const value of [null, undefined]) {
    const calls: FakeCall[] = [];
    const stripe = createFakeStripe({ kind: "resolve", value }, calls);

    const result = await fetchNormalizedStripeSubscription({
      provider_subscription_id: SUB_ID,
      stripe,
      config: CONFIG,
    });

    expectFailure(result, "refetch", "stripe_subscription_refetch_invalid");
    assertEquals(calls.length, 1, "retrieve attempted");
  }
});

Deno.test("5. raw subscription semantically invalid → normalize stage", async () => {
  const calls: FakeCall[] = [];
  // Refetch succeeds (non-null object); BE rejects missing/blank id.
  const raw = validRawSubscription({ id: "" });
  const stripe = createFakeStripe({ kind: "resolve", value: raw }, calls);

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
    config: CONFIG,
  });

  expectFailure(result, "normalize", "invalid_subscription_id");
  assertEquals(calls.length, 1, "refetch succeeded before normalize");
});

Deno.test("6. unsupported Price / metadata → normalize failure, no fallback", async () => {
  const calls: FakeCall[] = [];
  const raw = validRawSubscription({
    items: { data: [{ price: { id: "price_other_unsupported" } }] },
  });
  const stripe = createFakeStripe({ kind: "resolve", value: raw }, calls);

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
    config: CONFIG,
  });

  expectFailure(result, "normalize", "unsupported_price");
  assert(
    !("event" in (result as object)) && !("payload" in (result as object)),
    "no webhook/payload fallback fields on failure",
  );
});

Deno.test("7. multi-item → normalize invalid_items (BE rule, not reimplemented)", async () => {
  const calls: FakeCall[] = [];
  const raw = validRawSubscription({
    items: {
      data: [
        { price: { id: SUPPORTED_PRICE } },
        { price: { id: SUPPORTED_PRICE } },
      ],
    },
  });
  const stripe = createFakeStripe({ kind: "resolve", value: raw }, calls);

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
    config: CONFIG,
  });

  expectFailure(result, "normalize", "invalid_items");
});

Deno.test("8. exact identity: padded valid id passed unchanged to retrieve", async () => {
  const calls: FakeCall[] = [];
  const padded = ` ${SUB_ID} `;
  // Provider returns a semantically valid subscription with trimmed id fields
  // so normalization can succeed; identity check is on the retrieve argument.
  const raw = validRawSubscription({ id: SUB_ID });
  const stripe = createFakeStripe({ kind: "resolve", value: raw }, calls);

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: padded,
    stripe,
    config: CONFIG,
  });

  expectSuccess(result);
  assertEquals(calls.length, 1, "retrieve once");
  assertEquals(calls[0]?.id, padded, "padded id must reach retrieve unchanged");
  assert(calls[0]?.id !== SUB_ID, "must not silently trim before retrieve");
});

Deno.test("9. two independent invocations → two retrieves, no memoization", async () => {
  const calls: FakeCall[] = [];
  const first = validRawSubscription({ id: "sub_compose_a" });
  const second = validRawSubscription({ id: "sub_compose_b" });
  const stripe = createFakeStripe(
    { kind: "sequence", values: [first, second] },
    calls,
  );

  const result1 = await fetchNormalizedStripeSubscription({
    provider_subscription_id: "sub_compose_a",
    stripe,
    config: CONFIG,
  });
  const result2 = await fetchNormalizedStripeSubscription({
    provider_subscription_id: "sub_compose_b",
    stripe,
    config: CONFIG,
  });

  expectSuccess(result1);
  expectSuccess(result2);
  assertEquals(calls.length, 2, "two provider retrieves");
  assertEquals(result1.value.provider_subscription_id, "sub_compose_a", "first id");
  assertEquals(result2.value.provider_subscription_id, "sub_compose_b", "second id");
  assert(
    result1.value !== result2.value,
    "must not reuse/memoize normalized snapshot across invocations",
  );
});

Deno.test("10. raw provider error details must not leak in public result", async () => {
  const detailMarker = "RAW_PROVIDER_DETAIL_ALPHA";
  const referenceMarker = "RAW_PROVIDER_REFERENCE_GAMMA";
  const nestedDetailMarker = "RAW_PROVIDER_DETAIL_BETA";
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    {
      kind: "reject",
      error: {
        message: `Stripe failure ${detailMarker}`,
        providerReference: referenceMarker,
        raw: { detail: nestedDetailMarker, rawDetail: nestedDetailMarker },
      },
    },
    calls,
  );

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
    config: CONFIG,
  });

  expectFailure(result, "refetch", "stripe_subscription_refetch_failed");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason", "stage"].sort(),
    "public contract exposes only ok+stage+reason",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes(detailMarker) &&
      !serialized.includes(referenceMarker) &&
      !serialized.includes(nestedDetailMarker),
    "must not leak raw provider error detail / provider reference",
  );
});

Deno.test("11. provider retrieve failure → refetch stage; no alternate success source", async () => {
  const calls: FakeCall[] = [];
  const stripe = createFakeStripe(
    { kind: "reject", error: new Error("provider down") },
    calls,
  );

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
    config: CONFIG,
  });

  expectFailure(result, "refetch", "stripe_subscription_refetch_failed");
  assertEquals(calls.length, 1, "retrieve attempted");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason", "stage"].sort(),
    "public failure contract exposes only ok+stage+reason",
  );
  assert(
    result.ok === false && !("value" in result),
    "no success/value from an alternate source",
  );
});

Deno.test("12. normalizer config forwarded (explicit config is authority)", async () => {
  const calls: FakeCall[] = [];
  const configuredPrice = "price_explicit_forwarded_not_from_env";
  const raw = validRawSubscription({
    items: { data: [{ price: { id: configuredPrice } }] },
  });
  const stripe = createFakeStripe({ kind: "resolve", value: raw }, calls);

  const result = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe,
    config: { supportedProMonthlyPriceId: configuredPrice },
  });

  expectSuccess(result);
  assertEquals(result.value.plan_code, "paid", "uses forwarded Price config");

  // Wrong config → normalize failure proves config is forwarded as authority.
  const calls2: FakeCall[] = [];
  const stripe2 = createFakeStripe({ kind: "resolve", value: raw }, calls2);
  const failResult = await fetchNormalizedStripeSubscription({
    provider_subscription_id: SUB_ID,
    stripe: stripe2,
    config: { supportedProMonthlyPriceId: "price_different_from_raw" },
  });
  expectFailure(failResult, "normalize", "unsupported_price");
});
