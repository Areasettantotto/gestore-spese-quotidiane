/**
 * Deno tests for the complimentary invite revocation HTTP adapter.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/revoke-complimentary-invite/index_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic — not real tenants, operators, JWTs, or tokens.
 */

import { COMPLIMENTARY_GRANT_OPERATOR_USER_IDS } from "../_shared/authorizeComplimentaryGrantOperator.ts";
import {
  revokeTenantComplimentaryAccessInvite,
  type ComplimentaryInviteRevocationClient,
  type ComplimentaryInviteRevocationFilterBuilder,
  type ComplimentaryInviteRevocationWriteResponse,
  type ComplimentaryInviteRevocationWriteValues,
  type RevokeTenantComplimentaryAccessInviteParams,
  type RevokeTenantComplimentaryAccessInviteResult,
} from "../_shared/revokeTenantComplimentaryAccessInvite.ts";
import {
  createRevokeComplimentaryInviteHandler,
  type ComplimentaryInviteRevokeHandlerDependencies,
} from "./index.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const OPERATOR_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea1";
const OPERATOR_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea2";
const STRANGER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeaf";
const INVITE_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaa1";
const SYNTHETIC_BEARER = "synthetic-test-bearer-not-a-jwt";
const INVALID_BEARER = "synthetic-invalid-bearer";
const SYNTHETIC_SERVICE_ROLE = "synthetic-service-role-fixture-not-real";
const SYNTHETIC_SUPABASE_URL = "https://synthetic.example.invalid";
const SYNTHETIC_ALLOWLIST = `${OPERATOR_A},${OPERATOR_B}`;
const SYNTHETIC_RAW_TOKEN = "synthetic-invite-raw-token-fixture";
const SYNTHETIC_REVOKED_AT = "2026-03-26T12:00:00.000Z";
const ENDPOINT = "http://localhost/revoke-complimentary-invite";

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

function explodingRevoke(): ComplimentaryInviteRevokeHandlerDependencies["revokeInvite"] {
  return async () => {
    throw new Error("revokeInvite must not be called RAW_SERVICE_DETAIL");
  };
}

function explodingClient(): ComplimentaryInviteRevokeHandlerDependencies["createPrivilegedClient"] {
  return () => {
    throw new Error("createPrivilegedClient must not be called RAW_CLIENT_DETAIL");
  };
}

function unusedRevocationClient(): ComplimentaryInviteRevocationClient {
  return {
    from() {
      throw new Error("persistence must not run RAW_CLIENT_DETAIL");
    },
  };
}

type FilterCall = {
  op: "eq" | "is";
  column: string;
  value: string | null;
};

type FakeUpdateCall = {
  method: "update";
  table: string;
  values: Record<string, unknown>;
  filters: FilterCall[];
};

