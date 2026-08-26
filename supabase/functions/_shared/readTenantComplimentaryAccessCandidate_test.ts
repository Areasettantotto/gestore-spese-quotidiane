/**
 * Deno tests for readTenantComplimentaryAccessCandidate.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/readTenantComplimentaryAccessCandidate_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import {
  classifyTenantComplimentaryAccessGrantLookup,
  readTenantComplimentaryAccessCandidate,
  type ComplimentaryAccessGrantLookupClient,
  type ComplimentaryAccessGrantLookupError,
  type ComplimentaryAccessGrantRow,
  type ReadTenantComplimentaryAccessCandidateResult,
} from "./readTenantComplimentaryAccessCandidate.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

/** Synthetic UUIDs — not real tenant IDs from historical reports. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";

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
  result: ReadTenantComplimentaryAccessCandidateResult,
): asserts result is Extract<
  ReadTenantComplimentaryAccessCandidateResult,
  { ok: true }
> {
  assert(result.ok === true, `expected success, got ${JSON.stringify(result)}`);
}

function expectFailure(
  result: ReadTenantComplimentaryAccessCandidateResult,
  reason: string,
): void {
  if (result.ok !== false) {
    throw new Error(`expected failure, got ${JSON.stringify(result)}`);
  }
  assertEquals(result.reason, reason, "failure reason");
}

type FakeLookupResult = {
  data: ComplimentaryAccessGrantRow | null;
  error: ComplimentaryAccessGrantLookupError | null;
};

type FakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
  maybeSingle: boolean;
};

/**
 * Minimal SELECT-only fake: `.from().select().eq().maybeSingle()` → Promise.
 * Optionally throws to simulate transport/client failures.
 */
function createFakeClient(
  result: FakeLookupResult | (() => never),
  calls: FakeCall[],
): ComplimentaryAccessGrantLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                maybeSingle() {
                  calls.push({
                    table,
                    columns,
                    filters: [{ column, value }],
                    maybeSingle: true,
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

Deno.test("1. Base row → complimentary Base candidate", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: { product_tier: "base" }, error: null },
      calls,
    ),
  });

  expectSuccess(result);
  assertEquals(
    result.candidate,
    { kind: "valid", tier: "base", expiresAt: null },
    "Base candidate",
  );
  assertEquals(calls.length, 1, "one SELECT");
});

Deno.test("2. Pro row → complimentary Pro candidate", async () => {
  const result = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: { product_tier: "pro" }, error: null },
      [],
    ),
  });

  expectSuccess(result);
  assertEquals(
    result.candidate,
    { kind: "valid", tier: "pro", expiresAt: null },
    "Pro candidate",
  );
});

Deno.test("3. no row → no complimentary candidate", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient({ data: null, error: null }, calls),
  });

  expectSuccess(result);
  assertEquals(result.candidate, { kind: "absent" }, "absent candidate");
  assert(result.ok === true, "no-row is success, not a lookup failure");
  assertEquals(calls.length, 1, "one SELECT");
});

Deno.test("4. invalid product_tier → fail-closed, no coercion", async () => {
  const invalidTiers: unknown[] = [
    "free",
    "paid",
    "trial",
    "demo",
    "internal",
    "BASE",
    "Pro",
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

  for (const product_tier of invalidTiers) {
    const result = await readTenantComplimentaryAccessCandidate({
      tenantId: TENANT_A,
      client: createFakeClient(
        { data: { product_tier }, error: null },
        [],
      ),
    });
    expectFailure(result, "complimentary_access_grant_invalid");
    assert(
      !("candidate" in result),
      "must not return a candidate when product_tier is invalid",
    );
  }
});

Deno.test("5. query error → fail-closed, not treated as no-row", async () => {
  const result = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: null,
        error: {
          code: "57014",
          message:
            "canceling statement due to statement timeout RAW_DB_DETAIL_ALPHA",
        },
      },
      [],
    ),
  });

  expectFailure(result, "complimentary_access_grant_lookup_failed");
  assert(
    !("candidate" in result),
    "must not collapse query error to absent candidate",
  );
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

Deno.test("6. tenant scoping uses the received tenantId exactly", async () => {
  const calls: FakeCall[] = [];
  await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_B,
    client: createFakeClient({ data: null, error: null }, calls),
  });

  assertEquals(calls.length, 1, "one SELECT");
  assertEquals(
    calls[0]?.filters,
    [{ column: "tenant_id", value: TENANT_B }],
    "query pinned to received tenantId",
  );
  assert(
    calls[0]?.filters[0]?.value !== TENANT_A,
    "must not substitute another tenant",
  );
});

Deno.test("7. table authority is tenant_complimentary_access_grants", async () => {
  const calls: FakeCall[] = [];
  await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient({ data: null, error: null }, calls),
  });

  assertEquals(
    calls[0]?.table,
    "tenant_complimentary_access_grants",
    "complimentary grant table",
  );
  assert(calls[0]?.maybeSingle === true, "maybeSingle used");
});

