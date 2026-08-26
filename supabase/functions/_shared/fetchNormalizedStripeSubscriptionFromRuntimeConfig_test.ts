/**
 * Deno tests for fetchNormalizedStripeSubscriptionFromRuntimeConfig
 * (BILLING-11 / BILLING-38 / BILLING-61).
 *
 * Exercises the BILLING-10 orchestrator through the optional
 * createRetrieveClient factory seam. Config validation, BG refetch,
 * BE normalize, and BJ composition remain real. The fake factory
 * supplies only StripeSubscriptionRetrieveClient.retrieve.
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/_shared/fetchNormalizedStripeSubscriptionFromRuntimeConfig_test.ts
 *
 * No network/env/write/run capabilities required.
 * Fixtures are synthetic — not real secrets, tokens, or PII.
 */

import { createStripeSubscriptionRetrieveClient } from "./createStripeSubscriptionRetrieveClient.ts";
import {
  fetchNormalizedStripeSubscriptionFromRuntimeConfig,
  type FetchNormalizedStripeSubscriptionFromRuntimeConfigParams,
  type FetchNormalizedStripeSubscriptionFromRuntimeConfigResult,
} from "./fetchNormalizedStripeSubscriptionFromRuntimeConfig.ts";
import type { StripeSubscriptionLike } from "./normalizeStripeSubscription.ts";
import type { StripeSubscriptionRetrieveClient } from "./refetchStripeSubscription.ts";
import type { KnownStripePrice } from "./resolveKnownStripePrice.ts";
import { resolveStripeSubscriptionSyncRuntimeConfig } from "./resolveStripeSubscriptionSyncRuntimeConfig.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SUB_ID = "sub_test_runtime";
const CUSTOMER_ID = "cus_test_runtime";
const SUPPORTED_PRICE = "price_pro_monthly_test";
const PRICE_PRO_MONTHLY = SUPPORTED_PRICE;
const PRICE_BASE_MONTHLY = "price_test_base_monthly";
const PRICE_BASE_ANNUAL = "price_test_base_annual";
const PRICE_PRO_ANNUAL = "price_test_pro_annual";
const VALID_SECRET = "fake-secret-runtime";
const INVALID_SECRET = " ";
const INVALID_PRICE = " ";
const INVALID_PROVIDER_SUBSCRIPTION_ID = "   ";
const UNSUPPORTED_PROVIDER_PRICE = "price_other_unsupported_runtime";
const PROVIDER_ERROR_MARKER = "RAW_PROVIDER_DETAIL_RUNTIME";

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
  result: FetchNormalizedStripeSubscriptionFromRuntimeConfigResult,
): asserts result is Extract<
  FetchNormalizedStripeSubscriptionFromRuntimeConfigResult,
  { ok: true }
> {
  assert(result.ok === true, "expected success");
}

function expectConfigFailure(
  result: FetchNormalizedStripeSubscriptionFromRuntimeConfigResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error("expected config failure, got success");
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(!("stage" in result), "config failure has no BJ stage");
  assert(
    !("stripeSecretKey" in result),
    "failure must not return a secret",
  );
  assert(
    !("catalog" in result),
    "failure must not return a partial catalog",
  );
  assert(
    !("supportedProMonthlyPriceId" in result),
    "failure must not return a Price ID",
  );
  assert(
    !("supportedBaseMonthlyPriceId" in result),
    "failure must not return supportedBaseMonthlyPriceId",
  );
  assert(
    !("supportedBaseAnnualPriceId" in result),
    "failure must not return supportedBaseAnnualPriceId",
  );
  assert(
    !("supportedProAnnualPriceId" in result),
    "failure must not return supportedProAnnualPriceId",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public config failure contract exposes only ok+reason",
  );
}

function expectComposerFailure(
  result: FetchNormalizedStripeSubscriptionFromRuntimeConfigResult,
  stage: "refetch" | "normalize",
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error("expected composer failure, got success");
  }
  if (!("stage" in result)) {
    throw new Error("expected BJ stage on composer failure");
  }
  assertEquals(result.stage, stage, "failure stage");
  assertEquals(result.reason, reason, "failure reason");
  assert(
    !("stripeSecretKey" in result),
    "failure must not return a secret",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason", "stage"].sort(),
    "public BJ failure contract exposes only ok+stage+reason",
  );
}

