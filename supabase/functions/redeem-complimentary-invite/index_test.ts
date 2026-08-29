/**
 * Deno tests for the complimentary invite redemption HTTP adapter.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/redeem-complimentary-invite/index_test.ts
 *
 * No network/env/read/write capabilities required.
 * Fixtures are synthetic — not real tokens, tenants, JWTs, or secrets.
 */

import type {
  ComplimentaryInviteRedemptionRpcClient,
  RedeemTenantComplimentaryAccessInviteFailureReason,
  RedeemTenantComplimentaryAccessInviteParams,
  RedeemTenantComplimentaryAccessInviteResult,
} from "../_shared/redeemTenantComplimentaryAccessInvite.ts";
import {
  createRedeemComplimentaryInviteHandler,
  type RedeemComplimentaryInviteHandlerDependencies,
} from "./index.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const INVITE_ID = "cccccccc-dddd-4eee-8fff-aaaaaaaaaaa1";
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const REDEEMED_AT = "2026-03-26T12:00:00.000Z";
const SYNTHETIC_RAW_TOKEN = "synthetic-redeem-raw-token-must-not-leak";
const SPACED_RAW_TOKEN = ` ${SYNTHETIC_RAW_TOKEN} `;
const SYNTHETIC_TOKEN_HASH = "synthetic-token-hash-must-not-leak";
const SYNTHETIC_SERVICE_ROLE = "synthetic-service-role-fixture-not-real";
const SYNTHETIC_SUPABASE_URL = "https://synthetic.example.invalid";
const SYNTHETIC_ANON_KEY = "synthetic-anon-key-must-not-be-read";
const SYNTHETIC_OPERATOR_ALLOWLIST =
  "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea1,aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea2";
const ARBITRARY_AUTHORIZATION = "Bearer synthetic-arbitrary-authorization-not-a-jwt";
const ENDPOINT = "http://localhost/redeem-complimentary-invite";

const DOMAIN_COLLAPSE_REASONS = [
  "invalid_raw_token",
  "token_not_found",
  "invite_already_redeemed",
  "invite_revoked",
  "invite_expired",
] as const;

const INTERNAL_COLLAPSE_REASONS = [
  "complimentary_invite_token_hash_failed",
  "complimentary_invite_redemption_rpc_failed",
  "complimentary_invite_redemption_invalid_response",
] as const;

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

function explodingRedeem(): RedeemComplimentaryInviteHandlerDependencies["redeemInvite"] {
  return async () => {
    throw new Error("redeemInvite must not be called RAW_SERVICE_DETAIL");
  };
}

function explodingClient(): RedeemComplimentaryInviteHandlerDependencies["createPrivilegedClient"] {
  return () => {
    throw new Error("createPrivilegedClient must not be called RAW_CLIENT_DETAIL");
  };
}

function explodingEnv(): RedeemComplimentaryInviteHandlerDependencies["readEnv"] {
  return () => {
    throw new Error("readEnv must not be called RAW_ENV_DETAIL");
  };
}

function unusedRpcClient(): ComplimentaryInviteRedemptionRpcClient {
  return {
    rpc() {
      throw new Error("adapter must not call rpc RAW_CLIENT_DETAIL");
    },
  };
}

function successResult(
  productTier: "base" | "pro" = "base",
): RedeemTenantComplimentaryAccessInviteResult {
  return {
    ok: true,
    redemption: {
      inviteId: INVITE_ID,
      tenantId: TENANT_A,
      productTier,
      redeemedAt: REDEEMED_AT,
    },
  };
}

function tracingRedeem(
  impl: RedeemComplimentaryInviteHandlerDependencies["redeemInvite"] = async () =>
    successResult(),
): {
  redeemInvite: RedeemComplimentaryInviteHandlerDependencies["redeemInvite"];
  calls: RedeemTenantComplimentaryAccessInviteParams[];
} {
  const calls: RedeemTenantComplimentaryAccessInviteParams[] = [];
  return {
    calls,
    redeemInvite: async (params) => {
      calls.push(params);
      return await impl(params);
    },
  };
}

