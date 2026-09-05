/**
 * Deno tests for the EffectiveAccess Edge production entrypoint (BILLING-106).
 *
 * Run:
 *   deno test --no-lock --cached-only --no-prompt \
 *     supabase/functions/effective-access/index_test.ts
 *
 * Injected readEnv + B102 seam. No network, real Deno.env, secrets, or DB.
 * Fixtures are synthetic — not real tenants, JWTs, or service-role keys.
 */

import type { PrivilegedEffectiveAccessResolverConfig } from "../_shared/createPrivilegedEffectiveAccessResolver.ts";
import { canonicalModeCapabilityProfiles } from "../_shared/modeCapabilityProfiles.ts";
import {
  createEffectiveAccessEdgeHandler,
  type EffectiveAccessEdgeHandlerDependencies,
} from "./index.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_PADDED = `  ${TENANT_A}  `;
const SYNTHETIC_SUPABASE_URL = "https://synthetic-b106.example.invalid";
const SYNTHETIC_SERVICE_ROLE = "synthetic-b106-service-role-fixture-not-real";
const SYNTHETIC_BEARER = "synthetic-b106-bearer-not-a-jwt";
const ENDPOINT = "http://localhost/effective-access";
const DOWNSTREAM_BODY = "B102-RESPONSE-keep-exact";
const DOWNSTREAM_HEADER = "x-b102-response";

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

type HandlerCall = {
  request: Request;
  tenantId: string;
};

function explodingReadEnv(): EffectiveAccessEdgeHandlerDependencies["readEnv"] {
  return () => {
    throw new Error("readEnv must not be called RAW_ENV_DETAIL");
  };
}

function explodingCreateRequestHandler(): EffectiveAccessEdgeHandlerDependencies["createRequestHandler"] {
  return () => {
    throw new Error("B102 must not be constructed RAW_HANDLER_DETAIL");
  };
}

