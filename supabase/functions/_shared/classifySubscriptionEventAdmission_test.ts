/**
 * Deno tests for classifySubscriptionEventAdmission (I4.3BH).
 *
 * Run:
 *   deno test supabase/functions/_shared/classifySubscriptionEventAdmission_test.ts
 *
 * No network/env/write/run capabilities required.
 */

import {
  classifySubscriptionEventAdmission,
  type ClassifySubscriptionEventAdmissionResult,
  type TenantSubscriptionAdmissionRowObservation,
} from "./classifySubscriptionEventAdmission.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\n  actual:   ${actualJson}\n  expected: ${expectedJson}`);
  }
}

function expectSuccess(
  result: ClassifySubscriptionEventAdmissionResult,
  kind: string,
): void {
  if (result.ok !== true) {
    throw new Error(`expected success kind=${kind}, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.kind, kind, "admission kind");
}

function expectFailure(
  result: ClassifySubscriptionEventAdmissionResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure reason=${reason}, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
}

const EVENT_TS = 1_700_000_000;
const EVENT_ID = "evt_test_admission_001";
const OTHER_EVENT_ID = "evt_test_admission_002";

function presentRow(
  createdAt: unknown,
  eventId: unknown,
): TenantSubscriptionAdmissionRowObservation {
  return {
    presence: "present",
    last_applied_provider_event_created_at: createdAt,
    last_applied_provider_event_id: eventId,
  };
}

Deno.test("1. ROW_ABSENT → candidate_row_absent", () => {
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: { presence: "absent" },
    }),
    "candidate_row_absent",
  );
});

Deno.test("2. ROW_PRESENT W NULL/NULL → candidate_row_present_uninitialized", () => {
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(null, null),
    }),
    "candidate_row_present_uninitialized",
  );
});

Deno.test("3. half-null created only → fail-closed invalid_watermark", () => {
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, null),
    }),
    "invalid_watermark",
  );
});

Deno.test("4. half-null id only → fail-closed invalid_watermark", () => {
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(null, EVENT_ID),
    }),
    "invalid_watermark",
  );
});

Deno.test("5. different id + Event.created > W.created → candidate_newer_event", () => {
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS + 10,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, OTHER_EVENT_ID),
    }),
    "candidate_newer_event",
  );
});

Deno.test("6. different id + Event.created < W.created → stale_event", () => {
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS + 10, OTHER_EVENT_ID),
    }),
    "stale_event",
  );
});

Deno.test("7. equal timestamp + same id + not processed → partial_retry", () => {
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, EVENT_ID),
    }),
    "partial_retry",
  );
});

Deno.test("8. equal timestamp + same id + processed → already_applied", () => {
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: true,
      tenant_subscription_row: presentRow(EVENT_TS, EVENT_ID),
    }),
    "already_applied",
  );
});

Deno.test("9. same id + timestamp different → fail-closed inconsistent_same_event", () => {
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS + 5,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, EVENT_ID),
    }),
    "inconsistent_same_event",
  );
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: true,
      tenant_subscription_row: presentRow(EVENT_TS + 5, EVENT_ID),
    }),
    "inconsistent_same_event",
  );
});

Deno.test("10. equal timestamp + different id → candidate_equal_timestamp_distinct_event", () => {
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, OTHER_EVENT_ID),
    }),
    "candidate_equal_timestamp_distinct_event",
  );
});

Deno.test(
  "11. equal timestamp distinct IDs lexicographic order inverted → same classification",
  () => {
    const ts = EVENT_TS;
    // Lexicographically: evt_a < evt_z. Both directions must classify identically.
    const aThenZ = classifySubscriptionEventAdmission({
      provider_event_created_at: ts,
      provider_event_id: "evt_z",
      billing_event_processed: false,
      tenant_subscription_row: presentRow(ts, "evt_a"),
    });
    const zThenA = classifySubscriptionEventAdmission({
      provider_event_created_at: ts,
      provider_event_id: "evt_a",
      billing_event_processed: false,
      tenant_subscription_row: presentRow(ts, "evt_z"),
    });

    expectSuccess(aThenZ, "candidate_equal_timestamp_distinct_event");
    expectSuccess(zThenA, "candidate_equal_timestamp_distinct_event");
    assertEquals(aThenZ, zThenA, "no lexicographic id tie-break");
  },
);

Deno.test("12. invalid Event created → fail-closed invalid_provider_event_created_at", () => {
  for (const invalid of [
    null,
    undefined,
    "1700000000",
    1.5,
    NaN,
    Infinity,
    -1,
    true,
    {},
    [],
  ]) {
    expectFailure(
      classifySubscriptionEventAdmission({
        provider_event_created_at: invalid,
        provider_event_id: EVENT_ID,
        billing_event_processed: false,
        tenant_subscription_row: { presence: "absent" },
      }),
      "invalid_provider_event_created_at",
    );
  }
});

Deno.test("13. invalid Event id → fail-closed invalid_provider_event_id", () => {
  for (const invalid of [null, undefined, "", 1, true, {}, [], EVENT_TS]) {
    expectFailure(
      classifySubscriptionEventAdmission({
        provider_event_created_at: EVENT_TS,
        provider_event_id: invalid,
        billing_event_processed: false,
        tenant_subscription_row: { presence: "absent" },
      }),
      "invalid_provider_event_id",
    );
  }
});

Deno.test("14. invalid initialized watermark → fail-closed invalid_watermark", () => {
  // Invalid created_at with present id
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(1.5, OTHER_EVENT_ID),
    }),
    "invalid_watermark",
  );
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow("1700000000", OTHER_EVENT_ID),
    }),
    "invalid_watermark",
  );
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(-1, OTHER_EVENT_ID),
    }),
    "invalid_watermark",
  );
  // Valid created_at with invalid event_id
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, ""),
    }),
    "invalid_watermark",
  );
  expectFailure(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: EVENT_ID,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, 123),
    }),
    "invalid_watermark",
  );
});

Deno.test("15. exact identity: no silent trim/lowercase on event id comparison", () => {
  const padded = ` ${EVENT_ID} `;
  const upper = EVENT_ID.toUpperCase();

  // Padded id vs exact W id → distinct events (equal timestamp path), not collapsed.
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: padded,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, EVENT_ID),
    }),
    "candidate_equal_timestamp_distinct_event",
  );

  // Case difference → distinct events, not lowercased into same-event path.
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: upper,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, EVENT_ID),
    }),
    "candidate_equal_timestamp_distinct_event",
  );

  // Exact padded match on both sides → same event → partial_retry.
  expectSuccess(
    classifySubscriptionEventAdmission({
      provider_event_created_at: EVENT_TS,
      provider_event_id: padded,
      billing_event_processed: false,
      tenant_subscription_row: presentRow(EVENT_TS, padded),
    }),
    "partial_retry",
  );
});

Deno.test("16. deterministic repeat: same input → same output", () => {
  const input = {
    provider_event_created_at: EVENT_TS + 3,
    provider_event_id: EVENT_ID,
    billing_event_processed: false,
    tenant_subscription_row: presentRow(EVENT_TS, OTHER_EVENT_ID),
  };

  const first = classifySubscriptionEventAdmission(input);
  const second = classifySubscriptionEventAdmission(input);
  const third = classifySubscriptionEventAdmission({ ...input });

  expectSuccess(first, "candidate_newer_event");
  assertEquals(first, second, "repeat 1 vs 2");
  assertEquals(second, third, "repeat 2 vs 3");
});

Deno.test("17. ROW_ABSENT remains distinct from present null/null", () => {
  const absent = classifySubscriptionEventAdmission({
    provider_event_created_at: EVENT_TS,
    provider_event_id: EVENT_ID,
    billing_event_processed: false,
    tenant_subscription_row: { presence: "absent" },
  });
  const presentNull = classifySubscriptionEventAdmission({
    provider_event_created_at: EVENT_TS,
    provider_event_id: EVENT_ID,
    billing_event_processed: false,
    tenant_subscription_row: presentRow(null, null),
  });

  expectSuccess(absent, "candidate_row_absent");
  expectSuccess(presentNull, "candidate_row_present_uninitialized");
  assert(
    JSON.stringify(absent) !== JSON.stringify(presentNull),
    "ROW_ABSENT must not collapse to present null/null",
  );
});

Deno.test("18. same Event + not processed must not be classified already_applied", () => {
  const result = classifySubscriptionEventAdmission({
    provider_event_created_at: EVENT_TS,
    provider_event_id: EVENT_ID,
    billing_event_processed: false,
    tenant_subscription_row: presentRow(EVENT_TS, EVENT_ID),
  });
  expectSuccess(result, "partial_retry");
  assert(
    result.ok === true && result.kind !== "already_applied",
    "partial retry guardrail I4.3BB-R-F1",
  );
});
