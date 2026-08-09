/**
 * Deno tests for readTenantSubscriptionObservation (I4.3BI).
 *
 * Run:
 *   deno test supabase/functions/_shared/readTenantSubscriptionObservation_test.ts
 *
 * No network/env/write/run capabilities required.
 */

import {
  classifyTenantSubscriptionObservationLookup,
  readTenantSubscriptionObservation,
  type ReadTenantSubscriptionObservationResult,
  type TenantSubscriptionObservationLookupClient,
  type TenantSubscriptionObservationLookupError,
  type TenantSubscriptionObservationRow,
} from "./readTenantSubscriptionObservation.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from historical reports. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const PROVIDER = "stripe";
const SUB_ID = "sub_test_observation_synthetic_001";
const EVENT_TS = 1_700_000_000;
const EVENT_ID = "evt_test_observation_001";

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
  result: ReadTenantSubscriptionObservationResult,
): asserts result is Extract<ReadTenantSubscriptionObservationResult, { ok: true }> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: ReadTenantSubscriptionObservationResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
}

type FakeLookupResult = {
  data: TenantSubscriptionObservationRow[] | null;
  error: TenantSubscriptionObservationLookupError | null;
};

type FakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
};

/**
 * Minimal SELECT-only fake: `.from().select().eq().eq()` → Promise.
 * Optionally throws to simulate transport/client failures.
 */
function createFakeClient(
  result: FakeLookupResult | (() => never),
  calls: FakeCall[],
): TenantSubscriptionObservationLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column1: string, value1: string) {
              return {
                eq(column2: string, value2: string) {
                  calls.push({
                    table,
                    columns,
                    filters: [
                      { column: column1, value: value1 },
                      { column: column2, value: value2 },
                    ],
                  });
                  if (typeof result === "function") {
                    try {
                      result();
                      return Promise.reject(new Error("expected throw"));
                    } catch (err) {
                      return Promise.reject(err);
                    }
                  }
                  return Promise.resolve(result);
                },
              };
            },
          };
        },
      };
    },
  };
}

function presentRow(
  overrides: Partial<TenantSubscriptionObservationRow> = {},
): TenantSubscriptionObservationRow {
  return {
    tenant_id: TENANT_A,
    last_applied_provider_event_created_at: null,
    last_applied_provider_event_id: null,
    ...overrides,
  };
}

Deno.test("1. valid input + 0 rows → ROW_ABSENT", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: [], error: null }, calls);

  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client,
  });

  expectSuccess(result);
  assertEquals(result.observation, { kind: "row_absent" }, "ROW_ABSENT");
  assertEquals(calls.length, 1, "one SELECT");
  assertEquals(calls[0]?.table, "tenant_subscriptions", "table");
  assertEquals(
    calls[0]?.columns,
    "tenant_id,last_applied_provider_event_created_at,last_applied_provider_event_id",
    "select columns",
  );
  assertEquals(
    calls[0]?.filters,
    [
      { column: "provider", value: PROVIDER },
      { column: "provider_subscription_id", value: SUB_ID },
    ],
    "exact provider + provider_subscription_id filters",
  );
});

Deno.test("2. one row W NULL/NULL → ROW_PRESENT (not absent)", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(
    { data: [presentRow()], error: null },
    calls,
  );

  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client,
  });

  expectSuccess(result);
  assertEquals(
    result.observation,
    {
      kind: "row_present",
      tenant_id: TENANT_A,
      last_applied_provider_event_created_at: null,
      last_applied_provider_event_id: null,
    },
    "ROW_PRESENT with NULL/NULL W_sub",
  );
  assert(result.observation.kind !== "row_absent", "must not collapse to absent");
});

Deno.test("3. one row with initialized W → ROW_PRESENT faithful", async () => {
  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client: createFakeClient(
      {
        data: [
          presentRow({
            last_applied_provider_event_created_at: EVENT_TS,
            last_applied_provider_event_id: EVENT_ID,
          }),
        ],
        error: null,
      },
      [],
    ),
  });

  expectSuccess(result);
  assertEquals(
    result.observation,
    {
      kind: "row_present",
      tenant_id: TENANT_A,
      last_applied_provider_event_created_at: EVENT_TS,
      last_applied_provider_event_id: EVENT_ID,
    },
    "initialized W_sub preserved",
  );
});

Deno.test("4. invalid tenant_id → subscription_observation_invalid", async () => {
  const cases: unknown[] = [null, undefined, "", 123, { id: TENANT_A }];

  for (const tenantId of cases) {
    const result = await readTenantSubscriptionObservation({
      provider: PROVIDER,
      provider_subscription_id: SUB_ID,
      client: createFakeClient(
        {
          data: [presentRow({ tenant_id: tenantId })],
          error: null,
        },
        [],
      ),
    });
    expectFailure(result, "subscription_observation_invalid");
  }
});