function testReadEnv(
  overrides: Record<string, string | undefined> = {},
): {
  readEnv: RedeemComplimentaryInviteHandlerDependencies["readEnv"];
  keys: string[];
} {
  const keys: string[] = [];
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: SYNTHETIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SYNTHETIC_SERVICE_ROLE,
    SUPABASE_ANON_KEY: SYNTHETIC_ANON_KEY,
    COMPLIMENTARY_GRANT_OPERATOR_USER_IDS: SYNTHETIC_OPERATOR_ALLOWLIST,
    STRIPE_SECRET_KEY: "synthetic-stripe-secret-must-not-be-read",
    ...overrides,
  };
  return {
    keys,
    readEnv: (key) => {
      keys.push(key);
      return env[key];
    },
  };
}

function baseDeps(
  overrides: Partial<RedeemComplimentaryInviteHandlerDependencies> = {},
): Partial<RedeemComplimentaryInviteHandlerDependencies> {
  return {
    readEnv: testReadEnv().readEnv,
    createPrivilegedClient: () => unusedRpcClient(),
    redeemInvite: async () => successResult(),
    ...overrides,
  };
}

function jsonRequest(
  body: unknown,
  init: {
    method?: string;
    json?: boolean;
    authorization?: string | null;
    url?: string;
  } = {},
): Request {
  const headers = new Headers();
  const method = init.method ?? "POST";
  if (init.authorization) {
    headers.set("authorization", init.authorization);
  }
  const payload = init.json === false
    ? (body as BodyInit)
    : JSON.stringify(body);
  if (init.json !== false && method !== "GET" && method !== "OPTIONS") {
    headers.set("content-type", "application/json");
  }
  return new Request(init.url ?? ENDPOINT, {
    method,
    headers,
    body: method === "GET" || method === "OPTIONS" ? undefined : payload,
  });
}

async function invoke(
  req: Request,
  deps: Partial<RedeemComplimentaryInviteHandlerDependencies> = baseDeps(),
): Promise<Response> {
  return await createRedeemComplimentaryInviteHandler(deps)(req);
}

async function readBody(res: Response): Promise<unknown> {
  return await res.json();
}

function assertJsonNoStore(res: Response): void {
  assertEquals(
    res.headers.get("content-type"),
    "application/json; charset=utf-8",
    "JSON content-type",
  );
  assertEquals(
    res.headers.get("cache-control"),
    "no-store",
    "Cache-Control no-store",
  );
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
}

function assertNoSensitiveLeak(
  serialized: string,
  extra: string[] = [],
): void {
  for (
    const secret of [
      SYNTHETIC_RAW_TOKEN,
      SPACED_RAW_TOKEN,
      SYNTHETIC_TOKEN_HASH,
      SYNTHETIC_SERVICE_ROLE,
      SYNTHETIC_ANON_KEY,
      SYNTHETIC_OPERATOR_ALLOWLIST,
      ARBITRARY_AUTHORIZATION,
      "service_role",
      "token_hash",
      "tokenHash",
      "p_token_hash",
      "Authorization",
      INVITE_ID,
      TENANT_A,
      ...extra,
    ]
  ) {
    assert(!serialized.includes(secret), `must not leak ${secret}`);
  }
}

async function expectFailure(
  res: Response,
  status: number,
  error: string,
  distinctive: string[] = [],
): Promise<unknown> {
  const body = await readBody(res);
  assertEquals(res.status, status, `status ${status}`);
  assertJsonNoStore(res);
  assertEquals(body, { error }, "public failure contract is { error }");
  assertEquals(
    Object.keys(body as object).sort(),
    ["error"],
    "failure exposes only error",
  );
  assertNoSensitiveLeak(JSON.stringify(body), distinctive);
  return body;
}

