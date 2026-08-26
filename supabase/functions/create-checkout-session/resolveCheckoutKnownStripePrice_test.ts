/**
 * Deno tests for resolveCheckoutKnownStripePrice and
 * normalizeCheckoutPlanCode (BILLING-34 / BILLING-63).
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/create-checkout-session/resolveCheckoutKnownStripePrice_test.ts
 *
 * No network/env/read/write capabilities required.
 * Price IDs are synthetic fixtures — not real Stripe catalog values.
 */

import type { CommercialPriceSelection } from "../_shared/resolveKnownStripePrice.ts";
import {
  normalizeCheckoutPlanCode,
  resolveCheckoutKnownStripePrice,
  type ResolveCheckoutKnownStripePriceFailureReason,
  type ResolveCheckoutKnownStripePriceResult,
} from "./resolveCheckoutKnownStripePrice.ts";

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

const PRICE_PRO_MONTHLY = "price_pro_monthly_test";
const PRICE_BASE_MONTHLY = "price_base_monthly_test";
const PRICE_BASE_ANNUAL = "price_base_annual_test";
const PRICE_PRO_ANNUAL = "price_pro_annual_test";

const FOUR_SLOT_CATALOG = {
  proMonthlyPriceId: PRICE_PRO_MONTHLY,
  baseMonthlyPriceId: PRICE_BASE_MONTHLY,
  baseAnnualPriceId: PRICE_BASE_ANNUAL,
  proAnnualPriceId: PRICE_PRO_ANNUAL,
} as const;

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

function resolve(params: {
  readonly proMonthlyPriceId?: unknown;
  readonly baseMonthlyPriceId?: unknown;
  readonly baseAnnualPriceId?: unknown;
  readonly proAnnualPriceId?: unknown;
  readonly selection?: CommercialPriceSelection;
}): ResolveCheckoutKnownStripePriceResult {
  return resolveCheckoutKnownStripePrice({
    proMonthlyPriceId: params.proMonthlyPriceId,
    baseMonthlyPriceId: params.baseMonthlyPriceId,
    baseAnnualPriceId: params.baseAnnualPriceId,
    proAnnualPriceId: params.proAnnualPriceId,
    selection: params.selection ?? "pro_monthly",
  });
}

function expectCanonicalSuccess(
  selection: CommercialPriceSelection,
  expectedPriceId: string,
  expectedTier: "base" | "pro",
  expectedInterval: "monthly" | "annual",
): void {
  const result = resolve({
    ...FOUR_SLOT_CATALOG,
    selection,
  });

  expectSuccess(result);
  assertEquals(result.value.priceId, expectedPriceId, `${selection} priceId`);
  assert(
    result.value.priceId === expectedPriceId,
    `${selection} priceId identity`,
  );
  assertEquals(result.value.tier, expectedTier, `${selection} tier`);
  assertEquals(
    result.value.interval,
    expectedInterval,
    `${selection} interval`,
  );
}

Deno.test("1. happy path: exact Pro monthly → descriptor with identical priceId", () => {
  const result = resolve({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    selection: "pro_monthly",
  });

  expectSuccess(result);
  assertEquals(result.value.priceId, PRICE_PRO_MONTHLY, "priceId");
  assert(result.value.priceId === PRICE_PRO_MONTHLY, "priceId identity");
  assertEquals(result.value.tier, "pro", "tier");
  assertEquals(result.value.interval, "monthly", "interval");
});

Deno.test("2. leading padding → failure, no descriptor", () => {
  expectFailure(resolve({ proMonthlyPriceId: ` ${PRICE_PRO_MONTHLY}` }));
});

Deno.test("3. trailing padding → failure, no descriptor", () => {
  expectFailure(resolve({ proMonthlyPriceId: `${PRICE_PRO_MONTHLY} ` }));
});

Deno.test("4. whitespace-only → failure, no descriptor", () => {
  expectFailure(resolve({ proMonthlyPriceId: "   " }));
});

Deno.test("5. empty and undefined → failure, no descriptor", () => {
  expectFailure(resolve({ proMonthlyPriceId: "" }));
  expectFailure(resolve({ proMonthlyPriceId: undefined }));
});

Deno.test("6. padded Price ID is rejected, not trim-repaired", () => {
  const padded = ` ${PRICE_PRO_MONTHLY}`;
  const paddedResult = resolve({
    proMonthlyPriceId: padded,
    selection: "pro_monthly",
  });

  expectFailure(paddedResult);
  assert(
    !("value" in paddedResult),
    "padded input must not yield a descriptor",
  );

  const exactResult = resolve({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    selection: "pro_monthly",
  });
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
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      selection: "base_monthly",
    }),
    "unsupported_selection",
  );
  expectFailure(
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      selection: "pro_annual",
    }),
    "unsupported_selection",
  );
});

