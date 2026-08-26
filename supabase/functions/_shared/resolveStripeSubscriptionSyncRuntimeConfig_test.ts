/**
 * Deno tests for resolveStripeSubscriptionSyncRuntimeConfig (BILLING-06 /
 * BILLING-38 / BILLING-60).
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/_shared/resolveStripeSubscriptionSyncRuntimeConfig_test.ts
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
const PRICE_PRO_MONTHLY = "price_test_pro_monthly";
const PRICE_BASE_MONTHLY = "price_test_base_monthly";
const PRICE_BASE_ANNUAL = "price_test_base_annual";
const PRICE_PRO_ANNUAL = "price_test_pro_annual";

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

function fourSlotParams() {
  return {
    stripeSecretKey: VALID_SECRET,
    supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
    supportedBaseMonthlyPriceId: PRICE_BASE_MONTHLY,
    supportedBaseAnnualPriceId: PRICE_BASE_ANNUAL,
    supportedProAnnualPriceId: PRICE_PRO_ANNUAL,
  };
}

function findByAxes(
  catalog: readonly KnownStripePrice[],
  tier: KnownStripePrice["tier"],
  interval: KnownStripePrice["interval"],
): KnownStripePrice | undefined {
  return catalog.find((entry) =>
    entry.tier === tier && entry.interval === interval
  );
}

function assertSuccessPublicKeys(
  result: Extract<
    ResolveStripeSubscriptionSyncRuntimeConfigResult,
    { ok: true }
  >,
): void {
  assertEquals(
    Object.keys(result).sort(),
    ["catalog", "ok", "stripeSecretKey"].sort(),
    "public success contract exposes only ok+stripeSecretKey+catalog",
  );
  assert(
    !("supportedProMonthlyPriceId" in result),
    "success must not expose supportedProMonthlyPriceId",
  );
  assert(
    !("supportedBaseMonthlyPriceId" in result),
    "success must not expose supportedBaseMonthlyPriceId",
  );
  assert(
    !("supportedBaseAnnualPriceId" in result),
    "success must not expose supportedBaseAnnualPriceId",
  );
  assert(
    !("supportedProAnnualPriceId" in result),
    "success must not expose supportedProAnnualPriceId",
  );
}

Deno.test("M. legacy Pro Monthly singleton is unchanged", () => {
  const result = resolveStripeSubscriptionSyncRuntimeConfig({
    stripeSecretKey: VALID_SECRET,
    supportedProMonthlyPriceId: VALID_PRICE,
  });

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
    "legacy singleton payload",
  );
  assertSuccessPublicKeys(result);
  assertOneEntryProMonthlyCatalog(result.catalog, VALID_PRICE);
  assert(
    findByAxes(result.catalog, "base", "monthly") === undefined,
    "Base Monthly must be absent when not supplied",
  );
  assert(
    findByAxes(result.catalog, "base", "annual") === undefined,
    "Base Annual must be absent when not supplied",
  );
  assert(
    findByAxes(result.catalog, "pro", "annual") === undefined,
    "Pro Annual must be absent when not supplied",
  );
});

Deno.test("N. four valid Price IDs → success catalog of four entries", () => {
  const result = resolveStripeSubscriptionSyncRuntimeConfig(fourSlotParams());

  expectSuccess(result);
  assertEquals(result.stripeSecretKey, VALID_SECRET, "secret");
  assertEquals(result.catalog.length, 4, "catalog length");
  const priceIds = result.catalog.map((entry) => entry.priceId);
  assertEquals(new Set(priceIds).size, 4, "four distinct Price IDs");
  assertSuccessPublicKeys(result);
});

Deno.test("O. Base Monthly maps to tier base / interval monthly", () => {
  const result = resolveStripeSubscriptionSyncRuntimeConfig(fourSlotParams());

  expectSuccess(result);
  const entry = findByAxes(result.catalog, "base", "monthly");
  assert(entry !== undefined, "Base Monthly entry must exist");
  assertEquals(entry?.tier, "base", "tier");
  assertEquals(entry?.interval, "monthly", "interval");
});

Deno.test("P. Base Annual maps to tier base / interval annual", () => {
  const result = resolveStripeSubscriptionSyncRuntimeConfig(fourSlotParams());

  expectSuccess(result);
  const entry = findByAxes(result.catalog, "base", "annual");
  assert(entry !== undefined, "Base Annual entry must exist");
  assertEquals(entry?.tier, "base", "tier");
  assertEquals(entry?.interval, "annual", "interval");
});

Deno.test("Q. Pro Monthly maps to tier pro / interval monthly", () => {
  const result = resolveStripeSubscriptionSyncRuntimeConfig(fourSlotParams());

  expectSuccess(result);
  const entry = findByAxes(result.catalog, "pro", "monthly");
  assert(entry !== undefined, "Pro Monthly entry must exist");
  assertEquals(entry?.tier, "pro", "tier");
  assertEquals(entry?.interval, "monthly", "interval");
});

Deno.test("R. Pro Annual maps to tier pro / interval annual", () => {
  const result = resolveStripeSubscriptionSyncRuntimeConfig(fourSlotParams());

  expectSuccess(result);
  const entry = findByAxes(result.catalog, "pro", "annual");
  assert(entry !== undefined, "Pro Annual entry must exist");
  assertEquals(entry?.tier, "pro", "tier");
  assertEquals(entry?.interval, "annual", "interval");
});

Deno.test("S. catalog Price IDs are exactly the caller-supplied values", () => {
  const params = fourSlotParams();
  const result = resolveStripeSubscriptionSyncRuntimeConfig(params);

  expectSuccess(result);
  assertEquals(
    findByAxes(result.catalog, "base", "monthly")?.priceId,
    params.supportedBaseMonthlyPriceId,
    "Base Monthly Price ID",
  );
  assertEquals(
    findByAxes(result.catalog, "base", "annual")?.priceId,
    params.supportedBaseAnnualPriceId,
    "Base Annual Price ID",
  );
  assertEquals(
    findByAxes(result.catalog, "pro", "monthly")?.priceId,
    params.supportedProMonthlyPriceId,
    "Pro Monthly Price ID",
  );
  assertEquals(
    findByAxes(result.catalog, "pro", "annual")?.priceId,
    params.supportedProAnnualPriceId,
    "Pro Annual Price ID",
  );
  assert(
    findByAxes(result.catalog, "base", "monthly")?.priceId ===
      params.supportedBaseMonthlyPriceId,
    "Base Monthly identity must match input (no canonicalization)",
  );
  assert(
    findByAxes(result.catalog, "pro", "annual")?.priceId ===
      params.supportedProAnnualPriceId,
    "Pro Annual identity must match input (no canonicalization)",
  );
  const returned = result.catalog.map((entry) => entry.priceId).sort();
  const supplied = [
    params.supportedBaseMonthlyPriceId,
    params.supportedBaseAnnualPriceId,
    params.supportedProMonthlyPriceId,
    params.supportedProAnnualPriceId,
  ].sort();
  assertEquals(returned, supplied, "catalog Price IDs equal caller inputs");
});

Deno.test("T. partial config → only configured slots, no fallback", () => {
  const result = resolveStripeSubscriptionSyncRuntimeConfig({
    stripeSecretKey: VALID_SECRET,
    supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
    supportedBaseAnnualPriceId: PRICE_BASE_ANNUAL,
  });

  expectSuccess(result);
  assertEquals(result.catalog.length, 2, "only configured slots");
  assertEquals(
    findByAxes(result.catalog, "pro", "monthly")?.priceId,
    PRICE_PRO_MONTHLY,
    "Pro Monthly",
  );
  assertEquals(
    findByAxes(result.catalog, "base", "annual")?.priceId,
    PRICE_BASE_ANNUAL,
    "Base Annual",
  );
  assert(
    findByAxes(result.catalog, "base", "monthly") === undefined,
    "must not fill Base Monthly from another slot",
  );
  assert(
    findByAxes(result.catalog, "pro", "annual") === undefined,
    "must not fill Pro Annual from another slot",
  );
  assertSuccessPublicKeys(result);
});

Deno.test("U. invalid optional Base Monthly → invalid_supported_base_monthly_price_id", () => {
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseMonthlyPriceId: ` ${PRICE_BASE_MONTHLY}`,
    }),
    "invalid_supported_base_monthly_price_id",
  );
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseMonthlyPriceId: "",
    }),
    "invalid_supported_base_monthly_price_id",
  );
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseMonthlyPriceId: null,
    }),
    "invalid_supported_base_monthly_price_id",
  );
});

Deno.test("V. invalid optional Base Annual → invalid_supported_base_annual_price_id", () => {
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseAnnualPriceId: "",
    }),
    "invalid_supported_base_annual_price_id",
  );
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseAnnualPriceId: " ",
    }),
    "invalid_supported_base_annual_price_id",
  );
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseAnnualPriceId: 1,
    }),
    "invalid_supported_base_annual_price_id",
  );
});

Deno.test("W. invalid optional Pro Annual → invalid_supported_pro_annual_price_id", () => {
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedProAnnualPriceId: null,
    }),
    "invalid_supported_pro_annual_price_id",
  );
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedProAnnualPriceId: `${PRICE_PRO_ANNUAL} `,
    }),
    "invalid_supported_pro_annual_price_id",
  );
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedProAnnualPriceId: ["price"],
    }),
    "invalid_supported_pro_annual_price_id",
  );
});

Deno.test("X. invalid stripeSecretKey still precedes catalog slot failures", () => {
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: "",
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseMonthlyPriceId: ` ${PRICE_BASE_MONTHLY}`,
    }),
    "invalid_stripe_secret_key",
  );
  expectFailure(
    resolveStripeSubscriptionSyncRuntimeConfig({
      stripeSecretKey: null,
      supportedProMonthlyPriceId: undefined,
      supportedProAnnualPriceId: "",
    }),
    "invalid_stripe_secret_key",
  );
  expectFailure(
    resolveWith(" sk_test_fake", VALID_PRICE),
    "invalid_stripe_secret_key",
  );
});

Deno.test("Y. runtime config is a pure function of caller params — no env/runtime", () => {
  const params = fourSlotParams();
  const first = resolveStripeSubscriptionSyncRuntimeConfig(params);
  const second = resolveStripeSubscriptionSyncRuntimeConfig(params);

  expectSuccess(first);
  expectSuccess(second);
  assertEquals(first, second, "same params must yield the same result");
  assertEquals(
    first.catalog.map((entry) => entry.priceId).sort(),
    [
      PRICE_BASE_MONTHLY,
      PRICE_BASE_ANNUAL,
      PRICE_PRO_MONTHLY,
      PRICE_PRO_ANNUAL,
    ].sort(),
    "catalog is fully determined by caller-supplied Price IDs",
  );
  assertEquals(
    first.catalog.map((entry) => entry.priceId).sort(),
    [
      params.supportedBaseMonthlyPriceId,
      params.supportedBaseAnnualPriceId,
      params.supportedProMonthlyPriceId,
      params.supportedProAnnualPriceId,
    ].sort(),
    "no constructed or env-sourced Price IDs",
  );
});