function assertResultDoesNotContainSecret(
  result: FetchNormalizedStripeSubscriptionFromRuntimeConfigResult,
): void {
  const serialized = JSON.stringify(result);
  assert(
    !("stripeSecretKey" in result),
    "result must not expose stripeSecretKey",
  );
  assert(
    !serialized.includes(VALID_SECRET),
    "result must not contain the secret",
  );
}

function validRawSubscription(
  overrides: Partial<StripeSubscriptionLike> = {},
): StripeSubscriptionLike {
  return {
    id: SUB_ID,
    customer: CUSTOMER_ID,
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

type FakeRetrieveBehavior =
  | { kind: "resolve"; subscription: StripeSubscriptionLike }
  | { kind: "reject"; error: unknown };

type FakeRetrieveClientFactoryState = {
  factoryCallCount: number;
  retrieveCallCount: number;
  receivedSecret: string | undefined;
  receivedRetrieveId: string | undefined;
};

function createFakeRetrieveClientFactory(
  behavior: FakeRetrieveBehavior,
): {
  createRetrieveClient: typeof createStripeSubscriptionRetrieveClient;
  state: FakeRetrieveClientFactoryState;
} {
  const state: FakeRetrieveClientFactoryState = {
    factoryCallCount: 0,
    retrieveCallCount: 0,
    receivedSecret: undefined,
    receivedRetrieveId: undefined,
  };

  const createRetrieveClient: typeof createStripeSubscriptionRetrieveClient = (
    stripeSecretKey: string,
  ): StripeSubscriptionRetrieveClient => {
    state.factoryCallCount += 1;
    state.receivedSecret = stripeSecretKey;
    return {
      subscriptions: {
        retrieve(id: string) {
          state.retrieveCallCount += 1;
          state.receivedRetrieveId = id;
          if (behavior.kind === "reject") {
            return Promise.reject(behavior.error);
          }
          return Promise.resolve(behavior.subscription);
        },
      },
    };
  };

  return { createRetrieveClient, state };
}

function validRuntimeParams(
  overrides: {
    provider_subscription_id?: unknown;
    stripeSecretKey?: unknown;
    supportedProMonthlyPriceId?: unknown;
    supportedBaseMonthlyPriceId?: unknown;
    supportedBaseAnnualPriceId?: unknown;
    supportedProAnnualPriceId?: unknown;
  } = {},
) {
  return {
    provider_subscription_id: SUB_ID,
    stripeSecretKey: VALID_SECRET,
    supportedProMonthlyPriceId: SUPPORTED_PRICE,
    ...overrides,
  };
}

function fourSlotRuntimeParams(
  overrides: Parameters<typeof validRuntimeParams>[0] = {},
) {
  return validRuntimeParams({
    supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
    supportedBaseMonthlyPriceId: PRICE_BASE_MONTHLY,
    supportedBaseAnnualPriceId: PRICE_BASE_ANNUAL,
    supportedProAnnualPriceId: PRICE_PRO_ANNUAL,
    ...overrides,
  });
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

function resolveForwardedRuntimeConfig(
  params: FetchNormalizedStripeSubscriptionFromRuntimeConfigParams,
) {
  return resolveStripeSubscriptionSyncRuntimeConfig({
    stripeSecretKey: params.stripeSecretKey,
    supportedProMonthlyPriceId: params.supportedProMonthlyPriceId,
    supportedBaseMonthlyPriceId: params.supportedBaseMonthlyPriceId,
    supportedBaseAnnualPriceId: params.supportedBaseAnnualPriceId,
    supportedProAnnualPriceId: params.supportedProAnnualPriceId,
  });
}

Deno.test("A. invalid stripe secret → fail before factory", async () => {
  const fake = createFakeRetrieveClientFactory({
    kind: "resolve",
    subscription: validRawSubscription(),
  });

  const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
    validRuntimeParams({ stripeSecretKey: INVALID_SECRET }),
    fake.createRetrieveClient,
  );

  expectConfigFailure(result, "invalid_stripe_secret_key");
  assertEquals(fake.state.factoryCallCount, 0, "factory must not be called");
  assertEquals(fake.state.retrieveCallCount, 0, "retrieve must not be called");
  assertResultDoesNotContainSecret(result);
});

Deno.test("B. invalid supported price → fail before factory", async () => {
  const fake = createFakeRetrieveClientFactory({
    kind: "resolve",
    subscription: validRawSubscription(),
  });

  const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
    validRuntimeParams({ supportedProMonthlyPriceId: INVALID_PRICE }),
    fake.createRetrieveClient,
  );

  expectConfigFailure(result, "invalid_supported_pro_monthly_price_id");
  assertEquals(fake.state.factoryCallCount, 0, "factory must not be called");
  assertEquals(fake.state.retrieveCallCount, 0, "retrieve must not be called");
  assertResultDoesNotContainSecret(result);
});

Deno.test(
  "C. valid config + invalid provider subscription id → factory once, retrieve skipped",
  async () => {
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription(),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      validRuntimeParams({
        provider_subscription_id: INVALID_PROVIDER_SUBSCRIPTION_ID,
      }),
      fake.createRetrieveClient,
    );

    expectComposerFailure(
      result,
      "refetch",
      "invalid_provider_subscription_id",
    );
    assertEquals(fake.state.factoryCallCount, 1, "factory called once");
    assert(
      fake.state.receivedSecret === VALID_SECRET,
      "factory received exact validated secret",
    );
    assertEquals(
      fake.state.retrieveCallCount,
      0,
      "retrieve must not be called",
    );
    assertResultDoesNotContainSecret(result);
  },
);