function createFakeClient(
  result: ComplimentaryInviteRevocationWriteResponse,
  calls: FakeUpdateCall[] = [],
): ComplimentaryInviteRevocationClient {
  return {
    from(table: string) {
      return {
        update(values: ComplimentaryInviteRevocationWriteValues) {
          const filters: FilterCall[] = [];
          const builder: ComplimentaryInviteRevocationFilterBuilder = {
            eq(column: string, value: string) {
              filters.push({ op: "eq", column, value });
              return builder;
            },
            is(column: string, value: null) {
              filters.push({ op: "is", column, value });
              return builder;
            },
            select(_columns: string) {
              return {
                maybeSingle() {
                  calls.push({
                    method: "update",
                    table,
                    values: { ...values },
                    filters: [...filters],
                  });
                  return Promise.resolve(result);
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

function confirmedRow(
  overrides: Partial<NonNullable<ComplimentaryInviteRevocationWriteResponse["data"]>> =
    {},
): ComplimentaryInviteRevocationWriteResponse {
  return {
    data: {
      id: INVITE_ID,
      tenant_id: TENANT_A,
      revoked_at: SYNTHETIC_REVOKED_AT,
      ...overrides,
    },
    error: null,
  };
}

function tracingRevoke(
  impl: ComplimentaryInviteRevokeHandlerDependencies["revokeInvite"] =
    revokeTenantComplimentaryAccessInvite,
): {
  revokeInvite: ComplimentaryInviteRevokeHandlerDependencies["revokeInvite"];
  calls: RevokeTenantComplimentaryAccessInviteParams[];
} {
  const calls: RevokeTenantComplimentaryAccessInviteParams[] = [];
  return {
    calls,
    revokeInvite: async (params) => {
      calls.push(params);
      return await impl(params);
    },
  };
}

function testReadEnv(
  overrides: Record<string, string | undefined> = {},
): ComplimentaryInviteRevokeHandlerDependencies["readEnv"] {
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
  overrides: Partial<ComplimentaryInviteRevokeHandlerDependencies> = {},
): Partial<ComplimentaryInviteRevokeHandlerDependencies> {
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
  deps: Partial<ComplimentaryInviteRevokeHandlerDependencies> = baseDeps(),
): Promise<Response> {
  return await createRevokeComplimentaryInviteHandler(deps)(req);
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
    "VITE_",
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
    revoked_at: string;
  },
): Promise<unknown> {
  const body = await readBody(res);
  assertEquals(res.status, 200, "200 OK");
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
    { revocation: expected },
    "success body is { revocation: snake_case fields }",
  );
  const revocation = (body as { revocation: Record<string, unknown> })
    .revocation;
  assertEquals(
    Object.keys(revocation).sort(),
    ["id", "revoked_at", "tenant_id"].sort(),
    "revocation keys are exactly the HTTP contract",
  );
  const serialized = JSON.stringify(body);
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
  assert(
    !serialized.includes(SYNTHETIC_RAW_TOKEN) &&
      !serialized.includes("token_hash") &&
      !serialized.includes("tokenHash"),
    "success must not contain token material",
  );
  assert(!serialized.includes("VITE_"), "success must not contain VITE_");
  assert(!("revokedAt" in revocation), "HTTP contract uses revoked_at");
  assert(!("tenantId" in revocation), "HTTP contract uses tenant_id");
  return body;
}

Deno.test("A. factory import constructs a handler without real secrets", async () => {
  const handler = createRevokeComplimentaryInviteHandler();
  assert(typeof handler === "function", "factory returns a request handler");
  const res = await handler(new Request(ENDPOINT, { method: "OPTIONS" }));
  assertEquals(res.status, 200, "default handler serves OPTIONS without env");
});

Deno.test("B. OPTIONS → 200 CORS and skips auth/env/persistence", async () => {
  const revokes = tracingRevoke(explodingRevoke());
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
      revokeInvite: revokes.revokeInvite,
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
  assertEquals(revokes.calls.length, 0, "OPTIONS does not call the service");
});

Deno.test("C. GET → 405 method_not_allowed", async () => {
  const revokes = tracingRevoke(explodingRevoke());
  const res = await invoke(
    authenticatedRequest(undefined, { method: "GET" }),
    baseDeps({
      createPrivilegedClient: explodingClient(),
      revokeInvite: revokes.revokeInvite,
    }),
  );
  await expectFailure(res, 405, "method_not_allowed");
  assertEquals(res.headers.get("allow"), "POST", "Allow: POST");
  assertEquals(revokes.calls.length, 0, "405 does not call the service");
});

Deno.test("D. malformed JSON → 400 invalid_json", async () => {
  const revokes = tracingRevoke(explodingRevoke());
  const res = await invoke(
    authenticatedRequest("{not-json", { json: false }),
    baseDeps({
      createPrivilegedClient: explodingClient(),
      revokeInvite: revokes.revokeInvite,
    }),
  );
  await expectFailure(res, 400, "invalid_json");
  assertEquals(revokes.calls.length, 0, "invalid JSON does not call the service");
});

Deno.test("D. non-object, extra, token, and server-owned body keys → 422", async () => {
  const revokes = tracingRevoke(explodingRevoke());
  const deps = baseDeps({
    createPrivilegedClient: explodingClient(),
    revokeInvite: revokes.revokeInvite,
  });

  const invalidBodies: unknown[] = [
    null,
    [],
    [INVITE_ID],
    "invite",
    1,
    true,
    { invite_id: INVITE_ID },
    { tenant_id: TENANT_A },
    { invite_id: INVITE_ID, tenant_id: TENANT_A, extra: true },
    { invite_id: INVITE_ID, tenant_id: TENANT_A, token: SYNTHETIC_RAW_TOKEN },
    { invite_id: INVITE_ID, tenant_id: TENANT_A, raw_token: SYNTHETIC_RAW_TOKEN },
    { invite_id: INVITE_ID, tenant_id: TENANT_A, issued_by: OPERATOR_A },
    { invite_id: INVITE_ID, tenant_id: TENANT_A, revoked_at: SYNTHETIC_REVOKED_AT },
    { invite_id: INVITE_ID, tenant_id: TENANT_A, redeemed_at: null },
    { invite_id: INVITE_ID, tenant_id: TENANT_A, caller_user_id: OPERATOR_A },
    { token: SYNTHETIC_RAW_TOKEN },
    { invite_id: INVITE_ID, tenant_id: TENANT_A, token_hash: "abc" },
  ];

  for (const body of invalidBodies) {
    const res = await invoke(authenticatedRequest(body), deps);
    await expectFailure(res, 422, "invalid_request", [
      "RAW_SERVICE_DETAIL",
      SYNTHETIC_RAW_TOKEN,
    ]);
  }
  assertEquals(revokes.calls.length, 0, "structural 422 does not call the service");
});

Deno.test("E. POST missing or invalid auth → 401", async () => {
  const revokes = tracingRevoke(explodingRevoke());
  const deps = baseDeps({
    createPrivilegedClient: explodingClient(),
    revokeInvite: revokes.revokeInvite,
  });

  const missing = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }, {
      bearer: null,
    }),
    deps,
  );
  await expectFailure(missing, 401, "authentication_required");

  const invalid = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }, {
      bearer: INVALID_BEARER,
    }),
    deps,
  );
  await expectFailure(invalid, 401, "authentication_required", [INVALID_BEARER]);
  assertEquals(revokes.calls.length, 0, "401 does not call the service");
});

Deno.test("F. authenticated non-operator → 403", async () => {
  const revokes = tracingRevoke();
  const res = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      resolveAuthenticatedCaller: async () => ({
        ok: true,
        callerUserId: STRANGER,
      }),
      createPrivilegedClient: () => unusedRevocationClient(),
      revokeInvite: revokes.revokeInvite,
    }),
  );
  await expectFailure(res, 403, "forbidden", ["admin", "billing", STRANGER]);
  assertEquals(revokes.calls.length, 1, "forbidden is decided by the service");
});

