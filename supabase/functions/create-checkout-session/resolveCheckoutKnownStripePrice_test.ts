/**
 * Deno tests for resolveCheckoutKnownStripePrice (BILLING-34).
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/create-checkout-session/resolveCheckoutKnownStripePrice_test.ts
 *
 * No network/env/read/write capabilities required.
 * Price IDs are synthetic fixtures — not real Stripe catalog values.
 */

import type { ProductTier } from "../_shared/resolveEffectiveAccess.ts";
import type { BillingInterval } from "../_shared/resolveKnownStripePrice.ts";
import {
  resolveCheckoutKnownStripePrice,
  type ResolveCheckoutKnownStripePriceFailureReason,
  type ResolveCheckoutKnownStripePriceResult,
} from "./resolveCheckoutKnownStripePrice.ts";

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

const PRICE_PRO_MONTHLY = "price_pro_monthly_test";

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

function expectSuccess(
  result: ResolveCheckoutKnownStripePriceResult,
): asserts result is Extract<
  ResolveCheckoutKnownStripePriceResult,
  { ok: true }
> {
  if (result.ok !== true) {
    throw new Error(`expected success, got failure reason=${result.reason}`);
  }
}

function expectFailure(
  result: ResolveCheckoutKnownStripePriceResult,
  reason?: ResolveCheckoutKnownStripePriceFailureReason,
): void {
  if (result.ok !== false) {
    throw new Error("expected failure, got success");
  }
  if (reason !== undefined) {
    assertEquals(result.reason, reason, "failure reason");
  }
  assert(!("value" in result), "failure must not return a descriptor");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

function resolve(
  proMonthlyPriceId: unknown,
  tier: ProductTier = "pro",
  interval: BillingInterval = "monthly",
): ResolveCheckoutKnownStripePriceResult {
  return resolveCheckoutKnownStripePrice({
    proMonthlyPriceId,
    tier,
    interval,
  });
}

Deno.test("1. happy path: exact Pro monthly → descriptor with identical priceId", () => {
  const result = resolve(PRICE_PRO_MONTHLY, "pro", "monthly");

  expectSuccess(result);
  assertEquals(result.value.priceId, PRICE_PRO_MONTHLY, "priceId");
  assert(result.value.priceId === PRICE_PRO_MONTHLY, "priceId identity");
  assertEquals(result.value.tier, "pro", "tier");
  assertEquals(result.value.interval, "monthly", "interval");
});

Deno.test("2. leading padding → failure, no descriptor", () => {
  expectFailure(resolve(` ${PRICE_PRO_MONTHLY}`));
});

Deno.test("3. trailing padding → failure, no descriptor", () => {
  expectFailure(resolve(`${PRICE_PRO_MONTHLY} `));
});

Deno.test("4. whitespace-only → failure, no descriptor", () => {
  expectFailure(resolve("   "));
});

Deno.test("5. empty and undefined → failure, no descriptor", () => {
  expectFailure(resolve(""));
  expectFailure(resolve(undefined));
});

Deno.test("6. padded Price ID is rejected, not trim-repaired", () => {
  const padded = ` ${PRICE_PRO_MONTHLY}`;
  const paddedResult = resolve(padded, "pro", "monthly");

  expectFailure(paddedResult);
  assert(
    !("value" in paddedResult),
    "padded input must not yield a descriptor",
  );

  const exactResult = resolve(PRICE_PRO_MONTHLY, "pro", "monthly");
  expectSuccess(exactResult);
  assertEquals(exactResult.value.priceId, PRICE_PRO_MONTHLY, "exact priceId");
  assert(
    exactResult.value.priceId !== padded,
    "success descriptor must not be the padded input",
  );
  assert(
    padded.trim() === PRICE_PRO_MONTHLY,
    "fixture: padded input would become the exact Price ID only if trimmed",
  );
});

Deno.test("7. unsupported selection vs singleton Pro monthly catalog → failure", () => {
  expectFailure(
    resolve(PRICE_PRO_MONTHLY, "base", "monthly"),
    "unsupported_selection",
  );
  expectFailure(
    resolve(PRICE_PRO_MONTHLY, "pro", "annual"),
    "unsupported_selection",
  );
});
