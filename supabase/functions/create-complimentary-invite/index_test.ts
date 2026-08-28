/**
 * Deno tests for the complimentary invite HTTP adapter.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/create-complimentary-invite/index_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic — not real tenants, operators, JWTs, or tokens.
 */

import { COMPLIMENTARY_GRANT_OPERATOR_USER_IDS } from "../_shared/authorizeComplimentaryGrantOperator.ts";
import {
  createTenantComplimentaryAccessInvite,
  type ComplimentaryInviteInsertWriteValues,
  type ComplimentaryInvitePersistenceClient,
  type ComplimentaryInvitePersistenceWriteResponse,
  type CreateTenantComplimentaryAccessInviteParams,
  type CreateTenantComplimentaryAccessInviteResult,
} from "../_shared/createTenantComplimentaryAccessInvite.ts";
import {
  createComplimentaryInviteHandler,
  type ComplimentaryInviteHandlerDependencies,
} from "./index.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const OPERATOR_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea1";
const OPERATOR_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea2";
const STRANGER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeaf";
const INVITE_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaa1";
const SYNTHETIC_EXPIRES_AT = "2026-04-02T12:00:00.000Z";
const SYNTHETIC_BEARER = "synthetic-test-bearer-not-a-jwt";
const INVALID_BEARER = "synthetic-invalid-bearer";
const SYNTHETIC_SERVICE_ROLE = "synthetic-service-role-fixture-not-real";
const SYNTHETIC_SUPABASE_URL = "https://synthetic.example.invalid";
const SYNTHETIC_ALLOWLIST = `${OPERATOR_A},${OPERATOR_B}`;
const SYNTHETIC_RAW_TOKEN = "synthetic-invite-raw-token-fixture";
const ENDPOINT = "http://localhost/create-complimentary-invite";

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

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

function explodingInvite(): ComplimentaryInviteHandlerDependencies["createInvite"] {
  return async () => {
    throw new Error("createInvite must not be called RAW_SERVICE_DETAIL");
  };
}

function explodingClient(): ComplimentaryInviteHandlerDependencies["createPrivilegedClient"] {
  return () => {
    throw new Error("createPrivilegedClient must not be called RAW_CLIENT_DETAIL");
  };
}

function unusedPersistenceClient(): ComplimentaryInvitePersistenceClient {
  return {
    from() {
      throw new Error("persistence must not run RAW_CLIENT_DETAIL");
    },
  };
}