async function expectSuccess(
  res: Response,
  productTier: "base" | "pro",
): Promise<unknown> {
  const body = await readBody(res);
  assertEquals(res.status, 200, "200 OK");
  assertJsonNoStore(res);
  assertEquals(
    body,
    {
      redemption: {
        product_tier: productTier,
        redeemed_at: REDEEMED_AT,
      },
    },
    "success body is { redemption: product_tier, redeemed_at }",
  );
  const redemption = (body as { redemption: Record<string, unknown> })
    .redemption;
  assertEquals(
    Object.keys(redemption).sort(),
    ["product_tier", "redeemed_at"].sort(),
    "redemption keys are exactly the HTTP contract",
  );
  const serialized = JSON.stringify(body);
  assert(!("invite_id" in redemption), "invite_id must not be public");
  assert(!("inviteId" in redemption), "inviteId must not be public");
  assert(!("tenant_id" in redemption), "tenant_id must not be public");
  assert(!("tenantId" in redemption), "tenantId must not be public");
  assert(!("token" in redemption), "raw token must not be public");
  assert(!("reason" in (body as object)), "reason must not be public");
  assertNoSensitiveLeak(serialized, [
    "inviteId",
    "tenantId",
    "grant_kind",
    "issued_by",
    "caller",
    "JWT",
  ]);
  return body;
}

Deno.test("1-2. OPTIONS → 200 CORS no-store, zero env/client/service", async () => {
  const redeem = tracingRedeem(explodingRedeem());
  const res = await invoke(
    new Request(ENDPOINT, { method: "OPTIONS" }),
    {
      readEnv: explodingEnv(),
      createPrivilegedClient: explodingClient(),
      redeemInvite: redeem.redeemInvite,
    },
  );

  assertEquals(res.status, 200, "OPTIONS 200");
  assertJsonNoStore(res);
  assertEquals(await readBody(res), { data: { ok: true } }, "OPTIONS body");
  assertEquals(redeem.calls.length, 0, "OPTIONS does not call the service");
});

Deno.test("3-4. GET → 405 Allow POST, zero env/client/service", async () => {
  const redeem = tracingRedeem(explodingRedeem());
  const res = await invoke(
    jsonRequest(undefined, { method: "GET" }),
    {
      readEnv: explodingEnv(),
      createPrivilegedClient: explodingClient(),
      redeemInvite: redeem.redeemInvite,
    },
  );
  await expectFailure(res, 405, "method_not_allowed");
  assertEquals(res.headers.get("allow"), "POST", "Allow: POST");
  assertEquals(redeem.calls.length, 0, "405 does not call the service");
});

Deno.test("5-6. malformed JSON → 400 invalid_json, zero client/service", async () => {
  const redeem = tracingRedeem(explodingRedeem());
  const env = testReadEnv();
  const res = await invoke(
    jsonRequest("{not-json", { json: false }),
    {
      readEnv: env.readEnv,
      createPrivilegedClient: explodingClient(),
      redeemInvite: redeem.redeemInvite,
    },
  );
  await expectFailure(res, 400, "invalid_json");
  assertEquals(redeem.calls.length, 0, "invalid JSON does not call the service");
  assertEquals(env.keys.length, 0, "invalid JSON does not read env");
});

Deno.test("7-15. structural body rejection → 422 invalid_request, zero client/service", async () => {
  const redeem = tracingRedeem(explodingRedeem());
  const env = testReadEnv();
  const deps = {
    readEnv: env.readEnv,
    createPrivilegedClient: explodingClient(),
    redeemInvite: redeem.redeemInvite,
  };

  const invalidBodies: unknown[] = [
    null,
    [],
    [SYNTHETIC_RAW_TOKEN],
    "token",
    1,
    true,
    {},
    { token_hash: SYNTHETIC_TOKEN_HASH },
    { token: SYNTHETIC_RAW_TOKEN, extra: true },
    { token: SYNTHETIC_RAW_TOKEN, token_hash: SYNTHETIC_TOKEN_HASH },
    { token: SYNTHETIC_RAW_TOKEN, p_token_hash: SYNTHETIC_TOKEN_HASH },
    { token: SYNTHETIC_RAW_TOKEN, tenant_id: TENANT_A, product_tier: "base" },
    { token: SYNTHETIC_RAW_TOKEN, invite_id: INVITE_ID },
    { token: SYNTHETIC_RAW_TOKEN, caller_user_id: TENANT_A },
    { token: SYNTHETIC_RAW_TOKEN, user_id: TENANT_A },
    { token: SYNTHETIC_RAW_TOKEN, authorization: ARBITRARY_AUTHORIZATION },
    { token: SYNTHETIC_RAW_TOKEN, jwt: ARBITRARY_AUTHORIZATION },
    { token: SYNTHETIC_RAW_TOKEN, raw_token: SYNTHETIC_RAW_TOKEN },
    { token: SYNTHETIC_RAW_TOKEN, redeemed_at: REDEEMED_AT },
    { token: SYNTHETIC_RAW_TOKEN, revoked_at: REDEEMED_AT },
  ];

  for (const body of invalidBodies) {
    const res = await invoke(jsonRequest(body), deps);
    await expectFailure(res, 422, "invalid_request", [
      "RAW_SERVICE_DETAIL",
      "RAW_CLIENT_DETAIL",
    ]);
  }
  assertEquals(redeem.calls.length, 0, "structural 422 does not call the service");
  assertEquals(env.keys.length, 0, "structural 422 does not read env");
});

