/**
 * Deno tests for ensureTenantMembership (BILLING-87).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/ensureTenantMembership_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic — not real tenants, users, JWTs, or memberships.
 */

import {
  ensureTenantBillingAccess,
  ensureTenantMembership,
  parseAuthHeader,
  type AuthContext,
  type EnsureTenantMembershipDependencies,
  type TenantMembershipLookupClient,
  type TenantMembershipLookupError,
  type TenantMembershipLookupResponse,
  type TenantMembershipRole,
} from "./auth.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_PADDED = "  aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1  ";
const USER_A = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const USER_PADDED = "  bbbbbbbb-cccc-4ddd-8eee-ffffffffffff  ";
const AUTH: AuthContext = { token: "synthetic-test-bearer-not-a-jwt" };
const DISTINCTIVE_TOKEN = "synthetic-token-IDENTITY-keep-exact";

const RAW_DB_DETAIL =
  "RAW_DB_DETAIL SQLSTATE=42P01 hint=password authentication failed jwt=eyJhbGciOi secret=service_role email=user@example.test";

function assert(condition: boolean, message: string): asserts condition {
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

type FakeCall = {
  table: string;
  columns: string;
  filters: Array<{ column: string; value: string }>;
  maybeSingle: boolean;
};

function createFakeMembershipClient(
  result: TenantMembershipLookupResponse | (() => never),
  calls: FakeCall[],
): TenantMembershipLookupClient {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          const filters: Array<{ column: string; value: string }> = [];
          const builder = {
            eq(column: string, value: string) {
              filters.push({ column, value });
              return builder;
            },
            maybeSingle() {
              calls.push({
                table,
                columns,
                filters: [...filters],
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
          return builder;
        },
      };
    },
  };
}

function membershipRow(
  role: unknown,
): TenantMembershipLookupResponse {
  return { data: { role }, error: null };
}

function lookupError(
  error: TenantMembershipLookupError,
): TenantMembershipLookupResponse {
  return { data: null, error };
}

function deps(options: {
  userId?: string;
  authFailure?: Response;
  client?: TenantMembershipLookupClient | Response;
  membership?: TenantMembershipLookupResponse | (() => never);
  calls?: FakeCall[];
  clientTokens?: string[];
  authenticateCalls?: AuthContext[];
}): {
  dependencies: EnsureTenantMembershipDependencies;
  calls: FakeCall[];
  clientTokens: string[];
  authenticateCalls: AuthContext[];
} {
  const calls = options.calls ?? [];
  const clientTokens = options.clientTokens ?? [];
  const authenticateCalls = options.authenticateCalls ?? [];
  const membershipClient = options.client ??
    createFakeMembershipClient(
      options.membership ?? membershipRow("user"),
      calls,
    );

  return {
    calls,
    clientTokens,
    authenticateCalls,
    dependencies: {
      async getAuthenticatedUser(auth) {
        authenticateCalls.push({ token: auth.token });
        if (options.authFailure) {
          return options.authFailure;
        }
        return { userId: options.userId ?? USER_A };
      },
      createUserScopedClient(token) {
        clientTokens.push(token);
        if (options.client instanceof Response) {
          return options.client;
        }
        return membershipClient;
      },
    },
  };
}

async function callMembership(
  tenantId: string,
  options: Parameters<typeof deps>[0],
  auth: AuthContext = AUTH,
): Promise<
  | { ok: true; userId: string; role: TenantMembershipRole }
  | Response
> {
  const { dependencies } = deps(options);
  return await ensureTenantMembership(auth, tenantId, dependencies);
}

async function expectUnauthorized(result: unknown): Promise<Response> {
  assert(result instanceof Response, "expected unauthorized Response");
  assertEquals(result.status, 401, "status");
  const body = await result.json() as {
    error?: { code?: string; message?: string };
  };
  assertEquals(body.error?.code, "UNAUTHORIZED", "error code");
  assertEquals(
    body.error?.message,
    "Missing or invalid Authorization header.",
    "unauthorized message",
  );
  return result;
}

async function expectForbidden(
  result: unknown,
  leakTokens: readonly string[] = [],
): Promise<void> {
  assert(result instanceof Response, "expected forbidden Response");
  assertEquals(result.status, 403, "status");
  const body = await result.json() as {
    error?: { code?: string; message?: string };
  };
  assertEquals(body.error?.code, "FORBIDDEN", "error code");
  assertEquals(
    body.error?.message,
    "Insufficient permissions for this tenant.",
    "forbidden message",
  );
  const serialized = JSON.stringify(body);
  assert(
    !("data" in body) || body.data === undefined,
    "failure must not include data",
  );
  assert(!("role" in body), "failure must not include role");
  assert(!("userId" in body), "failure must not include userId");
  for (const token of leakTokens) {
    assert(
      !serialized.includes(token),
      `failure must not leak ${token}`,
    );
  }
}

function expectSuccess(
  result: { ok: true; userId: string; role: TenantMembershipRole } | Response,
  expected: { userId: string; role: TenantMembershipRole },
): asserts result is { ok: true; userId: string; role: TenantMembershipRole } {
  assert(!(result instanceof Response), "expected success, got Response");
  assertEquals(result.ok, true, "ok");
  assertEquals(result.userId, expected.userId, "userId");
  assertEquals(result.role, expected.role, "role");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "role", "userId"].sort(),
    "success public fields only",
  );
}

