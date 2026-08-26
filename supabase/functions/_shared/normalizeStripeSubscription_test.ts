/**
 * Deno tests for normalizeStripeSubscription (I4.3BE).
 *
 * Run (when Deno is available):
 *   deno test supabase/functions/_shared/normalizeStripeSubscription_test.ts
 *
 * No new dependencies. Does not touch DB / Stripe / network.
 */

import {
  extractStripeCustomerId,
  normalizeStripeSubscription,
  type NormalizedStripeSubscription,
  type NormalizeStripeSubscriptionConfig,
  type NormalizeStripeSubscriptionResult,
  type StripeSubscriptionLike,
  unixSecondsToTimestamptz,
} from "./normalizeStripeSubscription.ts";
import type { KnownStripePrice } from "./resolveKnownStripePrice.ts";

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

const SUPPORTED_PRICE = "price_test_pro_monthly_supported";

const PRO_MONTHLY_ENTRY: KnownStripePrice = {
  priceId: SUPPORTED_PRICE,
  tier: "pro",
  interval: "monthly",
};

const CONFIG: NormalizeStripeSubscriptionConfig = {
  catalog: [PRO_MONTHLY_ENTRY],
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}\n  actual:   ${actualJson}\n  expected: ${expectedJson}`,
    );
  }
}

function baseSubscription(
  overrides: Partial<StripeSubscriptionLike> = {},
): StripeSubscriptionLike {
  return {
    id: "sub_test_1",
    customer: "cus_test_1",
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

function expectSuccess(
  result: NormalizeStripeSubscriptionResult,
): asserts result is Extract<NormalizeStripeSubscriptionResult, { ok: true }> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: NormalizeStripeSubscriptionResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
}

function expectInvalidItemsForBothPriceForms(priceId: string): void {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: { data: [{ price: { id: priceId } }] },
      }),
      CONFIG,
    ),
    "invalid_items",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: { data: [{ price: priceId }] },
      }),
      CONFIG,
    ),
    "invalid_items",
  );
}

Deno.test("1. active + supported paid product → success", () => {
  const result = normalizeStripeSubscription(baseSubscription(), CONFIG);
  expectSuccess(result);
  assertEquals(result.value.status, "active", "status");
  assertEquals(result.value.plan_code, "paid", "plan_code");
  assertEquals(result.value.productTier, "pro", "productTier from catalog");
  assertEquals(
    result.value.provider_subscription_id,
    "sub_test_1",
    "subscription id",
  );
  assertEquals(result.value.provider_customer_id, "cus_test_1", "customer id");
});

Deno.test("2. trialing + valid trial_end + supported product → success, plan_code paid", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({
      status: "trialing",
      trial_end: 1_700_100_000,
    }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.status, "trialing", "status");
  assertEquals(
    result.value.plan_code,
    "paid",
    "plan_code stays paid (NP-A / D7)",
  );
  assertEquals(
    result.value.trial_ends_at,
    "2023-11-16T02:00:00.000Z",
    "trial_ends_at",
  );
});

Deno.test("3. trialing without valid trial_end → failure", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ status: "trialing", trial_end: null }),
      CONFIG,
    ),
    "missing_trial_end",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ status: "trialing", trial_end: -1 }),
      CONFIG,
    ),
    "invalid_trial_end",
  );
});

Deno.test("4. past_due → detailed status preserved", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({ status: "past_due" }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.status, "past_due", "status");
});

Deno.test("5. unpaid → unpaid, NOT suspended", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({ status: "unpaid" }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.status, "unpaid", "status");
});

Deno.test("6. paused → paused, NOT suspended", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({ status: "paused" }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.status, "paused", "status");
});

Deno.test("7. incomplete → incomplete, NOT suspended", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({ status: "incomplete" }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.status, "incomplete", "status");
});

Deno.test("8. canceled → canceled", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({ status: "canceled" }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.status, "canceled", "status");
});

Deno.test("9. incomplete_expired → incomplete_expired", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({ status: "incomplete_expired" }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.status, "incomplete_expired", "status");
});

Deno.test("10. unexpected provider status → failure", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ status: "something_else" }),
      CONFIG,
    ),
    "unsupported_status",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ status: "suspended" }),
      CONFIG,
    ),
    "unsupported_status",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ status: "unknown" }),
      CONFIG,
    ),
    "unsupported_status",
  );
});

Deno.test("11. unsupported product/price → failure", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: { data: [{ price: { id: "price_other_unsupported" } }] },
      }),
      CONFIG,
    ),
    "unsupported_price",
  );
});

Deno.test("12. incompatible plan metadata → failure", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: "trial" } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: "free" } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: "demo" } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: "internal" } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: "paid" } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: "enterprise_yearly" } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
  // Checkout request alias `pro` is NOT accepted as Subscription metadata.
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: "pro" } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
  // No casing / whitespace canonicalization of provider metadata.
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: "PRO_MONTHLY" } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ metadata: { plan_code: " pro_monthly " } }),
      CONFIG,
    ),
    "incompatible_plan_metadata",
  );
});

Deno.test("13. customer as string → extracted", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({ customer: "cus_string_form" }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(
    result.value.provider_customer_id,
    "cus_string_form",
    "customer",
  );
});

Deno.test("14. customer as expanded object → extracted", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({
      customer: { id: "cus_expanded_form", object: "customer" },
    }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(
    result.value.provider_customer_id,
    "cus_expanded_form",
    "customer",
  );
  assertEquals(
    extractStripeCustomerId({ id: "cus_helper" }),
    "cus_helper",
    "helper expanded",
  );
});

Deno.test("15. missing/invalid customer → failure", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ customer: null }),
      CONFIG,
    ),
    "invalid_customer",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ customer: "" }),
      CONFIG,
    ),
    "invalid_customer",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ customer: { id: 123 } }),
      CONFIG,
    ),
    "invalid_customer",
  );
});

Deno.test("16. valid timestamp → deterministic ISO/timestamptz-compatible", () => {
  const converted = unixSecondsToTimestamptz(1_700_000_000);
  if (converted.ok !== true) {
    throw new Error("conversion ok");
  }
  assertEquals(
    converted.value,
    "2023-11-14T22:13:20.000Z",
    "fixed unix → fixed ISO",
  );

  const result = normalizeStripeSubscription(baseSubscription(), CONFIG);
  expectSuccess(result);
  assertEquals(
    result.value.current_period_start,
    "2023-11-14T22:13:20.000Z",
    "period start",
  );
  assertEquals(
    result.value.current_period_end,
    "2023-11-18T00:26:40.000Z",
    "period end",
  );
});

Deno.test("17. invalid timestamp → failure", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ current_period_start: 1.5 }),
      CONFIG,
    ),
    "invalid_timestamp",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ current_period_end: -10 }),
      CONFIG,
    ),
    "invalid_timestamp",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ current_period_start: "1700000000" }),
      CONFIG,
    ),
    "invalid_timestamp",
  );
});

Deno.test("18. cancel_at_period_end preserved", () => {
  const resultTrue = normalizeStripeSubscription(
    baseSubscription({ cancel_at_period_end: true }),
    CONFIG,
  );
  expectSuccess(resultTrue);
  assertEquals(resultTrue.value.cancel_at_period_end, true, "true preserved");

  const resultFalse = normalizeStripeSubscription(
    baseSubscription({ cancel_at_period_end: false }),
    CONFIG,
  );
  expectSuccess(resultFalse);
  assertEquals(
    resultFalse.value.cancel_at_period_end,
    false,
    "false preserved",
  );

  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ cancel_at_period_end: "true" }),
      CONFIG,
    ),
    "invalid_cancel_at_period_end",
  );
});

Deno.test("19. no dependency on now()/current Date in result", () => {
  const input = baseSubscription({
    current_period_start: 1_600_000_000,
    current_period_end: 1_600_086_400,
  });
  const first = normalizeStripeSubscription(input, CONFIG);
  const second = normalizeStripeSubscription(input, CONFIG);
  expectSuccess(first);
  expectSuccess(second);
  assertEquals(first, second, "deterministic across calls");
  assertEquals(
    first.value.current_period_start,
    "2020-09-13T12:26:40.000Z",
    "fixed start",
  );
  assertEquals(
    first.value.current_period_end,
    "2020-09-14T12:26:40.000Z",
    "fixed end",
  );
});

Deno.test("extra: price as string id + missing metadata plan_code still paid", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({
      metadata: {},
      items: { data: [{ price: SUPPORTED_PRICE }] },
    }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.plan_code, "paid", "plan_code");
});

Deno.test("extra: null period timestamps allowed → null output", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({
      current_period_start: null,
      current_period_end: null,
    }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.current_period_start, null, "start null");
  assertEquals(result.value.current_period_end, null, "end null");
});

Deno.test("extra: padded catalog entry → invalid_config", () => {
  expectFailure(
    normalizeStripeSubscription(baseSubscription(), {
      catalog: [{
        priceId: ` ${SUPPORTED_PRICE} `,
        tier: "pro",
        interval: "monthly",
      }],
    }),
    "invalid_config",
  );
});

Deno.test("extra: empty catalog + valid item Price → unsupported_price", () => {
  expectFailure(
    normalizeStripeSubscription(baseSubscription(), { catalog: [] }),
    "unsupported_price",
  );
});

Deno.test("extra: duplicate exact catalog priceId → invalid_config", () => {
  expectFailure(
    normalizeStripeSubscription(baseSubscription(), {
      catalog: [PRO_MONTHLY_ENTRY, PRO_MONTHLY_ENTRY],
    }),
    "invalid_config",
  );
});

Deno.test("extra: exact known item Price as string and object id → success", () => {
  const asObject = normalizeStripeSubscription(baseSubscription(), CONFIG);
  expectSuccess(asObject);
  assertEquals(asObject.value.plan_code, "paid", "object id exact known");

  const asString = normalizeStripeSubscription(
    baseSubscription({
      items: { data: [{ price: SUPPORTED_PRICE }] },
    }),
    CONFIG,
  );
  expectSuccess(asString);
  assertEquals(asString.value.plan_code, "paid", "string id exact known");
});

Deno.test(
  "extra: padded item Price is not trim-repaired before catalog lookup (exact-ID fail-closed)",
  () => {
    expectInvalidItemsForBothPriceForms(` ${SUPPORTED_PRICE}`);
    expectInvalidItemsForBothPriceForms(`${SUPPORTED_PRICE} `);
    expectInvalidItemsForBothPriceForms(` ${SUPPORTED_PRICE} `);
  },
);

Deno.test("extra: whitespace-only item Price → invalid_items", () => {
  expectInvalidItemsForBothPriceForms("   ");
});

Deno.test("extra: empty-string item Price → invalid_items", () => {
  expectInvalidItemsForBothPriceForms("");
});

Deno.test("extra: padded unknown item Price → invalid_items (not unsupported_price)", () => {
  expectInvalidItemsForBothPriceForms(" price_unknown ");
});

Deno.test("extra: exact unknown item Price as string and object id → unsupported_price", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: { data: [{ price: { id: "price_unknown_exact" } }] },
      }),
      CONFIG,
    ),
    "unsupported_price",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: { data: [{ price: "price_unknown_exact" }] },
      }),
      CONFIG,
    ),
    "unsupported_price",
  );
});

Deno.test("extra: missing or malformed item Price → invalid_items", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: { data: [{}] },
      }),
      CONFIG,
    ),
    "invalid_items",
  );
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: { data: [{ price: { object: "price" } }] },
      }),
      CONFIG,
    ),
    "invalid_items",
  );
});

Deno.test("extra: absent metadata + known catalog Price still paid", () => {
  const result = normalizeStripeSubscription(
    baseSubscription({ metadata: undefined }),
    CONFIG,
  );
  expectSuccess(result);
  assertEquals(result.value.plan_code, "paid", "plan_code");
});

Deno.test("F1: multi-item both supported → invalid_items", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: {
          data: [
            { price: { id: SUPPORTED_PRICE } },
            { price: { id: SUPPORTED_PRICE } },
          ],
        },
      }),
      CONFIG,
    ),
    "invalid_items",
  );
});

Deno.test("F1: multi-item one supported one other → invalid_items", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        items: {
          data: [
            { price: { id: SUPPORTED_PRICE } },
            { price: { id: "price_other_unsupported" } },
          ],
        },
      }),
      CONFIG,
    ),
    "invalid_items",
  );
});

Deno.test("F1: zero items → invalid_items", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ items: { data: [] } }),
      CONFIG,
    ),
    "invalid_items",
  );
});

/** Just beyond ECMAScript Date TimeClip (±8.64e15 ms); still under MAX_SAFE_UNIX_SECONDS. */
const UNIX_OUTSIDE_DATE_RANGE = 8_640_000_000_001;

Deno.test("F1: unixSecondsToTimestamptz outside Date range → {ok:false} without throw", () => {
  let threw = false;
  let converted: ReturnType<typeof unixSecondsToTimestamptz> | undefined;
  try {
    converted = unixSecondsToTimestamptz(UNIX_OUTSIDE_DATE_RANGE);
  } catch {
    threw = true;
  }
  assert(threw === false, "must not throw");
  assertEquals(converted, { ok: false }, "out-of-range Date → fail closed");
});

Deno.test("F1: current_period_start outside Date range → invalid_timestamp", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({ current_period_start: UNIX_OUTSIDE_DATE_RANGE }),
      CONFIG,
    ),
    "invalid_timestamp",
  );
});

Deno.test("F1: trial_end outside Date range while trialing → invalid_trial_end", () => {
  expectFailure(
    normalizeStripeSubscription(
      baseSubscription({
        status: "trialing",
        trial_end: UNIX_OUTSIDE_DATE_RANGE,
      }),
      CONFIG,
    ),
    "invalid_trial_end",
  );
});

type _AssertNoIntervalOnNormalized =
  "interval" extends keyof NormalizedStripeSubscription ? never : true;
const _assertNoIntervalOnNormalized: _AssertNoIntervalOnNormalized = true;
void _assertNoIntervalOnNormalized;

type _AssertProductTierNotPlanCode =
  NormalizedStripeSubscription["productTier"] extends
    NormalizedStripeSubscription["plan_code"] ? never
    : true;
const _assertProductTierNotPlanCode: _AssertProductTierNotPlanCode = true;
void _assertProductTierNotPlanCode;

Deno.test(
  "BILLING-57: Pro Monthly KnownStripePrice.tier is preserved as productTier; plan_code stays paid",
  () => {
    const result = normalizeStripeSubscription(baseSubscription(), CONFIG);
    expectSuccess(result);
    assertEquals(result.value.productTier, "pro", "catalog Pro Monthly");
    assertEquals(result.value.plan_code, "paid", "plan_code axis unchanged");
    assertEquals(
      Object.prototype.hasOwnProperty.call(result.value, "interval"),
      false,
      "interval is not on the normalized contract",
    );
    assertEquals(
      result.value.productTier,
      PRO_MONTHLY_ENTRY.tier,
      "productTier is KnownStripePrice.tier, not reinterpreted",
    );
  },
);

Deno.test(
  "BILLING-57: synthetic Base catalog entry → productTier base, not derived from plan_code",
  () => {
    const baseEntry: KnownStripePrice = {
      priceId: "price_test_base_monthly_synthetic",
      tier: "base",
      interval: "monthly",
    };
    const result = normalizeStripeSubscription(
      baseSubscription({
        metadata: { plan_code: "pro_monthly" },
        items: {
          data: [{ price: { id: "price_test_base_monthly_synthetic" } }],
        },
      }),
      { catalog: [baseEntry] },
    );
    expectSuccess(result);
    assertEquals(
      result.value.productTier,
      "base",
      "productTier from KnownStripePrice.tier",
    );
    assertEquals(
      result.value.plan_code,
      "paid",
      "plan_code stays paid; not remapped to base",
    );
  },
);

Deno.test(
  "BILLING-57: unknown Price remains fail-closed; no partial productTier",
  () => {
    const result = normalizeStripeSubscription(
      baseSubscription({
        items: { data: [{ price: { id: "price_unknown_exact" } }] },
      }),
      CONFIG,
    );
    expectFailure(result, "unsupported_price");
    assertEquals(
      Object.prototype.hasOwnProperty.call(result, "value"),
      false,
      "fail-closed: no partial normalized value",
    );
  },
);
