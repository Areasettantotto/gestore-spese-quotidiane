/**
 * Deno tests for createPrivilegedEffectiveAccessPersistenceClients
 * (BILLING-99).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/createPrivilegedEffectiveAccessPersistenceClients_test.ts
 *
 * Injected createClient + in-process fetch stub. No network, env, or secrets.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { CreateEffectiveAccessResolverDependencies } from "./createEffectiveAccessResolver.ts";
import {
  createPrivilegedEffectiveAccessPersistenceClients,
  type PrivilegedEffectiveAccessPersistenceConfig,
  type PrivilegedSupabaseClientFactory,
} from "./createPrivilegedEffectiveAccessPersistenceClients.ts";
import type { ModeCapabilityProfiles } from "./resolveEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SYNTHETIC_URL = "https://b99-privileged.example.invalid";
const SYNTHETIC_KEY = "synthetic-b99-service-role-key-not-a-secret";
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";

const SYNTHETIC_PROFILES: ModeCapabilityProfiles = {
  demo: ["ai_assistant"],
  internal: ["expense_management"],
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

type CreateClientCall = {
  supabaseUrl: string;
  serviceRoleKey: string;
  argumentCount: number;
};

type Harness = {
  calls: CreateClientCall[];
  clients: SupabaseClient[];
  requests: Array<{ url: string; method: string }>;
  spyCreateClient: PrivilegedSupabaseClientFactory;
};

function createHarness(): Harness {
  const calls: CreateClientCall[] = [];
  const clients: SupabaseClient[] = [];
  const requests: Array<{ url: string; method: string }> = [];

  const fetchStub: typeof fetch = (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    requests.push({
      url,
      method: init?.method ?? "GET",
    });
    return Promise.resolve(
      new Response(JSON.stringify({ plan_code: "paid", is_demo: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  function spyCreateClient(
    supabaseUrl: string,
    serviceRoleKey: string,
  ): SupabaseClient {
    calls.push({
      supabaseUrl,
      serviceRoleKey,
      argumentCount: arguments.length,
    });
    const client = createClient(supabaseUrl, serviceRoleKey, {
      global: { fetch: fetchStub },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    clients.push(client);
    return client;
  }

  return { calls, clients, requests, spyCreateClient };
}

Deno.test("1–2. config requires supabaseUrl and serviceRoleKey; no extras", () => {
  type ConfigKey = keyof PrivilegedEffectiveAccessPersistenceConfig;
  type Unexpected = Exclude<ConfigKey, "supabaseUrl" | "serviceRoleKey">;
  type Missing = Exclude<"supabaseUrl" | "serviceRoleKey", ConfigKey>;
  type FieldsAreOptional =
    Partial<PrivilegedEffectiveAccessPersistenceConfig> extends
      PrivilegedEffectiveAccessPersistenceConfig ? true : false;

  const noUnexpected: [Unexpected] extends [never] ? true : false = true;
  const noMissing: [Missing] extends [never] ? true : false = true;
  const required: FieldsAreOptional extends false ? true : false = true;

  const config: PrivilegedEffectiveAccessPersistenceConfig = {
    supabaseUrl: SYNTHETIC_URL,
    serviceRoleKey: SYNTHETIC_KEY,
  };

  assert(noUnexpected && noMissing && required, "config keys are exact and required");
  assertEquals(
    Object.keys(config).sort(),
    ["serviceRoleKey", "supabaseUrl"],
    "runtime config carries only the two required fields",
  );
  assertEquals(config.supabaseUrl, SYNTHETIC_URL, "supabaseUrl present");
  assertEquals(config.serviceRoleKey, SYNTHETIC_KEY, "serviceRoleKey present");
});

Deno.test("3–6. createClient once; URL and key byte-identical; no third option", () => {
  const harness = createHarness();
  createPrivilegedEffectiveAccessPersistenceClients(
    { supabaseUrl: SYNTHETIC_URL, serviceRoleKey: SYNTHETIC_KEY },
    { createClient: harness.spyCreateClient },
  );

  assertEquals(harness.calls.length, 1, "exactly one createClient invocation");
  assert(
    harness.calls[0]?.supabaseUrl === SYNTHETIC_URL,
    "URL passed byte-identical",
  );
  assert(
    harness.calls[0]?.serviceRoleKey === SYNTHETIC_KEY,
    "serviceRoleKey passed byte-identical",
  );
  assertEquals(
    harness.calls[0]?.argumentCount,
    2,
    "two-argument createClient; no invented third option",
  );
});

Deno.test("7+10. created client is passed to B98; construction does not query", async () => {
  const harness = createHarness();
  const persistenceClients = createPrivilegedEffectiveAccessPersistenceClients(
    { supabaseUrl: SYNTHETIC_URL, serviceRoleKey: SYNTHETIC_KEY },
    { createClient: harness.spyCreateClient },
  );

  assertEquals(harness.clients.length, 1, "one client constructed");
  assertEquals(harness.requests.length, 0, "construction must not fetch");

  const result = await persistenceClients.accessModeClient
    .from("tenants")
    .select("plan_code,is_demo")
    .eq("id", TENANT_A)
    .maybeSingle();

  assertEquals(harness.requests.length, 1, "B98 port uses the created client");
  assert(
    harness.requests[0]?.url.startsWith(SYNTHETIC_URL),
    "B98 queried through the client built from the supplied URL",
  );
  assertEquals(result.error, null, "stubbed lookup succeeds");
  assert(
    result.data !== null && result.data !== undefined,
    "B98 forwarded the client response",
  );
});

Deno.test("8–9+19. output is exactly the three ports; no raw client, config, or modeProfiles", () => {
  const harness = createHarness();
  const persistenceClients = createPrivilegedEffectiveAccessPersistenceClients(
    { supabaseUrl: SYNTHETIC_URL, serviceRoleKey: SYNTHETIC_KEY },
    { createClient: harness.spyCreateClient },
  );

  assertEquals(
    Object.keys(persistenceClients).sort(),
    ["accessModeClient", "complimentaryClient", "stripeClient"].sort(),
    "exactly the three persistence slots",
  );
  assert(
    persistenceClients.accessModeClient !== undefined &&
      persistenceClients.stripeClient !== undefined &&
      persistenceClients.complimentaryClient !== undefined,
    "all three ports populated",
  );

  const created: object | undefined = harness.clients[0];
  assert(created !== undefined, "spy retained the raw client");
  const outputSlots: object[] = [
    persistenceClients.accessModeClient,
    persistenceClients.stripeClient,
    persistenceClients.complimentaryClient,
  ];
  assert(
    outputSlots.every((slot) => slot !== created),
    "raw client is not an output slot",
  );

  const forbiddenOutputKeys = [
    "serviceRoleKey",
    "supabaseUrl",
    "modeProfiles",
    "client",
    "supabaseClient",
  ];
  for (const key of forbiddenOutputKeys) {
    assert(
      !Object.prototype.hasOwnProperty.call(persistenceClients, key),
      `output must not contain ${key}`,
    );
  }
});

Deno.test("26. B95 type integration: persistenceClients + synthetic profiles", () => {
  const harness = createHarness();
  const persistenceClients = createPrivilegedEffectiveAccessPersistenceClients(
    { supabaseUrl: SYNTHETIC_URL, serviceRoleKey: SYNTHETIC_KEY },
    { createClient: harness.spyCreateClient },
  );

  const dependencies: CreateEffectiveAccessResolverDependencies = {
    ...persistenceClients,
    modeProfiles: SYNTHETIC_PROFILES,
  };

  assert(
    dependencies.accessModeClient === persistenceClients.accessModeClient &&
      dependencies.stripeClient === persistenceClients.stripeClient &&
      dependencies.complimentaryClient ===
        persistenceClients.complimentaryClient &&
      dependencies.modeProfiles === SYNTHETIC_PROFILES,
    "B95 dependencies compile from factory output + synthetic profiles",
  );
});

Deno.test("default createClient path: two-arg production API, three ports, no query API", () => {
  const persistenceClients = createPrivilegedEffectiveAccessPersistenceClients({
    supabaseUrl: SYNTHETIC_URL,
    serviceRoleKey: SYNTHETIC_KEY,
  });

  assertEquals(
    Object.keys(persistenceClients).sort(),
    ["accessModeClient", "complimentaryClient", "stripeClient"].sort(),
    "default path returns the three ports",
  );
});

Deno.test("two invocations construct two clients independently", () => {
  const harness = createHarness();
  createPrivilegedEffectiveAccessPersistenceClients(
    { supabaseUrl: SYNTHETIC_URL, serviceRoleKey: SYNTHETIC_KEY },
    { createClient: harness.spyCreateClient },
  );
  createPrivilegedEffectiveAccessPersistenceClients(
    { supabaseUrl: SYNTHETIC_URL, serviceRoleKey: SYNTHETIC_KEY },
    { createClient: harness.spyCreateClient },
  );

  assertEquals(harness.calls.length, 2, "one createClient per invocation");
  assert(harness.clients[0] !== harness.clients[1], "clients are distinct");
});

Deno.test("11–15+24–25. production factory has no env, auth, HTTP, logging, query, or unsafe cast", () => {
  const source = createPrivilegedEffectiveAccessPersistenceClients.toString();
  const forbidden = [
    "Deno.env",
    "Deno.serve",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_",
    ".from(",
    ".select(",
    ".eq(",
    ".rpc(",
    "tenantId",
    "modeProfiles",
    "createUserScopedClient",
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "authorizeTenantEffectiveAccess",
    "handleEffectiveAccessRequest",
    "parseAuthHeader",
    "getAuthenticatedUser",
    "console.log",
    "console.error",
    "console.warn",
    "as any",
    "as unknown as",
    "@ts-ignore",
    "@ts-expect-error",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `factory must not contain ${token}`);
  }
  assert(source.includes("createSupabaseClient"), "constructs via createClient");
  assert(
    source.includes("adaptSupabaseClientToEffectiveAccessPersistenceClients"),
    "delegates exclusively to B98",
  );
});
