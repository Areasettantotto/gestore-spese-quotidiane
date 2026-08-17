/**
 * Deno tests for extractStripeSubscriptionEventBootstrap (BILLING-03).
 *
 * Run:
 *   deno test supabase/functions/_shared/extractStripeSubscriptionEventBootstrap_test.ts
 *
 * No network/env/write/run capabilities required.
 */

import {
  extractStripeSubscriptionEventBootstrap,
  type ExtractStripeSubscriptionEventBootstrapResult,
} from "./extractStripeSubscriptionEventBootstrap.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SUB_ID = "sub_test_123";

const SUPPORTED_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

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
  result: ExtractStripeSubscriptionEventBootstrapResult,
): asserts result is Extract<
  ExtractStripeSubscriptionEventBootstrapResult,
  { ok: true }
> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: ExtractStripeSubscriptionEventBootstrapResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
  assert(
    !("provider_subscription_id" in result),
    "failure must not return a partial provider_subscription_id",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

function validSubscriptionEvent(
  type: string,
  id: string = SUB_ID,
): { type: string; data: { object: { id: string } } } {
  return {
    type,
    data: { object: { id } },
  };
}

Deno.test("1. supported customer.subscription.* types return exact id", () => {
  for (const type of SUPPORTED_TYPES) {
    const result = extractStripeSubscriptionEventBootstrap(
      validSubscriptionEvent(type, SUB_ID),
    );
    expectSuccess(result);
    assertEquals(
      result.provider_subscription_id,
      SUB_ID,
      `${type} must preserve exact identity`,
    );
    assertEquals(
      Object.keys(result).sort(),
      ["ok", "provider_subscription_id"].sort(),
      `${type} public success contract`,
    );
  }
});

Deno.test("2. unsupported event types → unsupported_event_type", () => {
  const unsupported: unknown[] = [
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "checkout.session.completed",
    "customer.created",
    "",
    " customer.subscription.created ",
    "customer.subscription.updated\n",
    "\tcustomer.subscription.deleted",
    1,
    true,
    { nested: "customer.subscription.created" },
    ["customer.subscription.created"],
  ];

  for (const type of unsupported) {
    const result = extractStripeSubscriptionEventBootstrap({
      type,
      data: { object: { id: SUB_ID } },
    });
    expectFailure(result, "unsupported_event_type");
  }

  const missingType = extractStripeSubscriptionEventBootstrap({
    data: { object: { id: SUB_ID } },
  });
  expectFailure(missingType, "unsupported_event_type");
});

Deno.test("3. invalid data/object structure → invalid_subscription_object", () => {
  const type = "customer.subscription.created";
  const invalidEvents: Array<{ type?: unknown; data?: unknown }> = [
    { type },
    { type, data: null },
    { type, data: "not-an-object" },
    { type, data: [{ object: { id: SUB_ID } }] },
    { type, data: {} },
    { type, data: { object: null } },
    { type, data: { object: "not-an-object" } },
    { type, data: { object: [{ id: SUB_ID }] } },
  ];

  for (const event of invalidEvents) {
    const result = extractStripeSubscriptionEventBootstrap(event);
    expectFailure(result, "invalid_subscription_object");
  }
});

Deno.test("4. invalid provider_subscription_id", () => {
  const type = "customer.subscription.updated";
  const invalidIds: unknown[] = [
    undefined,
    null,
    1,
    true,
    "",
    " ",
    "\t",
    "\n",
  ];

  for (const id of invalidIds) {
    const event = id === undefined
      ? { type, data: { object: {} } }
      : { type, data: { object: { id } } };
    const result = extractStripeSubscriptionEventBootstrap(event);
    expectFailure(result, "invalid_provider_subscription_id");
  }
});

Deno.test("5. padded id is preserved exactly — no silent trim", () => {
  const padded = " sub_test_123 ";
  const result = extractStripeSubscriptionEventBootstrap(
    validSubscriptionEvent("customer.subscription.created", padded),
  );

  expectSuccess(result);
  assertEquals(
    result.provider_subscription_id,
    padded,
    "padded id must be returned exactly — no silent trim",
  );
  assert(
    result.provider_subscription_id !== SUB_ID,
    "must not collapse padded id to trimmed form",
  );
});

Deno.test("6. non-sub_ id is accepted (no prefix validation)", () => {
  const nonSubId = "provider-id-123";
  const result = extractStripeSubscriptionEventBootstrap(
    validSubscriptionEvent("customer.subscription.deleted", nonSubId),
  );

  expectSuccess(result);
  assertEquals(
    result.provider_subscription_id,
    nonSubId,
    "identity must not require a sub_ prefix",
  );
});

Deno.test("7. extra payload does not enter public output", () => {
  const event = {
    type: "customer.subscription.updated",
    data: {
      object: {
        id: SUB_ID,
        metadata: { tenant_id: "tenant_must_not_leak" },
        tenant_id: "tenant_must_not_leak",
        customer: "cus_must_not_leak",
        status: "active",
        price: "price_must_not_leak",
        created: 1_700_000_000,
      },
    },
    metadata: { tenant_id: "tenant_must_not_leak" },
    tenant_id: "tenant_must_not_leak",
    customer: "cus_must_not_leak",
    status: "active",
    price: "price_must_not_leak",
    created: 1_700_000_000,
  };

  const result = extractStripeSubscriptionEventBootstrap(event);
  expectSuccess(result);
  assertEquals(
    result,
    { ok: true, provider_subscription_id: SUB_ID },
    "public contract returns only ok + provider_subscription_id",
  );
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "provider_subscription_id"].sort(),
    "extra payload fields must not appear on the result",
  );
});

Deno.test("8. failures never include a partial provider_subscription_id", () => {
  const failures: ExtractStripeSubscriptionEventBootstrapResult[] = [
    extractStripeSubscriptionEventBootstrap({
      type: "invoice.payment_succeeded",
      data: { object: { id: SUB_ID } },
    }),
    extractStripeSubscriptionEventBootstrap({
      type: "customer.subscription.created",
      data: null,
    }),
    extractStripeSubscriptionEventBootstrap({
      type: "customer.subscription.created",
      data: { object: { id: "" } },
    }),
  ];

  for (const result of failures) {
    assert(
      result.ok === false,
      `expected failure, got ${JSON.stringify(result)}`,
    );
    assert(
      !("provider_subscription_id" in result),
      "ok:false must not carry provider_subscription_id",
    );
  }
});