Deno.test("D. valid config + fresh retrieve success (BG/BE/BJ passthrough)", async () => {
  const fake = createFakeRetrieveClientFactory({
    kind: "resolve",
    subscription: validRawSubscription(),
  });

  const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
    validRuntimeParams(),
    fake.createRetrieveClient,
  );

  expectSuccess(result);
  assertEquals(fake.state.factoryCallCount, 1, "factory called once");
  assert(
    fake.state.receivedSecret === VALID_SECRET,
    "factory received exact validated secret",
  );
  assertEquals(fake.state.retrieveCallCount, 1, "retrieve called once");
  assertEquals(
    fake.state.receivedRetrieveId,
    SUB_ID,
    "retrieve received exact provider_subscription_id",
  );
  assert(
    fake.state.receivedRetrieveId === SUB_ID,
    "provider id identity must match orchestrator input (no trim)",
  );
  assertEquals(
    result.value.provider_subscription_id,
    SUB_ID,
    "normalized subscription id",
  );
  assertEquals(
    result.value.provider_customer_id,
    CUSTOMER_ID,
    "normalized customer id",
  );
  assertEquals(result.value.status, "active", "normalized status");
  assertEquals(result.value.plan_code, "paid", "normalized plan_code");
  assertEquals(
    result.value.cancel_at_period_end,
    false,
    "normalized cancel_at_period_end",
  );
  assertResultDoesNotContainSecret(result);

  const runtimeConfig = resolveStripeSubscriptionSyncRuntimeConfig({
    stripeSecretKey: VALID_SECRET,
    supportedProMonthlyPriceId: SUPPORTED_PRICE,
  });
  if (runtimeConfig.ok !== true) {
    throw new Error("runtime config must succeed");
  }
  assert(
    !("supportedProMonthlyPriceId" in runtimeConfig),
    "runtime success must not expose supportedProMonthlyPriceId",
  );
  assert(Array.isArray(runtimeConfig.catalog), "catalog must be an array");
  assertEquals(
    runtimeConfig.catalog.length,
    1,
    "catalog passed to fetch normalized has exactly one entry",
  );
  assertEquals(
    runtimeConfig.catalog[0]?.priceId,
    SUPPORTED_PRICE,
    "catalog priceId",
  );
  assertEquals(runtimeConfig.catalog[0]?.tier, "pro", "catalog tier");
  assertEquals(
    runtimeConfig.catalog[0]?.interval,
    "monthly",
    "catalog interval",
  );
});

