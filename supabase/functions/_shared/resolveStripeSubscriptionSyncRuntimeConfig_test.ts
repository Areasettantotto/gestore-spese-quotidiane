/**
 * Deno tests for resolveStripeSubscriptionSyncRuntimeConfig (BILLING-06 /
 * BILLING-38).
 *
 * Run:
 *   deno test supabase/functions/_shared/resolveStripeSubscriptionSyncRuntimeConfig_test.ts
 *
 * No network/env/write/run capabilities required.
 * Fixtures are synthetic and clearly fake — not real secrets or env values.
 */

import type { KnownStripePrice } from "./resolveKnownStripePrice.ts";
import {
  resolveStripeSubscriptionSyncRuntimeConfig,
  type ResolveStripeSubscriptionSyncRuntimeConfigFailureReason,
  type ResolveStripeSubscriptionSyncRuntimeConfigResult,
} from "./resolveStripeSubscriptionSyncRuntimeConfig.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const VALID_SECRET = "sk_test_fake";
const VALID_PRICE = "price_fake";

const NON_STRING_VALUES: unknown[] = [
  undefined,
  null,
  1,
  true,
  { nested: "sk_test_fake" },
  ["sk_test_fake"],
];

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
  result: ResolveStripeSubscriptionSyncRuntimeConfigResult,
): asserts result is Extract<
  ResolveStripeSubscriptionSyncRuntimeConfigResult,
  { ok: true }
> {
  if (result.ok !== true) {
    throw new Error(`expected success, got failure reason=${result.reason}`);
  }
}