Deno.test("G. missing privileged runtime config is fail-closed 503", async () => {
  const revokes = tracingRevoke(explodingRevoke());
  const clientCalls: number[] = [];

  const missingKey = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      readEnv: testReadEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }),
      createPrivilegedClient: () => {
        clientCalls.push(1);
        throw new Error("client must not be built");
      },
      revokeInvite: revokes.revokeInvite,
    }),
  );
  await expectFailure(missingKey, 503, "complimentary_invite_unavailable");

  const missingUrl = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      readEnv: testReadEnv({ SUPABASE_URL: undefined }),
      createPrivilegedClient: () => {
        clientCalls.push(1);
        throw new Error("client must not be built");
      },
      revokeInvite: revokes.revokeInvite,
    }),
  );
  await expectFailure(missingUrl, 503, "complimentary_invite_unavailable");

  assertEquals(revokes.calls.length, 0, "no service call without privileged config");
  assertEquals(clientCalls.length, 0, "no privileged client construction");
});

Deno.test("G. authority unconfigured or invalid config → 503 sanitized", async () => {
  const unconfigured = tracingRevoke();
  const unconfiguredRes = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      readEnv: testReadEnv({
        [COMPLIMENTARY_GRANT_OPERATOR_USER_IDS]: "",
      }),
      createPrivilegedClient: () => unusedRevocationClient(),
      revokeInvite: unconfigured.revokeInvite,
    }),
  );
  await expectFailure(
    unconfiguredRes,
    503,
    "complimentary_invite_unavailable",
    ["authority_unconfigured"],
  );

  const invalid = tracingRevoke();
  const invalidRes = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      readEnv: testReadEnv({
        [COMPLIMENTARY_GRANT_OPERATOR_USER_IDS]: "not-a-uuid",
      }),
      createPrivilegedClient: () => unusedRevocationClient(),
      revokeInvite: invalid.revokeInvite,
    }),
  );
  await expectFailure(
    invalidRes,
    503,
    "complimentary_invite_unavailable",
    ["authority_invalid_config", "not-a-uuid"],
  );
});

