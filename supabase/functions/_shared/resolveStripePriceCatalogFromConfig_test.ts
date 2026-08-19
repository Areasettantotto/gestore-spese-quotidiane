/**
 * Deno tests for resolveStripePriceCatalogFromConfig (BILLING-29).
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/_shared/resolveStripePriceCatalogFromConfig_test.ts
 *
 * No network/env/read/write capabilities required.
 * Price IDs are synthetic fixtures — not real Stripe catalog values.
 */

import type { KnownStripePrice } from "./resolveKnownStripePrice.ts";
import {
  resolveStripePriceCatalogFromConfig,
  type ResolveStripePriceCatalogFromConfigFailureReason,
  type ResolveStripePriceCatalogFromConfigResult,
} from "./resolveStripePriceCatalogFromConfig.ts";

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

const PRICE_PRO_MONTHLY = "price_test_pro_monthly";

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
  result: ResolveStripePriceCatalogFromConfigResult,
): asserts result is Extract<
  ResolveStripePriceCatalogFromConfigResult,
  { ok: true }
> {
  if (result.ok !== true) {
    throw new Error(`expected success, got failure reason=${result.reason}`);
  }
}

function expectFailure(
  result: ResolveStripePriceCatalogFromConfigResult,
  reason: ResolveStripePriceCatalogFromConfigFailureReason,
): void {
  if (result.ok !== false) {
    throw new Error("expected failure, got success");
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(!("catalog" in result), "failure must not return a partial catalog");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

function resolve(
  proMonthlyPriceId: unknown,
): ResolveStripePriceCatalogFromConfigResult {
  return resolveStripePriceCatalogFromConfig({ proMonthlyPriceId });
}

Deno.test("1. valid synthetic Pro monthly → ok catalog of one exact entry", () => {
  const result = resolve(PRICE_PRO_MONTHLY);

  expectSuccess(result);
  assertEquals(result.catalog.length, 1, "catalog length");
  assertEquals(result.catalog[0]?.priceId, PRICE_PRO_MONTHLY, "priceId");
  assertEquals(result.catalog[0]?.tier, "pro", "tier");
  assertEquals(result.catalog[0]?.interval, "monthly", "interval");
  assertEquals(
    Object.keys(result).sort(),
    ["catalog", "ok"].sort(),
    "public success contract exposes only ok+catalog",
  );
});

Deno.test("2. success entry is assignable to KnownStripePrice", () => {
  const result = resolve(PRICE_PRO_MONTHLY);

  expectSuccess(result);
  const entry: KnownStripePrice | undefined = result.catalog[0];
  assert(entry !== undefined, "catalog must contain the Pro monthly entry");
  const known: KnownStripePrice = entry;
  assertEquals(
    Object.keys(known).sort(),
    ["interval", "priceId", "tier"].sort(),
    "KnownStripePrice public keys",
  );
  assertEquals(known.priceId, PRICE_PRO_MONTHLY, "priceId");
  assertEquals(known.tier, "pro", "tier");
  assertEquals(known.interval, "monthly", "interval");
});

Deno.test("3. undefined → invalid_pro_monthly_price_id", () => {
  expectFailure(resolve(undefined), "invalid_pro_monthly_price_id");
});

Deno.test("4. null → invalid_pro_monthly_price_id", () => {
  expectFailure(resolve(null), "invalid_pro_monthly_price_id");
});

Deno.test("5. number → invalid_pro_monthly_price_id", () => {
  expectFailure(resolve(1), "invalid_pro_monthly_price_id");
});

Deno.test("6. object → invalid_pro_monthly_price_id", () => {
  expectFailure(
    resolve({ nested: PRICE_PRO_MONTHLY }),
    "invalid_pro_monthly_price_id",
  );
});

Deno.test("7. array → invalid_pro_monthly_price_id", () => {
  expectFailure(resolve([PRICE_PRO_MONTHLY]), "invalid_pro_monthly_price_id");
});

Deno.test("8. empty → invalid_pro_monthly_price_id", () => {
  expectFailure(resolve(""), "invalid_pro_monthly_price_id");
});

Deno.test("9. whitespace-only → invalid_pro_monthly_price_id", () => {
  for (const priceId of [" ", "   ", "\t", "\n"]) {
    expectFailure(resolve(priceId), "invalid_pro_monthly_price_id");
  }
});

Deno.test("10. leading whitespace → invalid_pro_monthly_price_id", () => {
  expectFailure(
    resolve(` ${PRICE_PRO_MONTHLY}`),
    "invalid_pro_monthly_price_id",
  );
});

Deno.test("11. trailing whitespace → invalid_pro_monthly_price_id", () => {
  expectFailure(
    resolve(`${PRICE_PRO_MONTHLY} `),
    "invalid_pro_monthly_price_id",
  );
});

Deno.test("12. exact value preserved — no trim/case normalization", () => {
  const priceId = "Price_Test_Pro_Monthly";
  const result = resolve(priceId);

  expectSuccess(result);
  assertEquals(result.catalog[0]?.priceId, priceId, "priceId returned exactly");
  assert(
    result.catalog[0]?.priceId === priceId,
    "priceId identity must match input (no canonicalization)",
  );
});

Deno.test("13. internal whitespace accepted when outer identity is exact", () => {
  const priceId = "price_test pro monthly";
  const result = resolve(priceId);

  expectSuccess(result);
  assertEquals(
    result.catalog[0]?.priceId,
    priceId,
    "internal whitespace is currently accepted as-is",
  );
});

Deno.test("14. success never returns an empty catalog", () => {
  const result = resolve(PRICE_PRO_MONTHLY);

  expectSuccess(result);
  assert(result.catalog.length > 0, "success must not return catalog=[]");
  assertEquals(
    result.catalog.length,
    1,
    "current catalog has exactly one slot",
  );
});
