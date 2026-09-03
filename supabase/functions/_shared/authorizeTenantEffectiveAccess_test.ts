/**
 * Deno tests for authorizeTenantEffectiveAccess (BILLING-96).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/authorizeTenantEffectiveAccess_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic — not real tenants, users, JWTs, or memberships.
 * Audience policy is delegated to ensureTenantMembership; these tests
 * prove the seam, not a second local role allowlist.
 */

import {
  ensureTenantMembership,
  type AuthContext,
  type EnsureTenantMembershipDependencies,
  type TenantMembershipLookupClient,
  type TenantMembershipLookupError,
  type TenantMembershipLookupResponse,
  type TenantMembershipRole,
} from "./auth.ts";
import {
  type AuthorizeTenant,
  type AuthorizeTenantOk,
} from "./handleEffectiveAccessRequest.ts";
import {
  authorizeTenantEffectiveAccess,
} from "./authorizeTenantEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_PADDED = "  aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1  ";
const USER_A = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const AUTH: AuthContext = { token: "synthetic-test-bearer-not-a-jwt" };

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
  authenticateCalls?: AuthContext[];
}): {
  dependencies: EnsureTenantMembershipDependencies;
  calls: FakeCall[];
  authenticateCalls: AuthContext[];
} {
  const calls = options.calls ?? [];
  const authenticateCalls = options.authenticateCalls ?? [];
  const membershipClient = options.client ??
    createFakeMembershipClient(
      options.membership ?? membershipRow("user"),
      calls,
    );

  return {
    calls,
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
        void token;
        if (options.client instanceof Response) {
          return options.client;
        }
        return membershipClient;
      },
    },
  };
}

async function authorize(
  tenantId: string,
  options: Parameters<typeof deps>[0],
  auth: AuthContext = AUTH,
): Promise<AuthorizeTenantOk | Response> {
  const { dependencies } = deps(options);
  return await authorizeTenantEffectiveAccess(auth, tenantId, dependencies);
}

function expectMinimizedOk(
  result: AuthorizeTenantOk | Response,
): asserts result is AuthorizeTenantOk {
  assert(!(result instanceof Response), "expected success, got Response");
  assertEquals(result, { ok: true }, "success must be exactly { ok: true }");
  assertEquals(Object.keys(result), ["ok"], "success public fields only");
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("userId"), "success must not include userId");
  assert(!serialized.includes("role"), "success must not include role");
  assert(!serialized.includes(USER_A), "success must not leak user id");
}

async function expectForbiddenEnvelope(
  result: unknown,
  leakTokens: readonly string[] = [],
): Promise<Response> {
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
  return result;
}

Deno.test("AuthorizeTenant assignment needs no unsafe cast", () => {
  const authorizeTenant: AuthorizeTenant = authorizeTenantEffectiveAccess;
  assert(
    authorizeTenant === authorizeTenantEffectiveAccess,
    "direct assignment without wrapping or cast",
  );
});

Deno.test("1. admin member → authorized {ok:true}", async () => {
  const result = await authorize(TENANT_A, {
    membership: membershipRow("admin"),
  });
  expectMinimizedOk(result);
});

Deno.test("2. billing member → authorized {ok:true}", async () => {
  const result = await authorize(TENANT_A, {
    membership: membershipRow("billing"),
  });
  expectMinimizedOk(result);
});

Deno.test("3. ordinary user member → authorized {ok:true}", async () => {
  const result = await authorize(TENANT_A, {
    membership: membershipRow("user"),
  });
  expectMinimizedOk(result);
});

Deno.test("4. non-member → membership failure envelope unchanged", async () => {
  const options = { membership: { data: null, error: null } };
  const { dependencies } = deps(options);
  const primitive = await ensureTenantMembership(AUTH, TENANT_A, dependencies);
  const result = await authorizeTenantEffectiveAccess(
    AUTH,
    TENANT_A,
    dependencies,
  );

  assert(primitive instanceof Response, "primitive denies non-member");
  assert(result instanceof Response, "authorizer denies non-member");
  assertEquals(result.status, primitive.status, "status matches primitive");
  assertEquals(await result.json(), await primitive.json(), "body matches primitive");
  await expectForbiddenEnvelope(
    await authorize(TENANT_A, options),
    [USER_A, TENANT_A, "tenant_memberships"],
  );
});

Deno.test("5. auth invalid Response is returned by identity", async () => {
  const authFailure = new Response(
    JSON.stringify({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header.",
      },
    }),
    { status: 401, headers: { "x-auth-failure": "keep-exact" } },
  );
  const calls: FakeCall[] = [];
  const result = await authorize(TENANT_A, { authFailure, calls });
  assert(result === authFailure, "auth failure Response must be the same instance");
  assert(result instanceof Response, "auth failure remains a Response");
  assertEquals(result.status, 401, "status unaltered");
  assertEquals(
    result.headers.get("x-auth-failure"),
    "keep-exact",
    "headers unaltered",
  );
  assertEquals(calls.length, 0, "membership must not be queried after auth failure");
});