function createFakeClient(
  result: ComplimentaryInvitePersistenceWriteResponse,
): ComplimentaryInvitePersistenceClient {
  return {
    from(_table: string) {
      return {
        insert(_values: ComplimentaryInviteInsertWriteValues) {
          return {
            select(_columns: string) {
              return {
                maybeSingle() {
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

function confirmedRow(
  overrides: Partial<NonNullable<ComplimentaryInvitePersistenceWriteResponse["data"]>> =
    {},
): ComplimentaryInvitePersistenceWriteResponse {
  return {
    data: {
      id: INVITE_ID,
      tenant_id: TENANT_A,
      product_tier: "base",
      expires_at: SYNTHETIC_EXPIRES_AT,
      ...overrides,
    },
    error: null,
  };
}

function tracingInvite(
  impl: ComplimentaryInviteHandlerDependencies["createInvite"] =
    createTenantComplimentaryAccessInvite,
): {
  createInvite: ComplimentaryInviteHandlerDependencies["createInvite"];
  calls: CreateTenantComplimentaryAccessInviteParams[];
} {
  const calls: CreateTenantComplimentaryAccessInviteParams[] = [];
  return {
    calls,
    createInvite: async (params) => {
      calls.push(params);
      return await impl(params);
    },
  };
}

function testReadEnv(
  overrides: Record<string, string | undefined> = {},
): ComplimentaryInviteHandlerDependencies["readEnv"] {
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: SYNTHETIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SYNTHETIC_SERVICE_ROLE,
    [COMPLIMENTARY_GRANT_OPERATOR_USER_IDS]: SYNTHETIC_ALLOWLIST,
    ...overrides,
  };
  return (key) => env[key];
}

async function testResolveAuthenticatedCaller(
  req: Request,
): Promise<{ ok: true; callerUserId: string } | { ok: false }> {
  const headerValue = req.headers.get("authorization");
  if (!headerValue) {
    return { ok: false };
  }
  const [scheme, token] = headerValue.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return { ok: false };
  }
  if (token === INVALID_BEARER) {
    return { ok: false };
  }
  if (token === SYNTHETIC_BEARER) {
    return { ok: true, callerUserId: OPERATOR_A };
  }
  return { ok: false };
}

function baseDeps(
  overrides: Partial<ComplimentaryInviteHandlerDependencies> = {},
): Partial<ComplimentaryInviteHandlerDependencies> {
  return {
    resolveAuthenticatedCaller: testResolveAuthenticatedCaller,
    readEnv: testReadEnv(),
    createPrivilegedClient: () => createFakeClient(confirmedRow()),
    ...overrides,
  };
}

function authenticatedRequest(
  body: unknown,
  init: { method?: string; json?: boolean; bearer?: string | null } = {},
): Request {
  const headers = new Headers();
  if (init.bearer !== null) {
    headers.set("authorization", `Bearer ${init.bearer ?? SYNTHETIC_BEARER}`);
  }
  const method = init.method ?? "POST";
  const payload = init.json === false
    ? (body as BodyInit)
    : JSON.stringify(body);
  if (init.json !== false && method !== "GET" && method !== "OPTIONS") {
    headers.set("content-type", "application/json");
  }
  return new Request(ENDPOINT, {
    method,
    headers,
    body: method === "GET" || method === "OPTIONS" ? undefined : payload,
  });
}

async function invoke(
  req: Request,
  deps: Partial<ComplimentaryInviteHandlerDependencies> = baseDeps(),
): Promise<Response> {
  return await createComplimentaryInviteHandler(deps)(req);
}

async function readBody(res: Response): Promise<unknown> {
  return await res.json();
}

function assertFailure(res: Response, status: number): void {
  assertEquals(res.status, status, `status ${status}`);
  assertEquals(
    res.headers.get("content-type"),
    "application/json; charset=utf-8",
    "JSON content-type",
  );
}

async function expectFailure(
  res: Response,
  status: number,
  error: string,
  distinctive: string[] = [],
): Promise<unknown> {
  const body = await readBody(res);
  assertFailure(res, status);
  assertEquals(body, { error }, "public failure contract is { error }");
  const serialized = JSON.stringify(body);
  assertEquals(
    Object.keys(body as object).sort(),
    ["error"],
    "failure exposes only error",
  );
  for (const secret of [
    SYNTHETIC_SERVICE_ROLE,
    SYNTHETIC_BEARER,
    SYNTHETIC_ALLOWLIST,
    SYNTHETIC_RAW_TOKEN,
    "service_role",
    "Authorization",
    "token_hash",
    "tokenHash",
    ...distinctive,
  ]) {
    assert(
      !serialized.includes(secret),
      `failure must not leak ${secret}`,
    );
  }
  return body;
}

async function expectSuccessShape(
  res: Response,
  expected: {
    id: string;
    tenant_id: string;
    product_tier: "base" | "pro";
    expires_at: string;
    token: string;
  },
): Promise<unknown> {
  const body = await readBody(res);
  assertEquals(res.status, 201, "201 Created");
  assertEquals(
    res.headers.get("cache-control"),
    "no-store",
    "Cache-Control no-store on success",
  );
  assertEquals(
    res.headers.get("content-type"),
    "application/json; charset=utf-8",
    "JSON content-type",
  );
  assertEquals(
    body,
    { invite: expected },
    "success body is { invite: snake_case fields }",
  );
  const invite = (body as { invite: Record<string, unknown> }).invite;
  assertEquals(
    Object.keys(invite).sort(),
    ["expires_at", "id", "product_tier", "tenant_id", "token"].sort(),
    "invite keys are exactly the HTTP contract",
  );
  const serialized = JSON.stringify(body);
  assertEquals(
    countOccurrences(serialized, expected.token),
    1,
    "raw token appears exactly once",
  );
  assert(
    !serialized.includes("tokenHash") && !serialized.includes("token_hash"),
    "success must not contain tokenHash/token_hash",
  );
  assert(
    !serialized.includes(SYNTHETIC_ALLOWLIST) &&
      !serialized.includes("COMPLIMENTARY_GRANT_OPERATOR_USER_IDS"),
    "success must not contain allowlist",
  );
  assert(
    !serialized.includes(SYNTHETIC_SERVICE_ROLE) &&
      !serialized.includes("service_role"),
    "success must not contain service role",
  );
  assert(
    !serialized.includes(SYNTHETIC_BEARER) &&
      !serialized.includes("Authorization"),
    "success must not contain Authorization/JWT",
  );
  assert(!("rawToken" in invite), "HTTP contract uses token, not rawToken");
  assert(!("tenantId" in invite), "HTTP contract uses tenant_id");
  assert(!("productTier" in invite), "HTTP contract uses product_tier");
  assert(!("expiresAt" in invite), "HTTP contract uses expires_at");
  return body;
}

Deno.test("1. OPTIONS follows CORS preflight and skips auth/service", async () => {
  const invites = tracingInvite(explodingInvite());
  const res = await invoke(
    new Request(ENDPOINT, { method: "OPTIONS" }),
    {
      resolveAuthenticatedCaller: async () => {
        throw new Error("auth must not run on OPTIONS");
      },
      readEnv: () => {
        throw new Error("env must not run on OPTIONS");
      },
      createPrivilegedClient: explodingClient(),
      createInvite: invites.createInvite,
    },
  );

  assertEquals(res.status, 200, "OPTIONS 200");
  assertEquals(
    res.headers.get("access-control-allow-origin"),
    "*",
    "CORS origin",
  );
  assertEquals(
    res.headers.get("access-control-allow-methods"),
    "POST, OPTIONS",
    "CORS methods",
  );
  assertEquals(
    res.headers.get("content-type"),
    "application/json; charset=utf-8",
    "JSON content-type",
  );
  assertEquals(await readBody(res), { data: { ok: true } }, "OPTIONS body");
  assertEquals(invites.calls.length, 0, "OPTIONS does not call the service");
});

Deno.test("2+3. POST missing or invalid auth → 401", async () => {
  const invites = tracingInvite(explodingInvite());
  const deps = baseDeps({
    createPrivilegedClient: explodingClient(),
    createInvite: invites.createInvite,
  });

  const missing = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }, {
      bearer: null,
    }),
    deps,
  );
  await expectFailure(missing, 401, "authentication_required");

  const invalid = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }, {
      bearer: INVALID_BEARER,
    }),
    deps,
  );
  await expectFailure(invalid, 401, "authentication_required", [INVALID_BEARER]);
  assertEquals(invites.calls.length, 0, "401 does not call the service");
});

Deno.test("4. GET → 405 method_not_allowed", async () => {
  const invites = tracingInvite(explodingInvite());
  const res = await invoke(
    authenticatedRequest(undefined, { method: "GET" }),
    baseDeps({
      createPrivilegedClient: explodingClient(),
      createInvite: invites.createInvite,
    }),
  );
  await expectFailure(res, 405, "method_not_allowed");
  assertEquals(res.headers.get("allow"), "POST", "Allow: POST");
  assertEquals(invites.calls.length, 0, "405 does not call the service");
});

Deno.test("5. malformed JSON → 400 invalid_json", async () => {
  const invites = tracingInvite(explodingInvite());
  const res = await invoke(
    authenticatedRequest("{not-json", { json: false }),
    baseDeps({
      createPrivilegedClient: explodingClient(),
      createInvite: invites.createInvite,
    }),
  );
  await expectFailure(res, 400, "invalid_json");
  assertEquals(invites.calls.length, 0, "invalid JSON does not call the service");
});

Deno.test("6-13. non-object, extra, and server-owned body keys → 422", async () => {
  const invites = tracingInvite(explodingInvite());
  const deps = baseDeps({
    createPrivilegedClient: explodingClient(),
    createInvite: invites.createInvite,
  });

  const invalidBodies: unknown[] = [
    null,
    [],
    [TENANT_A],
    "base",
    1,
    true,
    { tenant_id: TENANT_A, product_tier: "base", extra: true },
    { tenant_id: TENANT_A, product_tier: "base", issued_by: OPERATOR_A },
    { tenant_id: TENANT_A, product_tier: "base", expires_at: SYNTHETIC_EXPIRES_AT },
    { tenant_id: TENANT_A, product_tier: "base", token_hash: "abc" },
    { tenant_id: TENANT_A, product_tier: "base", raw_token: SYNTHETIC_RAW_TOKEN },
    { tenant_id: TENANT_A, product_tier: "base", token: SYNTHETIC_RAW_TOKEN },
    { tenant_id: TENANT_A, product_tier: "base", caller_user_id: OPERATOR_A },
    { tenant_id: TENANT_A, product_tier: "base", callerUserId: OPERATOR_A },
  ];

  for (const body of invalidBodies) {
    const res = await invoke(authenticatedRequest(body), deps);
    await expectFailure(res, 422, "invalid_request", [
      "RAW_SERVICE_DETAIL",
      SYNTHETIC_RAW_TOKEN,
    ]);
  }
  assertEquals(invites.calls.length, 0, "structural 422 does not call the service");
});

Deno.test("14+15. invalid tenant or tier is mapped from the service → 422", async () => {
  const invites = tracingInvite();
  const deps = baseDeps({
    createPrivilegedClient: () => unusedPersistenceClient(),
    createInvite: invites.createInvite,
  });

  const invalidTenant = await invoke(
    authenticatedRequest({ tenant_id: "not-a-uuid", product_tier: "base" }),
    deps,
  );
  await expectFailure(invalidTenant, 422, "invalid_request");

  const invalidTier = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "BASE" }),
    deps,
  );
  await expectFailure(invalidTier, 422, "invalid_request");

  assertEquals(invites.calls.length, 2, "domain validation is delegated");
  assertEquals(invites.calls[0]?.tenantId, "not-a-uuid", "tenant_id passed exactly");
  assertEquals(invites.calls[1]?.productTier, "BASE", "product_tier passed exactly");
});

