/**
 * Deno tests for persistTenantComplimentaryAccessGrant.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/persistTenantComplimentaryAccessGrant_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import {
  persistTenantComplimentaryAccessGrant,
  type ComplimentaryAccessGrantInsertWriteValues,
  type ComplimentaryAccessGrantPersistenceClient,
  type ComplimentaryAccessGrantPersistenceFilterBuilder,
  type ComplimentaryAccessGrantPersistenceWriteResponse,
  type ComplimentaryAccessGrantUpdateWriteValues,
  type PersistTenantComplimentaryAccessGrantParams,
  type PersistTenantComplimentaryAccessGrantResult,
} from "./persistTenantComplimentaryAccessGrant.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from historical reports. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";

const FORBIDDEN_TABLES = [
  "tenant_memberships",
  "profiles",
  "tenant_subscriptions",
  "tenant_billing_customers",
  "billing_events",
] as const;

const FORBIDDEN_WRITE_KEYS = [
  "source",
  "granted_at",
  "granted_by",
  "revoked_at",
  "updated_at",
  "plan_code",
  "provider",
  "provider_subscription_id",
  "provider_customer_id",
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
  result: PersistTenantComplimentaryAccessGrantResult,
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
  result: PersistTenantComplimentaryAccessGrantResult,
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
  op: "eq";
  column: string;
  value: string;
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

type FakeTrace = {
  fromTables: string[];
  calls: FakeCall[];
};

/**
 * Minimal write fake: insert().select().maybeSingle() and
 * update().eq().select().maybeSingle(). No upsert / onConflict / delete.
 */
