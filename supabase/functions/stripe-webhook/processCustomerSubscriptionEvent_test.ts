/**
 * Component tests for processCustomerSubscriptionEvent
 * (BILLING-19 / BILLING-41 / BILLING-43 / BILLING-45 / BILLING-48 /
 * BILLING-50 / BILLING-51).
 *
 * Imports the real stripe-webhook module after a test-only Deno.serve
 * replace/restore. Exercises the exported processor with synthetic
 * events, an in-memory recorder, a tenant-resolver fake, a
 * subscription-observation fake, a persistence fake, a billing-event
 * tenant-stamp fake, and a one-argument orchestrator fake.
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
type PersistFn = NonNullable<Parameters<Processor>[7]>;
type PersistParams = Parameters<PersistFn>[0];
type PersistResult = Awaited<ReturnType<PersistFn>>;
type PersistOperation = PersistParams["operation"];
type EnsureBillingEventTenantFn = NonNullable<Parameters<Processor>[8]>;
type EnsureBillingEventTenantParams = Parameters<
  EnsureBillingEventTenantFn
>[0];
type EnsureBillingEventTenantResult = Awaited<
  ReturnType<EnsureBillingEventTenantFn>
>;

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

function createPersistFake(result: PersistResult): {
  fn: PersistFn;
  calls: PersistParams[];
} {
  const calls: PersistParams[] = [];
  const fn: PersistFn = (params) => {
    calls.push(params);
    return Promise.resolve(result);
  };
  return { fn, calls };
}

function unusedPersist(): {
  fn: PersistFn;
  calls: PersistParams[];
} {
  const calls: PersistParams[] = [];
  const fn: PersistFn = (params) => {
    calls.push(params);
    throw new Error(
      `persistence helper must not be called, got ${JSON.stringify(params)}`,
    );
  };
  return { fn, calls };
}

function createEnsureBillingEventTenantFake(
  result: EnsureBillingEventTenantResult,
): {
  fn: EnsureBillingEventTenantFn;
  calls: EnsureBillingEventTenantParams[];
} {
  const calls: EnsureBillingEventTenantParams[] = [];
  const fn: EnsureBillingEventTenantFn = (params) => {
    calls.push(params);
    return Promise.resolve(result);
  };
  return { fn, calls };
}

function unusedEnsureBillingEventTenant(): {
  fn: EnsureBillingEventTenantFn;
  calls: EnsureBillingEventTenantParams[];
} {
  const calls: EnsureBillingEventTenantParams[] = [];
  const fn: EnsureBillingEventTenantFn = (params) => {
    calls.push(params);
    throw new Error(
      `tenant-stamp helper must not be called, got ${JSON.stringify(params)}`,
    );
  };
  return { fn, calls };
}

function tenantStampSuccessResult(): EnsureBillingEventTenantResult {
  const result: EnsureBillingEventTenantResult = { ok: true };
  return result;
}

function tenantStampFailureResult(): EnsureBillingEventTenantResult {
  const result: EnsureBillingEventTenantResult = {
    ok: false,
    reason: "billing_event_tenant_stamp_failed",
  };
  return result;
}

function persistInsertedResult(): PersistResult {
  const result: PersistResult = { ok: true, kind: "inserted" };
  return result;
}

function persistUpdatedResult(): PersistResult {
  const result: PersistResult = { ok: true, kind: "updated" };
  return result;
}

function persistInsertConflictResult(): PersistResult {
  const result: PersistResult = {
    ok: false,
    reason: "subscription_insert_conflict",
  };
  return result;
}

function persistCasMissResult(): PersistResult {
  const result: PersistResult = {
    ok: false,
    reason: "subscription_cas_miss",
  };
  return result;
}

function persistFailedResult(): PersistResult {
  const result: PersistResult = {
    ok: false,
    reason: "subscription_persistence_failed",
  };
  return result;
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

function assertPersistCalledOnce(
  calls: PersistParams[],
  expected: {
    tenant_id: string;
    snapshot: PersistParams["snapshot"];
    provider_event_created_at: number;
    provider_event_id: string;
    operation: PersistOperation;
  },
): void {
  assertEquals(calls.length, 1, "persistence helper call count");
  const params = calls[0];
  assert(params !== undefined, "persistence helper params");
  assertEquals(
    Object.keys(params).sort(),
    [
      "operation",
      "provider_event_created_at",
      "provider_event_id",
      "snapshot",
      "tenant_id",
    ],
    "persistence helper param keys",
  );
  assertEquals(
    params.tenant_id,
    expected.tenant_id,
    "tenant_id must be BF authority",
  );
  assertEquals(
    params.snapshot,
    expected.snapshot,
    "snapshot must be the normalized subscription",
  );
  assertEquals(
    params.provider_event_created_at,
    expected.provider_event_created_at,
    "provider_event_created_at must be the current event.created",
  );
  assertEquals(
    params.provider_event_id,
    expected.provider_event_id,
    "provider_event_id must be the current event.id",
  );
  assertEquals(
    params.operation,
    expected.operation,
    "persistence operation mapping",
  );
  assert(
    !("client" in params),
    "processor-facing persist params must not include client",
  );
  assert(
    !("billing_state_revision" in params),
    "billing_state_revision must not be passed to persistence",
  );
  assert(
    !("processed_at" in params),
    "processed_at must not be passed to persistence",
  );
  assert(
    !("updated_at" in params),
    "updated_at must not be passed to persistence",
  );
  assert(
    !("tenant_id" in params.snapshot),
    "normalized snapshot must not carry tenant_id authority",
  );
}

function assertTenantStampCalledOnce(
  calls: EnsureBillingEventTenantParams[],
  expected: {
    billingEventId: string;
    tenantId: string;
  },
): void {
  assertEquals(calls.length, 1, "tenant-stamp helper call count");
  const params = calls[0];
  assert(params !== undefined, "tenant-stamp helper params");
  assertEquals(
    Object.keys(params).sort(),
    ["billingEventId", "tenantId"],
    "tenant-stamp helper param keys",
  );
  assertEquals(
    params.billingEventId,
    expected.billingEventId,
    "billingEventId forwarded exactly",
  );
  assertEquals(
    params.tenantId,
    expected.tenantId,
    "tenantId must be BF authority",
  );
  assert(
    !("client" in params),
    "processor-facing tenant-stamp params must not include client",
  );
  assert(
    !("processed_at" in params),
    "processed_at must not be passed to tenant-stamp",
  );
}

function assertProcessorDoesNotWriteProcessedAt(): void {
  const source = processCustomerSubscriptionEvent.toString();
  assert(
    !source.includes("markBillingEventProcessed"),
    "nodo 9 processed_at writer must remain unwired in the subscription processor",
  );
  assert(
    !source.includes("ensureTenantIdOnBillingEvent"),
    "processor must not call ensureTenantIdOnBillingEvent directly",
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
      unusedPersist().fn,
      unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
  "5. candidate_row_absent → persist INSERT once with BF tenant + normalized snapshot + event watermark, HTTP 200",
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
      const fetchResult = freshFetchSuccessResult(subscriptionId);
      const orchestrator = createOrchestratorFake(fetchResult);
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_row_absent",
      });
      const persist = createPersistFake(persistInsertedResult());
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampSuccessResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      if (fetchResult.ok !== true) {
        throw new Error("fresh fetch fixture must succeed");
      }
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
      assertEquals(
        observationReader.calls.length,
        1,
        "BI observation must be queried exactly once",
      );
      assertAdmissionClassifierInputs(admissionClassifier.calls, {
        provider_event_id: eventId,
        provider_event_created_at: event.created,
        tenant_subscription_row: { presence: "absent" },
      });
      assertPersistCalledOnce(persist.calls, {
        tenant_id: SYNTHETIC_BF_TENANT_ID,
        snapshot: fetchResult.value,
        provider_event_created_at: SYNTHETIC_EVENT_CREATED,
        provider_event_id: eventId,
        operation: { kind: "insert" },
      });
      assertEquals(
        persist.calls[0]?.tenant_id,
        tenantResolver.calls[0] === SYNTHETIC_PROVIDER_CUSTOMER_ID
          ? SYNTHETIC_BF_TENANT_ID
          : "mismatch",
        "persist tenant_id must come from BF, not Stripe metadata",
      );
      assertEquals(
        persist.calls[0]?.tenant_id === SYNTHETIC_OTHER_TENANT_ID,
        false,
        "persist tenant_id must not use Stripe metadata tenant_id",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
      assertEquals(
        stamp.calls[0]?.tenantId,
        SYNTHETIC_BF_TENANT_ID,
        "tenant-stamp tenantId must be tenantResolutionResult.tenant_id",
      );
      assertProcessorDoesNotWriteProcessedAt();
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
      unusedPersist().fn,
      unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
  "12. candidate_row_present_uninitialized → persist UPDATE uninitialized once, HTTP 200",
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
        observationRowPresentResult(SYNTHETIC_BF_TENANT_ID, null, null),
      );
      const fetchResult = freshFetchSuccessResult(subscriptionId);
      const orchestrator = createOrchestratorFake(fetchResult);
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_row_present_uninitialized",
      });
      const persist = createPersistFake(persistUpdatedResult());
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampSuccessResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      if (fetchResult.ok !== true) {
        throw new Error("fresh fetch fixture must succeed");
      }
      assertEquals(
        tenantResolver.calls.length,
        1,
        "tenant resolver called once",
      );
      assertObservationForwardedExactly(
        observationReader.calls,
        subscriptionId,
      );
      assertEquals(
        observationReader.calls.length,
        1,
        "BI observation must be queried exactly once",
      );
      assertAdmissionClassifierInputs(admissionClassifier.calls, {
        provider_event_id: eventId,
        provider_event_created_at: event.created,
        tenant_subscription_row: {
          presence: "present",
          last_applied_provider_event_created_at: null,
          last_applied_provider_event_id: null,
        },
      });
      assertPersistCalledOnce(persist.calls, {
        tenant_id: SYNTHETIC_BF_TENANT_ID,
        snapshot: fetchResult.value,
        provider_event_created_at: SYNTHETIC_EVENT_CREATED,
        provider_event_id: eventId,
        operation: {
          kind: "update",
          expected_watermark: { kind: "uninitialized" },
        },
      });
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
      assertProcessorDoesNotWriteProcessedAt();
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
        unusedPersist().fn,
        unusedEnsureBillingEventTenant().fn,
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
  "17. candidate_newer_event → persist UPDATE initialized with BI W_sub expected, current event watermark, HTTP 200",
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
        observationRowPresentResult(
          SYNTHETIC_BF_TENANT_ID,
          SYNTHETIC_WATERMARK_CREATED_AT,
          SYNTHETIC_WATERMARK_EVENT_ID,
        ),
      );
      const fetchResult = freshFetchSuccessResult(subscriptionId);
      const orchestrator = createOrchestratorFake(fetchResult);
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_newer_event",
      });
      const persist = createPersistFake(persistUpdatedResult());
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampSuccessResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      if (fetchResult.ok !== true) {
        throw new Error("fresh fetch fixture must succeed");
      }
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
      assertPersistCalledOnce(persist.calls, {
        tenant_id: SYNTHETIC_BF_TENANT_ID,
        snapshot: fetchResult.value,
        provider_event_created_at: SYNTHETIC_EVENT_CREATED,
        provider_event_id: eventId,
        operation: {
          kind: "update",
          expected_watermark: {
            kind: "initialized",
            last_applied_provider_event_created_at:
              SYNTHETIC_WATERMARK_CREATED_AT,
            last_applied_provider_event_id: SYNTHETIC_WATERMARK_EVENT_ID,
          },
        },
      });
      assertEquals(
        persist.calls[0]?.provider_event_created_at ===
          SYNTHETIC_WATERMARK_CREATED_AT,
        false,
        "current watermark must remain the new event, not BI W_sub",
      );
      assertEquals(
        persist.calls[0]?.provider_event_id === SYNTHETIC_WATERMARK_EVENT_ID,
        false,
        "current event id must remain the new event, not BI W_sub",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
      assertProcessorDoesNotWriteProcessedAt();
      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "18. stale_event → persistence NOT called, tenant-stamp once with BF tenant, HTTP 200",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing51_stale";
      const eventId = "evt_billing51_stale";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing51_stale");
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

      const persist = unusedPersist();
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampSuccessResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(
        tenantResolver.calls.length,
        1,
        "stale_event must still resolve BF tenant once",
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
      assertEquals(
        persist.calls.length,
        0,
        "stale_event must not rewrite tenant_subscriptions",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
      assertEquals(
        stamp.calls[0]?.tenantId,
        SYNTHETIC_BF_TENANT_ID,
        "stale_event tenant-stamp tenantId must be tenantResolutionResult.tenant_id",
      );
      assertProcessorDoesNotWriteProcessedAt();
      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "19. partial_retry → persistence NOT called, tenant-stamp once, HTTP 200",
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

      const persist = unusedPersist();
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampSuccessResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(
        persist.calls.length,
        0,
        "partial_retry must not rewrite tenant_subscriptions",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
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

      const persist = unusedPersist();
      const stamp = unusedEnsureBillingEventTenant();

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(persist.calls.length, 0, "persistence must not be called");
      assertEquals(stamp.calls.length, 0, "tenant-stamp must not be called");
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
      const persist = unusedPersist();
      const stamp = unusedEnsureBillingEventTenant();

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(
        persist.calls.length,
        0,
        "persistence must not be called on BH failure",
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
      const persist = unusedPersist();
      const stamp = unusedEnsureBillingEventTenant();

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(
        persist.calls.length,
        0,
        "persistence must not be called on BH failure",
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

Deno.test(
  "23. candidate_equal_timestamp_distinct_event → persist UPDATE initialized with exact BI W_sub, HTTP 200",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing48_equal_ts";
      const eventId = "evt_billing48_equal_ts";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
        created: SYNTHETIC_WATERMARK_CREATED_AT,
      });
      const billingEvent = createBillingEvent("be_billing48_equal_ts");
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
      const fetchResult = freshFetchSuccessResult(subscriptionId);
      const orchestrator = createOrchestratorFake(fetchResult);
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_equal_timestamp_distinct_event",
      });
      const persist = createPersistFake(persistUpdatedResult());
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampSuccessResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      if (fetchResult.ok !== true) {
        throw new Error("fresh fetch fixture must succeed");
      }
      assertEquals(
        observationReader.calls.length,
        1,
        "BI observation must be queried exactly once",
      );
      assertPersistCalledOnce(persist.calls, {
        tenant_id: SYNTHETIC_BF_TENANT_ID,
        snapshot: fetchResult.value,
        provider_event_created_at: SYNTHETIC_WATERMARK_CREATED_AT,
        provider_event_id: eventId,
        operation: {
          kind: "update",
          expected_watermark: {
            kind: "initialized",
            last_applied_provider_event_created_at:
              SYNTHETIC_WATERMARK_CREATED_AT,
            last_applied_provider_event_id: SYNTHETIC_WATERMARK_EVENT_ID,
          },
        },
      });
      assertEquals(
        persist.calls[0]?.provider_event_id,
        eventId,
        "current event id must be the new event, not BI W_sub",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
      assertProcessorDoesNotWriteProcessedAt();
      assertEquals(recorder.calls.length, 0, "recorder must not be called");
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "24. subscription_insert_conflict → generic HTTP 502, reason not leaked",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing48_insert_conflict";
      const event = validSubscriptionEvent({
        eventId: "evt_billing48_insert_conflict",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing48_insert_conflict");
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
      const persist = createPersistFake(persistInsertConflictResult());
      const stamp = unusedEnsureBillingEventTenant();

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(persist.calls.length, 1, "persistence called once");
      assertEquals(
        stamp.calls.length,
        0,
        "tenant-stamp must not be called after persistence failure",
      );
      assertEquals(
        observationReader.calls.length,
        1,
        "BI must not be queried again after persistence conflict",
      );
      assertEquals(
        persist.calls[0]?.operation,
        { kind: "insert" },
        "insert conflict path must not fall back to update",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_insert_conflict",
        tenantId: null,
      });
      const bodyForLeakCheck = response.clone();
      await assertGenericUpstreamFailure(
        response,
        "subscription_insert_conflict",
      );
      const serialized = JSON.stringify(await bodyForLeakCheck.json());
      assert(
        !serialized.includes("23505"),
        "unique violation code must not leak",
      );
      assertEquals(response.status === 409, false, "must not return HTTP 409");
    });
  },
);

Deno.test(
  "25. subscription_cas_miss → generic HTTP 502, reason not leaked",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing48_cas_miss";
      const event = validSubscriptionEvent({
        eventId: "evt_billing48_cas_miss",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing48_cas_miss");
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
        kind: "candidate_newer_event",
      });
      const persist = createPersistFake(persistCasMissResult());
      const stamp = unusedEnsureBillingEventTenant();

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(persist.calls.length, 1, "persistence called once");
      assertEquals(
        stamp.calls.length,
        0,
        "tenant-stamp must not be called after persistence failure",
      );
      assertEquals(
        observationReader.calls.length,
        1,
        "BI must not be queried again after CAS miss",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_cas_miss",
        tenantId: null,
      });
      await assertGenericUpstreamFailure(response, "subscription_cas_miss");
    });
  },
);

Deno.test(
  "26. subscription_persistence_failed → generic HTTP 502, reason not leaked",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing48_persist_failed";
      const event = validSubscriptionEvent({
        eventId: "evt_billing48_persist_failed",
        subscriptionId,
      });
      const billingEvent = createBillingEvent("be_billing48_persist_failed");
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
      const persist = createPersistFake(persistFailedResult());
      const stamp = unusedEnsureBillingEventTenant();

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(persist.calls.length, 1, "persistence called once");
      assertEquals(
        stamp.calls.length,
        0,
        "tenant-stamp must not be called after persistence failure",
      );
      assertEquals(
        observationReader.calls.length,
        1,
        "BI must not be queried again after persistence failure",
      );
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "subscription_persistence_failed",
        tenantId: null,
      });
      const bodyForLeakCheck = response.clone();
      await assertGenericUpstreamFailure(
        response,
        "subscription_persistence_failed",
      );
      const serialized = JSON.stringify(await bodyForLeakCheck.json());
      assert(
        !serialized.includes("fully_applied") &&
          !serialized.includes("processed_at"),
        "HTTP body must not suggest nodo 9 completion",
      );
    });
  },
);

Deno.test(
  "27. partial_retry + tenant-stamp failure → persistence NOT called, HTTP 502",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing50_partial_retry_stamp_fail";
      const event = validSubscriptionEvent({
        eventId: "evt_billing50_partial_retry_stamp_fail",
        subscriptionId,
      });
      const billingEvent = createBillingEvent(
        "be_billing50_partial_retry_stamp_fail",
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
        ok: true,
        kind: "partial_retry",
      });
      const persist = unusedPersist();
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampFailureResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(
        persist.calls.length,
        0,
        "partial_retry must not rewrite tenant_subscriptions",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "billing_event_tenant_stamp_failed",
        tenantId: null,
      });
      assertProcessorDoesNotWriteProcessedAt();
      await assertGenericUpstreamFailure(
        response,
        "billing_event_tenant_stamp_failed",
      );
    });
  },
);

Deno.test(
  "28. candidate persistence success + tenant-stamp failure → HTTP 502, persist once",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing50_persist_ok_stamp_fail";
      const event = validSubscriptionEvent({
        eventId: "evt_billing50_persist_ok_stamp_fail",
        subscriptionId,
      });
      const billingEvent = createBillingEvent(
        "be_billing50_persist_ok_stamp_fail",
      );
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake(
        tenantResolverSuccessResult(),
      );
      const observationReader = createObservationReaderFake(
        observationRowAbsentResult(),
      );
      const fetchResult = freshFetchSuccessResult(subscriptionId);
      const orchestrator = createOrchestratorFake(fetchResult);
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_row_absent",
      });
      const persist = createPersistFake(persistInsertedResult());
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampFailureResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      if (fetchResult.ok !== true) {
        throw new Error("fresh fetch fixture must succeed");
      }
      assertPersistCalledOnce(persist.calls, {
        tenant_id: SYNTHETIC_BF_TENANT_ID,
        snapshot: fetchResult.value,
        provider_event_created_at: SYNTHETIC_EVENT_CREATED,
        provider_event_id: event.id,
        operation: { kind: "insert" },
      });
      assertEquals(
        persist.calls.length,
        1,
        "persistence must not be retried in-request after stamp failure",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "billing_event_tenant_stamp_failed",
        tenantId: null,
      });
      assertProcessorDoesNotWriteProcessedAt();
      const bodyForLeakCheck = response.clone();
      await assertGenericUpstreamFailure(
        response,
        "billing_event_tenant_stamp_failed",
      );
      const serialized = JSON.stringify(await bodyForLeakCheck.json());
      assert(
        !serialized.includes("processed_at") &&
          !serialized.includes("fully_applied"),
        "HTTP body must not suggest nodo 9 completion",
      );
    });
  },
);

Deno.test(
  "29. tenant-stamp tenantId is exactly tenantResolutionResult.tenant_id",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const uniqueTenantId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
      const subscriptionId = "sub_billing50_tenant_authority";
      const eventId = "evt_billing50_tenant_authority";
      const eventType = "customer.subscription.updated";
      const event = validSubscriptionEvent({
        eventId,
        eventType,
        subscriptionId,
      });
      const billingEvent = createBillingEvent(
        "be_billing50_tenant_authority",
      );
      const recorder = createRecorder("recorded");
      const tenantResolver = createTenantResolverFake({
        ok: true,
        tenant_id: uniqueTenantId,
      });
      const observationReader = createObservationReaderFake(
        observationRowAbsentResult(),
      );
      const fetchResult = freshFetchSuccessResult(subscriptionId);
      const orchestrator = createOrchestratorFake(fetchResult);
      const admissionClassifier = createAdmissionClassifierFake({
        ok: true,
        kind: "candidate_row_absent",
      });
      const persist = createPersistFake(persistInsertedResult());
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampSuccessResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      if (fetchResult.ok !== true) {
        throw new Error("fresh fetch fixture must succeed");
      }
      assertEquals(
        persist.calls[0]?.tenant_id,
        uniqueTenantId,
        "persist tenant_id must match BF result",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: uniqueTenantId,
      });
      assertEquals(
        stamp.calls[0]?.tenantId === SYNTHETIC_BF_TENANT_ID,
        false,
        "tenant-stamp must not use a hardcoded tenant other than BF result",
      );
      assertEquals(
        stamp.calls[0]?.tenantId === SYNTHETIC_OTHER_TENANT_ID,
        false,
        "tenant-stamp must not use Stripe metadata tenant_id",
      );
      assertProcessorDoesNotWriteProcessedAt();
      await assertReceivedOk(response, eventId, eventType);
    });
  },
);

Deno.test(
  "30. source guard: processor does not wire markBillingEventProcessed",
  () => {
    assertProcessorDoesNotWriteProcessedAt();
  },
);

Deno.test(
  "31. stale_event + tenant-stamp failure → persistence NOT called, HTTP 502",
  async () => {
    await withSyntheticStripeEnv(async () => {
      const subscriptionId = "sub_billing51_stale_stamp_fail";
      const event = validSubscriptionEvent({
        eventId: "evt_billing51_stale_stamp_fail",
        subscriptionId,
      });
      const billingEvent = createBillingEvent(
        "be_billing51_stale_stamp_fail",
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
        ok: true,
        kind: "stale_event",
      });
      const persist = unusedPersist();
      const stamp = createEnsureBillingEventTenantFake(
        tenantStampFailureResult(),
      );

      const response = await processCustomerSubscriptionEvent(
        event,
        billingEvent,
        recorder.fn,
        tenantResolver.fn,
        observationReader.fn,
        orchestrator.fn,
        admissionClassifier.fn,
        persist.fn,
        stamp.fn,
      );

      assertEquals(
        persist.calls.length,
        0,
        "stale_event must not rewrite tenant_subscriptions",
      );
      assertTenantStampCalledOnce(stamp.calls, {
        billingEventId: billingEvent.id,
        tenantId: SYNTHETIC_BF_TENANT_ID,
      });
      assertRecorderCall(recorder.calls, {
        billingEventId: billingEvent.id,
        reason: "billing_event_tenant_stamp_failed",
        tenantId: null,
      });
      assertProcessorDoesNotWriteProcessedAt();
      await assertGenericUpstreamFailure(
        response,
        "billing_event_tenant_stamp_failed",
      );
    });
  },
);