Deno.test("8. minimal projection: product_tier only, no Stripe identity", async () => {
  const calls: FakeCall[] = [];
  await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient(
      { data: { product_tier: "base" }, error: null },
      calls,
    ),
  });

  assertEquals(calls[0]?.columns, "product_tier", "select product_tier only");
  const columns = calls[0]?.columns ?? "";
  assert(
    !columns.includes("plan_code") &&
      !columns.includes("provider") &&
      !columns.includes("provider_subscription_id") &&
      !columns.includes("provider_customer_id") &&
      !columns.includes("granted_at") &&
      !columns.includes("source"),
    "must not project Stripe identity, plan_code, granted_at, or source",
  );
});

Deno.test("9. no Stripe fallback when complimentary row is absent", async () => {
  const calls: FakeCall[] = [];
  const result = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient({ data: null, error: null }, calls),
  });

  expectSuccess(result);
  assertEquals(result.candidate.kind, "absent", "absent complimentary");
  assertEquals(calls.length, 1, "exactly one query");
  assertEquals(
    calls[0]?.table,
    "tenant_complimentary_access_grants",
    "complimentary table only",
  );
  for (const call of calls) {
    assert(
      call.table !== "tenant_subscriptions",
      "must not query tenant_subscriptions",
    );
  }
});

Deno.test("10. query throw/rejection → sanitized lookup failure, not no-row", async () => {
  const result = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient(() => {
      throw new Error(
        "socket hang up with RAW_EXCEPTION_DETAIL_BETA RAW_PRIVATE_DETAIL_DELTA",
      );
    }, []),
  });

  expectFailure(result, "complimentary_access_grant_lookup_failed");
  assert(
    !("candidate" in result),
    "must not collapse transport failure to absent candidate",
  );
  const serialized = JSON.stringify(result);
  assert(
    !serialized.includes("RAW_EXCEPTION_DETAIL_BETA") &&
      !serialized.includes("socket hang") &&
      !serialized.includes("RAW_PRIVATE_DETAIL_DELTA"),
    "must not leak raw exception text",
  );
});

Deno.test("11. invalid tenantId → fail-closed, no query", async () => {
  const calls: FakeCall[] = [];
  const client = createFakeClient({ data: null, error: null }, calls);

  for (const invalid of [null, undefined, "", " ", "   ", "\t", 1, true, {}, []]) {
    calls.length = 0;
    expectFailure(
      await readTenantComplimentaryAccessCandidate({
        tenantId: invalid,
        client,
      }),
      "invalid_tenant_id",
    );
    assertEquals(calls.length, 0, "must not query on invalid tenantId");
  }
});

Deno.test("12. padded valid tenantId preserves exact identity in filter", async () => {
  const calls: FakeCall[] = [];
  const paddedTenant = " aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1 ";

  await readTenantComplimentaryAccessCandidate({
    tenantId: paddedTenant,
    client: createFakeClient({ data: null, error: null }, calls),
  });

  assertEquals(
    calls[0]?.filters,
    [{ column: "tenant_id", value: paddedTenant }],
    "input identity must be preserved for DB filters",
  );
});

Deno.test("13. classify: error is never absent; null row is absent; invalid fails", () => {
  expectFailure(
    classifyTenantComplimentaryAccessGrantLookup({
      error: { code: "XX000", message: "internal RAW_CLASSIFY_DETAIL" },
      row: null,
    }),
    "complimentary_access_grant_lookup_failed",
  );

  const absent = classifyTenantComplimentaryAccessGrantLookup({
    error: null,
    row: null,
  });
  expectSuccess(absent);
  assertEquals(absent.candidate.kind, "absent", "null row → absent");

  expectFailure(
    classifyTenantComplimentaryAccessGrantLookup({
      error: null,
      row: { product_tier: "enterprise" },
    }),
    "complimentary_access_grant_invalid",
  );

  const base = classifyTenantComplimentaryAccessGrantLookup({
    error: null,
    row: { product_tier: "base" },
  });
  expectSuccess(base);
  assertEquals(base.candidate, {
    kind: "valid",
    tier: "base",
    expiresAt: null,
  }, "classify Base");
});

Deno.test("14. error wins over a present row; no candidate returned", async () => {
  const result = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_A,
    client: createFakeClient(
      {
        data: { product_tier: "pro" },
        error: {
          code: "PGRST116",
          message: "JSON object requested request_id=req_abc RAW_REQUEST_DETAIL",
        },
      },
      [],
    ),
  });

  expectFailure(result, "complimentary_access_grant_lookup_failed");
  const serialized = JSON.stringify(result);
  assertEquals(
    serialized,
    '{"ok":false,"reason":"complimentary_access_grant_lookup_failed"}',
    "sanitized",
  );
  assert(
    !serialized.includes("PGRST") &&
      !serialized.includes("request_id") &&
      !serialized.includes("RAW_REQUEST_DETAIL"),
    "no raw request/token leak",
  );
});