function createFakeClient(
  result: ComplimentaryAccessGrantPersistenceWriteResponse | (() => never),
  trace: FakeTrace,
): ComplimentaryAccessGrantPersistenceClient {
  const resolveResult = (): Promise<
    ComplimentaryAccessGrantPersistenceWriteResponse
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
      trace.fromTables.push(table);
      const tableApi = {
        insert(values: ComplimentaryAccessGrantInsertWriteValues) {
          return {
            select(columns: string) {
              return {
                maybeSingle() {
                  trace.calls.push({
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
        update(values: ComplimentaryAccessGrantUpdateWriteValues) {
          const filters: FilterCall[] = [];
          const builder: ComplimentaryAccessGrantPersistenceFilterBuilder = {
            eq(column: string, value: string) {
              filters.push({ op: "eq", column, value });
              return builder;
            },
            select(columns: string) {
              return {
                maybeSingle() {
                  trace.calls.push({
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
      assert(
        !("upsert" in tableApi) && !("onConflict" in tableApi) &&
          !("delete" in tableApi) && !("select" in tableApi),
        "fake table surface must not expose upsert/onConflict/delete/select",
      );
      return tableApi;
    },
  };
}

function emptyTrace(): FakeTrace {
  return { fromTables: [], calls: [] };
}

function confirmedRow(): ComplimentaryAccessGrantPersistenceWriteResponse {
  return { data: { tenant_id: TENANT_A }, error: null };
}

function baseParams(
  client: ComplimentaryAccessGrantPersistenceClient,
  operation: PersistTenantComplimentaryAccessGrantParams["operation"],
  productTier: unknown = "base",
  tenantId: unknown = TENANT_A,
): PersistTenantComplimentaryAccessGrantParams {
  return {
    client,
    tenantId,
    productTier,
    operation,
  };
}

function explicitParams(params: {
  client: ComplimentaryAccessGrantPersistenceClient;
  tenantId: unknown;
  productTier: unknown;
  operation: PersistTenantComplimentaryAccessGrantParams["operation"];
}): PersistTenantComplimentaryAccessGrantParams {
  return params;
}

function assertNoForbiddenKeys(values: Record<string, unknown>): void {
  for (const key of FORBIDDEN_WRITE_KEYS) {
    assert(
      !Object.prototype.hasOwnProperty.call(values, key),
      `payload must not include ${key}`,
    );
  }
}

function assertNoCollateralTables(fromTables: string[]): void {
  for (const table of fromTables) {
    assertEquals(
      table,
      "tenant_complimentary_access_grants",
      "only the complimentary grant table may be touched",
    );
    for (const forbidden of FORBIDDEN_TABLES) {
      assert(table !== forbidden, `must not query ${forbidden}`);
    }
  }
}

function assertInsertCall(
  call: FakeCall | undefined,
): asserts call is FakeInsertCall {
  assert(
    call !== undefined && call.method === "insert",
    "expected INSERT call",
  );
}

function assertUpdateCall(
  call: FakeCall | undefined,
): asserts call is FakeUpdateCall {
  assert(
    call !== undefined && call.method === "update",
    "expected UPDATE call",
  );
}

Deno.test("1. INSERT Base succeeds with tenant-pinned product_tier base", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(client, { kind: "insert" }, "base"),
  );

  expectSuccess(result, "inserted");
  assertEquals(trace.calls.length, 1, "exactly one write");
  const call = trace.calls[0];
  assertInsertCall(call);
  assertEquals(call.table, "tenant_complimentary_access_grants", "table");
  assertEquals(call.selectColumns, "tenant_id", "minimal confirmation columns");
  assertEquals(
    call.values,
    { tenant_id: TENANT_A, product_tier: "base" },
    "insert payload exact",
  );
  assertNoForbiddenKeys(call.values);
});

Deno.test("2. INSERT Pro succeeds with product_tier pro", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(client, { kind: "insert" }, "pro"),
  );

  expectSuccess(result, "inserted");
  assertInsertCall(trace.calls[0]);
  assertEquals(trace.calls[0].values.product_tier, "pro", "product_tier pro");
  assertEquals(trace.calls[0].values.tenant_id, TENANT_A, "tenant_id");
});

Deno.test("3. UPDATE Base→Pro is tenant-pinned and writes only product_tier", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(client, { kind: "update" }, "pro"),
  );

  expectSuccess(result, "updated");
  assertEquals(trace.calls.length, 1, "exactly one write");
  const call = trace.calls[0];
  assertUpdateCall(call);
  assertEquals(call.table, "tenant_complimentary_access_grants", "table");
  assertEquals(
    call.values,
    { product_tier: "pro" },
    "UPDATE writes only product_tier",
  );
  assertEquals(
    Object.keys(call.values).sort(),
    ["product_tier"],
    "granted_at and other columns are not SET",
  );
  assertEquals(
    call.filters,
    [{ op: "eq", column: "tenant_id", value: TENANT_A }],
    "UPDATE pinned to received tenantId",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(call.values, "tenant_id"),
    "UPDATE must pin tenant_id in WHERE, not SET",
  );
  assertNoForbiddenKeys(call.values);
});

Deno.test("4. UPDATE Pro→Base writes product_tier base", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(client, { kind: "update" }, "base"),
  );

  expectSuccess(result, "updated");
  const call = trace.calls[0];
  assertUpdateCall(call);
  assertEquals(call.values.product_tier, "base", "product_tier base");
  assertEquals(
    call.filters,
    [{ op: "eq", column: "tenant_id", value: TENANT_A }],
    "tenant-pinned UPDATE",
  );
});

Deno.test("5. invalid tenantId → fail-closed, zero query/write", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  for (
    const invalid of [
      null,
      undefined,
      "",
      " ",
      "   ",
      "\t",
      "not-a-uuid",
      "tenant-a",
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee",
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeeZ",
      " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ",
      1,
      true,
      {},
      [],
    ]
  ) {
    trace.fromTables.length = 0;
    trace.calls.length = 0;
    expectFailure(
      await persistTenantComplimentaryAccessGrant(
        explicitParams({
          client,
          tenantId: invalid,
          productTier: "base",
          operation: { kind: "insert" },
        }),
      ),
      "invalid_tenant_id",
    );
    assertEquals(trace.fromTables.length, 0, "must not touch DB on invalid tenantId");
    assertEquals(trace.calls.length, 0, "must not write on invalid tenantId");
  }
});

Deno.test("6. invalid product tier runtime → fail-closed, zero write", async () => {
  const invalidTiers: unknown[] = [
    "free",
    "paid",
    "demo",
    "internal",
    "BASE",
    "Pro",
    "standard",
    "trial",
    "base ",
    " pro",
    "",
    null,
    undefined,
    1,
    true,
    {},
    [],
  ];
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  for (const productTier of invalidTiers) {
    trace.fromTables.length = 0;
    trace.calls.length = 0;
    expectFailure(
      await persistTenantComplimentaryAccessGrant(
        explicitParams({
          client,
          tenantId: TENANT_A,
          productTier,
          operation: { kind: "insert" },
        }),
      ),
      "invalid_product_tier",
    );
    assertEquals(
      trace.calls.length,
      0,
      "must not write on invalid product tier",
    );
    assertEquals(
      trace.fromTables.length,
      0,
      "must not query on invalid product tier",
    );
  }
});

Deno.test("7. INSERT generic DB failure → sanitized persistence_failed", async () => {
  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "57014",
            message: "statement timeout RAW_DB_DETAIL_INSERT_GENERIC",
          },
        },
        emptyTrace(),
      ),
      { kind: "insert" },
    ),
  );

  expectFailure(result, "complimentary_access_grant_persistence_failed");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_INSERT_GENERIC") &&
      !serialized.includes("57014") &&
      !serialized.includes("timeout"),
    "must not leak raw generic DB details",
  );
});