Deno.test("16-20. POST without JWT reaches service; Authorization is ignored and not passed", async () => {
  const withoutAuth = tracingRedeem();
  const withAuth = tracingRedeem();
  let clientCalls = 0;

  const unauthenticated = await invoke(
    jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
    baseDeps({
      createPrivilegedClient: () => {
        clientCalls += 1;
        return unusedRpcClient();
      },
      redeemInvite: withoutAuth.redeemInvite,
    }),
  );
  await expectSuccess(unauthenticated, "base");

  const authorized = await invoke(
    jsonRequest({ token: SYNTHETIC_RAW_TOKEN }, {
      authorization: ARBITRARY_AUTHORIZATION,
    }),
    baseDeps({
      createPrivilegedClient: () => {
        clientCalls += 1;
        return unusedRpcClient();
      },
      redeemInvite: withAuth.redeemInvite,
    }),
  );
  await expectSuccess(authorized, "base");

  assertEquals(withoutAuth.calls.length, 1, "unauthenticated POST reaches service");
  assertEquals(withAuth.calls.length, 1, "Authorization does not change arity");
  assertEquals(
    JSON.stringify(Object.keys(withoutAuth.calls[0] ?? {}).sort()),
    JSON.stringify(Object.keys(withAuth.calls[0] ?? {}).sort()),
    "Authorization does not change service param keys",
  );
  assertEquals(
    withoutAuth.calls[0]?.rawToken,
    withAuth.calls[0]?.rawToken,
    "Authorization does not change rawToken",
  );
  for (const params of [withoutAuth.calls[0], withAuth.calls[0]]) {
    assert(params !== undefined, "service received params");
    assertEquals(
      Object.keys(params).sort(),
      ["client", "rawToken"].sort(),
      "service receives only client+rawToken",
    );
    assert(
      !("hashRawToken" in params) &&
        !("tokenHash" in params) &&
        !("tenantId" in params) &&
        !("productTier" in params) &&
        !("callerUserId" in params) &&
        !("jwt" in params) &&
        !("authorization" in params) &&
        !("configuredOperatorUserIds" in params),
      "no auth/operator/tenant injection",
    );
  }
  assertEquals(clientCalls, 2, "one privileged client per valid POST");
});

Deno.test("21-25. body.token is passed exactly as rawToken; not trimmed, hashed, or relocated", async () => {
  const redeem = tracingRedeem();
  const queryUrl =
    `${ENDPOINT}?token=${encodeURIComponent("query-token-must-be-ignored")}&raw_token=${
      encodeURIComponent("query-raw-must-be-ignored")
    }`;

  const res = await invoke(
    jsonRequest({ token: SPACED_RAW_TOKEN }, {
      authorization: ARBITRARY_AUTHORIZATION,
      url: queryUrl,
    }),
    baseDeps({ redeemInvite: redeem.redeemInvite }),
  );
  await expectSuccess(res, "base");

  assertEquals(redeem.calls.length, 1, "exactly one service call");
  assertEquals(
    redeem.calls[0]?.rawToken,
    SPACED_RAW_TOKEN,
    "rawToken is the exact body.token including whitespace",
  );
  assert(
    redeem.calls[0]?.rawToken !== SYNTHETIC_RAW_TOKEN,
    "whitespace token is not trimmed",
  );
});

