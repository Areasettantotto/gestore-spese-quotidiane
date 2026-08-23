/**
 * Deno tests for persistTenantSubscriptionCandidate (BILLING-47).
 *
 * Run:
 *   deno test supabase/functions/_shared/persistTenantSubscriptionCandidate_test.ts
 *
 * No network/env/write/run capabilities required.
 */

import type { NormalizedStripeSubscription } from "./normalizeStripeSubscription.ts";
import {
  persistTenantSubscriptionCandidate,
  type PersistTenantSubscriptionCandidateExpectedWatermark,
  type PersistTenantSubscriptionCandidateParams,
  type PersistTenantSubscriptionCandidateResult,
  type TenantSubscriptionInsertWriteValues,
  type TenantSubscriptionPersistenceClient,
  type TenantSubscriptionPersistenceFilterBuilder,
  type TenantSubscriptionPersistenceWriteResponse,
  type TenantSubscriptionUpdateWriteValues,
} from "./persistTenantSubscriptionCandidate.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic IDs — not real tenant/event IDs from historical reports. */
const TENANT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const SUB_ID = "sub_test_persist_synthetic_001";
const CUSTOMER_ID = "cus_test_persist_synthetic_001";
const EVENT_CREATED = 1_700_000_100;
const EVENT_ID = "evt_test_persist_001";
const PREV_CREATED = 1_700_000_000;
const PREV_EVENT_ID = "evt_test_persist_000";

const SNAPSHOT: NormalizedStripeSubscription = {
  provider_subscription_id: SUB_ID,
  provider_customer_id: CUSTOMER_ID,
  plan_code: "paid",
  status: "active",
  current_period_start: "2023-11-14T22:01:40.000Z",
  current_period_end: "2023-12-14T22:01:40.000Z",
  cancel_at_period_end: false,
  trial_ends_at: null,
};

const FORBIDDEN_WRITE_KEYS = [
  "billing_state_revision",
  "processed_at",
  "tier",
  "interval",
  "metadata",
] as const;

const EXPECTED_SNAPSHOT_FIELDS = {
  provider_subscription_id: SUB_ID,
  provider_customer_id: CUSTOMER_ID,
  plan_code: "paid",
  status: "active",
  current_period_start: "2023-11-14T22:01:40.000Z",
  current_period_end: "2023-12-14T22:01:40.000Z",
  cancel_at_period_end: false,
  trial_ends_at: null,
};

