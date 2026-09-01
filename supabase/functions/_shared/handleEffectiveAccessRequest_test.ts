/**
 * Deno tests for handleEffectiveAccessRequest (BILLING-89).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/handleEffectiveAccessRequest_test.ts
 *
 * No network/env/read/write capabilities required.
 * Authorization and resolver are fake dependencies — not real tenants,
 * JWTs, DB, or Stripe.
 */

import { type AuthContext } from "./auth.ts";
import { forbidden } from "./http.ts";
import type { Capability, EffectiveAccess } from "./resolveEffectiveAccess.ts";
import { serializeEffectiveAccess } from "./serializeEffectiveAccess.ts";
import {
  type AuthorizeTenant,
  type HandleEffectiveAccessRequestDependencies,
  type ResolveEffectiveAccess,
  handleEffectiveAccessRequest,
} from "./handleEffectiveAccessRequest.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

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

const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_RAW = "  Tenant-ID-KEEP-exact  ";
const TOKEN = "synthetic-test-bearer-not-a-jwt";

const BASE_CAPABILITIES: readonly Capability[] = Object.freeze([
  "expense_management",
  "standard_dashboard",
]);

const PRO_CAPABILITIES: readonly Capability[] = Object.freeze([
  "expense_management",
  "standard_dashboard",
  "ai_categorization",
  "ai_insights",
  "ai_assistant",
]);

const DEMO_CAPABILITIES: readonly Capability[] = Object.freeze([
  "standard_dashboard",
  "ai_insights",
]);

const STANDARD_STRIPE_BASE: EffectiveAccess = {
  status: "granted",
  mode: "standard",
  tier: "base",
  source: "stripe",
  expiresAt: "opaque-expiry-keep-exact",
  capabilities: BASE_CAPABILITIES,
};

const STANDARD_COMPLIMENTARY_PRO: EffectiveAccess = {
  status: "granted",
  mode: "standard",
  tier: "pro",
  source: "complimentary",
  expiresAt: "complimentary-expiry-keep-exact",
  capabilities: PRO_CAPABILITIES,
};

const DEMO_GRANTED: EffectiveAccess = {
  status: "granted",
  mode: "demo",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: DEMO_CAPABILITIES,
};

const INTERNAL_GRANTED: EffectiveAccess = {
  status: "granted",
  mode: "internal",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: PRO_CAPABILITIES,
};

const UNENTITLED: EffectiveAccess = {
  status: "unentitled",
  mode: "standard",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: Object.freeze([]),
};

const INVALID: EffectiveAccess = {
  status: "invalid",
  mode: "standard",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: Object.freeze([]),
};

type CallLog = {
  order: string[];
  authorize: Array<{ auth: AuthContext; tenantId: string }>;
  resolve: string[];
};

function emptyLog(): CallLog {
  return { order: [], authorize: [], resolve: [] };
}

