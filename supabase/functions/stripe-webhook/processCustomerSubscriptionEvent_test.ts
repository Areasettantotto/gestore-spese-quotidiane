/**
 * Component tests for processCustomerSubscriptionEvent (BILLING-19).
 *
 * Imports the real stripe-webhook module after a test-only Deno.serve
 * replace/restore. Exercises the exported processor with synthetic
 * events, an in-memory recorder, and a one-argument orchestrator fake.
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     --allow-read=supabase/functions \
 *     --allow-env=STRIPE_SECRET_KEY,STRIPE_PRICE_ID_PRO_MONTHLY \
 *     supabase/functions/stripe-webhook/processCustomerSubscriptionEvent_test.ts
 *
 * No network, Stripe API, Supabase, or remote assertion libraries.
 */

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
    delete: (key: string) => void;
  };
};

const ENV_STRIPE_SECRET_KEY = "STRIPE_SECRET_KEY";
const ENV_SUPPORTED_PRICE = "STRIPE_PRICE_ID_PRO_MONTHLY";
const SYNTHETIC_STRIPE_SECRET = "sk_test_billing19_synthetic_not_real";
const SYNTHETIC_SUPPORTED_PRICE = "price_billing19_pro_monthly_synthetic";
const PUBLIC_SUBSCRIPTION_FAILURE_MESSAGE =
  "Failed to process Stripe subscription event.";

const originalServeDescriptor = Object.getOwnPropertyDescriptor(
  Deno,
  "serve",
);
if (originalServeDescriptor === undefined) {
  throw new Error("Deno.serve property descriptor is missing");
}
if (originalServeDescriptor.configurable !== true) {
  throw new Error("Deno.serve is not configurable");
}

const originalServe = Deno.serve;
let serveCallCount = 0;
let webhookModule: typeof import("./index.ts") | undefined;

try {
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    enumerable: originalServeDescriptor.enumerable,
    writable: true,
    value: () => {
      serveCallCount += 1;
    },
  });

  webhookModule = await import(
    new URL("./index.ts", import.meta.url).href
  );
} finally {
  Object.defineProperty(Deno, "serve", originalServeDescriptor);
}

if (webhookModule === undefined) {
  throw new Error("dynamic import of stripe-webhook/index.ts did not complete");
}
if (serveCallCount !== 1) {
  throw new Error(`expected serveCallCount === 1, got ${serveCallCount}`);
}
if (Deno.serve !== originalServe) {
  throw new Error("Deno.serve was not restored to the original reference");
}
if (typeof webhookModule.processCustomerSubscriptionEvent !== "function") {
  throw new Error(
    "processCustomerSubscriptionEvent is not exported as a function",
  );
}

const processCustomerSubscriptionEvent =
  webhookModule.processCustomerSubscriptionEvent;

type Processor = typeof processCustomerSubscriptionEvent;
type ProcessorEvent = Parameters<Processor>[0];
type ProcessorBillingEvent = Parameters<Processor>[1];
type RecorderFn = Parameters<Processor>[2];
type FetchFn = NonNullable<Parameters<Processor>[3]>;
type FetchParams = Parameters<FetchFn>[0];
type FetchResult = Awaited<ReturnType<FetchFn>>;
type RecorderResult = Awaited<ReturnType<RecorderFn>>;