function testReadEnv(
  overrides: Record<string, string | undefined> = {},
): {
  readEnv: NonNullable<EffectiveAccessEdgeHandlerDependencies["readEnv"]>;
  keys: string[];
} {
  const keys: string[] = [];
  const env: Record<string, string | undefined> = {
    SUPABASE_URL: SYNTHETIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SYNTHETIC_SERVICE_ROLE,
    SUPABASE_ANON_KEY: "synthetic-anon-must-not-be-read",
    VITE_SUPABASE_URL: "vite-must-not-be-read",
    MODE_PROFILES: "http-or-env-profiles-must-not-be-read",
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

function tracingCreateRequestHandler(
  respond: (request: Request, tenantId: string) => Response = () =>
    new Response(DOWNSTREAM_BODY, {
      status: 299,
      headers: { [DOWNSTREAM_HEADER]: "keep-exact" },
    }),
): {
  createRequestHandler: NonNullable<
    EffectiveAccessEdgeHandlerDependencies["createRequestHandler"]
  >;
  factoryCalls: PrivilegedEffectiveAccessResolverConfig[];
  handlerCalls: HandlerCall[];
} {
  const factoryCalls: PrivilegedEffectiveAccessResolverConfig[] = [];
  const handlerCalls: HandlerCall[] = [];
  return {
    factoryCalls,
    handlerCalls,
    createRequestHandler: (config) => {
      factoryCalls.push(config);
      return (request, tenantId) => {
        handlerCalls.push({ request, tenantId });
        return Promise.resolve(respond(request, tenantId));
      };
    },
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
  if (init.authorization !== null) {
    headers.set(
      "authorization",
      init.authorization ?? `Bearer ${SYNTHETIC_BEARER}`,
    );
  }
  const payload = init.json === false ? (body as BodyInit) : JSON.stringify(body);
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
  deps: EffectiveAccessEdgeHandlerDependencies = {},
): Promise<Response> {
  return await createEffectiveAccessEdgeHandler(deps)(req);
}

async function readBody(res: Response): Promise<unknown> {
  return await res.json();
}

function assertCors(res: Response, messagePrefix: string): void {
  assertEquals(
    res.headers.get("access-control-allow-origin"),
    "*",
    `${messagePrefix} CORS origin`,
  );
  assertEquals(
    res.headers.get("access-control-allow-headers"),
    "authorization, content-type",
    `${messagePrefix} CORS headers`,
  );
  assertEquals(
    res.headers.get("access-control-allow-methods"),
    "POST, OPTIONS",
    `${messagePrefix} CORS methods`,
  );
}

function assertNoSensitiveLeak(
  serialized: string,
  extra: string[] = [],
): void {
  for (
    const secret of [
      SYNTHETIC_SERVICE_ROLE,
      SYNTHETIC_BEARER,
      "service_role",
      "VITE_",
      "RAW_ENV_DETAIL",
      "RAW_HANDLER_DETAIL",
      ...extra,
    ]
  ) {
    assert(!serialized.includes(secret), `must not leak ${secret}`);
  }
}

async function expectPatternAError(
  res: Response,
  status: number,
  code: string,
  message: string,
  extraLeaks: string[] = [],
): Promise<unknown> {
  const body = await readBody(res);
  assertEquals(res.status, status, `status ${status}`);
  assertEquals(
    res.headers.get("content-type"),
    "application/json; charset=utf-8",
    "JSON content-type",
  );
  assertCors(res, `${code}`);
  assertEquals(
    body,
    { error: { code, message } },
    "Pattern-A error envelope",
  );
  assertNoSensitiveLeak(JSON.stringify(body), extraLeaks);
  return body;
}

Deno.test("A. factory is importable without Deno.env and does not build B102 at construction", () => {
  const env = testReadEnv();
  const traced = tracingCreateRequestHandler();
  const handler = createEffectiveAccessEdgeHandler({
    readEnv: env.readEnv,
    createRequestHandler: traced.createRequestHandler,
  });

  assert(typeof handler === "function", "factory returns a request handler");
  assertEquals(env.keys.length, 0, "construction does not read env");
  assertEquals(traced.factoryCalls.length, 0, "construction does not build B102");
});

Deno.test("B. OPTIONS → 200 CORS; no env read; B102 not invoked", async () => {
  const traced = tracingCreateRequestHandler();
  const res = await invoke(new Request(ENDPOINT, { method: "OPTIONS" }), {
    readEnv: explodingReadEnv(),
    createRequestHandler: traced.createRequestHandler,
  });

  assertEquals(res.status, 200, "OPTIONS 200");
  assertCors(res, "OPTIONS");
  assertEquals(
    res.headers.get("content-type"),
    "application/json; charset=utf-8",
    "OPTIONS JSON content-type",
  );
  assertEquals(await readBody(res), { data: { ok: true } }, "OPTIONS body");
  assertEquals(traced.factoryCalls.length, 0, "OPTIONS does not build B102");
  assertEquals(traced.handlerCalls.length, 0, "OPTIONS does not invoke B102");
});

Deno.test("C. GET and PUT → 405 Allow POST; no delegation", async () => {
  for (const method of ["GET", "PUT"]) {
    const traced = tracingCreateRequestHandler();
    const res = await invoke(
      jsonRequest(undefined, { method }),
      {
        readEnv: explodingReadEnv(),
        createRequestHandler: traced.createRequestHandler,
      },
    );
    await expectPatternAError(
      res,
      405,
      "METHOD_NOT_ALLOWED",
      `Method ${method} is not allowed.`,
    );
    assertEquals(res.headers.get("allow"), "POST", `${method} Allow: POST`);
    assertEquals(traced.factoryCalls.length, 0, `${method} does not build B102`);
    assertEquals(traced.handlerCalls.length, 0, `${method} does not invoke B102`);
  }
});

Deno.test("D. invalid JSON → 400 INVALID_JSON; no delegation", async () => {
  const env = testReadEnv();
  const traced = tracingCreateRequestHandler();
  const res = await invoke(
    jsonRequest("{not-json", { json: false }),
    {
      readEnv: env.readEnv,
      createRequestHandler: explodingCreateRequestHandler(),
    },
  );
  await expectPatternAError(
    res,
    400,
    "INVALID_JSON",
    "Request body must be valid JSON.",
  );
  assertEquals(env.keys.length, 0, "invalid JSON does not read env");
  assertEquals(traced.factoryCalls.length, 0, "invalid JSON does not build B102");
});

Deno.test("E. missing tenant_id → canonical parseTenantBody error; no delegation", async () => {
  const env = testReadEnv();
  const traced = tracingCreateRequestHandler();
  const res = await invoke(
    jsonRequest({}),
    {
      readEnv: env.readEnv,
      createRequestHandler: explodingCreateRequestHandler(),
    },
  );
  await expectPatternAError(
    res,
    422,
    "UNPROCESSABLE_ENTITY",
    "Field 'tenant_id' is required and must be a UUID string.",
  );
  assertEquals(env.keys.length, 0, "missing tenant_id does not read env");
  assertEquals(traced.factoryCalls.length, 0, "missing tenant_id does not build B102");
});

Deno.test("F. non-string tenant_id → canonical parseTenantBody error; no delegation", async () => {
  const env = testReadEnv();
  const traced = tracingCreateRequestHandler();
  const res = await invoke(
    jsonRequest({ tenant_id: 123 }),
    {
      readEnv: env.readEnv,
      createRequestHandler: explodingCreateRequestHandler(),
    },
  );
  await expectPatternAError(
    res,
    422,
    "UNPROCESSABLE_ENTITY",
    "Field 'tenant_id' is required and must be a UUID string.",
  );
  assertEquals(env.keys.length, 0, "non-string tenant_id does not read env");
  assertEquals(traced.factoryCalls.length, 0, "non-string tenant_id does not build B102");
});

Deno.test("G. invalid UUID tenant_id → canonical parseTenantBody error; no delegation", async () => {
  const env = testReadEnv();
  const traced = tracingCreateRequestHandler();
  const res = await invoke(
    jsonRequest({ tenant_id: "not-a-uuid" }),
    {
      readEnv: env.readEnv,
      createRequestHandler: explodingCreateRequestHandler(),
    },
  );
  await expectPatternAError(
    res,
    422,
    "UNPROCESSABLE_ENTITY",
    "Field 'tenant_id' must be a valid UUID.",
  );
  assertEquals(env.keys.length, 0, "invalid UUID does not read env");
  assertEquals(traced.factoryCalls.length, 0, "invalid UUID does not build B102");
});

Deno.test("H. missing privileged config → 503; B102 never constructed", async () => {
  const missingUrl = tracingCreateRequestHandler();
  const missingUrlEnv = testReadEnv({ SUPABASE_URL: undefined });
  const missingUrlRes = await invoke(
    jsonRequest({ tenant_id: TENANT_A }),
    {
      readEnv: missingUrlEnv.readEnv,
      createRequestHandler: explodingCreateRequestHandler(),
    },
  );
  await expectPatternAError(
    missingUrlRes,
    503,
    "SERVICE_UNAVAILABLE",
    "Service is temporarily unavailable.",
    [SYNTHETIC_SUPABASE_URL],
  );

  const missingKey = tracingCreateRequestHandler();
  const missingKeyEnv = testReadEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined });
  const missingKeyRes = await invoke(
    jsonRequest({ tenant_id: TENANT_A }),
    {
      readEnv: missingKeyEnv.readEnv,
      createRequestHandler: explodingCreateRequestHandler(),
    },
  );
  await expectPatternAError(
    missingKeyRes,
    503,
    "SERVICE_UNAVAILABLE",
    "Service is temporarily unavailable.",
  );

  const emptyKey = tracingCreateRequestHandler();
  const emptyKeyRes = await invoke(
    jsonRequest({ tenant_id: TENANT_A }),
    {
      readEnv: testReadEnv({ SUPABASE_SERVICE_ROLE_KEY: "" }).readEnv,
      createRequestHandler: explodingCreateRequestHandler(),
    },
  );
  await expectPatternAError(
    emptyKeyRes,
    503,
    "SERVICE_UNAVAILABLE",
    "Service is temporarily unavailable.",
  );

  assertEquals(missingUrl.factoryCalls.length, 0, "missing URL does not build B102");
  assertEquals(missingKey.factoryCalls.length, 0, "missing key does not build B102");
  assertEquals(emptyKey.factoryCalls.length, 0, "empty key does not build B102");
  assertEquals(
    [...new Set(missingUrlEnv.keys)].sort(),
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"].sort(),
    "missing-config path reads only privileged env names",
  );
  assertEquals(
    [...new Set(missingKeyEnv.keys)].sort(),
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"].sort(),
    "missing-key path reads only privileged env names",
  );
});

Deno.test("I. happy path forwards tenant_id, original Request, and B102 Response", async () => {
  const traced = tracingCreateRequestHandler();
  const env = testReadEnv();
  const request = jsonRequest({
    tenant_id: TENANT_PADDED,
    tenantId: "alias-must-be-ignored",
    mode_profiles: { demo: ["ai_assistant"] },
    modeProfiles: { internal: ["expense_management"] },
  }, {
    url:
      `${ENDPOINT}?tenant_id=bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeee2&mode=demo`,
  });

  const res = await invoke(request, {
    readEnv: env.readEnv,
    createRequestHandler: traced.createRequestHandler,
  });

  assert(res.status === 299, "downstream status pass-through");
  assertEquals(
    res.headers.get(DOWNSTREAM_HEADER),
    "keep-exact",
    "downstream headers pass-through",
  );
  assertEquals(await res.text(), DOWNSTREAM_BODY, "downstream body pass-through");
  assertEquals(traced.factoryCalls.length, 1, "B102 constructed once");
  assertEquals(traced.handlerCalls.length, 1, "B102 invoked once");
  assert(
    traced.handlerCalls[0]?.request === request,
    "original Request forwarded by identity",
  );
  assertEquals(
    traced.handlerCalls[0]?.tenantId,
    TENANT_A,
    "validated tenant_id forwarded after shared parseTenantBody trim",
  );
  assertEquals(
    [...new Set(env.keys)].sort(),
    ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"].sort(),
    "happy path reads only privileged env names",
  );
  assertNoSensitiveLeak(DOWNSTREAM_BODY);
});

Deno.test("J. lifecycle: valid config builds B102 once and reuses it", async () => {
  const traced = tracingCreateRequestHandler();
  let supabaseUrl: string | undefined;
  const handler = createEffectiveAccessEdgeHandler({
    readEnv: (key) => {
      if (key === "SUPABASE_URL") return supabaseUrl;
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return SYNTHETIC_SERVICE_ROLE;
      return undefined;
    },
    createRequestHandler: traced.createRequestHandler,
  });

  const firstInvalid = await handler(jsonRequest({ tenant_id: TENANT_A }));
  await expectPatternAError(
    firstInvalid,
    503,
    "SERVICE_UNAVAILABLE",
    "Service is temporarily unavailable.",
  );
  assertEquals(
    traced.factoryCalls.length,
    0,
    "invalid config is not cached as a handler",
  );

  supabaseUrl = SYNTHETIC_SUPABASE_URL;
  const requestOne = jsonRequest({ tenant_id: TENANT_A });
  const requestTwo = jsonRequest({ tenant_id: TENANT_A });
  const firstValid = await handler(requestOne);
  const secondValid = await handler(requestTwo);

  assertEquals(firstValid.status, 299, "first valid request delegated");
  assertEquals(secondValid.status, 299, "second valid request delegated");
  assertEquals(traced.factoryCalls.length, 1, "B102 constructed once after valid config");
  assertEquals(traced.handlerCalls.length, 2, "bound handler reused per request");
  assert(
    traced.handlerCalls[0]?.request === requestOne,
    "first request identity preserved",
  );
  assert(
    traced.handlerCalls[1]?.request === requestTwo,
    "second request identity preserved",
  );
});

Deno.test("K. production config injects canonicalModeCapabilityProfiles only", async () => {
  const traced = tracingCreateRequestHandler();
  const env = testReadEnv({
    MODE_PROFILES: JSON.stringify({ demo: ["ai_assistant"] }),
  });
  await invoke(
    jsonRequest({
      tenant_id: TENANT_A,
      mode_profiles: { demo: ["standard_dashboard"] },
      modeProfiles: { internal: ["expense_management"] },
      capabilities: ["ai_assistant"],
    }),
    {
      readEnv: env.readEnv,
      createRequestHandler: traced.createRequestHandler,
    },
  );

  assertEquals(traced.factoryCalls.length, 1, "one production config");
  const config = traced.factoryCalls[0];
  assert(config !== undefined, "B102 received config");
  assert(
    config.modeProfiles === canonicalModeCapabilityProfiles,
    "modeProfiles is the canonical production source by identity",
  );
  assertEquals(config.supabaseUrl, SYNTHETIC_SUPABASE_URL, "URL from SUPABASE_URL");
  assertEquals(
    config.serviceRoleKey,
    SYNTHETIC_SERVICE_ROLE,
    "key from SUPABASE_SERVICE_ROLE_KEY",
  );
  assertEquals(
    Object.keys(config).sort(),
    ["modeProfiles", "serviceRoleKey", "supabaseUrl"].sort(),
    "config contains only privileged URL/key + canonical profiles",
  );
  assert(
    !env.keys.includes("MODE_PROFILES"),
    "env mode-profile keys are not read",
  );
  assert(
    !env.keys.includes("VITE_SUPABASE_URL"),
    "VITE_* is not read",
  );
});

Deno.test("L. top-level has no second auth / AccessMode / Demo-Internal pipeline", () => {
  const source = createEffectiveAccessEdgeHandler.toString();
  const required = [
    "parseJsonBody",
    "parseTenantBody",
    "createEffectiveAccessRequestHandler",
    "canonicalModeCapabilityProfiles",
    "serviceUnavailable",
    "methodNotAllowed",
  ];
  for (const token of required) {
    assert(source.includes(token), `factory must contain ${token}`);
  }

  const forbidden = [
    "parseAuthHeader",
    "getAuthenticatedUser",
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "readTenantAccessMode",
    "capabilitiesForTier",
    'mode === "demo"',
    "mode === 'demo'",
    'mode === "internal"',
    "mode === 'internal'",
    "mode === \"standard\"",
    "Deno.serve",
    "createClient",
    "VITE_",
    "console.log",
    "console.error",
    "console.warn",
    "verify_jwt",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `factory must not contain ${token}`);
  }
});

Deno.test("M. service-role is not exposed in Response and VITE_* is unused", async () => {
  const traced = tracingCreateRequestHandler();
  const res = await invoke(
    jsonRequest({ tenant_id: TENANT_A }),
    {
      readEnv: testReadEnv().readEnv,
      createRequestHandler: traced.createRequestHandler,
    },
  );
  const serialized = `${res.status}:${await res.text()}:${
    JSON.stringify([...res.headers.entries()])
  }`;
  assertNoSensitiveLeak(serialized, [
    SYNTHETIC_SERVICE_ROLE,
    "VITE_SUPABASE_URL",
    "serviceRoleKey",
  ]);
  assertEquals(
    createEffectiveAccessEdgeHandler.toString().includes("VITE_"),
    false,
    "source does not mention VITE_*",
  );
  assertEquals(
    createEffectiveAccessEdgeHandler.toString().includes("console."),
    false,
    "source does not log",
  );
});