function bearerRequest(token = TOKEN): Request {
  return new Request("https://example.test/effective-access", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function requestWithoutAuth(): Request {
  return new Request("https://example.test/effective-access");
}

function authorizeOk(
  log: CallLog,
  extra: Record<string, unknown> = {},
): AuthorizeTenant {
  return async (auth, tenantId) => {
    log.order.push("authorize");
    log.authorize.push({ auth, tenantId });
    return { ok: true, ...extra };
  };
}

function authorizeResponse(log: CallLog, response: Response): AuthorizeTenant {
  return async (auth, tenantId) => {
    log.order.push("authorize");
    log.authorize.push({ auth, tenantId });
    return response;
  };
}

function resolveValue(
  log: CallLog,
  value: EffectiveAccess | Response,
): ResolveEffectiveAccess {
  return async (tenantId) => {
    log.order.push("resolve");
    log.resolve.push(tenantId);
    return value;
  };
}

function resolveMustNotRun(): ResolveEffectiveAccess {
  return async () => {
    throw new Error("resolver must not run");
  };
}

function authorizeMustNotRun(): AuthorizeTenant {
  return async () => {
    throw new Error("authorization must not run");
  };
}

function dependencies(
  log: CallLog,
  overrides: Partial<HandleEffectiveAccessRequestDependencies> = {},
): HandleEffectiveAccessRequestDependencies {
  return {
    authorizeTenant: authorizeOk(log),
    resolveEffectiveAccess: resolveValue(log, STANDARD_STRIPE_BASE),
    ...overrides,
  };
}

async function invoke(
  request: Request,
  tenantId: string,
  deps: HandleEffectiveAccessRequestDependencies,
): Promise<Response> {
  return await handleEffectiveAccessRequest(request, tenantId, deps);
}

async function readBody(response: Response): Promise<unknown> {
  return await response.json();
}

Deno.test("A. missing Authorization header → existing auth failure; deps not called", async () => {
  const log = emptyLog();
  const response = await invoke(
    requestWithoutAuth(),
    TENANT_A,
    dependencies(log, {
      authorizeTenant: authorizeMustNotRun(),
      resolveEffectiveAccess: resolveMustNotRun(),
    }),
  );

  assertEquals(response.status, 401, "auth failure status");
  const body = await readBody(response);
  assertEquals(
    body,
    {
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header.",
      },
    },
    "existing unauthorized envelope",
  );
  assertEquals(log.order, [], "no authorization or resolver");
});

Deno.test("A. invalid Authorization header → existing auth failure; deps not called", async () => {
  const log = emptyLog();
  const response = await invoke(
    new Request("https://example.test", {
      headers: { authorization: "Basic not-a-bearer" },
    }),
    TENANT_A,
    dependencies(log, {
      authorizeTenant: authorizeMustNotRun(),
      resolveEffectiveAccess: resolveMustNotRun(),
    }),
  );

  assertEquals(response.status, 401, "invalid scheme is unauthorized");
  const body = await readBody(response);
  assertEquals(
    (body as { error?: { code?: string } }).error?.code,
    "UNAUTHORIZED",
    "existing unauthorized code",
  );
  assertEquals(log.order, [], "invalid auth must skip later steps");
});

Deno.test("B. valid auth + authorization 403 → Response returned; resolver not called", async () => {
  const log = emptyLog();
  const denial = forbidden();
  const response = await invoke(
    bearerRequest(),
    TENANT_A,
    dependencies(log, {
      authorizeTenant: authorizeResponse(log, denial),
      resolveEffectiveAccess: resolveMustNotRun(),
    }),
  );

  assert(response === denial, "authorization failure Response is returned as-is");
  assertEquals(response.status, 403, "403 pass-through");
  assertEquals(log.order, ["authorize"], "resolver must not run after 403");
  assertEquals(log.resolve, [], "no resolver tenantId");
});

Deno.test("C. authorization success with {ok:true} → resolver called", async () => {
  const log = emptyLog();
  const response = await invoke(
    bearerRequest(),
    TENANT_A,
    dependencies(log, {
      authorizeTenant: authorizeOk(log),
    }),
  );

  assertEquals(response.status, 200, "success after minimal ok");
  assertEquals(log.order, ["authorize", "resolve"], "resolver runs after ok");
  assertEquals(log.resolve, [TENANT_A], "resolver received tenantId");
});

Deno.test("D. richer {ok:true,userId,role} is ignored; resolver still called", async () => {
  const log = emptyLog();
  const response = await invoke(
    bearerRequest(),
    TENANT_A,
    dependencies(log, {
      authorizeTenant: authorizeOk(log, {
        userId: "user-must-not-appear-in-output",
        role: "not-a-known-role",
      }),
    }),
  );

  assertEquals(response.status, 200, "unknown role still authorized by dependency");
  assertEquals(log.order, ["authorize", "resolve"], "role is not inspected");
  const body = await readBody(response);
  const json = JSON.stringify(body);
  assert(!json.includes("user-must-not-appear-in-output"), "userId not leaked");
  assert(!json.includes("not-a-known-role"), "role not leaked");
  assert(!json.includes('"role"'), "role key absent from success body");
  assert(!json.includes('"userId"'), "userId key absent from success body");
});

Deno.test("E. tenantId passed unchanged to authorization", async () => {
  const log = emptyLog();
  await invoke(
    bearerRequest(),
    TENANT_RAW,
    dependencies(log, {
      resolveEffectiveAccess: resolveValue(log, STANDARD_STRIPE_BASE),
    }),
  );

  assertEquals(log.authorize.length, 1, "authorization called once");
  assertEquals(
    log.authorize[0]?.tenantId,
    TENANT_RAW,
    "authorization tenantId is byte-identical",
  );
  assertEquals(log.authorize[0]?.auth.token, TOKEN, "parsed bearer token");
});

Deno.test("F. tenantId passed unchanged to resolver", async () => {
  const log = emptyLog();
  await invoke(
    bearerRequest(),
    TENANT_RAW,
    dependencies(log),
  );

  assertEquals(log.resolve, [TENANT_RAW], "resolver tenantId is byte-identical");
});

Deno.test("G. resolver failure Response returned unchanged; no success envelope", async () => {
  const log = emptyLog();
  const failure = new Response("RESOLVER-FAILURE-BODY-keep-exact", {
    status: 503,
    headers: { "x-resolver-failure": "keep-exact" },
  });
  const response = await invoke(
    bearerRequest(),
    TENANT_A,
    dependencies(log, {
      resolveEffectiveAccess: resolveValue(log, failure),
    }),
  );

  assert(response === failure, "same Response instance");
  assertEquals(response.status, 503, "status unaltered");
  assertEquals(
    response.headers.get("x-resolver-failure"),
    "keep-exact",
    "headers unaltered",
  );
  assertEquals(
    await response.text(),
    "RESOLVER-FAILURE-BODY-keep-exact",
    "body unaltered",
  );
  assertEquals(log.order, ["authorize", "resolve"], "serializer not a separate dep");
});

async function assertPublicSuccess(
  effectiveAccess: EffectiveAccess,
  assertions: (payload: unknown, json: string) => void,
): Promise<void> {
  const log = emptyLog();
  const response = await invoke(
    bearerRequest(),
    TENANT_A,
    dependencies(log, {
      resolveEffectiveAccess: resolveValue(log, effectiveAccess),
    }),
  );
  assertEquals(response.status, 200, "HTTP 200");
  assertEquals(
    response.headers.get("content-type"),
    "application/json; charset=utf-8",
    "jsonResponse content-type",
  );
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    "*",
    "existing CORS preserved",
  );
  const body = await readBody(response);
  assertEquals(
    body,
    { data: serializeEffectiveAccess(effectiveAccess) },
    "envelope is { data: serializeEffectiveAccess(...) }",
  );
  const payload = (body as { data: unknown }).data;
  assertions(payload, JSON.stringify(body));
}