Deno.test("16. forbidden operator → 403", async () => {
  const invites = tracingInvite();
  const res = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      resolveAuthenticatedCaller: async () => ({
        ok: true,
        callerUserId: STRANGER,
      }),
      createPrivilegedClient: () => unusedPersistenceClient(),
      createInvite: invites.createInvite,
    }),
  );
  await expectFailure(res, 403, "forbidden", ["admin", "billing", STRANGER]);
  assertEquals(invites.calls.length, 1, "forbidden is decided by the service");
});

Deno.test("17+18. authority unconfigured or invalid config → 503 sanitized", async () => {
  const unconfigured = tracingInvite();
  const unconfiguredRes = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      readEnv: testReadEnv({
        [COMPLIMENTARY_GRANT_OPERATOR_USER_IDS]: "",
      }),
      createPrivilegedClient: () => unusedPersistenceClient(),
      createInvite: unconfigured.createInvite,
    }),
  );
  await expectFailure(
    unconfiguredRes,
    503,
    "complimentary_invite_unavailable",
    ["authority_unconfigured"],
  );

  const invalid = tracingInvite();
  const invalidRes = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      readEnv: testReadEnv({
        [COMPLIMENTARY_GRANT_OPERATOR_USER_IDS]: "not-a-uuid",
      }),
      createPrivilegedClient: () => unusedPersistenceClient(),
      createInvite: invalid.createInvite,
    }),
  );
  await expectFailure(
    invalidRes,
    503,
    "complimentary_invite_unavailable",
    ["authority_invalid_config", "not-a-uuid"],
  );
});