const EXPECTED_NEW_WATERMARK = {
  last_applied_provider_event_created_at: EVENT_CREATED,
  last_applied_provider_event_id: EVENT_ID,
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertUpdateCall(
  call: FakeCall | undefined,
): asserts call is FakeUpdateCall {
  assert(
    call !== undefined && call.method === "update",
    "expected UPDATE call",
  );
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
  result: PersistTenantSubscriptionCandidateResult,
  kind: "inserted" | "updated",
): void {
  if (result.ok !== true) {
    throw new Error(
      `expected success kind=${kind}, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(result.kind, kind, "success kind");
}

function expectFailure(
  result: PersistTenantSubscriptionCandidateResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(
      `expected failure ${reason}, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(result.reason, reason, "failure reason");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

type FilterCall = {
  op: "eq" | "is";
  column: string;
  value: string | number | null;
};

type FakeInsertCall = {
  method: "insert";
  table: string;
  values: Record<string, unknown>;
  selectColumns: string;
};

type FakeUpdateCall = {
  method: "update";
  table: string;
  values: Record<string, unknown>;
  filters: FilterCall[];
  selectColumns: string;
};

type FakeCall = FakeInsertCall | FakeUpdateCall;

/**
 * Minimal write fake: insert().select().maybeSingle() and
 * update().eq/is().select().maybeSingle(). No upsert method.
 */
function createFakeClient(
  result: TenantSubscriptionPersistenceWriteResponse | (() => never),
  calls: FakeCall[],
): TenantSubscriptionPersistenceClient {
  const resolveResult = (): Promise<
    TenantSubscriptionPersistenceWriteResponse
  > => {
    if (typeof result === "function") {
      try {
        result();
        return Promise.reject(new Error("expected throw"));
      } catch (err) {
        return Promise.reject(err);
      }
    }
    return Promise.resolve(result);
  };

  return {
    from(table: string) {
      return {
        insert(values: TenantSubscriptionInsertWriteValues) {
          return {
            select(columns: string) {
              return {
                maybeSingle() {
                  calls.push({
                    method: "insert",
                    table,
                    values: { ...values },
                    selectColumns: columns,
                  });
                  return resolveResult();
                },
              };
            },
          };
        },
        update(values: TenantSubscriptionUpdateWriteValues) {
          const filters: FilterCall[] = [];
          const builder: TenantSubscriptionPersistenceFilterBuilder = {
            eq(column: string, value: string | number) {
              filters.push({ op: "eq", column, value });
              return builder;
            },
            is(column: string, value: null) {
              filters.push({ op: "is", column, value });
              return builder;
            },
            select(columns: string) {
              return {
                maybeSingle() {
                  calls.push({
                    method: "update",
                    table,
                    values: { ...values },
                    filters: [...filters],
                    selectColumns: columns,
                  });
                  return resolveResult();
                },
              };
            },
          };
          return builder;
        },
      };
    },
  };
}

function confirmedRow(): TenantSubscriptionPersistenceWriteResponse {
  return { data: { id: "11111111-2222-4333-8444-555555555555" }, error: null };
}

function baseParams(
  client: TenantSubscriptionPersistenceClient,
  operation: PersistTenantSubscriptionCandidateParams["operation"],
): PersistTenantSubscriptionCandidateParams {
  return {
    client,
    tenant_id: TENANT_ID,
    snapshot: SNAPSHOT,
    provider_event_created_at: EVENT_CREATED,
    provider_event_id: EVENT_ID,
    operation,
  };
}

function assertNoForbiddenKeys(values: Record<string, unknown>): void {
  for (const key of FORBIDDEN_WRITE_KEYS) {
    assert(
      !Object.prototype.hasOwnProperty.call(values, key),
      `payload must not include ${key}`,
    );
  }
}

function assertWatermarkPairPresent(values: Record<string, unknown>): void {
  assert(
    Object.prototype.hasOwnProperty.call(
      values,
      "last_applied_provider_event_created_at",
    ) &&
      Object.prototype.hasOwnProperty.call(
        values,
        "last_applied_provider_event_id",
      ),
    "both W_sub columns must be written together",
  );
}

// Compile-time: initialized structurally requires both fields.
// Does not claim that `null` is unassignable under this compiler config.
type InitializedExpectedWatermark = Exclude<
  PersistTenantSubscriptionCandidateExpectedWatermark,
  { kind: "uninitialized" }
>;
type AssertCreatedAtIsNumber =
  InitializedExpectedWatermark["last_applied_provider_event_created_at"] extends
    number
    ? (number extends
      InitializedExpectedWatermark["last_applied_provider_event_created_at"]
      ? true
      : never)
    : never;
type AssertEventIdIsString =
  InitializedExpectedWatermark["last_applied_provider_event_id"] extends string
    ? (string extends
      InitializedExpectedWatermark["last_applied_provider_event_id"] ? true
      : never)
    : never;
const _assertCreatedAt: AssertCreatedAtIsNumber = true;
const _assertEventId: AssertEventIdIsString = true;
void _assertCreatedAt;
void _assertEventId;

function acceptInitializedExpectedWatermark(
  _watermark: InitializedExpectedWatermark,
): void {}

Deno.test("1+2. INSERT writes table/snapshot/watermark exactly and succeeds as inserted", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(confirmedRow(), calls);

  const result = await persistTenantSubscriptionCandidate(
    baseParams(client, { kind: "insert" }),
  );

  expectSuccess(result, "inserted");
  assertEquals(calls.length, 1, "exactly one write");
  const call = calls[0];
  assert(call !== undefined && call.method === "insert", "INSERT not upsert");
  assertEquals(call.table, "tenant_subscriptions", "table");
  assertEquals(call.selectColumns, "id", "minimal confirmation columns");
  assertEquals(
    call.values,
    {
      tenant_id: TENANT_ID,
      provider: "stripe",
      ...EXPECTED_SNAPSHOT_FIELDS,
      ...EXPECTED_NEW_WATERMARK,
    },
    "insert payload exact",
  );
  assertWatermarkPairPresent(call.values);
  assertNoForbiddenKeys(call.values);
});

Deno.test("3. INSERT unique violation 23505 → subscription_insert_conflict", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(
    {
      data: null,
      error: {
        code: "23505",
        message: "duplicate key value RAW_DB_DETAIL_INSERT_CONFLICT",
      },
    },
    calls,
  );

  const result = await persistTenantSubscriptionCandidate(
    baseParams(client, { kind: "insert" }),
  );

  expectFailure(result, "subscription_insert_conflict");
  assertEquals(calls.length, 1, "no upsert fallback after 23505");
  assert(calls[0]?.method === "insert", "must remain INSERT");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_INSERT_CONFLICT") &&
      !serialized.includes("23505") &&
      !serialized.includes("duplicate"),
    "must not leak raw DB unique-violation details",
  );
});

Deno.test("4. INSERT generic DB error → subscription_persistence_failed", async () => {
  const result = await persistTenantSubscriptionCandidate(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "57014",
            message: "statement timeout RAW_DB_DETAIL_INSERT_GENERIC",
          },
        },
        [],
      ),
      { kind: "insert" },
    ),
  );

  expectFailure(result, "subscription_persistence_failed");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_INSERT_GENERIC") &&
      !serialized.includes("57014") &&
      !serialized.includes("timeout"),
    "must not leak raw generic DB details",
  );
});

