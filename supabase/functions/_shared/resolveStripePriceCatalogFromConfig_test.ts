/**
 * Deno tests for resolveStripePriceCatalogFromConfig
 * (BILLING-29 / BILLING-59).
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
const PRICE_BASE_MONTHLY = "price_test_base_monthly";
const PRICE_BASE_ANNUAL = "price_test_base_annual";
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

function fourSlotParams() {
  return {
    baseMonthlyPriceId: PRICE_BASE_MONTHLY,
    baseAnnualPriceId: PRICE_BASE_ANNUAL,
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    proAnnualPriceId: PRICE_PRO_ANNUAL,
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

Deno.test("15. legacy singleton Pro Monthly is unchanged", () => {
  const result = resolveStripePriceCatalogFromConfig({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
  });

  expectSuccess(result);
  assertEquals(result.catalog, [
    {
      priceId: PRICE_PRO_MONTHLY,
      tier: "pro",
      interval: "monthly",
    },
  ], "legacy singleton catalog");
});

Deno.test("16. four valid inputs → catalog of four distinct entries", () => {
  const result = resolveStripePriceCatalogFromConfig(fourSlotParams());

  expectSuccess(result);
  assertEquals(result.catalog.length, 4, "catalog length");
  const priceIds = result.catalog.map((entry) => entry.priceId);
  assertEquals(new Set(priceIds).size, 4, "four distinct Price IDs");
});

Deno.test("17. Base Monthly maps to tier base / interval monthly", () => {
  const result = resolveStripePriceCatalogFromConfig(fourSlotParams());

  expectSuccess(result);
  const entry = findByAxes(result.catalog, "base", "monthly");
  assert(entry !== undefined, "Base Monthly entry must exist");
  assertEquals(entry?.tier, "base", "tier");
  assertEquals(entry?.interval, "monthly", "interval");
});

Deno.test("18. Base Annual maps to tier base / interval annual", () => {
  const result = resolveStripePriceCatalogFromConfig(fourSlotParams());

  expectSuccess(result);
  const entry = findByAxes(result.catalog, "base", "annual");
  assert(entry !== undefined, "Base Annual entry must exist");
  assertEquals(entry?.tier, "base", "tier");
  assertEquals(entry?.interval, "annual", "interval");
});

Deno.test("19. Pro Monthly maps to tier pro / interval monthly", () => {
  const result = resolveStripePriceCatalogFromConfig(fourSlotParams());

  expectSuccess(result);
  const entry = findByAxes(result.catalog, "pro", "monthly");
  assert(entry !== undefined, "Pro Monthly entry must exist");
  assertEquals(entry?.tier, "pro", "tier");
  assertEquals(entry?.interval, "monthly", "interval");
});

Deno.test("20. Pro Annual maps to tier pro / interval annual", () => {
  const result = resolveStripePriceCatalogFromConfig(fourSlotParams());

  expectSuccess(result);
  const entry = findByAxes(result.catalog, "pro", "annual");
  assert(entry !== undefined, "Pro Annual entry must exist");
  assertEquals(entry?.tier, "pro", "tier");
  assertEquals(entry?.interval, "annual", "interval");
});

Deno.test("21. returned Price IDs are exactly the caller-supplied values", () => {
  const params = fourSlotParams();
  const result = resolveStripePriceCatalogFromConfig(params);

  expectSuccess(result);
  assertEquals(
    findByAxes(result.catalog, "base", "monthly")?.priceId,
    params.baseMonthlyPriceId,
    "Base Monthly Price ID",
  );
  assertEquals(
    findByAxes(result.catalog, "base", "annual")?.priceId,
    params.baseAnnualPriceId,
    "Base Annual Price ID",
  );
  assertEquals(
    findByAxes(result.catalog, "pro", "monthly")?.priceId,
    params.proMonthlyPriceId,
    "Pro Monthly Price ID",
  );
  assertEquals(
    findByAxes(result.catalog, "pro", "annual")?.priceId,
    params.proAnnualPriceId,
    "Pro Annual Price ID",
  );
  assert(
    findByAxes(result.catalog, "base", "monthly")?.priceId ===
      params.baseMonthlyPriceId,
    "Base Monthly identity must match input (no canonicalization)",
  );
  assert(
    findByAxes(result.catalog, "pro", "annual")?.priceId ===
      params.proAnnualPriceId,
    "Pro Annual identity must match input (no canonicalization)",
  );
});

Deno.test("22. no Price ID is constructed — only caller-supplied values appear", () => {
  const params = {
    baseMonthlyPriceId: "caller_supplied_base_monthly",
    baseAnnualPriceId: "caller_supplied_base_annual",
    proMonthlyPriceId: "caller_supplied_pro_monthly",
    proAnnualPriceId: "caller_supplied_pro_annual",
  };
  const result = resolveStripePriceCatalogFromConfig(params);

  expectSuccess(result);
  const returned = result.catalog.map((entry) => entry.priceId).sort();
  const supplied = [
    params.baseMonthlyPriceId,
    params.baseAnnualPriceId,
    params.proMonthlyPriceId,
    params.proAnnualPriceId,
  ].sort();
  assertEquals(returned, supplied, "catalog Price IDs equal caller inputs");
  for (const entry of result.catalog) {
    assert(
      supplied.includes(entry.priceId),
      `unexpected constructed Price ID: ${entry.priceId}`,
    );
  }
});

Deno.test("23. config without new inputs → historical singleton", () => {
  const result = resolveStripePriceCatalogFromConfig({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
  });

  expectSuccess(result);
  assertEquals(result.catalog.length, 1, "singleton length");
  assertEquals(result.catalog[0]?.priceId, PRICE_PRO_MONTHLY, "priceId");
  assertEquals(result.catalog[0]?.tier, "pro", "tier");
  assertEquals(result.catalog[0]?.interval, "monthly", "interval");
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

Deno.test("24. invalid optional input → failure with no partial catalog", () => {
  expectFailure(
    resolveStripePriceCatalogFromConfig({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      baseMonthlyPriceId: ` ${PRICE_BASE_MONTHLY}`,
    }),
    "invalid_base_monthly_price_id",
  );
  expectFailure(
    resolveStripePriceCatalogFromConfig({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      baseAnnualPriceId: "",
    }),
    "invalid_base_annual_price_id",
  );
  expectFailure(
    resolveStripePriceCatalogFromConfig({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      proAnnualPriceId: null,
    }),
    "invalid_pro_annual_price_id",
  );
});

Deno.test("25. no fallback between slots — missing optional slots stay absent", () => {
  const result = resolveStripePriceCatalogFromConfig({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    baseAnnualPriceId: PRICE_BASE_ANNUAL,
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
});

Deno.test("26. builder is a pure function of caller params — no env/runtime", () => {
  const params = fourSlotParams();
  const first = resolveStripePriceCatalogFromConfig(params);
  const second = resolveStripePriceCatalogFromConfig(params);

  expectSuccess(first);
  expectSuccess(second);
  assertEquals(first, second, "same params must yield the same catalog");
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
});

Deno.test("27. partial config: Pro Monthly + one new slot → only those entries", () => {
  const result = resolveStripePriceCatalogFromConfig({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    baseMonthlyPriceId: PRICE_BASE_MONTHLY,
  });

  expectSuccess(result);
  assertEquals(result.catalog.length, 2, "two configured slots");
  assertEquals(
    findByAxes(result.catalog, "base", "monthly")?.priceId,
    PRICE_BASE_MONTHLY,
    "Base Monthly",
  );
  assertEquals(
    findByAxes(result.catalog, "pro", "monthly")?.priceId,
    PRICE_PRO_MONTHLY,
    "Pro Monthly",
  );
  assert(
    findByAxes(result.catalog, "base", "annual") === undefined,
    "unconfigured Base Annual must be absent",
  );
  assert(
    findByAxes(result.catalog, "pro", "annual") === undefined,
    "unconfigured Pro Annual must be absent",
  );
});
