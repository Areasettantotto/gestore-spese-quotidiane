/**
 * Deno tests for createEffectiveAccessRequestHandler (BILLING-102).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/createEffectiveAccessRequestHandler_test.ts
 *
 * Injected B101/B89/B96 seams. No network, env, secrets, or real DB.
 * ModeCapabilityProfiles are synthetic fixtures — not product policy.
 */

import { authorizeTenantEffectiveAccess } from "./authorizeTenantEffectiveAccess.ts";
import {
  createEffectiveAccessRequestHandler,
  type EffectiveAccessRequestHandler,
} from "./createEffectiveAccessRequestHandler.ts";
import type { PrivilegedEffectiveAccessResolverConfig } from "./createPrivilegedEffectiveAccessResolver.ts";
import {
  type AuthorizeTenant,
  type HandleEffectiveAccessRequestDependencies,
  type ResolveEffectiveAccess,
} from "./handleEffectiveAccessRequest.ts";
import { forbidden } from "./http.ts";
import type {
  Capability,
  EffectiveAccess,
  ModeCapabilityProfiles,
} from "./resolveEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SYNTHETIC_URL = "https://b102-handler.example.invalid";
const SYNTHETIC_KEY = "synthetic-b102-service-role-key-not-a-secret";
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_RAW = "  Tenant-ID-KEEP-exact  ";
const TOKEN = "synthetic-test-bearer-not-a-jwt";

/** synthetic fixture — not product policy */
const SYNTHETIC_DEMO_PROFILE: readonly Capability[] = Object.freeze([
  "ai_assistant",
]);

/** synthetic fixture — not product policy */
const SYNTHETIC_INTERNAL_PROFILE: readonly Capability[] = Object.freeze([
  "expense_management",
]);