Deno.test("E. retrieve reject → existing BG refetch failure, no error leak", async () => {
  const fake = createFakeRetrieveClientFactory({
    kind: "reject",
    error: {
      message: `Stripe failure ${PROVIDER_ERROR_MARKER}`,
      providerReference: PROVIDER_ERROR_MARKER,
    },
  });

  const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
    validRuntimeParams(),
    fake.createRetrieveClient,
  );

  expectComposerFailure(
    result,
    "refetch",
    "stripe_subscription_refetch_failed",
  );
  assertEquals(fake.state.factoryCallCount, 1, "factory called once");
  assert(
    fake.state.receivedSecret === VALID_SECRET,
    "factory received exact validated secret",
  );
  assertEquals(fake.state.retrieveCallCount, 1, "retrieve called once");
  assertEquals(
    fake.state.receivedRetrieveId,
    SUB_ID,
    "retrieve received exact provider_subscription_id",
  );
  assertResultDoesNotContainSecret(result);
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes(PROVIDER_ERROR_MARKER),
    "must not leak raw provider error detail",
  );
});

Deno.test(
  "F. unsupported provider price → existing normalize failure",
  async () => {
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription({
        items: { data: [{ price: { id: UNSUPPORTED_PROVIDER_PRICE } }] },
      }),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      validRuntimeParams(),
      fake.createRetrieveClient,
    );

    expectComposerFailure(result, "normalize", "unsupported_price");
    assertEquals(fake.state.factoryCallCount, 1, "factory called once");
    assertEquals(fake.state.retrieveCallCount, 1, "retrieve called once");
    assertResultDoesNotContainSecret(result);
  },
);

Deno.test(
  "H. optional second parameter: config failure uses default factory without provider call",
  async () => {
    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      validRuntimeParams({ stripeSecretKey: INVALID_SECRET }),
    );

    expectConfigFailure(result, "invalid_stripe_secret_key");
    assertResultDoesNotContainSecret(result);
  },
);

Deno.test(
  "I. BILLING-61: legacy Pro Monthly-only call remains a singleton catalog",
  async () => {
    const params = validRuntimeParams();
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription(),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      params,
      fake.createRetrieveClient,
    );

    expectSuccess(result);
    assertEquals(result.value.plan_code, "paid", "plan_code");
    assertEquals(result.value.productTier, "pro", "legacy Pro Monthly tier");
    assertResultDoesNotContainSecret(result);

    const runtimeConfig = resolveForwardedRuntimeConfig(params);
    if (runtimeConfig.ok !== true) {
      throw new Error("legacy runtime config must succeed");
    }
    assertEquals(runtimeConfig.catalog.length, 1, "singleton catalog");
    assertEquals(
      runtimeConfig.catalog[0]?.priceId,
      PRICE_PRO_MONTHLY,
      "catalog priceId",
    );
    assertEquals(runtimeConfig.catalog[0]?.tier, "pro", "catalog tier");
    assertEquals(
      runtimeConfig.catalog[0]?.interval,
      "monthly",
      "catalog interval",
    );
    assert(
      runtimeConfig.catalog[0]?.priceId === PRICE_PRO_MONTHLY,
      "Pro Monthly identity must match input (no canonicalization)",
    );
    assert(
      findByAxes(runtimeConfig.catalog, "base", "monthly") === undefined,
      "Base Monthly must be absent when not supplied",
    );
    assert(
      findByAxes(runtimeConfig.catalog, "base", "annual") === undefined,
      "Base Annual must be absent when not supplied",
    );
    assert(
      findByAxes(runtimeConfig.catalog, "pro", "annual") === undefined,
      "Pro Annual must be absent when not supplied",
    );
  },
);