Deno.test("8. legacy singleton Pro Monthly remains valid when optional env are absent", () => {
  const result = resolve({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    selection: "pro_monthly",
  });

  expectSuccess(result);
  assertEquals(result.value.priceId, PRICE_PRO_MONTHLY, "priceId");
  assertEquals(result.value.tier, "pro", "tier");
  assertEquals(result.value.interval, "monthly", "interval");
});

Deno.test("9. four-slot catalog: base_monthly → exact Base Monthly", () => {
  expectCanonicalSuccess("base_monthly", PRICE_BASE_MONTHLY, "base", "monthly");
});

Deno.test("10. four-slot catalog: base_annual → exact Base Annual", () => {
  expectCanonicalSuccess("base_annual", PRICE_BASE_ANNUAL, "base", "annual");
});

Deno.test("11. four-slot catalog: pro_monthly → exact Pro Monthly", () => {
  expectCanonicalSuccess(
    "pro_monthly",
    PRICE_PRO_MONTHLY,
    "pro",
    "monthly",
  );
});

Deno.test("12. four-slot catalog: pro_annual → exact Pro Annual", () => {
  expectCanonicalSuccess("pro_annual", PRICE_PRO_ANNUAL, "pro", "annual");
});

Deno.test("13. four distinct raw Price IDs are preserved across slots", () => {
  const expected: Record<
    CommercialPriceSelection,
    string
  > = {
    base_monthly: PRICE_BASE_MONTHLY,
    base_annual: PRICE_BASE_ANNUAL,
    pro_monthly: PRICE_PRO_MONTHLY,
    pro_annual: PRICE_PRO_ANNUAL,
  };

  const resolvedIds: string[] = [];
  for (
    const selection of [
      "base_monthly",
      "base_annual",
      "pro_monthly",
      "pro_annual",
    ] as const
  ) {
    const result = resolve({ ...FOUR_SLOT_CATALOG, selection });
    expectSuccess(result);
    assertEquals(
      result.value.priceId,
      expected[selection],
      `${selection} raw priceId`,
    );
    resolvedIds.push(result.value.priceId);
  }

  assertEquals(new Set(resolvedIds).size, 4, "four distinct Price IDs");
  assertEquals(resolvedIds.sort(), [
    PRICE_BASE_ANNUAL,
    PRICE_BASE_MONTHLY,
    PRICE_PRO_ANNUAL,
    PRICE_PRO_MONTHLY,
  ].sort(), "exact fixture set");
});

Deno.test("14. optional slot absent + relative selection → unsupported_selection", () => {
  expectFailure(
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      selection: "base_monthly",
    }),
    "unsupported_selection",
  );
  expectFailure(
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      selection: "base_annual",
    }),
    "unsupported_selection",
  );
  expectFailure(
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      selection: "pro_annual",
    }),
    "unsupported_selection",
  );
});

Deno.test("15. no fallback: base_monthly does not resolve Pro Monthly", () => {
  const result = resolve({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    selection: "base_monthly",
  });
  expectFailure(result, "unsupported_selection");
  assert(!("value" in result), "must not return a fallback descriptor");
});

Deno.test("16. no fallback: base_annual does not resolve Base Monthly", () => {
  const baseMonthlyPresent = resolve({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    baseMonthlyPriceId: PRICE_BASE_MONTHLY,
    selection: "base_monthly",
  });
  expectSuccess(baseMonthlyPresent);
  assertEquals(
    baseMonthlyPresent.value.priceId,
    PRICE_BASE_MONTHLY,
    "Base Monthly remains resolvable",
  );

  const missingAnnual = resolve({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    baseMonthlyPriceId: PRICE_BASE_MONTHLY,
    selection: "base_annual",
  });
  expectFailure(missingAnnual, "unsupported_selection");
  assert(!("value" in missingAnnual), "must not fall back to Base Monthly");
});

Deno.test("17. no fallback: pro_annual does not resolve Pro Monthly", () => {
  const result = resolve({
    proMonthlyPriceId: PRICE_PRO_MONTHLY,
    selection: "pro_annual",
  });
  expectFailure(result, "unsupported_selection");
  assert(!("value" in result), "must not fall back to Pro Monthly");
});