Deno.test("26-31. missing privileged env → 503, zero client/service, no secret leak", async () => {
  const redeem = tracingRedeem(explodingRedeem());
  const clientCalls: number[] = [];

  const missingKey = await invoke(
    jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
    {
      readEnv: testReadEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }).readEnv,
      createPrivilegedClient: () => {
        clientCalls.push(1);
        throw new Error("client must not be built");
      },
      redeemInvite: redeem.redeemInvite,
    },
  );
  await expectFailure(missingKey, 503, "complimentary_invite_unavailable");

  const missingUrl = await invoke(
    jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
    {
      readEnv: testReadEnv({ SUPABASE_URL: undefined }).readEnv,
      createPrivilegedClient: () => {
        clientCalls.push(1);
        throw new Error("client must not be built");
      },
      redeemInvite: redeem.redeemInvite,
    },
  );
  await expectFailure(missingUrl, 503, "complimentary_invite_unavailable");

  const emptyKey = await invoke(
    jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
    {
      readEnv: testReadEnv({ SUPABASE_SERVICE_ROLE_KEY: "" }).readEnv,
      createPrivilegedClient: () => {
        clientCalls.push(1);
        throw new Error("client must not be built");
      },
      redeemInvite: redeem.redeemInvite,
    },
  );
  await expectFailure(emptyKey, 503, "complimentary_invite_unavailable");

  assertEquals(redeem.calls.length, 0, "no service call without privileged config");
  assertEquals(clientCalls.length, 0, "no privileged client construction");
});

Deno.test("29-35. valid POST builds one client from URL+service_role and calls service once", async () => {
  const redeem = tracingRedeem();
  const env = testReadEnv();
  let clientConfig: { supabaseUrl: string; serviceRoleKey: string } | null =
    null;
  let clientCalls = 0;

  const res = await invoke(
    jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
    {
      readEnv: env.readEnv,
      createPrivilegedClient: (supabaseUrl, serviceRoleKey) => {
        clientCalls += 1;
        clientConfig = { supabaseUrl, serviceRoleKey };
        return unusedRpcClient();
      },
      redeemInvite: redeem.redeemInvite,
    },
  );
  await expectSuccess(res, "base");

  assertEquals(clientCalls, 1, "privileged client created once");
  assertEquals(
    clientConfig,
    {
      supabaseUrl: SYNTHETIC_SUPABASE_URL,
      serviceRoleKey: SYNTHETIC_SERVICE_ROLE,
    },
    "client receives only SUPABASE_URL + SERVICE_ROLE",
  );
  assertEquals(
    [...new Set(env.keys)].sort(),
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"].sort(),
    "adapter reads only privileged runtime env",
  );
  assertEquals(redeem.calls.length, 1, "service called exactly once");
  assertEquals(
    Object.keys(redeem.calls[0] ?? {}).sort(),
    ["client", "rawToken"].sort(),
    "service params are only client+rawToken",
  );
  assertEquals(redeem.calls[0]?.rawToken, SYNTHETIC_RAW_TOKEN, "exact rawToken");
  assert(
    !("hashRawToken" in (redeem.calls[0] ?? {})),
    "no hashRawToken injection",
  );
});

Deno.test("36-40. domain reasons collapse to identical 422 invite_not_redeemable", async () => {
  const serializedBodies: string[] = [];

  for (const reason of DOMAIN_COLLAPSE_REASONS) {
    const redeem = tracingRedeem(async () => ({ ok: false, reason }));
    const res = await invoke(
      jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
      baseDeps({ redeemInvite: redeem.redeemInvite }),
    );
    const body = await expectFailure(
      res,
      422,
      "invite_not_redeemable",
      [reason, "invalid_raw_token", "token_not_found", "invite_already_redeemed"],
    );
    serializedBodies.push(JSON.stringify(body));
    assertEquals(redeem.calls.length, 1, `${reason}: one service call`);
  }

  assert(
    serializedBodies.every((body) => body === serializedBodies[0]),
    "non-redeemable responses must be indistinguishable",
  );
  assertEquals(
    serializedBodies[0],
    '{"error":"invite_not_redeemable"}',
    "exact public non-redeemable JSON",
  );
});