Deno.test(
  "J. BILLING-61: four valid slots are forwarded; catalog has four correct entries",
  async () => {
    const params = fourSlotRuntimeParams();
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription({
        items: { data: [{ price: { id: PRICE_PRO_MONTHLY } }] },
      }),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      params,
      fake.createRetrieveClient,
    );

    expectSuccess(result);
    assertEquals(result.value.productTier, "pro", "success uses forwarded catalog");
    assertResultDoesNotContainSecret(result);

    const runtimeConfig = resolveForwardedRuntimeConfig(params);
    if (runtimeConfig.ok !== true) {
      throw new Error("four-slot runtime config must succeed");
    }
    assertEquals(runtimeConfig.catalog.length, 4, "catalog length");
    const priceIds = runtimeConfig.catalog.map((entry) => entry.priceId);
    assertEquals(new Set(priceIds).size, 4, "four distinct Price IDs");
    const returned = [...priceIds].sort();
    const supplied = [
      params.supportedBaseMonthlyPriceId,
      params.supportedBaseAnnualPriceId,
      params.supportedProMonthlyPriceId,
      params.supportedProAnnualPriceId,
    ].sort();
    assertEquals(returned, supplied, "catalog Price IDs equal caller inputs");
    assertEquals(
      findByAxes(runtimeConfig.catalog, "base", "monthly")?.priceId,
      PRICE_BASE_MONTHLY,
      "Base Monthly Price ID",
    );
    assertEquals(
      findByAxes(runtimeConfig.catalog, "base", "annual")?.priceId,
      PRICE_BASE_ANNUAL,
      "Base Annual Price ID",
    );
    assertEquals(
      findByAxes(runtimeConfig.catalog, "pro", "monthly")?.priceId,
      PRICE_PRO_MONTHLY,
      "Pro Monthly Price ID",
    );
    assertEquals(
      findByAxes(runtimeConfig.catalog, "pro", "annual")?.priceId,
      PRICE_PRO_ANNUAL,
      "Pro Annual Price ID",
    );
  },
);

async function assertSlotIdentityPreserved(
  priceId: string,
  expectedTier: KnownStripePrice["tier"],
  label: string,
): Promise<void> {
  const params = fourSlotRuntimeParams();
  const fake = createFakeRetrieveClientFactory({
    kind: "resolve",
    subscription: validRawSubscription({
      items: { data: [{ price: { id: priceId } }] },
    }),
  });

  const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
    params,
    fake.createRetrieveClient,
  );

  expectSuccess(result);
  assertEquals(result.value.plan_code, "paid", `${label} plan_code`);
  assertEquals(result.value.productTier, expectedTier, `${label} productTier`);
  assertEquals(fake.state.factoryCallCount, 1, `${label} factory once`);
  assertEquals(fake.state.retrieveCallCount, 1, `${label} retrieve once`);
  assertResultDoesNotContainSecret(result);

  const runtimeConfig = resolveForwardedRuntimeConfig(params);
  if (runtimeConfig.ok !== true) {
    throw new Error(`${label} runtime config must succeed`);
  }
  const interval = priceId === PRICE_BASE_ANNUAL || priceId === PRICE_PRO_ANNUAL
    ? "annual"
    : "monthly";
  const entry = findByAxes(runtimeConfig.catalog, expectedTier, interval);
  assert(entry !== undefined, `${label} catalog entry must exist`);
  assertEquals(entry?.priceId, priceId, `${label} catalog priceId`);
  assert(
    entry?.priceId === priceId,
    `${label} identity must match input (no canonicalization)`,
  );
}

Deno.test(
  "K. BILLING-61: Base Monthly identity is preserved through catalog",
  async () => {
    await assertSlotIdentityPreserved(
      PRICE_BASE_MONTHLY,
      "base",
      "Base Monthly",
    );
  },
);

Deno.test(
  "L. BILLING-61: Base Annual identity is preserved through catalog",
  async () => {
    await assertSlotIdentityPreserved(PRICE_BASE_ANNUAL, "base", "Base Annual");
  },
);

Deno.test(
  "M. BILLING-61: Pro Monthly identity is preserved through catalog",
  async () => {
    await assertSlotIdentityPreserved(PRICE_PRO_MONTHLY, "pro", "Pro Monthly");
  },
);

Deno.test(
  "N. BILLING-61: Pro Annual identity is preserved through catalog",
  async () => {
    await assertSlotIdentityPreserved(PRICE_PRO_ANNUAL, "pro", "Pro Annual");
  },
);