Deno.test("19-21. internal service failures → 500 sanitized", async () => {
  const reasons: Array<
    Extract<
      CreateTenantComplimentaryAccessInviteResult,
      { ok: false }
    >["reason"]
  > = [
    "invalid_caller_user_id",
    "invalid_clock",
    "complimentary_invite_token_generation_failed",
    "complimentary_invite_persistence_failed",
  ];

  for (const reason of reasons) {
    const invites = tracingInvite(async () => ({ ok: false, reason }));
    const res = await invoke(
      authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
      baseDeps({ createInvite: invites.createInvite }),
    );
    await expectFailure(
      res,
      500,
      "complimentary_invite_internal_error",
      [reason],
    );
    assertEquals(invites.calls.length, 1, `${reason} was mapped`);
  }
});

Deno.test("22. token conflict → 409 complimentary_invite_token_conflict", async () => {
  const invites = tracingInvite();
  const res = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      createPrivilegedClient: () =>
        createFakeClient({
          data: null,
          error: {
            code: "23505",
            message: `duplicate key RAW_DB_DETAIL ${SYNTHETIC_RAW_TOKEN}`,
          },
        }),
      createInvite: invites.createInvite,
    }),
  );
  await expectFailure(
    res,
    409,
    "complimentary_invite_token_conflict",
    ["RAW_DB_DETAIL", "23505", "duplicate"],
  );
});