Deno.test("H. standard Stripe EffectiveAccess → 200 {data} equals serializer", async () => {
  await assertPublicSuccess(STANDARD_STRIPE_BASE, (payload) => {
    assertEquals(
      payload,
      serializeEffectiveAccess(STANDARD_STRIPE_BASE),
      "payload matches serializer",
    );
    assertEquals(
      (payload as { source: string }).source,
      "stripe",
      "stripe source",
    );
  });
});

Deno.test("I. complimentary EffectiveAccess → source preserved", async () => {
  await assertPublicSuccess(STANDARD_COMPLIMENTARY_PRO, (payload) => {
    assertEquals(
      (payload as { source: string }).source,
      "complimentary",
      "complimentary source preserved",
    );
  });
});

Deno.test("J. Demo → tier/source null preserved", async () => {
  await assertPublicSuccess(DEMO_GRANTED, (payload) => {
    const data = payload as { mode: string; tier: unknown; source: unknown };
    assertEquals(data.mode, "demo", "demo mode");
    assertEquals(data.tier, null, "Demo has no ProductTier");
    assertEquals(data.source, null, "Demo has no commercial source");
  });
});

Deno.test("K. Internal → tier/source null preserved", async () => {
  await assertPublicSuccess(INTERNAL_GRANTED, (payload) => {
    const data = payload as { mode: string; tier: unknown; source: unknown };
    assertEquals(data.mode, "internal", "internal mode");
    assertEquals(data.tier, null, "Internal is not ProductTier");
    assertEquals(data.source, null, "Internal has no commercial source");
  });
});

Deno.test("L. unentitled → public payload correct", async () => {
  await assertPublicSuccess(UNENTITLED, (payload) => {
    assertEquals(
      payload,
      serializeEffectiveAccess(UNENTITLED),
      "unentitled public payload",
    );
  });
});

Deno.test("M. invalid → public payload correct", async () => {
  await assertPublicSuccess(INVALID, (payload) => {
    assertEquals(
      payload,
      serializeEffectiveAccess(INVALID),
      "invalid public payload",
    );
  });
});