Deno.test("H. unused invite on the target tenant → 200 with server revoked_at", async () => {
  const writes: FakeUpdateCall[] = [];
  const revokes = tracingRevoke();
  const res = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      createPrivilegedClient: () => createFakeClient(confirmedRow(), writes),
      revokeInvite: revokes.revokeInvite,
    }),
  );

  await expectSuccessShape(res, {
    id: INVITE_ID,
    tenant_id: TENANT_A,
    revoked_at: SYNTHETIC_REVOKED_AT,
  });
  assertEquals(revokes.calls.length, 1, "service called once");
  assertEquals(writes.length, 1, "exactly one UPDATE");
  assertEquals(
    Object.keys(writes[0]?.values ?? {}).sort(),
    ["revoked_at"],
    "UPDATE SET is only revoked_at",
  );
  assert(
    typeof writes[0]?.values.revoked_at === "string" &&
      Number.isFinite(new Date(String(writes[0].values.revoked_at)).getTime()),
    "revoked_at is a server-side timestamp",
  );
  assert(
    writes[0]?.values.revoked_at !== SYNTHETIC_RAW_TOKEN,
    "revoked_at is not caller-supplied token material",
  );
});

Deno.test("I+J+K+L. redeemed, revoked, missing, and tenant-mismatch collapse to invite_not_revocable", async () => {
  const cases: Array<{
    name: string;
    inviteId: string;
    tenantId: string;
    persistence: ComplimentaryInviteRevocationWriteResponse;
  }> = [
    {
      name: "already redeemed",
      inviteId: INVITE_ID,
      tenantId: TENANT_A,
      persistence: { data: null, error: null },
    },
    {
      name: "already revoked",
      inviteId: INVITE_ID,
      tenantId: TENANT_A,
      persistence: { data: null, error: null },
    },
    {
      name: "not found",
      inviteId: INVITE_ID,
      tenantId: TENANT_A,
      persistence: { data: null, error: null },
    },
    {
      name: "tenant mismatch",
      inviteId: INVITE_ID,
      tenantId: TENANT_B,
      persistence: { data: null, error: null },
    },
  ];

  for (const item of cases) {
    const writes: FakeUpdateCall[] = [];
    const revokes = tracingRevoke();
    const res = await invoke(
      authenticatedRequest({
        invite_id: item.inviteId,
        tenant_id: item.tenantId,
      }),
      baseDeps({
        createPrivilegedClient: () =>
          createFakeClient(item.persistence, writes),
        revokeInvite: revokes.revokeInvite,
      }),
    );
    await expectFailure(res, 422, "invite_not_revocable", [
      "invite_already_redeemed",
      "invite_revoked",
      "token_not_found",
      item.name,
    ]);
    assertEquals(writes.length, 1, `${item.name}: one conditional UPDATE`);
    assertEquals(
      writes[0]?.filters.some((filter) =>
        filter.op === "is" && filter.column === "redeemed_at" &&
        filter.value === null
      ),
      true,
      `${item.name}: redeemed_at IS NULL`,
    );
    assertEquals(
      writes[0]?.filters.some((filter) =>
        filter.op === "is" && filter.column === "revoked_at" &&
        filter.value === null
      ),
      true,
      `${item.name}: revoked_at IS NULL`,
    );
    assertEquals(
      writes[0]?.filters.some((filter) =>
        filter.op === "eq" && filter.column === "tenant_id" &&
        filter.value === item.tenantId
      ),
      true,
      `${item.name}: tenant pinned`,
    );
  }
});

Deno.test("M. writer conditions stay on the single UPDATE", async () => {
  const writes: FakeUpdateCall[] = [];
  await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      createPrivilegedClient: () => createFakeClient(confirmedRow(), writes),
    }),
  );
  assertEquals(
    writes[0]?.filters,
    [
      { op: "eq", column: "id", value: INVITE_ID },
      { op: "eq", column: "tenant_id", value: TENANT_A },
      { op: "is", column: "redeemed_at", value: null },
      { op: "is", column: "revoked_at", value: null },
    ],
    "single UPDATE is invite+tenant+unused+unrevoked",
  );
  assertEquals(
    Object.keys(writes[0]?.values ?? {}).sort(),
    ["revoked_at"],
    "SET is only revoked_at",
  );
});