type RecorderCall = {
  billingEventId: string;
  reason: string;
  tenantId: string | null;
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

function readUnknownProperty(target: unknown, key: string): unknown {
  if (target === null || typeof target !== "object") {
    return undefined;
  }
  return Reflect.get(target, key);
}

function readStringProperty(target: unknown, key: string): string | undefined {
  const value = readUnknownProperty(target, key);
  return typeof value === "string" ? value : undefined;
}

function restoreEnv(key: string, previous: string | undefined): void {
  if (previous === undefined) {
    Deno.env.delete(key);
  } else {
    Deno.env.set(key, previous);
  }
}

async function withSyntheticStripeEnv(
  run: () => Promise<void>,
): Promise<void> {
  const previousSecret = Deno.env.get(ENV_STRIPE_SECRET_KEY);
  const previousPrice = Deno.env.get(ENV_SUPPORTED_PRICE);
  try {
    Deno.env.set(ENV_STRIPE_SECRET_KEY, SYNTHETIC_STRIPE_SECRET);
    Deno.env.set(ENV_SUPPORTED_PRICE, SYNTHETIC_SUPPORTED_PRICE);
    await run();
  } finally {
    restoreEnv(ENV_STRIPE_SECRET_KEY, previousSecret);
    restoreEnv(ENV_SUPPORTED_PRICE, previousPrice);
  }
}

function createBillingEvent(id: string): ProcessorBillingEvent {
  return { id };
}

function validSubscriptionEvent(params: {
  eventId: string;
  eventType?: string;
  subscriptionId: string;
}): ProcessorEvent {
  return {
    id: params.eventId,
    type: params.eventType ?? "customer.subscription.updated",
    data: {
      object: {
        id: params.subscriptionId,
      },
    },
  };
}

function invalidSubscriptionObjectEvent(eventId: string): ProcessorEvent {
  return {
    id: eventId,
    type: "customer.subscription.created",
    data: {},
  };
}

function createRecorder(status: RecorderResult["status"]): {
  fn: RecorderFn;
  calls: RecorderCall[];
} {
  const calls: RecorderCall[] = [];
  const fn: RecorderFn = (billingEventId, reason, tenantId) => {
    calls.push({ billingEventId, reason, tenantId });
    const result: RecorderResult = { status };
    return Promise.resolve(result);
  };
  return { fn, calls };
}

function createOrchestratorFake(result: FetchResult): {
  fn: FetchFn;
  calls: FetchParams[];
} {
  const calls: FetchParams[] = [];
  const fn: FetchFn = (params) => {
    calls.push(params);
    return Promise.resolve(result);
  };
  return { fn, calls };
}

function unusedOrchestratorResult(): FetchResult {
  const result: FetchResult = {
    ok: false,
    reason: "invalid_stripe_secret_key",
  };
  return result;
}

function configFailureResult(): FetchResult {
  const result: FetchResult = {
    ok: false,
    reason: "invalid_stripe_secret_key",
  };
  return result;
}

function refetchFailureResult(): FetchResult {
  const result: FetchResult = {
    ok: false,
    stage: "refetch",
    reason: "stripe_subscription_refetch_failed",
  };
  return result;
}

function normalizeFailureResult(): FetchResult {
  const result: FetchResult = {
    ok: false,
    stage: "normalize",
    reason: "unsupported_price",
  };
  return result;
}

function freshFetchSuccessResult(subscriptionId: string): FetchResult {
  const result: FetchResult = {
    ok: true,
    value: {
      provider_subscription_id: subscriptionId,
      provider_customer_id: "cus_billing19_fresh",
      plan_code: "paid",
      status: "active",
      current_period_start: "2023-11-14T22:13:20.000Z",
      current_period_end: "2023-11-18T00:26:40.000Z",
      cancel_at_period_end: false,
      trial_ends_at: null,
    },
  };
  return result;
}

async function assertGenericUpstreamFailure(
  response: Response,
  internalReason: string,
): Promise<void> {
  assertEquals(response.status, 502, "HTTP status");
  const body: unknown = await response.json();
  const serialized = JSON.stringify(body);
  const error = readUnknownProperty(body, "error");
  assertEquals(
    readStringProperty(error, "code"),
    "UPSTREAM_ERROR",
    "public error code",
  );
  assertEquals(
    readStringProperty(error, "message"),
    PUBLIC_SUBSCRIPTION_FAILURE_MESSAGE,
    "public error message",
  );
  assert(
    !serialized.includes(internalReason),
    "internal reason must not leak in the HTTP body",
  );
}

async function assertReceivedOk(
  response: Response,
  eventId: string,
  eventType: string,
): Promise<void> {
  assertEquals(response.status, 200, "HTTP status");
  const body: unknown = await response.json();
  const data = readUnknownProperty(body, "data");
  assert(
    data !== null && typeof data === "object",
    "receivedOk body must include data",
  );
  assertEquals(
    readUnknownProperty(data, "received"),
    true,
    "received flag",
  );
  assertEquals(
    readStringProperty(data, "event_id"),
    eventId,
    "event_id",
  );
  assertEquals(
    readStringProperty(data, "event_type"),
    eventType,
    "event_type",
  );
}

function assertRecorderCall(
  calls: RecorderCall[],
  expected: RecorderCall,
): void {
  assertEquals(calls.length, 1, "recorder call count");
  assertEquals(
    calls[0]?.billingEventId,
    expected.billingEventId,
    "billingEventId",
  );
  assertEquals(calls[0]?.reason, expected.reason, "recorder reason");
  assertEquals(calls[0]?.tenantId, expected.tenantId, "tenantId");
}

function assertOrchestratorForwardedSyntheticEnv(
  calls: FetchParams[],
  providerSubscriptionId: string,
): void {
  assertEquals(calls.length, 1, "orchestrator call count");
  assert(
    calls[0]?.provider_subscription_id === providerSubscriptionId,
    "provider_subscription_id forwarded exactly",
  );
  assert(
    calls[0]?.stripeSecretKey === SYNTHETIC_STRIPE_SECRET,
    "stripeSecretKey forwarded from synthetic env",
  );
  assert(
    calls[0]?.supportedProMonthlyPriceId === SYNTHETIC_SUPPORTED_PRICE,
    "supportedProMonthlyPriceId forwarded from synthetic env",
  );
}

Deno.test(
  "1. bootstrap failure → recorder once, orchestrator skipped, HTTP 502 generic",
  async () => {
    const event = invalidSubscriptionObjectEvent("evt_billing19_bootstrap");
    const billingEvent = createBillingEvent("be_billing19_bootstrap");
    const recorder = createRecorder("recorded");
    const orchestrator = createOrchestratorFake(unusedOrchestratorResult());

    const response = await processCustomerSubscriptionEvent(
      event,
      billingEvent,
      recorder.fn,
      orchestrator.fn,
    );

    assertEquals(
      orchestrator.calls.length,
      0,
      "orchestrator must not be called",
    );
    assertRecorderCall(recorder.calls, {
      billingEventId: billingEvent.id,
      reason: "invalid_subscription_object",
      tenantId: null,
    });
    await assertGenericUpstreamFailure(
      response,
      "invalid_subscription_object",
    );
  },
);

Deno.test(
  "2. orchestrator config failure propagated → HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing19_config";
      const event = validSubscriptionEvent({
        eventId: "evt_billing19_config",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing19_config");
      const recorder = createRecorder("recorded");
      const orchestrator = createOrchestratorFake(configFailureResult());

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        orchestrator.fn,
      );

      assertOrchestratorForwardedSyntheticEnv(
        orchestrator.calls,
        subscriptionId,
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "invalid_stripe_secret_key",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "invalid_stripe_secret_key",
      );
    });
  },
);