Deno.test("N. extra runtime properties on EffectiveAccess do not leak", async () => {
  const malicious = {
    status: "granted",
    mode: "standard",
    tier: "base",
    source: "stripe",
    expiresAt: null,
    capabilities: BASE_CAPABILITIES,
    stripe_customer_id: "cus_malicious_not_public",
    tenant_id: "tenant-must-not-leak",
    plan_code: "paid",
    is_demo: true,
    secret: "super-secret-value",
    userId: "user-from-domain-must-not-leak",
    role: "admin",
  } as EffectiveAccess;

  await assertPublicSuccess(malicious, (payload, json) => {
    const data = payload as Record<string, unknown>;
    assertEquals(
      Object.getOwnPropertyNames(data),
      ["status", "mode", "tier", "source", "expiresAt", "capabilities"],
      "allowlisted keys only",
    );
    assert(!("stripe_customer_id" in data), "no stripe_customer_id");
    assert(!("tenant_id" in data), "no tenant_id");
    assert(!("plan_code" in data), "no plan_code");
    assert(!("is_demo" in data), "no is_demo");
    assert(!("secret" in data), "no secret");
    assert(!json.includes("cus_malicious_not_public"), "no Stripe id");
    assert(!json.includes("tenant-must-not-leak"), "no tenant_id value");
    assert(!json.includes("super-secret-value"), "no secret value");
    assert(!json.includes("user-from-domain-must-not-leak"), "no userId");
  });
});

Deno.test("O. success body has no tenantId, userId, role, plan_code, is_demo, Stripe IDs, secret", async () => {
  const log = emptyLog();
  const response = await invoke(
    bearerRequest(),
    "tenantId-value-must-not-appear",
    dependencies(log, {
      authorizeTenant: authorizeOk(log, {
        userId: "authz-user-must-not-appear",
        role: "billing",
      }),
      resolveEffectiveAccess: resolveValue(log, STANDARD_STRIPE_BASE),
    }),
  );

  const json = JSON.stringify(await readBody(response));
  for (
    const leak of [
      "tenantId",
      "tenant_id",
      "tenantId-value-must-not-appear",
      "userId",
      "authz-user-must-not-appear",
      '"role"',
      "plan_code",
      "is_demo",
      "cus_",
      "sub_",
      "price_",
      "sk_live",
      "sk_test",
      "service_role",
      "secret",
    ]
  ) {
    assert(!json.includes(leak), `success must not contain ${leak}`);
  }
});

Deno.test("P. ordering: auth → authorization → resolver", async () => {
  const log = emptyLog();
  await invoke(bearerRequest(), TENANT_A, dependencies(log));
  assertEquals(
    log.order,
    ["authorize", "resolve"],
    "authorization before resolver after successful parseAuthHeader",
  );
  assertEquals(log.authorize[0]?.auth.token, TOKEN, "auth parsed before authz");
});

Deno.test("Q. zero privileged/data resolver before authorization success", async () => {
  const log = emptyLog();
  await invoke(
    requestWithoutAuth(),
    TENANT_A,
    dependencies(log, {
      authorizeTenant: authorizeMustNotRun(),
      resolveEffectiveAccess: resolveMustNotRun(),
    }),
  );
  assertEquals(log.resolve, [], "no resolver on auth failure");

  const deniedLog = emptyLog();
  await invoke(
    bearerRequest(),
    TENANT_A,
    dependencies(deniedLog, {
      authorizeTenant: authorizeResponse(deniedLog, forbidden()),
      resolveEffectiveAccess: resolveMustNotRun(),
    }),
  );
  assertEquals(deniedLog.order, ["authorize"], "authz runs");
  assertEquals(deniedLog.resolve, [], "no resolver on authz failure");
});

Deno.test("audience neutrality: handler source does not inspect roles or freeze audience", () => {
  const source = handleEffectiveAccessRequest.toString();
  const forbiddenTokens = [
    "role ===",
    "role !==",
    'role==="admin"',
    'role === "admin"',
    'role === "billing"',
    'role === "user"',
    '"admin" | "billing"',
    '"admin"|"billing"',
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "ModeCapabilityProfiles",
    "capabilitiesForTier",
    "resolveTenantEffectiveAccessFromPersistence",
    "createClient",
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
    "Deno.env",
    "Deno.serve",
    "tenant_subscriptions",
    "tenant_memberships",
    "plan_code",
    "is_demo",
    "JSON.stringify(resolved)",
    "JSON.stringify(effectiveAccess)",
    "...resolved",
    "...effectiveAccess",
  ];
  for (const token of forbiddenTokens) {
    assert(!source.includes(token), `core must not contain ${token}`);
  }
  assert(source.includes("parseAuthHeader"), "must parse auth first");
  assert(source.includes("authorizeTenant"), "authorization is injected");
  assert(source.includes("resolveEffectiveAccess"), "resolver is injected");
  assert(source.includes("serializeEffectiveAccess"), "must serialize allowlist");
  assert(source.includes("jsonResponse"), "must use shared JSON helper");
});