Deno.test("5. invalid watermark created_at → fail-closed", async () => {
  const cases: unknown[] = [
    "1700000000",
    1.5,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    true,
    {},
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const createdAt of cases) {
    const result = await readTenantSubscriptionObservation({
      provider: PROVIDER,
      provider_subscription_id: SUB_ID,
      client: createFakeClient(
        {
          data: [
            presentRow({
              last_applied_provider_event_created_at: createdAt,
              last_applied_provider_event_id: EVENT_ID,
            }),
          ],
          error: null,
        },
        [],
      ),
    });
    expectFailure(result, "subscription_observation_invalid");
  }
});

Deno.test("6. invalid non-null watermark event id → fail-closed", async () => {
  const cases: unknown[] = ["", "   ", "\t", 123, true, {}, []];

  for (const eventId of cases) {
    const result = await readTenantSubscriptionObservation({
      provider: PROVIDER,
      provider_subscription_id: SUB_ID,
      client: createFakeClient(
        {
          data: [
            presentRow({
              last_applied_provider_event_created_at: EVENT_TS,
              last_applied_provider_event_id: eventId,
            }),
          ],
          error: null,
        },
        [],
      ),
    });
    expectFailure(result, "subscription_observation_invalid");
  }
});

Deno.test("7. half-null created valorized / id null → ROW_PRESENT faithful (strategy A)", async () => {
  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client: createFakeClient(
      {
        data: [
          presentRow({
            last_applied_provider_event_created_at: EVENT_TS,
            last_applied_provider_event_id: null,
          }),
        ],
        error: null,
      },
      [],
    ),
  });

  expectSuccess(result);
  assertEquals(
    result.observation,
    {
      kind: "row_present",
      tenant_id: TENANT_A,
      last_applied_provider_event_created_at: EVENT_TS,
      last_applied_provider_event_id: null,
    },
    "half-null preserved for BH invalid_watermark",
  );
});

Deno.test("8. half-null created null / id valorized → ROW_PRESENT faithful (strategy A)", async () => {
  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client: createFakeClient(
      {
        data: [
          presentRow({
            last_applied_provider_event_created_at: null,
            last_applied_provider_event_id: EVENT_ID,
          }),
        ],
        error: null,
      },
      [],
    ),
  });

  expectSuccess(result);
  assertEquals(
    result.observation,
    {
      kind: "row_present",
      tenant_id: TENANT_A,
      last_applied_provider_event_created_at: null,
      last_applied_provider_event_id: EVENT_ID,
    },
    "half-null preserved for BH invalid_watermark",
  );
});

Deno.test("9. ambiguous >1 rows → subscription_observation_ambiguous (no first-row pick)", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(
    {
      data: [
        presentRow({ tenant_id: TENANT_A }),
        presentRow({ tenant_id: TENANT_B }),
      ],
      error: null,
    },
    calls,
  );

  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client,
  });

  expectFailure(result, "subscription_observation_ambiguous");
  assert(result.ok === false, "fail-closed");
  assert(
    !("observation" in result),
    "must not return an observation when ambiguous",
  );
});

Deno.test("10. query error → sanitized subscription_observation_lookup_failed", async () => {
  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client: createFakeClient(
      {
        data: null,
        error: {
          code: "57014",
          message: "canceling statement due to statement timeout RAW_DB_DETAIL_ALPHA",
        },
      },
      [],
    ),
  });

  expectFailure(result, "subscription_observation_lookup_failed");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public contract exposes only ok+reason",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_ALPHA") &&
      !serialized.includes("timeout") &&
      !serialized.includes("57014"),
    "must not leak raw DB error details",
  );
});

Deno.test("11. query throw/rejection → sanitized subscription_observation_lookup_failed", async () => {
  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client: createFakeClient(() => {
      throw new Error(
        "socket hang up with RAW_EXCEPTION_DETAIL_BETA RAW_PRIVATE_DETAIL_DELTA",
      );
    }, []),
  });

  expectFailure(result, "subscription_observation_lookup_failed");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_EXCEPTION_DETAIL_BETA") &&
      !serialized.includes("socket hang") &&
      !serialized.includes("RAW_PRIVATE_DETAIL_DELTA"),
    "must not leak raw exception text",
  );
});

Deno.test("12. raw DB message/token/request detail never in result", async () => {
  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client: createFakeClient(
      {
        data: null,
        error: {
          code: "PGRST116",
          message:
            "JSON object requested, multiple (or no) rows returned request_id=req_abc RAW_REQUEST_DETAIL_GAMMA",
        },
      },
      [],
    ),
  });

  expectFailure(result, "subscription_observation_lookup_failed");
  const serialized = JSON.stringify(result);
  assertEquals(serialized, '{"ok":false,"reason":"subscription_observation_lookup_failed"}', "sanitized");
  assert(
    !serialized.includes("PGRST") &&
      !serialized.includes("request_id") &&
      !serialized.includes("RAW_REQUEST_DETAIL_GAMMA"),
    "no raw request/token leak",
  );
});