Deno.test(
  "O. BILLING-61: partial config produces only the supplied slots",
  async () => {
    const params = validRuntimeParams({
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseAnnualPriceId: PRICE_BASE_ANNUAL,
    });
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription({
        items: { data: [{ price: { id: PRICE_BASE_ANNUAL } }] },
      }),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      params,
      fake.createRetrieveClient,
    );

    expectSuccess(result);
    assertEquals(result.value.productTier, "base", "supplied Base Annual used");
    assertResultDoesNotContainSecret(result);

    const runtimeConfig = resolveForwardedRuntimeConfig(params);
    if (runtimeConfig.ok !== true) {
      throw new Error("partial runtime config must succeed");
    }
    assertEquals(runtimeConfig.catalog.length, 2, "only configured slots");
    assertEquals(
      findByAxes(runtimeConfig.catalog, "pro", "monthly")?.priceId,
      PRICE_PRO_MONTHLY,
      "Pro Monthly",
    );
    assertEquals(
      findByAxes(runtimeConfig.catalog, "base", "annual")?.priceId,
      PRICE_BASE_ANNUAL,
      "Base Annual",
    );
    assert(
      findByAxes(runtimeConfig.catalog, "base", "monthly") === undefined,
      "must not fill Base Monthly from another slot",
    );
    assert(
      findByAxes(runtimeConfig.catalog, "pro", "annual") === undefined,
      "must not fill Pro Annual from another slot",
    );
  },
);

Deno.test(
  "P. BILLING-61: omitted slots are not filled by fallback",
  async () => {
    const params = validRuntimeParams({
      supportedProMonthlyPriceId: PRICE_PRO_MONTHLY,
      supportedBaseAnnualPriceId: PRICE_BASE_ANNUAL,
    });
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription({
        items: { data: [{ price: { id: PRICE_BASE_MONTHLY } }] },
      }),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      params,
      fake.createRetrieveClient,
    );

    expectComposerFailure(result, "normalize", "unsupported_price");
    assertEquals(fake.state.factoryCallCount, 1, "factory called once");
    assertEquals(fake.state.retrieveCallCount, 1, "retrieve called once");
    assertResultDoesNotContainSecret(result);

    const runtimeConfig = resolveForwardedRuntimeConfig(params);
    if (runtimeConfig.ok !== true) {
      throw new Error("partial runtime config must succeed");
    }
    assert(
      findByAxes(runtimeConfig.catalog, "base", "monthly") === undefined,
      "Base Monthly must not be copied from Pro or Annual",
    );
    assert(
      findByAxes(runtimeConfig.catalog, "pro", "annual") === undefined,
      "Pro Annual must not be copied from Monthly",
    );
  },
);

Deno.test(
  "Q. BILLING-61: invalid Base Monthly propagates runtime failure reason",
  async () => {
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription(),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      validRuntimeParams({
        supportedBaseMonthlyPriceId: ` ${PRICE_BASE_MONTHLY}`,
      }),
      fake.createRetrieveClient,
    );

    expectConfigFailure(result, "invalid_supported_base_monthly_price_id");
    assertEquals(fake.state.factoryCallCount, 0, "factory must not be called");
    assertEquals(fake.state.retrieveCallCount, 0, "retrieve must not be called");
    assertResultDoesNotContainSecret(result);
  },
);

Deno.test(
  "R. BILLING-61: invalid Base Annual propagates runtime failure reason",
  async () => {
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription(),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      validRuntimeParams({
        supportedBaseAnnualPriceId: "",
      }),
      fake.createRetrieveClient,
    );

    expectConfigFailure(result, "invalid_supported_base_annual_price_id");
    assertEquals(fake.state.factoryCallCount, 0, "factory must not be called");
    assertEquals(fake.state.retrieveCallCount, 0, "retrieve must not be called");
    assertResultDoesNotContainSecret(result);
  },
);

Deno.test(
  "S. BILLING-61: invalid Pro Annual propagates runtime failure reason",
  async () => {
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription(),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      validRuntimeParams({
        supportedProAnnualPriceId: null,
      }),
      fake.createRetrieveClient,
    );

    expectConfigFailure(result, "invalid_supported_pro_annual_price_id");
    assertEquals(fake.state.factoryCallCount, 0, "factory must not be called");
    assertEquals(fake.state.retrieveCallCount, 0, "retrieve must not be called");
    assertResultDoesNotContainSecret(result);
  },
);