Deno.test("5+7. UPDATE uninitialized pins identity + IS NULL both W_sub and succeeds as updated", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(confirmedRow(), calls);

  const result = await persistTenantSubscriptionCandidate(
    baseParams(client, {
      kind: "update",
      expected_watermark: { kind: "uninitialized" },
    }),
  );

  expectSuccess(result, "updated");
  assertEquals(calls.length, 1, "exactly one write");
  const call = calls[0];
  assertUpdateCall(call);
  assertEquals(call.table, "tenant_subscriptions", "table");
  assertEquals(call.selectColumns, "id", "minimal confirmation columns");
  assertEquals(
    call.values,
    {
      ...EXPECTED_SNAPSHOT_FIELDS,
      ...EXPECTED_NEW_WATERMARK,
    },
    "update snapshot + new watermark payload",
  );
  assertEquals(
    call.filters,
    [
      { op: "eq", column: "provider", value: "stripe" },
      { op: "eq", column: "provider_subscription_id", value: SUB_ID },
      { op: "eq", column: "tenant_id", value: TENANT_ID },
      {
        op: "is",
        column: "last_applied_provider_event_created_at",
        value: null,
      },
      { op: "is", column: "last_applied_provider_event_id", value: null },
    ],
    "identity + uninitialized IS NULL both W_sub",
  );
  assertWatermarkPairPresent(call.values);
  assertNoForbiddenKeys(call.values);
  assert(
    !Object.prototype.hasOwnProperty.call(call.values, "tenant_id") &&
      !Object.prototype.hasOwnProperty.call(call.values, "provider"),
    "UPDATE must pin tenant_id/provider in WHERE, not SET",
  );
});