function expectFailure(
  result: ResolveStripeSubscriptionSyncRuntimeConfigResult,
  reason: ResolveStripeSubscriptionSyncRuntimeConfigFailureReason,
): void {
  if (result.ok !== false) {
    throw new Error("expected failure, got success");
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(
    !("stripeSecretKey" in result),
    "failure must not return a partial stripeSecretKey",
  );
  assert(
    !("supportedProMonthlyPriceId" in result),
    "failure must not return a partial supportedProMonthlyPriceId",
  );
  assert(
    !("catalog" in result),
    "failure must not return a partial catalog",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes(VALID_SECRET),
    "failure must not contain the secret",
  );
  assert(
    !serialized.includes(VALID_PRICE),
    "failure must not contain the Price ID",
  );
}

function resolveWith(
  stripeSecretKey: unknown,
  supportedProMonthlyPriceId: unknown,
): ResolveStripeSubscriptionSyncRuntimeConfigResult {
  return resolveStripeSubscriptionSyncRuntimeConfig({
    stripeSecretKey,
    supportedProMonthlyPriceId,
  });
}

function assertOneEntryProMonthlyCatalog(
  catalog: readonly KnownStripePrice[],
  priceId: string,
): void {
  assert(Array.isArray(catalog), "catalog must be an array");
  assertEquals(catalog.length, 1, "catalog has exactly one entry");
  assertEquals(catalog[0]?.priceId, priceId, "catalog priceId");
  assertEquals(catalog[0]?.tier, "pro", "catalog tier");
  assertEquals(catalog[0]?.interval, "monthly", "catalog interval");
  const entry: KnownStripePrice | undefined = catalog[0];
  assert(entry !== undefined, "catalog must contain the Pro monthly entry");
  const known: KnownStripePrice = entry;
  assertEquals(
    Object.keys(known).sort(),
    ["interval", "priceId", "tier"].sort(),
    "KnownStripePrice public keys",
  );
}

Deno.test("A. success base returns exact fake values and public keys only", () => {
  const result = resolveWith(VALID_SECRET, VALID_PRICE);

  expectSuccess(result);
  assertEquals(
    result,
    {
      ok: true,
      stripeSecretKey: VALID_SECRET,
      catalog: [
        {
          priceId: VALID_PRICE,
          tier: "pro",
          interval: "monthly",
        },
      ],
    },
    "success payload",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["catalog", "ok", "stripeSecretKey"].sort(),
    "public success contract exposes only ok+stripeSecretKey+catalog",
  );
  assert(
    !("supportedProMonthlyPriceId" in result),
    "success must not expose supportedProMonthlyPriceId",
  );
  assertOneEntryProMonthlyCatalog(result.catalog, VALID_PRICE);
  assert(
    result.catalog[0]?.priceId === VALID_PRICE,
    "catalog priceId identity must match input (no canonicalization)",
  );
});

Deno.test("B. secret non-string → invalid_stripe_secret_key", () => {
  for (const secret of NON_STRING_VALUES) {
    expectFailure(
      resolveWith(secret, VALID_PRICE),
      "invalid_stripe_secret_key",
    );
  }
});

Deno.test("C. secret empty / whitespace-only → invalid_stripe_secret_key", () => {
  for (const secret of ["", " ", "\t", "\n"]) {
    expectFailure(
      resolveWith(secret, VALID_PRICE),
      "invalid_stripe_secret_key",
    );
  }
});

Deno.test("D. secret leading/trailing whitespace fails closed — no trim", () => {
  for (
    const secret of [
      " sk_test_fake",
      "sk_test_fake ",
      " sk_test_fake ",
      "\tsk_test_fake",
      "sk_test_fake\n",
    ]
  ) {
    expectFailure(
      resolveWith(secret, VALID_PRICE),
      "invalid_stripe_secret_key",
    );
  }
});

Deno.test("E. price non-string → invalid_supported_pro_monthly_price_id", () => {
  for (const price of NON_STRING_VALUES) {
    expectFailure(
      resolveWith(VALID_SECRET, price),
      "invalid_supported_pro_monthly_price_id",
    );
  }
});

Deno.test("F. price empty / whitespace-only → invalid_supported_pro_monthly_price_id", () => {
  for (const price of ["", " ", "\t", "\n"]) {
    expectFailure(
      resolveWith(VALID_SECRET, price),
      "invalid_supported_pro_monthly_price_id",
    );
  }
});

Deno.test("G. price leading/trailing whitespace fails closed — no trim", () => {
  for (
    const price of [
      " price_fake",
      "price_fake ",
      " price_fake ",
      "\tprice_fake",
      "price_fake\n",
    ]
  ) {
    expectFailure(
      resolveWith(VALID_SECRET, price),
      "invalid_supported_pro_monthly_price_id",
    );
  }
});

Deno.test("H. both invalid → invalid_stripe_secret_key (fail-closed order)", () => {
  expectFailure(
    resolveWith("", ""),
    "invalid_stripe_secret_key",
  );
  expectFailure(
    resolveWith(null, undefined),
    "invalid_stripe_secret_key",
  );
});

Deno.test("J. exact success values — no trim/lowercase/prefix/canonicalization", () => {
  const secret = "fake-secret-value";
  const price = "provider-price-value";
  const result = resolveWith(secret, price);

  expectSuccess(result);
  assertEquals(result.stripeSecretKey, secret, "secret returned exactly");
  assert(
    !("supportedProMonthlyPriceId" in result),
    "success must not expose supportedProMonthlyPriceId",
  );
  assertOneEntryProMonthlyCatalog(result.catalog, price);
  assert(
    result.stripeSecretKey === secret,
    "secret identity must match input (no canonicalization)",
  );
  assert(
    result.catalog[0]?.priceId === price,
    "catalog priceId identity must match input (no canonicalization)",
  );
});

Deno.test("K. clean values without sk_test_ / price_ prefixes succeed", () => {
  const secret = "clean-secret-value";
  const price = "clean-monthly-id";
  const result = resolveWith(secret, price);

  expectSuccess(result);
  assertEquals(result.stripeSecretKey, secret, "no sk_test_ prefix required");
  assertOneEntryProMonthlyCatalog(result.catalog, price);
});

Deno.test("L. internal whitespace remains accepted (current contract, not a new policy)", () => {
  const secret = "fake secret internal";
  const price = "provider price internal";
  const result = resolveWith(secret, price);

  expectSuccess(result);
  assertEquals(
    result.stripeSecretKey,
    secret,
    "internal whitespace in secret is currently accepted as-is",
  );
  assertOneEntryProMonthlyCatalog(result.catalog, price);
  assertEquals(
    result.catalog[0]?.priceId,
    price,
    "internal whitespace in price is currently accepted as-is",
  );
});
