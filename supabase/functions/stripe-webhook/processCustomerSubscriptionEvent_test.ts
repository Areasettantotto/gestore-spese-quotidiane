/**
 * Component tests for processCustomerSubscriptionEvent
 * (BILLING-19 / BILLING-41 / BILLING-43 / BILLING-45).
 *
 * Imports the real stripe-webhook module after a test-only Deno.serve
 * replace/restore. Exercises the exported processor with synthetic
 * events, an in-memory recorder, a tenant-resolver fake, a
 * subscription-observation fake, and a one-argument orchestrator fake.
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
const SYNTHETIC_PROVIDER_CUSTOMER_ID = "cus_billing19_fresh";
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
type TenantResolverFn = Parameters<Processor>[3];
type TenantResolverResult = Awaited<ReturnType<TenantResolverFn>>;
type ObservationReaderFn = Parameters<Processor>[4];
type ObservationReaderParams = Parameters<ObservationReaderFn>[0];
type ObservationReaderResult = Awaited<ReturnType<ObservationReaderFn>>;
type FetchFn = NonNullable<Parameters<Processor>[5]>;
type FetchParams = Parameters<FetchFn>[0];
type FetchResult = Awaited<ReturnType<FetchFn>>;
type RecorderResult = Awaited<ReturnType<RecorderFn>>;
type AdmissionClassifierFn = NonNullable<Parameters<Processor>[6]>;
type AdmissionClassifierParams = Parameters<AdmissionClassifierFn>[0];
type AdmissionClassifierResult = ReturnType<AdmissionClassifierFn>;

const SYNTHETIC_BF_TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const SYNTHETIC_OTHER_TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const STRIPE_PROVIDER = "stripe";
const SYNTHETIC_EVENT_CREATED = 1700000000;
const SYNTHETIC_WATERMARK_CREATED_AT = 1699000000;
const SYNTHETIC_WATERMARK_EVENT_ID = "evt_billing45_watermark";

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
  created?: number;
}): ProcessorEvent {
  return {
    id: params.eventId,
    type: params.eventType ?? "customer.subscription.updated",
    created: params.created ?? SYNTHETIC_EVENT_CREATED,
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
    created: SYNTHETIC_EVENT_CREATED,
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

function createTenantResolverFake(result: TenantResolverResult): {
  fn: TenantResolverFn;
  calls: string[];
} {
  const calls: string[] = [];
  const fn: TenantResolverFn = (providerCustomerId) => {
    calls.push(providerCustomerId);
    return Promise.resolve(result);
  };
  return { fn, calls };
}

function unusedTenantResolver(): {
  fn: TenantResolverFn;
  calls: string[];
} {
  const calls: string[] = [];
  const fn: TenantResolverFn = (providerCustomerId) => {
    calls.push(providerCustomerId);
    throw new Error(
      `tenant resolver must not be called, got ${
        JSON.stringify(providerCustomerId)
      }`,
    );
  };
  return { fn, calls };
}

function createObservationReaderFake(result: ObservationReaderResult): {
  fn: ObservationReaderFn;
  calls: ObservationReaderParams[];
} {
  const calls: ObservationReaderParams[] = [];
  const fn: ObservationReaderFn = (params) => {
    calls.push(params);
    return Promise.resolve(result);
  };
  return { fn, calls };
}

function unusedObservationReader(): {
  fn: ObservationReaderFn;
  calls: ObservationReaderParams[];
} {
  const calls: ObservationReaderParams[] = [];
  const fn: ObservationReaderFn = (params) => {
    calls.push(params);
    throw new Error(
      `observation reader must not be called, got ${JSON.stringify(params)}`,
    );
  };
  return { fn, calls };
}

function createAdmissionClassifierFake(result: AdmissionClassifierResult): {
  fn: AdmissionClassifierFn;
  calls: AdmissionClassifierParams[];
} {
  const calls: AdmissionClassifierParams[] = [];
  const fn: AdmissionClassifierFn = (params) => {
    calls.push(params);
    return result;
  };
  return { fn, calls };
}

function unusedAdmissionClassifier(): {
  fn: AdmissionClassifierFn;
  calls: AdmissionClassifierParams[];
} {
  const calls: AdmissionClassifierParams[] = [];
  const fn: AdmissionClassifierFn = (params) => {
    calls.push(params);
    throw new Error(
      `admission classifier must not be called, got ${JSON.stringify(params)}`,
    );
  };
  return { fn, calls };
}

function observationRowAbsentResult(): ObservationReaderResult {
  const result: ObservationReaderResult = {
    ok: true,
    observation: { kind: "row_absent" },
  };
  return result;
}

function observationRowPresentResult(
  tenantId: string,
  lastAppliedProviderEventCreatedAt: number | null = null,
  lastAppliedProviderEventId: string | null = null,
): ObservationReaderResult {
  const result: ObservationReaderResult = {
    ok: true,
    observation: {
      kind: "row_present",
      tenant_id: tenantId,
      last_applied_provider_event_created_at: lastAppliedProviderEventCreatedAt,
      last_applied_provider_event_id: lastAppliedProviderEventId,
    },
  };
  return result;
}

function observationLookupFailedResult(): ObservationReaderResult {
  const result: ObservationReaderResult = {
    ok: false,
    reason: "subscription_observation_lookup_failed",
  };
  return result;
}

function observationAmbiguousResult(): ObservationReaderResult {
  const result: ObservationReaderResult = {
    ok: false,
    reason: "subscription_observation_ambiguous",
  };
  return result;
}

function observationInvalidResult(): ObservationReaderResult {
  const result: ObservationReaderResult = {
    ok: false,
    reason: "subscription_observation_invalid",
  };
  return result;
}

function tenantResolverSuccessResult(): TenantResolverResult {
  const result: TenantResolverResult = {
    ok: true,
    tenant_id: SYNTHETIC_BF_TENANT_ID,
  };
  return result;
}

function tenantMappingNotFoundResult(): TenantResolverResult {
  const result: TenantResolverResult = {
    ok: false,
    reason: "tenant_mapping_not_found",
  };
  return result;
}

function tenantMappingAmbiguousResult(): TenantResolverResult {
  const result: TenantResolverResult = {
    ok: false,
    reason: "tenant_mapping_ambiguous",
  };
  return result;
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
      provider_customer_id: SYNTHETIC_PROVIDER_CUSTOMER_ID,
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
  assert(
    !serialized.includes(SYNTHETIC_BF_TENANT_ID) &&
      !serialized.includes(SYNTHETIC_OTHER_TENANT_ID) &&
      !serialized.includes("row_present") &&
      !serialized.includes("row_absent"),
    "HTTP body must not include row observation or tenant_id",
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

function assertObservationForwardedExactly(
  calls: ObservationReaderParams[],
  providerSubscriptionId: string,
): void {
  assertEquals(calls.length, 1, "observation reader call count");
  assertEquals(
    calls[0]?.provider,
    STRIPE_PROVIDER,
    "provider forwarded exactly",
  );
  assertEquals(
    calls[0]?.provider_subscription_id,
    providerSubscriptionId,
    "provider_subscription_id forwarded exactly from normalized snapshot",
  );
}

function assertAdmissionClassifierInputs(
  calls: AdmissionClassifierParams[],
  expected: {
    provider_event_id: string;
    provider_event_created_at: unknown;
    tenant_subscription_row: AdmissionClassifierParams[
      "tenant_subscription_row"
    ];
  },
): void {
  assertEquals(calls.length, 1, "admission classifier call count");
  const params = calls[0];
  assert(params !== undefined, "admission classifier params");
  assertEquals(
    Object.keys(params).sort(),
    [
      "billing_event_processed",
      "provider_event_created_at",
      "provider_event_id",
      "tenant_subscription_row",
    ],
    "admission classifier param keys",
  );
  assertEquals(
    params.provider_event_id,
    expected.provider_event_id,
    "provider_event_id forwarded exactly",
  );
  assertEquals(
    params.provider_event_created_at,
    expected.provider_event_created_at,
    "provider_event_created_at forwarded exactly",
  );
  assertEquals(
    params.billing_event_processed,
    false,
    "billing_event_processed must be false",
  );
  assertEquals(
    params.tenant_subscription_row,
    expected.tenant_subscription_row,
    "tenant_subscription_row mapping",
  );
  assert(
    !("tenant_id" in params),
    "tenant_id must not be passed as a classifier param",
  );
  assert(
    !("tenant_id" in params.tenant_subscription_row),
    "tenant_id must not be passed in tenant_subscription_row",
  );
}

Deno.test(
  "1. bootstrap failure → recorder once, orchestrator skipped, HTTP 502 generic",
  async () => {
    const event = invalidSubscriptionObjectEvent("evt_billing19_bootstrap");
    const billingEvent = createBillingEvent("be_billing19_bootstrap");
    const recorder = createRecorder("recorded");
    const tenantResolver = unusedTenantResolver();
    const observationReader = unusedObservationReader();
    const orchestrator = createOrchestratorFake(unusedOrchestratorResult());

    const response = await processCustomerSubscriptionEvent(
      event,
      billingEvent,
      recorder.fn,
      tenantResolver.fn,
      observationReader.fn,
      orchestrator.fn,
      unusedAdmissionClassifier().fn,
    );

    assertEquals(
      orchestrator.calls.length,
      0,
      "orchestrator must not be called",
    );
    assertEquals(
      tenantResolver.calls.length,
      0,
      "tenant resolver must not be called",
    );
    assertEquals(
      observationReader.calls.length,
      0,
      "observation reader must not be called",
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
      const tenantResolver = unusedTenantResolver();
      const observationReader = unusedObservationReader();
      const orchestrator = createOrchestratorFake(configFailureResult());

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertOrchestratorForwardedSyntheticEnv(
        orchestrator.calls,
        subscriptionId,
      );
      assertEquals(
        tenantResolver.calls.length,
        0,
        "tenant resolver must not be called",
      );
      assertEquals(
        observationReader.calls.length,
        0,
        "observation reader must not be called",
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
      const tenantResolver = unusedTenantResolver();
      const observationReader = unusedObservationReader();
      const orchestrator = createOrchestratorFake(refetchFailureResult());

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertOrchestratorForwardedSyntheticEnv(
        orchestrator.calls,
        subscriptionId,
      );
      assertEquals(
        tenantResolver.calls.length,
        0,
        "tenant resolver must not be called",
      );
      assertEquals(
        observationReader.calls.length,
        0,
        "observation reader must not be called",
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
      const tenantResolver = unusedTenantResolver();
      const observationReader = unusedObservationReader();
      const orchestrator = createOrchestratorFake(normalizeFailureResult());

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertEquals(orchestrator.calls.length, 1, "orchestrator called once");
      assertEquals(
        tenantResolver.calls.length,
        0,
        "tenant resolver must not be called",
      );
      assertEquals(
        observationReader.calls.length,
        0,
        "observation reader must not be called",
      );
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
  "5. BF success + BI row_absent → HTTP 200 receivedOk, recorder not called, BI once",
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
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowAbsentResult(),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_row_absent",
      });

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
      );

      assertOrchestratorForwardedSyntheticEnv(
        orchestrator.calls,
        subscriptionId,
      );
      assertEquals(
        tenantResolver.calls.length,
        1,
        "tenant resolver called once",
      );
      assertEquals(
        tenantResolver.calls[0],
        SYNTHETIC_PROVIDER_CUSTOMER_ID,
        "tenant resolver receives exact fresh-normalized provider_customer_id",
      );
      assertObservationForwardedExactly(
        observationReader.calls,
        subscriptionId,
      );
      assertAdmissionClassifierInputs(admissionClassifier.calls, {
        provider_event_id: eventId,
        provider_event_created_at: event.created,
        tenant_subscription_row: { presence: "absent" },
      });
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
    const tenantResolver = unusedTenantResolver();
    const observationReader = unusedObservationReader();
    const orchestrator = createOrchestratorFake(unusedOrchestratorResult());

    const response = await processCustomerSubscriptionEvent(
      event,
      billingEvent,
      recorder.fn,
      tenantResolver.fn,
      observationReader.fn,
      orchestrator.fn,
      unusedAdmissionClassifier().fn,
    );

    assertEquals(
      orchestrator.calls.length,
      0,
      "orchestrator must not be called",
    );
    assertEquals(
      tenantResolver.calls.length,
      0,
      "tenant resolver must not be called",
    );
    assertEquals(
      observationReader.calls.length,
      0,
      "observation reader must not be called",
    );
    assertRecorderCall(recorder.calls, {
      billingEventId: billingEvent.id,
      reason: "invalid_subscription_object",
      tenantId: null,
    });
    await assertReceivedOk(response, eventId, eventType);
  },
);

Deno.test(
  "7. identity mismatch after fresh-fetch success → recorder once, HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const bootstrapSubscriptionId = "sub_billing21_identity_a";
      const normalizedSubscriptionId = "sub_billing21_identity_b";
      const event = validSubscriptionEvent({
        eventId: "evt_billing21_identity_mismatch",
        subscriptionId: bootstrapSubscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing21_identity_mismatch");
      const recorder = createRecorder("recorded");
      const tenantResolver = unusedTenantResolver();
      const observationReader = unusedObservationReader();
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(normalizedSubscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertOrchestratorForwardedSyntheticEnv(
        orchestrator.calls,
        bootstrapSubscriptionId,
      );
      assertEquals(
        tenantResolver.calls.length,
        0,
        "tenant resolver must not be called on identity mismatch",
      );
      assertEquals(
        observationReader.calls.length,
        0,
        "observation reader must not be called on identity mismatch",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_identity_mismatch",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "subscription_identity_mismatch",
      );
    });
  },
);

Deno.test(
  "8. identity mismatch + recorder already_completed → HTTP 200 receivedOk",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const bootstrapSubscriptionId = "sub_billing21_identity_already_a";
      const normalizedSubscriptionId = "sub_billing21_identity_already_b";
      const eventId = "evt_billing21_identity_already_completed";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId: bootstrapSubscriptionId,
      });
      const billingEvent = createBillingEvent(
        "be_billing21_identity_already_completed",
      );
      const recorder = createRecorder("already_completed");
      const tenantResolver = unusedTenantResolver();
      const observationReader = unusedObservationReader();
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(normalizedSubscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertEquals(orchestrator.calls.length, 1, "orchestrator called once");
      assertEquals(
        tenantResolver.calls.length,
        0,
        "tenant resolver must not be called on identity mismatch",
      );
      assertEquals(
        observationReader.calls.length,
        0,
        "observation reader must not be called on identity mismatch",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_identity_mismatch",
        tenantId: null,
      });
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "9. identity match + BF tenant_mapping_not_found → recorder once, HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing23_not_found";
      const event = validSubscriptionEvent({
        eventId: "evt_billing23_not_found",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing23_not_found");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantMappingNotFoundResult(),
      );
      const observationReader = unusedObservationReader();
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertEquals(orchestrator.calls.length, 1, "orchestrator called once");
      assertEquals(
        tenantResolver.calls.length,
        1,
        "tenant resolver called once",
      );
      assertEquals(
        tenantResolver.calls[0],
        SYNTHETIC_PROVIDER_CUSTOMER_ID,
        "tenant resolver receives exact fresh-normalized provider_customer_id",
      );
      assertEquals(
        observationReader.calls.length,
        0,
        "observation reader must not be called when BF fails",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "tenant_mapping_not_found",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "tenant_mapping_not_found",
      );
    });
  },
);

Deno.test(
  "10. identity match + BF tenant_mapping_ambiguous → recorder once, HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing23_ambiguous";
      const event = validSubscriptionEvent({
        eventId: "evt_billing23_ambiguous",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing23_ambiguous");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantMappingAmbiguousResult(),
      );
      const observationReader = unusedObservationReader();
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertEquals(
        tenantResolver.calls.length,
        1,
        "tenant resolver called once",
      );
      assertEquals(
        observationReader.calls.length,
        0,
        "observation reader must not be called when BF fails",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "tenant_mapping_ambiguous",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "tenant_mapping_ambiguous",
      );
    });
  },
);

Deno.test(
  "11. BF tenant_mapping_not_found + recorder already_completed → HTTP 200 receivedOk",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing23_already_completed";
      const eventId = "evt_billing23_already_completed";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent(
        "be_billing23_already_completed",
      );
      const recorder = createRecorder("already_completed");
      const tenantResolver = createTenantResolverFake(
        tenantMappingNotFoundResult(),
      );
      const observationReader = unusedObservationReader();
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertEquals(
        tenantResolver.calls.length,
        1,
        "tenant resolver called once",
      );
      assertEquals(
        observationReader.calls.length,
        0,
        "observation reader must not be called when BF fails",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "tenant_mapping_not_found",
        tenantId: null,
      });
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "12. BF success + BI row_present same tenant → HTTP 200 receivedOk, recorder not called",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing41_same_tenant";
      const eventId = "evt_billing41_same_tenant";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing41_same_tenant");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowPresentResult(
          SYNTHETIC_BF_TENANT_ID,
          SYNTHETIC_WATERMARK_CREATED_AT,
          SYNTHETIC_WATERMARK_EVENT_ID,
        ),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_row_present_uninitialized",
      });

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
      );

      assertEquals(
        tenantResolver.calls.length,
        1,
        "tenant resolver called once",
      );
      assertObservationForwardedExactly(
        observationReader.calls,
        subscriptionId,
      );
      assertAdmissionClassifierInputs(admissionClassifier.calls, {
        provider_event_id: eventId,
        provider_event_created_at: event.created,
        tenant_subscription_row: {
          presence: "present",
          last_applied_provider_event_created_at:
            SYNTHETIC_WATERMARK_CREATED_AT,
          last_applied_provider_event_id: SYNTHETIC_WATERMARK_EVENT_ID,
        },
      });
      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "13. BF success + BI row_present different tenant → ownership mismatch, HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing43_different_tenant";
      const event = validSubscriptionEvent({
        eventId: "evt_billing43_different_tenant",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing43_different_tenant");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowPresentResult(SYNTHETIC_OTHER_TENANT_ID),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertEquals(
        tenantResolver.calls.length,
        1,
        "tenant resolver called once",
      );
      assertObservationForwardedExactly(
        observationReader.calls,
        subscriptionId,
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_ownership_mismatch",
        tenantId: null,
      });
      const bodyForLeakCheck = response.clone();
      await assertGenericUpstreamFailure(
        response,
        "subscription_ownership_mismatch",
      );
      const serialized = JSON.stringify(await bodyForLeakCheck.json());
      assert(
        !serialized.includes(SYNTHETIC_BF_TENANT_ID),
        "BF tenant_id must not leak in the HTTP body",
      );
      assert(
        !serialized.includes(SYNTHETIC_OTHER_TENANT_ID),
        "observation tenant_id must not leak in the HTTP body",
      );
      assert(
        !serialized.includes("row_present"),
        "observation row kind must not leak in the HTTP body",
      );
    });
  },
);

Deno.test(
  "14. BI subscription_observation_lookup_failed → recorder once, HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing41_lookup_failed";
      const event = validSubscriptionEvent({
        eventId: "evt_billing41_lookup_failed",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing41_lookup_failed");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationLookupFailedResult(),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertEquals(
        tenantResolver.calls.length,
        1,
        "tenant resolver called once",
      );
      assertObservationForwardedExactly(
        observationReader.calls,
        subscriptionId,
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_observation_lookup_failed",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "subscription_observation_lookup_failed",
      );
    });
  },
);

Deno.test(
  "15. BI subscription_observation_ambiguous → recorder once, HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing41_ambiguous";
      const event = validSubscriptionEvent({
        eventId: "evt_billing41_ambiguous",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing41_ambiguous");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationAmbiguousResult(),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertObservationForwardedExactly(
        observationReader.calls,
        subscriptionId,
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_observation_ambiguous",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "subscription_observation_ambiguous",
      );
    });
  },
);

Deno.test(
  "16. BI subscription_observation_invalid → recorder once, HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing41_invalid";
      const event = validSubscriptionEvent({
        eventId: "evt_billing41_invalid",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing41_invalid");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationInvalidResult(),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        unusedAdmissionClassifier().fn,
      );

      assertObservationForwardedExactly(
        observationReader.calls,
        subscriptionId,
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_observation_invalid",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "subscription_observation_invalid",
      );
    });
  },
);

Deno.test(
  "17. BH ok:true candidate_newer_event → HTTP 200 receivedOk, recorder not called",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing45_newer";
      const eventId = "evt_billing45_newer";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing45_newer");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowAbsentResult(),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_newer_event",
      });

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
      );

      assertEquals(
        observationReader.calls.length,
        1,
        "observation reader called once",
      );
      assertEquals(
        admissionClassifier.calls.length,
        1,
        "admission classifier called once",
      );
      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "18. BH ok:true stale_event → HTTP 200 receivedOk, recorder not called",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing45_stale";
      const eventId = "evt_billing45_stale";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing45_stale");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowPresentResult(
          SYNTHETIC_BF_TENANT_ID,
          SYNTHETIC_WATERMARK_CREATED_AT,
          SYNTHETIC_WATERMARK_EVENT_ID,
        ),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "stale_event",
      });

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
      );

      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "19. BH ok:true partial_retry → HTTP 200 receivedOk, recorder not called",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing45_partial_retry";
      const eventId = "evt_billing45_partial_retry";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing45_partial_retry");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowPresentResult(
          SYNTHETIC_BF_TENANT_ID,
          SYNTHETIC_WATERMARK_CREATED_AT,
          SYNTHETIC_WATERMARK_EVENT_ID,
        ),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "partial_retry",
      });

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
      );

      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "20. BH ok:true already_applied → HTTP 200 receivedOk, recorder not called",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing45_already_applied";
      const eventId = "evt_billing45_already_applied";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing45_already_applied");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowPresentResult(
          SYNTHETIC_BF_TENANT_ID,
          SYNTHETIC_WATERMARK_CREATED_AT,
          SYNTHETIC_WATERMARK_EVENT_ID,
        ),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "already_applied",
      });

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
      );

      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "21. BH ok:false invalid_watermark → recorder once, HTTP 502 generic",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing45_invalid_watermark";
      const event = validSubscriptionEvent({
        eventId: "evt_billing45_invalid_watermark",
        subscriptionId,
      });
      const billingEvent = createBillingEvent(
        "be_billing45_invalid_watermark",
      );
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowPresentResult(
          SYNTHETIC_BF_TENANT_ID,
          SYNTHETIC_WATERMARK_CREATED_AT,
          SYNTHETIC_WATERMARK_EVENT_ID,
        ),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );
      const admissionClassifier = createAdmissionClassifierFake({
        ok: false,
        reason: "invalid_watermark",
      });

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
      );

      assertEquals(
        admissionClassifier.calls.length,
        1,
        "admission classifier called once",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "invalid_watermark",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(response, "invalid_watermark");
    });
  },
);

Deno.test(
  "22. BH ok:false inconsistent_same_event → HTTP 502 generic, reason not leaked",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing45_inconsistent";
      const event = validSubscriptionEvent({
        eventId: "evt_billing45_inconsistent",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing45_inconsistent");
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowPresentResult(
          SYNTHETIC_BF_TENANT_ID,
          SYNTHETIC_WATERMARK_CREATED_AT,
          SYNTHETIC_WATERMARK_EVENT_ID,
        ),
      );
      const orchestrator = createOrchestratorFake(
        freshFetchSuccessResult(subscriptionId),
      );
      const admissionClassifier = createAdmissionClassifierFake({
        ok: false,
        reason: "inconsistent_same_event",
      });

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
      );

      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "inconsistent_same_event",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(
        response,
        "inconsistent_same_event",
      );
    });
  },
);