Deno.test(
  "T. BILLING-61: invalid stripeSecretKey keeps current semantics with four slots present",
  async () => {
    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription(),
    });

    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      fourSlotRuntimeParams({ stripeSecretKey: INVALID_SECRET }),
      fake.createRetrieveClient,
    );

    expectConfigFailure(result, "invalid_stripe_secret_key");
    assertEquals(fake.state.factoryCallCount, 0, "factory must not be called");
    assertEquals(fake.state.retrieveCallCount, 0, "retrieve must not be called");
    assertResultDoesNotContainSecret(result);

    const padded = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      fourSlotRuntimeParams({ stripeSecretKey: ` ${VALID_SECRET}` }),
      fake.createRetrieveClient,
    );
    expectConfigFailure(padded, "invalid_stripe_secret_key");
    assertEquals(fake.state.factoryCallCount, 0, "factory still unused");
  },
);

Deno.test(
  "U. BILLING-61: success continues to consume runtime catalog, not a reconstructed one",
  async () => {
    const fourSlotParams = fourSlotRuntimeParams();
    const fourSlotFake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription({
        items: { data: [{ price: { id: PRICE_BASE_MONTHLY } }] },
      }),
    });

    const fourSlotResult =
      await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
        fourSlotParams,
        fourSlotFake.createRetrieveClient,
      );

    expectSuccess(fourSlotResult);
    assertEquals(
      fourSlotResult.value.productTier,
      "base",
      "four-slot catalog admits Base Monthly",
    );

    const legacyFake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription({
        items: { data: [{ price: { id: PRICE_BASE_MONTHLY } }] },
      }),
    });
    const legacyResult = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      validRuntimeParams(),
      legacyFake.createRetrieveClient,
    );

    expectComposerFailure(legacyResult, "normalize", "unsupported_price");
  },
);

Deno.test(
  "V. BILLING-61: orchestrator remains a pure function of caller params — no env/runtime",
  async () => {
    const params = fourSlotRuntimeParams();
    const firstFake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription({
        items: { data: [{ price: { id: PRICE_PRO_ANNUAL } }] },
      }),
    });
    const secondFake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription({
        items: { data: [{ price: { id: PRICE_PRO_ANNUAL } }] },
      }),
    });

    const first = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      params,
      firstFake.createRetrieveClient,
    );
    const second = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      params,
      secondFake.createRetrieveClient,
    );

    expectSuccess(first);
    expectSuccess(second);
    assertEquals(first, second, "same params must yield the same result");
    assertEquals(first.value.productTier, "pro", "catalog from caller slots");

    const runtimeConfig = resolveForwardedRuntimeConfig(params);
    if (runtimeConfig.ok !== true) {
      throw new Error("runtime config must succeed");
    }
    assertEquals(
      runtimeConfig.catalog.map((entry) => entry.priceId).sort(),
      [
        params.supportedBaseMonthlyPriceId,
        params.supportedBaseAnnualPriceId,
        params.supportedProMonthlyPriceId,
        params.supportedProAnnualPriceId,
      ].sort(),
      "no constructed or env-sourced Price IDs",
    );
  },
);

Deno.test(
  "W. BILLING-61: historical three-field caller remains type-compatible",
  async () => {
    const historical: {
      provider_subscription_id: unknown;
      stripeSecretKey: unknown;
      supportedProMonthlyPriceId: unknown;
    } = {
      provider_subscription_id: SUB_ID,
      stripeSecretKey: VALID_SECRET,
      supportedProMonthlyPriceId: SUPPORTED_PRICE,
    };
    const params: FetchNormalizedStripeSubscriptionFromRuntimeConfigParams =
      historical;
    assert(
      !("supportedBaseMonthlyPriceId" in params),
      "historical caller does not supply Base Monthly",
    );
    assert(
      !("supportedBaseAnnualPriceId" in params),
      "historical caller does not supply Base Annual",
    );
    assert(
      !("supportedProAnnualPriceId" in params),
      "historical caller does not supply Pro Annual",
    );

    const fake = createFakeRetrieveClientFactory({
      kind: "resolve",
      subscription: validRawSubscription(),
    });
    const result = await fetchNormalizedStripeSubscriptionFromRuntimeConfig(
      params,
      fake.createRetrieveClient,
    );

    expectSuccess(result);
    assertEquals(result.value.productTier, "pro", "legacy Pro Monthly");
    assertResultDoesNotContainSecret(result);
  },
);