Deno.test("N+O+P. adapter source has no grant write, VITE_, or secret logging", () => {
  const source = createRevokeComplimentaryInviteHandler.toString();
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
      ".update(",
      "tenant_complimentary_access_invites",
      "console.log",
      "VITE_",
    ]
  ) {
    assert(
      !source.includes(forbidden),
      `adapter orchestration must not contain ${forbidden}`,
    );
  }
});

Deno.test("adapter reuses shared auth seam and does not reimplement Bearer/getUser", () => {
  const source = createRevokeComplimentaryInviteHandler.toString();
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

Deno.test("service receives auth identity, exact body fields, and server env only", async () => {
  const revokes = tracingRevoke();
  let clientConfig: { supabaseUrl: string; serviceRoleKey: string } | null =
    null;

  await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      createPrivilegedClient: (supabaseUrl, serviceRoleKey) => {
        clientConfig = { supabaseUrl, serviceRoleKey };
        return createFakeClient(confirmedRow());
      },
      revokeInvite: revokes.revokeInvite,
    }),
  );

  assertEquals(revokes.calls.length, 1, "service called once");
  const params = revokes.calls[0];
  assert(params !== undefined, "service received params");
  assertEquals(
    Object.keys(params).sort(),
    [
      "callerUserId",
      "client",
      "configuredOperatorUserIds",
      "inviteId",
      "tenantId",
    ].sort(),
    "adapter passes only the authorized service params",
  );
  assertEquals(params.callerUserId, OPERATOR_A, "callerUserId from auth seam");
  assertEquals(params.inviteId, INVITE_ID, "inviteId from invite_id");
  assertEquals(params.tenantId, TENANT_A, "tenantId from tenant_id");
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
    !("revokedAt" in params) && !("token" in params) &&
      !("rawToken" in params) && !("now" in params),
    "adapter does not pass server-owned revoke fields",
  );
});

Deno.test("invalid invite or tenant is mapped from the service → 422", async () => {
  const revokes = tracingRevoke();
  const deps = baseDeps({
    createPrivilegedClient: () => unusedRevocationClient(),
    revokeInvite: revokes.revokeInvite,
  });

  const invalidInvite = await invoke(
    authenticatedRequest({ invite_id: "not-a-uuid", tenant_id: TENANT_A }),
    deps,
  );
  await expectFailure(invalidInvite, 422, "invalid_request");

  const invalidTenant = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: "not-a-uuid" }),
    deps,
  );
  await expectFailure(invalidTenant, 422, "invalid_request");

  assertEquals(revokes.calls.length, 2, "domain validation is delegated");
  assertEquals(revokes.calls[0]?.inviteId, "not-a-uuid", "invite_id passed exactly");
  assertEquals(revokes.calls[1]?.tenantId, "not-a-uuid", "tenant_id passed exactly");
});

Deno.test("internal service failures → 500 sanitized", async () => {
  const reasons: Array<
    Extract<
      RevokeTenantComplimentaryAccessInviteResult,
      { ok: false }
    >["reason"]
  > = [
    "invalid_caller_user_id",
    "invalid_clock",
    "complimentary_invite_persistence_failed",
  ];

  for (const reason of reasons) {
    const revokes = tracingRevoke(async () => ({ ok: false, reason }));
    const res = await invoke(
      authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
      baseDeps({ revokeInvite: revokes.revokeInvite }),
    );
    await expectFailure(
      res,
      500,
      "complimentary_invite_internal_error",
      [reason],
    );
    assertEquals(revokes.calls.length, 1, `${reason} was mapped`);
  }
});

Deno.test("unexpected auth or service throw → 500 sanitized", async () => {
  const authRes = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      resolveAuthenticatedCaller: async () => {
        throw new Error("RAW_AUTH_THROW stack=TRACE token=SECRET");
      },
      revokeInvite: explodingRevoke(),
    }),
  );
  await expectFailure(
    authRes,
    500,
    "complimentary_invite_internal_error",
    ["RAW_AUTH_THROW", "stack=TRACE", "SECRET"],
  );

  const serviceRes = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      revokeInvite: async () => {
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

Deno.test("failure responses never include raw exception or DB detail", async () => {
  const res = await invoke(
    authenticatedRequest({ invite_id: INVITE_ID, tenant_id: TENANT_A }),
    baseDeps({
      revokeInvite: async () => ({
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