Deno.test("6. UPDATE initialized pins equality on both expected W_sub values", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(confirmedRow(), calls);

  const result = await persistTenantSubscriptionCandidate(
    baseParams(client, {
      kind: "update",
      expected_watermark: {
        kind: "initialized",
        last_applied_provider_event_created_at: PREV_CREATED,
        last_applied_provider_event_id: PREV_EVENT_ID,
      },
    }),
  );

  expectSuccess(result, "updated");
  const call = calls[0];
  assertUpdateCall(call);
  assertEquals(
    call.values,
    {
      ...EXPECTED_SNAPSHOT_FIELDS,
      ...EXPECTED_NEW_WATERMARK,
    },
    "new watermark is the current event, not the expected CAS token",
  );
  assertEquals(
    call.filters,
    [
      { op: "eq", column: "provider", value: "stripe" },
      { op: "eq", column: "provider_subscription_id", value: SUB_ID },
      { op: "eq", column: "tenant_id", value: TENANT_ID },
      {
        op: "eq",
        column: "last_applied_provider_event_created_at",
        value: PREV_CREATED,
      },
      {
        op: "eq",
        column: "last_applied_provider_event_id",
        value: PREV_EVENT_ID,
      },
    ],
    "initialized equality on both expected W_sub columns",
  );
  assert(
    !call.filters.some((filter) => filter.op === "is"),
    "initialized CAS must not use IS NULL",
  );
});

Deno.test("8. UPDATE zero rows → subscription_cas_miss", async () => {
  const calls: FakeCall[] = [];
  const result = await persistTenantSubscriptionCandidate(
    baseParams(
      createFakeClient({ data: null, error: null }, calls),
      {
        kind: "update",
        expected_watermark: {
          kind: "initialized",
          last_applied_provider_event_created_at: PREV_CREATED,
          last_applied_provider_event_id: PREV_EVENT_ID,
        },
      },
    ),
  );

  expectFailure(result, "subscription_cas_miss");
  assertEquals(calls.length, 1, "no retry / reread / upsert after CAS miss");
  assert(calls[0]?.method === "update", "must remain UPDATE");
});

Deno.test("9. UPDATE generic DB error → subscription_persistence_failed", async () => {
  const result = await persistTenantSubscriptionCandidate(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "40001",
            message: "serialization failure RAW_DB_DETAIL_UPDATE_GENERIC",
          },
        },
        [],
      ),
      {
        kind: "update",
        expected_watermark: { kind: "uninitialized" },
      },
    ),
  );

  expectFailure(result, "subscription_persistence_failed");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_UPDATE_GENERIC") &&
      !serialized.includes("40001") &&
      !serialized.includes("serialization"),
    "must not leak raw UPDATE DB details",
  );
});

Deno.test("10. initialized expected watermark compile-time requires both fields", () => {
  const initialized: PersistTenantSubscriptionCandidateExpectedWatermark = {
    kind: "initialized",
    last_applied_provider_event_created_at: PREV_CREATED,
    last_applied_provider_event_id: PREV_EVENT_ID,
  };
  assert(initialized.kind === "initialized", "initialized kind");
  assertEquals(
    initialized.last_applied_provider_event_created_at,
    PREV_CREATED,
    "created_at is a number",
  );
  assertEquals(
    initialized.last_applied_provider_event_id,
    PREV_EVENT_ID,
    "event_id is a string",
  );

  const uninitialized: PersistTenantSubscriptionCandidateExpectedWatermark = {
    kind: "uninitialized",
  };
  assertEquals(
    Object.keys(uninitialized).sort(),
    ["kind"],
    "uninitialized carries no watermark value fields",
  );

  // Missing-field check only. Does not claim `null` is a compile error here.
  // @ts-expect-error initialized watermark requires created_at
  acceptInitializedExpectedWatermark({
    kind: "initialized",
    last_applied_provider_event_id: PREV_EVENT_ID,
  });
  // @ts-expect-error initialized watermark requires event_id
  acceptInitializedExpectedWatermark({
    kind: "initialized",
    last_applied_provider_event_created_at: PREV_CREATED,
  });
});