Deno.test("5b. distinctive non-401 auth Response is not remapped", async () => {
  const distinctive = new Response("AUTH-FAILURE-BODY-keep-exact", {
    status: 418,
    headers: { "x-distinctive-auth": "keep-exact" },
  });
  const result = await authorize(TENANT_A, { authFailure: distinctive });
  assert(result === distinctive, "same Response instance");
  assert(result instanceof Response, "distinctive failure remains a Response");
  assertEquals(result.status, 418, "status not remapped to 401/403/500");
  assertEquals(
    await result.text(),
    "AUTH-FAILURE-BODY-keep-exact",
    "body unaltered",
  );
});

Deno.test("5c. user-scoped client factory Response is returned by identity", async () => {
  const scopedFailure = new Response("SCOPED-CLIENT-FAILURE-keep-exact", {
    status: 401,
    headers: { "x-scoped-client": "keep-exact" },
  });
  const calls: FakeCall[] = [];
  const result = await authorize(TENANT_A, { client: scopedFailure, calls });
  assert(result === scopedFailure, "client factory Response returned as-is");
  assertEquals(calls.length, 0, "membership must not be queried");
});

Deno.test("6. unrecognized / malformed role → primitive fail-closed", async () => {
  for (const role of ["owner", "USER", "ADMIN", "moderator", "", 123, null]) {
    const options = { membership: membershipRow(role) };
    const { dependencies } = deps(options);
    const primitive = await ensureTenantMembership(
      AUTH,
      TENANT_A,
      dependencies,
    );
    const result = await authorizeTenantEffectiveAccess(
      AUTH,
      TENANT_A,
      dependencies,
    );
    assert(primitive instanceof Response, `primitive fail-closed for ${String(role)}`);
    assert(result instanceof Response, `authorizer fail-closed for ${String(role)}`);
    assertEquals(result.status, primitive.status, `status for ${String(role)}`);
    assertEquals(
      await result.clone().json(),
      await primitive.clone().json(),
      `body for ${String(role)} matches primitive`,
    );
  }
});

Deno.test("tenantId is forwarded byte-identical to the membership primitive", async () => {
  const calls: FakeCall[] = [];
  await authorize(TENANT_PADDED, {
    membership: membershipRow("user"),
    calls,
  });
  assertEquals(calls.length, 1, "one membership lookup");
  assertEquals(
    calls[0]?.filters[0],
    { column: "tenant_id", value: TENANT_PADDED },
    "tenant_id filter is the received tenantId",
  );
});

Deno.test("success strips membership userId and role; primitive still returns them", async () => {
  const { dependencies } = deps({ membership: membershipRow("admin") });
  const primitive = await ensureTenantMembership(AUTH, TENANT_A, dependencies);
  const result = await authorizeTenantEffectiveAccess(
    AUTH,
    TENANT_A,
    dependencies,
  );

  assert(!(primitive instanceof Response), "primitive succeeds for admin");
  assertEquals(primitive.ok, true, "primitive ok");
  assertEquals(primitive.userId, USER_A, "primitive still exposes userId");
  assertEquals(
    primitive.role,
    "admin" satisfies TenantMembershipRole,
    "primitive still exposes role",
  );

  expectMinimizedOk(result);
  assert(!("userId" in result), "authorizer must not expose userId");
  assert(!("role" in result), "authorizer must not expose role");
});

Deno.test("lookup error Response envelope matches the membership primitive", async () => {
  const { dependencies } = deps({
    membership: lookupError({
      code: "42P01",
      message: RAW_DB_DETAIL,
    }),
  });
  const primitive = await ensureTenantMembership(AUTH, TENANT_A, dependencies);
  const result = await authorizeTenantEffectiveAccess(
    AUTH,
    TENANT_A,
    dependencies,
  );
  assert(primitive instanceof Response, "primitive sanitizes lookup error");
  assert(result instanceof Response, "authorizer sanitizes lookup error");
  assertEquals(result.status, primitive.status, "status matches primitive");
  assertEquals(
    await result.json(),
    await primitive.json(),
    "body matches primitive — not remapped",
  );
});

Deno.test("source scan: authorization-only seam, no local role policy or persistence", () => {
  const source = authorizeTenantEffectiveAccess.toString();
  const forbidden = [
    "Deno.env",
    "Deno.serve",
    "createClient",
    "createUserScopedClient",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
    "tenant_subscriptions",
    "tenant_complimentary_access_grants",
    "ensureTenantBillingAccess",
    '"admin"',
    '"billing"',
    '"user"',
    "serializeEffectiveAccess",
    "jsonResponse",
    "internalError",
    "resolveHttpSafeTenantEffectiveAccessFromPersistence",
    "readTenantAccessMode",
    "readTenantStripeSubscriptionObservations",
    "readTenantComplimentaryAccessCandidate",
    "resolveEffectiveAccess",
    "resolveTenantEffectiveAccessFromPersistence",
    "createEffectiveAccessResolver",
    "handleEffectiveAccessRequest(",
    "ModeCapabilityProfiles",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `authorizer must not contain ${token}`);
  }
  assert(
    source.includes("ensureTenantMembership"),
    "must delegate to ensureTenantMembership",
  );
  assert(
    source.includes("instanceof Response"),
    "must pass through membership Response",
  );
  assert(source.includes("ok: true"), "success must be minimized");
});
