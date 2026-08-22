/**
 * Deno tests for fetchNormalizedStripeSubscriptionFromRuntimeConfig
 * (BILLING-11 / BILLING-38).
 *
 * Exercises the BILLING-10 orchestrator through the optional
 * createRetrieveClient factory seam. Config validation, BG refetch,
 * BE normalize, and BJ composition remain real. The fake factory
 * supplies only StripeSubscriptionRetrieveClient.retrieve.
 *
 * Run:
 *   deno test --no-lock supabase/functions/_shared/fetchNormalizedStripeSubscriptionFromRuntimeConfig_test.ts
 *
 * No network/env/write/run capabilities required.
 * Fixtures are synthetic — not real secrets, tokens, or PII.
 */

import { createStripeSubscriptionRetrieveClient } from "./createStripeSubscriptionRetrieveClient.ts";
import {
  fetchNormalizedStripeSubscriptionFromRuntimeConfig,
  type FetchNormalizedStripeSubscriptionFromRuntimeConfigResult,
} from "./fetchNormalizedStripeSubscriptionFromRuntimeConfig.ts";
import type { StripeSubscriptionLike } from "./normalizeStripeSubscription.ts";
import type { StripeSubscriptionRetrieveClient } from "./refetchStripeSubscription.ts";
import { resolveStripeSubscriptionSyncRuntimeConfig } from "./resolveStripeSubscriptionSyncRuntimeConfig.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SUB_ID = "sub_test_runtime";
const CUSTOMER_ID = "cus_test_runtime";
const SUPPORTED_PRICE = "price_pro_monthly_test";
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
  } = {},
) {
  return {
    provider_subscription_id: SUB_ID,
    stripeSecretKey: VALID_SECRET,
    supportedProMonthlyPriceId: SUPPORTED_PRICE,
    ...overrides,
  };
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