Deno.test("8. INSERT unique violation 23505 → insert_conflict, no UPDATE fallback", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(
    {
      data: null,
      error: {
        code: "23505",
        message: "duplicate key value RAW_DB_DETAIL_INSERT_CONFLICT",
      },
    },
    trace,
  );

  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(client, { kind: "insert" }),
  );

  expectFailure(result, "complimentary_access_grant_insert_conflict");
  assertEquals(trace.calls.length, 1, "no upsert fallback after 23505");
  assertInsertCall(trace.calls[0]);
  assert(
    trace.calls.every((call) => call.method !== "update"),
    "must not fall back to UPDATE",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_INSERT_CONFLICT") &&
      !serialized.includes("23505") &&
      !serialized.includes("duplicate"),
    "must not leak raw DB unique-violation details",
  );
});

Deno.test("9. UPDATE generic DB failure → sanitized persistence_failed", async () => {
  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "40001",
            message: "serialization failure RAW_DB_DETAIL_UPDATE_GENERIC",
          },
        },
        emptyTrace(),
      ),
      { kind: "update" },
    ),
  );

  expectFailure(result, "complimentary_access_grant_persistence_failed");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_DB_DETAIL_UPDATE_GENERIC") &&
      !serialized.includes("40001") &&
      !serialized.includes("serialization"),
    "must not leak raw UPDATE DB details",
  );
});

Deno.test("10. UPDATE zero rows → update_miss, no INSERT fallback", async () => {
  const trace = emptyTrace();
  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient({ data: null, error: null }, trace),
      { kind: "update" },
    ),
  );

  expectFailure(result, "complimentary_access_grant_update_miss");
  assertEquals(trace.calls.length, 1, "no retry / insert fallback after miss");
  assertUpdateCall(trace.calls[0]);
  assert(
    trace.calls.every((call) => call.method !== "insert"),
    "must not fall back to INSERT",
  );
});

Deno.test("11. tenant pinning INSERT uses the received tenantId exactly", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  await persistTenantComplimentaryAccessGrant(
    baseParams(client, { kind: "insert" }, "base", TENANT_B),
  );

  assertEquals(trace.calls.length, 1, "one INSERT");
  const call = trace.calls[0];
  assertInsertCall(call);
  assertEquals(call.values.tenant_id, TENANT_B, "payload tenant_id matches caller");
  assert(call.values.tenant_id !== TENANT_A, "must not substitute another tenant");
});

Deno.test("12. tenant pinning UPDATE eq tenant_id matches the caller", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(confirmedRow(), trace);

  await persistTenantComplimentaryAccessGrant(
    baseParams(client, { kind: "update" }, "pro", TENANT_B),
  );

  const call = trace.calls[0];
  assertUpdateCall(call);
  assertEquals(
    call.filters,
    [{ op: "eq", column: "tenant_id", value: TENANT_B }],
    "UPDATE filter uses received tenantId",
  );
  assert(
    call.filters[0]?.value !== TENANT_A,
    "must not substitute another tenant",
  );
});

Deno.test("13. no upsert / onConflict on fake surface or call trace", async () => {
  const insertTrace = emptyTrace();
  const insertClient = createFakeClient(confirmedRow(), insertTrace);
  await persistTenantComplimentaryAccessGrant(
    baseParams(insertClient, { kind: "insert" }),
  );

  const updateTrace = emptyTrace();
  const updateClient = createFakeClient(confirmedRow(), updateTrace);
  await persistTenantComplimentaryAccessGrant(
    baseParams(updateClient, { kind: "update" }),
  );

  const insertTableApi = insertClient.from("tenant_complimentary_access_grants");
  const updateTableApi = updateClient.from("tenant_complimentary_access_grants");
  assert(
    !("upsert" in insertTableApi) && !("onConflict" in insertTableApi) &&
      !("upsert" in updateTableApi) && !("onConflict" in updateTableApi),
    "client table surface has no upsert/onConflict",
  );
  assert(!("upsert" in insertClient) && !("upsert" in updateClient), "client has no upsert");

  const serialized = JSON.stringify([...insertTrace.calls, ...updateTrace.calls]);
  assert(
    !serialized.includes("upsert") && !serialized.includes("onConflict"),
    "call trace must not mention upsert/onConflict",
  );
  assertEquals(insertTrace.calls[0]?.method, "insert", "insert intent stays INSERT");
  assertEquals(updateTrace.calls[0]?.method, "update", "update intent stays UPDATE");
});