Deno.test("23-32. Base and Pro success contract, snake_case, token once, no secrets", async () => {
  for (const productTier of ["base", "pro"] as const) {
    const invites = tracingInvite();
    const res = await invoke(
      authenticatedRequest({ tenant_id: TENANT_A, product_tier: productTier }),
      baseDeps({
        createPrivilegedClient: () =>
          createFakeClient(confirmedRow({ product_tier: productTier })),
        createInvite: invites.createInvite,
      }),
    );

    const body = await res.clone().json() as {
      invite: { token: string; product_tier: string };
    };
    await expectSuccessShape(res, {
      id: INVITE_ID,
      tenant_id: TENANT_A,
      product_tier: productTier,
      expires_at: SYNTHETIC_EXPIRES_AT,
      token: body.invite.token,
    });
    assert(body.invite.token.length > 0, "raw token is present");
    assertEquals(invites.calls.length, 1, `${productTier} service called once`);
  }
});

Deno.test("33-37. service receives auth identity, exact body fields, and server env only", async () => {
  const invites = tracingInvite();
  let clientConfig: { supabaseUrl: string; serviceRoleKey: string } | null =
    null;

  await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "pro" }),
    baseDeps({
      createPrivilegedClient: (supabaseUrl, serviceRoleKey) => {
        clientConfig = { supabaseUrl, serviceRoleKey };
        return createFakeClient(confirmedRow({ product_tier: "pro" }));
      },
      createInvite: invites.createInvite,
    }),
  );

  assertEquals(invites.calls.length, 1, "service called once");
  const params = invites.calls[0];
  assert(params !== undefined, "service received params");
  assertEquals(
    Object.keys(params).sort(),
    [
      "callerUserId",
      "client",
      "configuredOperatorUserIds",
      "productTier",
      "tenantId",
    ].sort(),
    "adapter passes only the authorized service params",
  );
  assertEquals(params.callerUserId, OPERATOR_A, "callerUserId from auth seam");
  assertEquals(params.tenantId, TENANT_A, "tenantId from tenant_id");
  assertEquals(params.productTier, "pro", "productTier from product_tier");
  assertEquals(
    params.configuredOperatorUserIds,
    SYNTHETIC_ALLOWLIST,
    "allowlist from server-side env",
  );
  assertEquals(
    clientConfig,
    {
      supabaseUrl: SYNTHETIC_SUPABASE_URL,
      serviceRoleKey: SYNTHETIC_SERVICE_ROLE,
    },
    "privileged client receives server env",
  );
  assert(
    !("expiresAt" in params) && !("issuedBy" in params) &&
      !("tokenHash" in params) && !("rawToken" in params) &&
      !("now" in params) && !("generateToken" in params),
    "adapter does not pass server-owned invite fields",
  );
});

Deno.test("38+39. unexpected auth or service throw → 500 sanitized", async () => {
  const authRes = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      resolveAuthenticatedCaller: async () => {
        throw new Error("RAW_AUTH_THROW stack=TRACE token=SECRET");
      },
      createInvite: explodingInvite(),
    }),
  );
  await expectFailure(
    authRes,
    500,
    "complimentary_invite_internal_error",
    ["RAW_AUTH_THROW", "stack=TRACE", "SECRET"],
  );

  const serviceRes = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      createInvite: async () => {
        throw new Error("RAW_SERVICE_THROW env=SECRET_VALUE");
      },
    }),
  );
  await expectFailure(
    serviceRes,
    500,
    "complimentary_invite_internal_error",
    ["RAW_SERVICE_THROW", "SECRET_VALUE"],
  );
});