Deno.test(
  "3. orchestrator refetch failure + recorder db_error → HTTP 502",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing19_refetch";
      const event = validSubscriptionEvent({
        eventId: "evt_billing19_refetch",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing19_refetch");
      const recorder = createRecorder("db_error");
      const orchestrator = createOrchestratorFake(refetchFailureResult());

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        orchestrator.fn,
      );

      assertOrchestratorForwardedSyntheticEnv(
        orchestrator.calls,
        subscriptionId,
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "stripe_subscription_refetch_failed",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "stripe_subscription_refetch_failed",
      );
    });
  },
);

Deno.test(
  "4. orchestrator normalize failure propagated → HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing19_normalize";
      const event = validSubscriptionEvent({
        eventId: "evt_billing19_normalize",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing19_normalize");
      const recorder = createRecorder("recorded");
      const orchestrator = createOrchestratorFake(normalizeFailureResult());

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        orchestrator.fn,
      );

      assertEquals(orchestrator.calls.length, 1, "orchestrator called once");
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "unsupported_price",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(response, "unsupported_price");
    });
  },
);

Deno.test(
  "5. fresh-fetch success → HTTP 200 receivedOk, recorder not called",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing19_fresh";
      const eventId = "evt_billing19_fresh";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing19_fresh");
      const recorder = createRecorder("recorded");
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        orchestrator.fn,
      );

      assertOrchestratorForwardedSyntheticEnv(
        orchestrator.calls,
        subscriptionId,
      );
      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "6. recorder already_completed on bootstrap failure → HTTP 200 receivedOk",
  async () => {
    const eventId = "evt_billing19_already_completed";
    const eventType = "customer.subscription.created";
    const event = invalidSubscriptionObjectEvent(eventId);
    const billingEvent = createBillingEvent("be_billing19_already_completed");
    const recorder = createRecorder("already_completed");
    const orchestrator = createOrchestratorFake(unusedOrchestratorResult());

    const response = await processCustomerSubscriptionEvent(
      event,
      billingEvent,
      recorder.fn,
      orchestrator.fn,
    );

    assertEquals(
      orchestrator.calls.length,
      0,
      "orchestrator must not be called",
    );
    assertRecorderCall(recorder.calls, {
      billingEventId: billingEvent.id,
      reason: "invalid_subscription_object",
      tenantId: null,
    });
    await assertReceivedOk(response, eventId, eventType);
  },
);