Deno.test("A. missing Authorization header → unauthorized", async () => {
  const result = parseAuthHeader(new Request("https://example.test", {
    method: "POST",
  }));
  await expectUnauthorized(result);
});

Deno.test("A. invalid Authorization scheme → unauthorized", async () => {
  const result = parseAuthHeader(new Request("https://example.test", {
    method: "POST",
    headers: { authorization: "Basic synthetic" },
  }));
  await expectUnauthorized(result);
});

Deno.test("A. getAuthenticatedUser failure is returned; membership is not queried", async () => {
  const authFailure = new Response(
    JSON.stringify({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header.",
      },
    }),
    { status: 401 },
  );
  const calls: FakeCall[] = [];
  const { dependencies } = deps({ authFailure, calls });
  const result = await ensureTenantMembership(AUTH, TENANT_A, dependencies);
  assert(result === authFailure, "auth failure Response must be returned as-is");
  await expectUnauthorized(result);
  assertEquals(calls.length, 0, "membership must not be queried after auth failure");
});

Deno.test("B. authenticated user with no membership → forbidden sanitized", async () => {
  const result = await callMembership(TENANT_A, {
    membership: { data: null, error: null },
  });
  await expectForbidden(result, [USER_A, TENANT_A, "tenant_memberships"]);
});

Deno.test("C. role user → success", async () => {
  const result = await callMembership(TENANT_A, {
    membership: membershipRow("user"),
  });
  expectSuccess(result, { userId: USER_A, role: "user" });
});

Deno.test("D. role billing → success", async () => {
  const result = await callMembership(TENANT_A, {
    membership: membershipRow("billing"),
  });
  expectSuccess(result, { userId: USER_A, role: "billing" });
});

Deno.test("E. role admin → success", async () => {
  const result = await callMembership(TENANT_A, {
    membership: membershipRow("admin"),
  });
  expectSuccess(result, { userId: USER_A, role: "admin" });
});

Deno.test("F. membership lookup error with raw DB detail → forbidden sanitized", async () => {
  const result = await callMembership(TENANT_A, {
    membership: lookupError({
      code: "42P01",
      message: RAW_DB_DETAIL,
    }),
  });
  await expectForbidden(result, [
    RAW_DB_DETAIL,
    "SQLSTATE",
    "42P01",
    "jwt=eyJhbGciOi",
    "service_role",
    "user@example.test",
    "tenant_memberships",
  ]);
});

Deno.test("F. thrown lookup error with raw detail → forbidden sanitized", async () => {
  const result = await callMembership(TENANT_A, {
    membership: () => {
      throw new Error(RAW_DB_DETAIL);
    },
  });
  await expectForbidden(result, [
    RAW_DB_DETAIL,
    "SQLSTATE",
    "42P01",
    "service_role",
    "user@example.test",
  ]);
});