Deno.test("10a. runtime initialized half-null created_at → persistence_failed, zero writes", async () => {
  const calls: FakeCall[] = [];
  const expectedWatermark = {
    kind: "initialized" as const,
    last_applied_provider_event_created_at: null,
    last_applied_provider_event_id: PREV_EVENT_ID,
  } as unknown as PersistTenantSubscriptionCandidateExpectedWatermark;

  const result = await persistTenantSubscriptionCandidate(
    baseParams(createFakeClient(confirmedRow(), calls), {
      kind: "update",
      expected_watermark: expectedWatermark,
    }),
  );

  expectFailure(result, "subscription_persistence_failed");
  assertEquals(calls.length, 0, "must not write on half-null created_at");
});

Deno.test("10b. runtime initialized half-null event_id → persistence_failed, zero writes", async () => {
  const calls: FakeCall[] = [];
  const expectedWatermark = {
    kind: "initialized" as const,
    last_applied_provider_event_created_at: PREV_CREATED,
    last_applied_provider_event_id: null,
  } as unknown as PersistTenantSubscriptionCandidateExpectedWatermark;

  const result = await persistTenantSubscriptionCandidate(
    baseParams(createFakeClient(confirmedRow(), calls), {
      kind: "update",
      expected_watermark: expectedWatermark,
    }),
  );

  expectFailure(result, "subscription_persistence_failed");
  assertEquals(calls.length, 0, "must not write on half-null event_id");
});

Deno.test("11. write payload never includes revision/processed_at/tier/interval/metadata", async () => {
  const insertCalls: FakeCall[] = [];
  await persistTenantSubscriptionCandidate(
    baseParams(createFakeClient(confirmedRow(), insertCalls), {
      kind: "insert",
    }),
  );
  const updateCalls: FakeCall[] = [];
  await persistTenantSubscriptionCandidate(
    baseParams(createFakeClient(confirmedRow(), updateCalls), {
      kind: "update",
      expected_watermark: { kind: "uninitialized" },
    }),
  );

  const insertValues = insertCalls[0]?.values ?? {};
  const updateValues = updateCalls[0]?.values ?? {};
  assertNoForbiddenKeys(insertValues);
  assertNoForbiddenKeys(updateValues);
  for (const key of FORBIDDEN_WRITE_KEYS) {
    assertEquals(
      JSON.stringify(insertValues).includes(key),
      false,
      `INSERT serialized payload must not mention ${key}`,
    );
    assertEquals(
      JSON.stringify(updateValues).includes(key),
      false,
      `UPDATE serialized payload must not mention ${key}`,
    );
  }
});

Deno.test("12. client is injected; thrown client error is sanitized persistence_failed", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient(() => {
    throw new Error(
      "socket hang up RAW_EXCEPTION_DETAIL_PERSIST env=SECRET_VALUE",
    );
  }, calls);

  const result = await persistTenantSubscriptionCandidate(
    baseParams(client, { kind: "insert" }),
  );

  expectFailure(result, "subscription_persistence_failed");
  assertEquals(calls.length, 1, "injected client was used");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_EXCEPTION_DETAIL_PERSIST") &&
      !serialized.includes("SECRET_VALUE") &&
      !serialized.includes("socket hang"),
    "must not leak raw exception/secret text",
  );
});

Deno.test("INSERT unconfirmed success (data null, error null) → persistence_failed", async () => {
  const result = await persistTenantSubscriptionCandidate(
    baseParams(
      createFakeClient({ data: null, error: null }, []),
      { kind: "insert" },
    ),
  );
  expectFailure(result, "subscription_persistence_failed");
});

Deno.test("UPDATE 23505 is persistence_failed, not insert_conflict", async () => {
  const result = await persistTenantSubscriptionCandidate(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: { code: "23505", message: "duplicate key RAW_UPDATE_23505" },
        },
        [],
      ),
      {
        kind: "update",
        expected_watermark: { kind: "uninitialized" },
      },
    ),
  );
  expectFailure(result, "subscription_persistence_failed");
  assertEquals(
    JSON.stringify(result).includes("RAW_UPDATE_23505"),
    false,
    "no raw leak",
  );
});