Deno.test("41-44. internal reasons collapse to identical 500 internal error", async () => {
  const serializedBodies: string[] = [];

  for (const reason of INTERNAL_COLLAPSE_REASONS) {
    const redeem = tracingRedeem(async () => ({ ok: false, reason }));
    const res = await invoke(
      jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
      baseDeps({ redeemInvite: redeem.redeemInvite }),
    );
    const body = await expectFailure(
      res,
      500,
      "complimentary_invite_internal_error",
      [reason],
    );
    serializedBodies.push(JSON.stringify(body));
    assertEquals(redeem.calls.length, 1, `${reason}: one service call`);
  }

  assert(
    serializedBodies.every((body) => body === serializedBodies[0]),
    "internal failure responses must be indistinguishable",
  );
  assertEquals(
    serializedBodies[0],
    '{"error":"complimentary_invite_internal_error"}',
    "exact sanitized internal JSON",
  );
});

Deno.test("45-46. unexpected service or client throw → 500 sanitized", async () => {
  const serviceRes = await invoke(
    jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
    baseDeps({
      redeemInvite: async () => {
        throw new Error(
          `RAW_SERVICE_THROW ${SYNTHETIC_RAW_TOKEN} hash=${SYNTHETIC_TOKEN_HASH}`,
        );
      },
    }),
  );
  await expectFailure(
    serviceRes,
    500,
    "complimentary_invite_internal_error",
    ["RAW_SERVICE_THROW", "stack"],
  );

  const clientRes = await invoke(
    jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
    baseDeps({
      createPrivilegedClient: () => {
        throw new Error(`RAW_CLIENT_THROW ${SYNTHETIC_SERVICE_ROLE}`);
      },
      redeemInvite: explodingRedeem(),
    }),
  );
  await expectFailure(
    clientRes,
    500,
    "complimentary_invite_internal_error",
    ["RAW_CLIENT_THROW"],
  );
});

Deno.test("47-54. Base and Pro success expose only product_tier and redeemed_at", async () => {
  for (const productTier of ["base", "pro"] as const) {
    const redeem = tracingRedeem(async () => successResult(productTier));
    const res = await invoke(
      jsonRequest({ token: SYNTHETIC_RAW_TOKEN }),
      baseDeps({ redeemInvite: redeem.redeemInvite }),
    );
    await expectSuccess(res, productTier);
    assertEquals(redeem.calls.length, 1, `${productTier} service called once`);
  }
});

Deno.test("55-61. adapter source has no RPC/table writes, auth, operator, Stripe, IAM, or logging", () => {
  const source = createRedeemComplimentaryInviteHandler.toString();
  for (
    const forbidden of [
      ".from(",
      ".rpc(",
      ".insert(",
      ".update(",
      ".upsert(",
      ".delete(",
      "parseAuthHeader",
      "getAuthenticatedUser",
      "_shared/auth",
      "auth.ts",
      "authorizeComplimentaryGrantOperator",
      "COMPLIMENTARY_GRANT_OPERATOR_USER_IDS",
      "tenant_memberships",
      "profiles",
      "default_tenant_id",
      "auth.users",
      "Stripe",
      "STRIPE_",
      "hashComplimentaryInviteToken",
      "subtle",
      "sha256",
      "console.log",
      "console.error",
      "console.warn",
    ]
  ) {
    assert(
      !source.includes(forbidden),
      `adapter orchestration must not contain ${forbidden}`,
    );
  }
});

Deno.test("exhaustive mapping covers every BILLING-78 failure reason", () => {
  const mapped: RedeemTenantComplimentaryAccessInviteFailureReason[] = [
    ...DOMAIN_COLLAPSE_REASONS,
    ...INTERNAL_COLLAPSE_REASONS,
  ];
  const unique = new Set(mapped);
  assertEquals(unique.size, mapped.length, "no duplicate mapped reasons");
  assertEquals(mapped.length, 8, "all eight BILLING-78 failure reasons are mapped");
});