const CONTROLLED_ACCESS: EffectiveAccess = {
  status: "unentitled",
  mode: "standard",
  tier: null,
  source: null,
  expiresAt: null,
  capabilities: Object.freeze([]),
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

type ProfileAccess = { key: "demo" | "internal"; receiver: unknown };

function createTrackedModeProfiles(
  accesses: ProfileAccess[],
): ModeCapabilityProfiles {
  return {
    get demo(): readonly Capability[] {
      accesses.push({ key: "demo", receiver: this });
      return SYNTHETIC_DEMO_PROFILE;
    },
    get internal(): readonly Capability[] {
      accesses.push({ key: "internal", receiver: this });
      return SYNTHETIC_INTERNAL_PROFILE;
    },
  };
}

function bearerRequest(token = TOKEN): Request {
  return new Request("https://example.test/effective-access", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function requestWithoutAuth(): Request {
  return new Request("https://example.test/effective-access");
}

const SENTINEL_RESOLVER: ResolveEffectiveAccess = (_tenantId) =>
  Promise.resolve(CONTROLLED_ACCESS);

const SENTINEL_RESPONSE = new Response("B89-RESPONSE-keep-exact", {
  status: 299,
  headers: { "x-b89-response": "keep-exact" },
});

type ResolverFactoryCall = {
  config: PrivilegedEffectiveAccessResolverConfig;
  argumentCount: number;
};

type HandleRequestCall = {
  request: Request;
  tenantId: string;
  dependencies: HandleEffectiveAccessRequestDependencies;
};

type AuthorizeCall = {
  tenantId: string;
};

function createConfig(accesses: ProfileAccess[] = []): {
  config: PrivilegedEffectiveAccessResolverConfig;
  modeProfiles: ModeCapabilityProfiles;
  accesses: ProfileAccess[];
} {
  const modeProfiles = createTrackedModeProfiles(accesses);
  return {
    accesses,
    modeProfiles,
    config: {
      supabaseUrl: SYNTHETIC_URL,
      serviceRoleKey: SYNTHETIC_KEY,
      modeProfiles,
    },
  };
}

Deno.test("B96 is assignable to B89 AuthorizeTenant without cast", () => {
  const authorizeTenant: AuthorizeTenant = authorizeTenantEffectiveAccess;
  assert(
    authorizeTenant === authorizeTenantEffectiveAccess,
    "direct assignment without wrapping or cast",
  );
});

Deno.test("1–8. B101 once at construction; URL/key/profiles pass-through; no request/auth/query/profile read", () => {
  const { config, modeProfiles, accesses } = createConfig();
  const resolverFactoryCalls: ResolverFactoryCall[] = [];
  const handleCalls: HandleRequestCall[] = [];
  const authorizeCalls: AuthorizeCall[] = [];
  let resolverInvocations = 0;

  const trackedResolver: ResolveEffectiveAccess = (tenantId) => {
    resolverInvocations += 1;
    void tenantId;
    return Promise.resolve(CONTROLLED_ACCESS);
  };

  const handler = createEffectiveAccessRequestHandler(config, {
    createResolver: (receivedConfig, ...rest: unknown[]) => {
      resolverFactoryCalls.push({
        config: receivedConfig,
        argumentCount: 1 + rest.length,
      });
      return trackedResolver;
    },
    handleRequest: (request, tenantId, dependencies) => {
      handleCalls.push({ request, tenantId, dependencies });
      return Promise.resolve(SENTINEL_RESPONSE);
    },
    authorizeTenant: async (_auth, tenantId) => {
      authorizeCalls.push({ tenantId });
      return { ok: true };
    },
  });

  assertEquals(resolverFactoryCalls.length, 1, "B101 factory invoked exactly once");
  assert(
    resolverFactoryCalls[0]?.config === config,
    "entire config passed to B101 by reference",
  );
  assert(
    resolverFactoryCalls[0]?.config.supabaseUrl === SYNTHETIC_URL,
    "supabaseUrl passed byte-identical",
  );
  assert(
    resolverFactoryCalls[0]?.config.supabaseUrl === config.supabaseUrl,
    "supabaseUrl is the caller's exact string",
  );
  assert(
    resolverFactoryCalls[0]?.config.serviceRoleKey === SYNTHETIC_KEY,
    "serviceRoleKey passed byte-identical",
  );
  assert(
    resolverFactoryCalls[0]?.config.serviceRoleKey === config.serviceRoleKey,
    "serviceRoleKey is the caller's exact string",
  );
  assert(
    resolverFactoryCalls[0]?.config.modeProfiles === modeProfiles,
    "modeProfiles passed by reference identity",
  );
  assertEquals(
    resolverFactoryCalls[0]?.argumentCount,
    1,
    "B101 receives only the privileged config",
  );
  assertEquals(handleCalls.length, 0, "no request processed during construction");
  assertEquals(authorizeCalls.length, 0, "no auth call during construction");
  assertEquals(resolverInvocations, 0, "no query/resolution during construction");
  assertEquals(
    accesses,
    [],
    "factory construction must not read .demo or .internal",
  );
  assert(typeof handler === "function", "returned value is a function");
  void handler;
});

Deno.test("9–14. handler wiring: request identity, tenantId, B96 authorizer, B101 resolver, Response pass-through", async () => {
  const { config, modeProfiles } = createConfig();
  const resolverFactoryCalls: ResolverFactoryCall[] = [];
  const handleCalls: HandleRequestCall[] = [];
  const request = bearerRequest();

  const handler: EffectiveAccessRequestHandler =
    createEffectiveAccessRequestHandler(config, {
      createResolver: (receivedConfig) => {
        resolverFactoryCalls.push({
          config: receivedConfig,
          argumentCount: 1,
        });
        return SENTINEL_RESOLVER;
      },
      handleRequest: (receivedRequest, tenantId, dependencies) => {
        handleCalls.push({
          request: receivedRequest,
          tenantId,
          dependencies,
        });
        return Promise.resolve(SENTINEL_RESPONSE);
      },
    });

  assert(typeof handler === "function", "returned value is callable");
  assertEquals(handler.length, 2, "handler takes request and tenantId");

  const response = await handler(request, TENANT_RAW);

  assertEquals(handleCalls.length, 1, "B89 invoked once per request");
  assert(
    handleCalls[0]?.request === request,
    "request passed to B89 by identity",
  );
  assert(
    handleCalls[0]?.tenantId === TENANT_RAW,
    "tenantId passed byte-identical to B89",
  );
  assert(
    handleCalls[0]?.dependencies.authorizeTenant ===
      authorizeTenantEffectiveAccess,
    "B89 receives the B96 authorizer by identity",
  );
  assert(
    handleCalls[0]?.dependencies.resolveEffectiveAccess === SENTINEL_RESOLVER,
    "B89 receives exactly the resolver created by B101",
  );
  assert(
    resolverFactoryCalls[0]?.config.modeProfiles === modeProfiles,
    "wired resolver was built from the caller's modeProfiles",
  );
  assert(response === SENTINEL_RESPONSE, "B89 Response returned by identity");
  assertEquals(response.status, 299, "status unaltered");
  assertEquals(
    response.headers.get("x-b89-response"),
    "keep-exact",
    "headers unaltered",
  );
  assertEquals(
    await response.text(),
    "B89-RESPONSE-keep-exact",
    "body unaltered",
  );
});

Deno.test("15. two handler invocations do not recreate B101 and reuse the same resolver", async () => {
  const { config } = createConfig();
  const resolverFactoryCalls: ResolverFactoryCall[] = [];
  const handleCalls: HandleRequestCall[] = [];
  const requestOne = bearerRequest("token-one");
  const requestTwo = bearerRequest("token-two");

  const handler = createEffectiveAccessRequestHandler(config, {
    createResolver: (receivedConfig) => {
      resolverFactoryCalls.push({
        config: receivedConfig,
        argumentCount: 1,
      });
      return SENTINEL_RESOLVER;
    },
    handleRequest: (request, tenantId, dependencies) => {
      handleCalls.push({ request, tenantId, dependencies });
      return Promise.resolve(new Response("ok"));
    },
  });

  assertEquals(
    resolverFactoryCalls.length,
    1,
    "B101 already constructed before any request",
  );

  await handler(requestOne, TENANT_A);
  await handler(requestTwo, TENANT_RAW);

  assertEquals(resolverFactoryCalls.length, 1, "B101 is not recreated per request");
  assertEquals(handleCalls.length, 2, "B89 invoked once per request");
  assert(
    handleCalls[0]?.dependencies.resolveEffectiveAccess === SENTINEL_RESOLVER,
    "first request uses the B101 resolver",
  );
  assert(
    handleCalls[1]?.dependencies.resolveEffectiveAccess === SENTINEL_RESOLVER,
    "second request uses the same B101 resolver",
  );
  assert(
    handleCalls[0]?.dependencies.resolveEffectiveAccess ===
      handleCalls[1]?.dependencies.resolveEffectiveAccess,
    "both requests receive the same resolver instance",
  );
  assert(
    handleCalls[0]?.request === requestOne,
    "first request identity preserved",
  );
  assert(
    handleCalls[1]?.request === requestTwo,
    "second request identity preserved",
  );
  assertEquals(handleCalls[0]?.tenantId, TENANT_A, "first tenantId");
  assertEquals(handleCalls[1]?.tenantId, TENANT_RAW, "second tenantId byte-identical");
});

Deno.test("integration: real B89 + injected authorizer/resolver — authorize then resolve", async () => {
  const { config, accesses } = createConfig();
  const order: string[] = [];
  const resolveTenants: string[] = [];
  let resolverFactoryCalls = 0;

  const controlledResolver: ResolveEffectiveAccess = (tenantId) => {
    order.push("resolve");
    resolveTenants.push(tenantId);
    return Promise.resolve(CONTROLLED_ACCESS);
  };

  const handler = createEffectiveAccessRequestHandler(config, {
    createResolver: () => {
      resolverFactoryCalls += 1;
      return controlledResolver;
    },
    authorizeTenant: async (_auth, _tenantId) => {
      order.push("authorize");
      return { ok: true };
    },
  });

  assertEquals(resolverFactoryCalls, 1, "B101 bound once before real B89");
  assertEquals(order, [], "real B89 not invoked during construction");
  assertEquals(accesses, [], "no profile read during construction");

  const request = bearerRequest();
  const response = await handler(request, TENANT_RAW);

  assertEquals(order, ["authorize", "resolve"], "authorization before resolution");
  assertEquals(resolveTenants, [TENANT_RAW], "resolver tenantId is byte-identical");
  assertEquals(response.status, 200, "real B89 success status");
});

Deno.test("integration: authorization failure → privileged resolver not called", async () => {
  const { config } = createConfig();
  const order: string[] = [];
  const denial = forbidden();
  let resolverInvocations = 0;

  const mustNotResolve: ResolveEffectiveAccess = () => {
    resolverInvocations += 1;
    throw new Error("resolver must not run");
  };

  const handler = createEffectiveAccessRequestHandler(config, {
    createResolver: () => mustNotResolve,
    authorizeTenant: async () => {
      order.push("authorize");
      return denial;
    },
  });

  const response = await handler(bearerRequest(), TENANT_A);

  assert(response === denial, "authorization failure Response returned as-is");
  assertEquals(order, ["authorize"], "authorizer ran");
  assertEquals(resolverInvocations, 0, "resolver must not run after 403");
  assertEquals(response.status, 403, "403 pass-through");
});

Deno.test("integration: missing Authorization → B89 auth failure; authorizer and resolver skipped", async () => {
  const { config } = createConfig();
  let authorizeCalls = 0;
  let resolverInvocations = 0;

  const handler = createEffectiveAccessRequestHandler(config, {
    createResolver: () => {
      return (_tenantId) => {
        resolverInvocations += 1;
        throw new Error("resolver must not run");
      };
    },
    authorizeTenant: async () => {
      authorizeCalls += 1;
      throw new Error("authorization must not run");
    },
  });

  const response = await handler(requestWithoutAuth(), TENANT_A);
  assertEquals(response.status, 401, "existing unauthorized status");
  assertEquals(authorizeCalls, 0, "authorizer skipped on missing auth");
  assertEquals(resolverInvocations, 0, "resolver skipped on missing auth");
});

Deno.test("production factory has no env, HTTP, persistence, policy, or unsafe cast", () => {
  const source = createEffectiveAccessRequestHandler.toString();
  const required = [
    "createPrivilegedEffectiveAccessResolver",
    "authorizeTenantEffectiveAccess",
    "handleEffectiveAccessRequest",
  ];
  for (const token of required) {
    assert(source.includes(token), `factory must contain ${token}`);
  }

  const forbiddenTokens = [
    "Deno.env",
    "Deno.serve",
    "createClient",
    "createPrivilegedEffectiveAccessPersistenceClients",
    "adaptSupabaseClientToEffectiveAccessPersistenceClients",
    ".from(",
    ".select(",
    ".eq(",
    ".rpc(",
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "parseAuthHeader",
    "getAuthenticatedUser",
    "capabilitiesForTier",
    '"expense_management"',
    '"standard_dashboard"',
    '"ai_categorization"',
    '"ai_insights"',
    '"ai_assistant"',
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_",
    "console.log",
    "console.error",
    "as any",
    "as unknown as",
    "@ts-ignore",
    "@ts-expect-error",
  ];
  for (const token of forbiddenTokens) {
    assert(!source.includes(token), `factory must not contain ${token}`);
  }
});