Deno.test("40-44. adapter source has no membership, Stripe, grant write, crypto, or INSERT", () => {
  const source = createComplimentaryInviteHandler.toString();
  for (
    const forbidden of [
      "tenant_memberships",
      "ensureTenantBillingAccess",
      "profiles",
      "Stripe",
      "STRIPE_",
      "persistTenantComplimentaryAccessGrant",
      "tenant_complimentary_access_grants",
      "generateComplimentaryInviteToken",
      "subtle",
      "sha256",
      "token_hash",
      ".insert(",
      "tenant_complimentary_access_invites",
      "console.log",
      "redeemed_at",
      "revoked_at",
    ]
  ) {
    assert(
      !source.includes(forbidden),
      `adapter orchestration must not contain ${forbidden}`,
    );
  }
});

Deno.test("adapter reuses shared auth seam and does not reimplement Bearer/getUser", () => {
  const source = createComplimentaryInviteHandler.toString();
  assert(
    source.includes("parseAuthHeader"),
    "runtime default must call shared parseAuthHeader",
  );
  assert(
    source.includes("getAuthenticatedUser"),
    "runtime default must call shared getAuthenticatedUser",
  );
  assert(
    source.includes("callerUserId: user.userId"),
    "callerUserId must come from the shared auth user id",
  );
  for (
    const forbidden of [
      "SUPABASE_ANON_KEY",
      "persistSession",
      "autoRefreshToken",
      "detectSessionInUrl",
      ".getUser(",
      "createUserScopedClient",
    ]
  ) {
    assert(
      !source.includes(forbidden),
      `adapter must not reimplement auth via ${forbidden}`,
    );
  }
  assert(
    !/toLowerCase\(\)\s*!==\s*["']bearer["']/.test(source),
    "adapter must not parse Bearer locally",
  );
  assert(
    !source.includes('headers.get("authorization")'),
    "adapter must not read Authorization locally",
  );
});

Deno.test("45. missing privileged runtime config is fail-closed with no service call", async () => {
  const invites = tracingInvite(explodingInvite());
  const clientCalls: number[] = [];

  const missingKey = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      readEnv: testReadEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }),
      createPrivilegedClient: () => {
        clientCalls.push(1);
        throw new Error("client must not be built");
      },
      createInvite: invites.createInvite,
    }),
  );
  await expectFailure(missingKey, 503, "complimentary_invite_unavailable");

  const missingUrl = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      readEnv: testReadEnv({ SUPABASE_URL: undefined }),
      createPrivilegedClient: () => {
        clientCalls.push(1);
        throw new Error("client must not be built");
      },
      createInvite: invites.createInvite,
    }),
  );
  await expectFailure(missingUrl, 503, "complimentary_invite_unavailable");

  assertEquals(invites.calls.length, 0, "no service call without privileged config");
  assertEquals(clientCalls.length, 0, "no privileged client construction");
});

Deno.test("46. failure responses never include raw exception or DB detail", async () => {
  const res = await invoke(
    authenticatedRequest({ tenant_id: TENANT_A, product_tier: "base" }),
    baseDeps({
      createInvite: async () => ({
        ok: false,
        reason: "complimentary_invite_persistence_failed",
      }),
    }),
  );
  const body = await expectFailure(
    res,
    500,
    "complimentary_invite_internal_error",
    ["Error", "stack", "message"],
  );
  assertEquals(
    JSON.stringify(body),
    '{"error":"complimentary_invite_internal_error"}',
    "exact sanitized failure JSON",
  );
});

Deno.test("callerUserId is taken from the auth seam even if a body spoof is rejected first", async () => {
  const invites = tracingInvite(explodingInvite());
  const res = await invoke(
    authenticatedRequest({
      tenant_id: TENANT_A,
      product_tier: "base",
      caller_user_id: STRANGER,
    }),
    baseDeps({
      createPrivilegedClient: explodingClient(),
      createInvite: invites.createInvite,
    }),
  );
  await expectFailure(res, 422, "invalid_request");
  assertEquals(invites.calls.length, 0, "spoofed caller never reaches the service");
});