Deno.test("14. no unauthorized collateral reads of IAM/Stripe storage", async () => {
  const insertTrace = emptyTrace();
  await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(confirmedRow(), insertTrace),
      { kind: "insert" },
    ),
  );
  const updateTrace = emptyTrace();
  await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(confirmedRow(), updateTrace),
      { kind: "update" },
    ),
  );

  assertNoCollateralTables(insertTrace.fromTables);
  assertNoCollateralTables(updateTrace.fromTables);
  assertEquals(insertTrace.fromTables.length, 1, "INSERT: one from()");
  assertEquals(updateTrace.fromTables.length, 1, "UPDATE: one from()");
});

Deno.test("15. no mutation other than the requested INSERT or UPDATE", async () => {
  const insertTrace = emptyTrace();
  await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(confirmedRow(), insertTrace),
      { kind: "insert" },
    ),
  );
  assertEquals(insertTrace.calls.length, 1, "INSERT: one mutation");
  assertInsertCall(insertTrace.calls[0]);

  const updateTrace = emptyTrace();
  await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(confirmedRow(), updateTrace),
      { kind: "update" },
    ),
  );
  assertEquals(updateTrace.calls.length, 1, "UPDATE: one mutation");
  assertUpdateCall(updateTrace.calls[0]);
});

Deno.test("16. result does not expose raw DB details", async () => {
  const conflict = await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "23505",
            message: "duplicate key RAW_SECRET hint=DETAIL",
          },
        },
        emptyTrace(),
      ),
      { kind: "insert" },
    ),
  );
  expectFailure(conflict, "complimentary_access_grant_insert_conflict");
  assertEquals(
    JSON.stringify(conflict),
    '{"ok":false,"reason":"complimentary_access_grant_insert_conflict"}',
    "sanitized insert conflict",
  );

  const generic = await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: {
            code: "XX000",
            message: "internal RAW_HINT stack=TRACE",
          },
        },
        emptyTrace(),
      ),
      { kind: "update" },
    ),
  );
  expectFailure(generic, "complimentary_access_grant_persistence_failed");
  assertEquals(
    JSON.stringify(generic),
    '{"ok":false,"reason":"complimentary_access_grant_persistence_failed"}',
    "sanitized generic failure",
  );
});

Deno.test("INSERT unconfirmed success (data null, error null) → persistence_failed", async () => {
  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient({ data: null, error: null }, emptyTrace()),
      { kind: "insert" },
    ),
  );
  expectFailure(result, "complimentary_access_grant_persistence_failed");
});

Deno.test("UPDATE 23505 is persistence_failed, not insert_conflict", async () => {
  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(
      createFakeClient(
        {
          data: null,
          error: { code: "23505", message: "duplicate key RAW_UPDATE_23505" },
        },
        emptyTrace(),
      ),
      { kind: "update" },
    ),
  );
  expectFailure(result, "complimentary_access_grant_persistence_failed");
  assertEquals(
    JSON.stringify(result).includes("RAW_UPDATE_23505"),
    false,
    "no raw leak",
  );
});

Deno.test("thrown client error is sanitized persistence_failed", async () => {
  const trace = emptyTrace();
  const client = createFakeClient(() => {
    throw new Error(
      "socket hang up RAW_EXCEPTION_DETAIL_PERSIST env=SECRET_VALUE",
    );
  }, trace);

  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(client, { kind: "insert" }),
  );

  expectFailure(result, "complimentary_access_grant_persistence_failed");
  assertEquals(trace.calls.length, 1, "injected client was used");
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_EXCEPTION_DETAIL_PERSIST") &&
      !serialized.includes("SECRET_VALUE") &&
      !serialized.includes("socket hang"),
    "must not leak raw exception/secret text",
  );
});

Deno.test("padded UUID tenantId is invalid on INSERT and UPDATE, zero DB", async () => {
  const paddedTenant = " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ";

  for (const operation of [{ kind: "insert" as const }, { kind: "update" as const }]) {
    const trace = emptyTrace();
    expectFailure(
      await persistTenantComplimentaryAccessGrant(
        explicitParams({
          client: createFakeClient(confirmedRow(), trace),
          tenantId: paddedTenant,
          productTier: "base",
          operation,
        }),
      ),
      "invalid_tenant_id",
    );
    assertEquals(trace.fromTables.length, 0, "must not touch DB on padded UUID");
    assertEquals(trace.calls.length, 0, "must not write on padded UUID");
  }
});

Deno.test("unknown operation kind → persistence_failed, zero write", async () => {
  const trace = emptyTrace();
  const operation = { kind: "upsert" } as unknown as
    PersistTenantComplimentaryAccessGrantParams["operation"];

  const result = await persistTenantComplimentaryAccessGrant(
    baseParams(createFakeClient(confirmedRow(), trace), operation),
  );

  expectFailure(result, "complimentary_access_grant_persistence_failed");
  assertEquals(trace.calls.length, 0, "must not write on unknown operation");
  assertEquals(trace.fromTables.length, 0, "must not query on unknown operation");
});
