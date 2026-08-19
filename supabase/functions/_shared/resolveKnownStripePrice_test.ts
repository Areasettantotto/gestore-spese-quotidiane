/**
 * Deno tests for resolveKnownStripePrice (BILLING-27).
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/_shared/resolveKnownStripePrice_test.ts
 *
 * No network/env/read/write capabilities required.
 * Price IDs are synthetic fixtures — not real Stripe catalog values.
 */

import type { ProductTier } from "./resolveEffectiveAccess.ts";
import {
  type BillingInterval,
  type KnownStripePrice,
  resolveKnownStripePrice,
  type ResolveKnownStripePriceFailureReason,
  type ResolveKnownStripePriceResult,
} from "./resolveKnownStripePrice.ts";

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

const PRICE_PRO_MONTHLY = "price_test_pro_monthly";
const PRICE_BASE_MONTHLY = "price_test_base_monthly";
const PRICE_PRO_ANNUAL = "price_test_pro_annual";

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
  result: ResolveKnownStripePriceResult,
): asserts result is Extract<ResolveKnownStripePriceResult, { ok: true }> {
  if (result.ok !== true) {
    throw new Error(`expected success, got failure reason=${result.reason}`);
  }
}

function expectFailure(
  result: ResolveKnownStripePriceResult,
  reason: ResolveKnownStripePriceFailureReason,
): void {
  if (result.ok !== false) {
    throw new Error("expected failure, got success");
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(!("value" in result), "failure must not return a partial value");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

function knownPrice(
  priceId: string,
  tier: ProductTier,
  interval: BillingInterval,
): KnownStripePrice {
  return { priceId, tier, interval };
}

function resolve(
  priceId: string,
  catalog: readonly KnownStripePrice[],
): ResolveKnownStripePriceResult {
  return resolveKnownStripePrice({ priceId, catalog });
}

Deno.test("1. exact known Pro monthly → success pro + monthly", () => {
  const entry = knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly");
  const result = resolve(PRICE_PRO_MONTHLY, [entry]);

  expectSuccess(result);
  assertEquals(result.value.priceId, PRICE_PRO_MONTHLY, "priceId");
  assertEquals(result.value.tier, "pro", "tier");
  assertEquals(result.value.interval, "monthly", "interval");
  assert(result.value === entry, "must preserve the catalog descriptor");
});

Deno.test("2. exact known Base monthly synthetic → success base + monthly", () => {
  const entry = knownPrice(PRICE_BASE_MONTHLY, "base", "monthly");
  const result = resolve(PRICE_BASE_MONTHLY, [entry]);

  expectSuccess(result);
  assertEquals(result.value.priceId, PRICE_BASE_MONTHLY, "priceId");
  assertEquals(result.value.tier, "base", "tier");
  assertEquals(result.value.interval, "monthly", "interval");
});

Deno.test("3. synthetic Pro annual → success pro + annual (not a new ProductTier)", () => {
  const entry = knownPrice(PRICE_PRO_ANNUAL, "pro", "annual");
  const result = resolve(PRICE_PRO_ANNUAL, [entry]);

  expectSuccess(result);
  assertEquals(result.value.priceId, PRICE_PRO_ANNUAL, "priceId");
  assertEquals(result.value.tier, "pro", "tier remains ProductTier pro");
  assertEquals(result.value.interval, "annual", "interval");
});

Deno.test("4. unknown price → unknown_price", () => {
  expectFailure(
    resolve("price_test_unknown", [
      knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly"),
    ]),
    "unknown_price",
  );
});

Deno.test("4b. empty catalog + valid priceId → unknown_price", () => {
  expectFailure(resolve(PRICE_PRO_MONTHLY, []), "unknown_price");
});

Deno.test("5. empty requested price → invalid_price_id", () => {
  expectFailure(
    resolve("", [knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly")]),
    "invalid_price_id",
  );
});

Deno.test("6. whitespace-only requested price → invalid_price_id", () => {
  for (const priceId of [" ", "   ", "\t", "\n"]) {
    expectFailure(
      resolve(priceId, [knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly")]),
      "invalid_price_id",
    );
  }
});

Deno.test("7. leading whitespace requested price → invalid_price_id", () => {
  expectFailure(
    resolve(` ${PRICE_PRO_MONTHLY}`, [
      knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly"),
    ]),
    "invalid_price_id",
  );
});

Deno.test("8. trailing whitespace requested price → invalid_price_id", () => {
  expectFailure(
    resolve(`${PRICE_PRO_MONTHLY} `, [
      knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly"),
    ]),
    "invalid_price_id",
  );
});

Deno.test("9. invalid catalog entry empty priceId → invalid_catalog_entry", () => {
  expectFailure(
    resolve(PRICE_PRO_MONTHLY, [
      knownPrice("", "pro", "monthly"),
    ]),
    "invalid_catalog_entry",
  );
});

Deno.test("10. invalid catalog entry padded priceId → invalid_catalog_entry", () => {
  for (
    const priceId of [
      ` ${PRICE_PRO_MONTHLY}`,
      `${PRICE_PRO_MONTHLY} `,
      ` ${PRICE_PRO_MONTHLY} `,
    ]
  ) {
    expectFailure(
      resolve(PRICE_PRO_MONTHLY, [
        knownPrice(priceId, "pro", "monthly"),
      ]),
      "invalid_catalog_entry",
    );
  }
});

Deno.test("11. duplicate exact priceId → duplicate_price_id", () => {
  expectFailure(
    resolve(PRICE_PRO_MONTHLY, [
      knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly"),
      knownPrice(PRICE_PRO_MONTHLY, "base", "annual"),
    ]),
    "duplicate_price_id",
  );
});

Deno.test("12. duplicate same descriptor → duplicate_price_id", () => {
  const entry = knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly");
  expectFailure(
    resolve(PRICE_PRO_MONTHLY, [entry, entry]),
    "duplicate_price_id",
  );
});

Deno.test("13. matching entry + unrelated invalid entry → invalid_catalog_entry", () => {
  expectFailure(
    resolve(PRICE_PRO_MONTHLY, [
      knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly"),
      knownPrice("", "base", "monthly"),
    ]),
    "invalid_catalog_entry",
  );
});

Deno.test("14. exact identity: no trim/casing normalization", () => {
  expectFailure(
    resolve("price_test_pro", [
      knownPrice("price_test_PRO", "pro", "monthly"),
    ]),
    "unknown_price",
  );
});

Deno.test("14b. catalog is not mutated", () => {
  const entry = knownPrice(PRICE_PRO_MONTHLY, "pro", "monthly");
  const catalog: KnownStripePrice[] = [entry];
  const snapshot = JSON.stringify(catalog);

  const result = resolve(PRICE_PRO_MONTHLY, catalog);

  expectSuccess(result);
  assertEquals(JSON.stringify(catalog), snapshot, "catalog array/entries");
  assert(catalog[0] === entry, "catalog entry identity");
});