Deno.test("G. unexpected persisted role → fail-closed forbidden", async () => {
  for (const role of ["owner", "USER", "ADMIN", "moderator", "", 123, null]) {
    const result = await callMembership(TENANT_A, {
      membership: membershipRow(role),
    });
    await expectForbidden(result, ["owner", "moderator"]);
  }
});

Deno.test("H. tenantId is passed unchanged to the membership query", async () => {
  const calls: FakeCall[] = [];
  await callMembership(TENANT_PADDED, {
    membership: membershipRow("user"),
    calls,
  });
  assertEquals(calls.length, 1, "one membership lookup");
  assertEquals(calls[0]?.table, "tenant_memberships", "table");
  assertEquals(calls[0]?.columns, "role", "select role only");
  assertEquals(
    calls[0]?.filters[0],
    { column: "tenant_id", value: TENANT_PADDED },
    "tenant_id filter is the received tenantId",
  );
});

Deno.test("I. authenticated userId is passed unchanged to the membership query", async () => {
  const calls: FakeCall[] = [];
  await callMembership(TENANT_A, {
    userId: USER_PADDED,
    membership: membershipRow("admin"),
    calls,
  });
  assertEquals(calls.length, 1, "one membership lookup");
  assertEquals(
    calls[0]?.filters[1],
    { column: "user_id", value: USER_PADDED },
    "user_id filter is the authenticated userId",
  );
});

Deno.test("J. helper does not use service_role", () => {
  const source = ensureTenantMembership.toString();
  for (
    const forbidden of [
      "service_role",
      "SERVICE_ROLE",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]
  ) {
    assert(!source.includes(forbidden), `helper must not contain ${forbidden}`);
  }
  assert(
    source.includes("createUserScopedClient") ||
      source.includes("createScopedClient"),
    "production path must use the user-scoped client factory",
  );
});

Deno.test("J. createUserScopedClient receives only the caller token", async () => {
  const clientTokens: string[] = [];
  const auth: AuthContext = { token: DISTINCTIVE_TOKEN };
  await callMembership(TENANT_A, {
    membership: membershipRow("user"),
    clientTokens,
  }, auth);
  assertEquals(clientTokens, [DISTINCTIVE_TOKEN], "token passed unchanged");
});

Deno.test("K. ensureTenantBillingAccess still rejects role user", () => {
  const billing = ensureTenantBillingAccess.toString();
  assert(
    billing.includes('membership.role !== "admin"') &&
      billing.includes('membership.role !== "billing"'),
    "billing gate must still require admin or billing",
  );
  assert(
    billing.includes("return forbidden()"),
    "non-privileged membership must remain forbidden",
  );
  assert(
    !billing.includes("isTenantMembershipRole"),
    "billing gate must not be widened to the any-role helper",
  );

  const membership = ensureTenantMembership.toString();
  assert(
    membership.includes("isTenantMembershipRole"),
    "membership helper must accept any persistable role",
  );
  assert(
    ensureTenantMembership !== ensureTenantBillingAccess,
    "helpers must be distinct functions",
  );
});

Deno.test("success must not echo extra membership row fields", async () => {
  const result = await callMembership(TENANT_A, {
    membership: {
      data: {
        role: "user",
        user_id: USER_A,
        tenant_id: TENANT_A,
        created_at: "2026-01-01T00:00:00.000Z",
      } as TenantMembershipLookupResponse["data"],
      error: null,
    },
  });
  expectSuccess(result, { userId: USER_A, role: "user" });
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("created_at"), "must not echo created_at");
  assert(!serialized.includes("tenant_id"), "must not echo tenant_id");
});

Deno.test("createUserScopedClient auth-layer failure is returned; lookup skipped", async () => {
  const scopedFailure = new Response(
    JSON.stringify({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header.",
      },
    }),
    { status: 401 },
  );
  const calls: FakeCall[] = [];
  const result = await callMembership(TENANT_A, {
    client: scopedFailure,
    calls,
  });
  assert(result === scopedFailure, "client factory Response returned as-is");
  await expectUnauthorized(result);
  assertEquals(calls.length, 0, "membership must not be queried");
});