Deno.test("18. invalid optional env → fail closed even for Pro Monthly selection", () => {
  expectFailure(
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      baseMonthlyPriceId: " ",
      selection: "pro_monthly",
    }),
    "invalid_base_monthly_price_id",
  );
  expectFailure(
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      baseAnnualPriceId: "",
      selection: "pro_monthly",
    }),
    "invalid_base_annual_price_id",
  );
  expectFailure(
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      proAnnualPriceId: ` ${PRICE_PRO_ANNUAL}`,
      selection: "pro_monthly",
    }),
    "invalid_pro_annual_price_id",
  );
});

Deno.test("19. duplicate Price ID across slots → duplicate_price_id", () => {
  expectFailure(
    resolve({
      proMonthlyPriceId: PRICE_PRO_MONTHLY,
      baseMonthlyPriceId: PRICE_PRO_MONTHLY,
      selection: "pro_monthly",
    }),
    "duplicate_price_id",
  );
  expectFailure(
    resolve({
      ...FOUR_SLOT_CATALOG,
      proAnnualPriceId: PRICE_PRO_MONTHLY,
      selection: "pro_annual",
    }),
    "duplicate_price_id",
  );
});

Deno.test("20. historical alias pro → pro_monthly", () => {
  const result = normalizeCheckoutPlanCode("pro");
  assertEquals(result, { ok: true, planCode: "pro_monthly" }, "alias pro");
});

Deno.test("21. alias pro is case-insensitive and trimmed", () => {
  assertEquals(
    normalizeCheckoutPlanCode(" PRO "),
    { ok: true, planCode: "pro_monthly" },
    "padded PRO",
  );
  assertEquals(
    normalizeCheckoutPlanCode("Pro"),
    { ok: true, planCode: "pro_monthly" },
    "mixed case Pro",
  );
});

Deno.test("22. canonical plan_code tokens normalize to themselves", () => {
  for (
    const token of [
      "base_monthly",
      "base_annual",
      "pro_monthly",
      "pro_annual",
    ] as const
  ) {
    assertEquals(
      normalizeCheckoutPlanCode(token),
      { ok: true, planCode: token },
      token,
    );
    assertEquals(
      normalizeCheckoutPlanCode(` ${token.toUpperCase()} `),
      { ok: true, planCode: token },
      `${token} padded uppercase`,
    );
  }
});

Deno.test("23. non-allowlisted selections fail closed, including former shortcuts", () => {
  for (
    const token of [
      "base",
      "annual",
      "monthly",
      "standard",
      "paid",
      "free",
      "pro_yearly",
      "",
      "   ",
    ]
  ) {
    assertEquals(
      normalizeCheckoutPlanCode(token),
      { ok: false },
      `rejected token: ${JSON.stringify(token)}`,
    );
  }
  assertEquals(
    normalizeCheckoutPlanCode(undefined),
    { ok: false },
    "undefined plan_code",
  );
  assertEquals(
    normalizeCheckoutPlanCode(null),
    { ok: false },
    "null plan_code",
  );
  assertEquals(
    normalizeCheckoutPlanCode(1),
    { ok: false },
    "numeric plan_code",
  );
});

Deno.test("24. arbitrary Price ID as plan_code is not selection authority", () => {
  assertEquals(
    normalizeCheckoutPlanCode(PRICE_PRO_MONTHLY),
    { ok: false },
    "catalog Price ID is not a plan_code",
  );
  assertEquals(
    normalizeCheckoutPlanCode("price_client_supplied_arbitrary"),
    { ok: false },
    "arbitrary Price ID token",
  );
});

Deno.test("25. helper has no client priceId input: resolved ID comes from catalog", () => {
  const result = resolve({
    ...FOUR_SLOT_CATALOG,
    selection: "base_annual",
  });
  expectSuccess(result);
  assertEquals(result.value.priceId, PRICE_BASE_ANNUAL, "server catalog ID");
  assert(
    result.value.priceId !== "price_client_supplied_arbitrary",
    "must not be a client-supplied Price ID",
  );
});

Deno.test("26. success descriptor priceId is the value checkout would send to Stripe", () => {
  const selections: readonly {
    selection: CommercialPriceSelection;
    priceId: string;
  }[] = [
    { selection: "base_monthly", priceId: PRICE_BASE_MONTHLY },
    { selection: "base_annual", priceId: PRICE_BASE_ANNUAL },
    { selection: "pro_monthly", priceId: PRICE_PRO_MONTHLY },
    { selection: "pro_annual", priceId: PRICE_PRO_ANNUAL },
  ];

  for (const { selection, priceId } of selections) {
    const result = resolve({ ...FOUR_SLOT_CATALOG, selection });
    expectSuccess(result);
    assertEquals(
      result.value.priceId,
      priceId,
      `${selection} Stripe line item price`,
    );
  }
});