Deno.test("13. empty provider → no query", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantSubscriptionObservation({
    provider: "",
    provider_subscription_id: SUB_ID,
    client: createFakeClient({ data: [], error: null }, calls),
  });
  expectFailure(result, "invalid_provider");
  assertEquals(calls.length, 0, "must not query");
});

Deno.test("14. whitespace-only provider → no query", async () => {
  const calls: FakeCall[] = [];
  for (const invalid of [" ", "   ", "\t", "\n"]) {
    calls.length = 0;
    const result = await readTenantSubscriptionObservation({
      provider: invalid,
      provider_subscription_id: SUB_ID,
      client: createFakeClient({ data: [], error: null }, calls),
    });
    expectFailure(result, "invalid_provider");
    assertEquals(calls.length, 0, "must not query");
  }
});

Deno.test("15. empty provider_subscription_id → no query", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: "",
    client: createFakeClient({ data: [], error: null }, calls),
  });
  expectFailure(result, "invalid_provider_subscription_id");
  assertEquals(calls.length, 0, "must not query");
});

Deno.test("16. whitespace-only provider_subscription_id → no query", async () => {
  const calls: FakeCall[] = [];
  for (const invalid of [" ", "   ", "\t"]) {
    calls.length = 0;
    const result = await readTenantSubscriptionObservation({
      provider: PROVIDER,
      provider_subscription_id: invalid,
      client: createFakeClient({ data: [], error: null }, calls),
    });
    expectFailure(result, "invalid_provider_subscription_id");
    assertEquals(calls.length, 0, "must not query");
  }
});

Deno.test("17. padded valid input preserves exact identity in filters", async () => {
  const calls: FakeCall[] = [];
  const paddedProvider = " stripe ";
  const paddedSub = " sub_MixedCase ";

  await readTenantSubscriptionObservation({
    provider: paddedProvider,
    provider_subscription_id: paddedSub,
    client: createFakeClient({ data: [], error: null }, calls),
  });

  assertEquals(
    calls[0]?.filters,
    [
      { column: "provider", value: paddedProvider },
      { column: "provider_subscription_id", value: paddedSub },
    ],
    "input identity must be preserved for DB filters",
  );
});

Deno.test("18. two independent invocations → two SELECT, no cache/memoization", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: [], error: null }, calls);

  await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client,
  });
  await readTenantSubscriptionObservation({
    provider: PROVIDER,
    provider_subscription_id: SUB_ID,
    client,
  });

  assertEquals(calls.length, 2, "each call performs its own SELECT");
});

Deno.test("19. classify: never chooses first row when ambiguous; empty/error/invalid/non-array", () => {
  expectFailure(
    classifyTenantSubscriptionObservationLookup({
      error: null,
      rows: [presentRow({ tenant_id: TENANT_A }), presentRow({ tenant_id: TENANT_B })],
    }),
    "subscription_observation_ambiguous",
  );

  const absent = classifyTenantSubscriptionObservationLookup({
    error: null,
    rows: [],
  });
  expectSuccess(absent);
  assertEquals(absent.observation.kind, "row_absent", "empty → absent");

  expectFailure(
    classifyTenantSubscriptionObservationLookup({
      error: { code: "XX000", message: "internal" },
      rows: [presentRow()],
    }),
    "subscription_observation_lookup_failed",
  );
  expectFailure(
    classifyTenantSubscriptionObservationLookup({
      error: null,
      rows: [presentRow({ tenant_id: null })],
    }),
    "subscription_observation_invalid",
  );
  expectFailure(
    classifyTenantSubscriptionObservationLookup({ error: null, rows: null }),
    "subscription_observation_lookup_failed",
  );
});

Deno.test("20. non-string provider / subscription id → fail-closed, no query", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: [], error: null }, calls);

  for (const invalid of [null, undefined, 1, true, {}, []]) {
    calls.length = 0;
    expectFailure(
      await readTenantSubscriptionObservation({
        provider: invalid,
        provider_subscription_id: SUB_ID,
        client,
      }),
      "invalid_provider",
    );
    assertEquals(calls.length, 0, "no query on invalid provider");

    calls.length = 0;
    expectFailure(
      await readTenantSubscriptionObservation({
        provider: PROVIDER,
        provider_subscription_id: invalid,
        client,
      }),
      "invalid_provider_subscription_id",
    );
    assertEquals(calls.length, 0, "no query on invalid subscription id");
  }
});
