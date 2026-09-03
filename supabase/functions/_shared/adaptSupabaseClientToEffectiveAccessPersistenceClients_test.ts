/**
 * Deno tests for adaptSupabaseClientToEffectiveAccessPersistenceClients
 * (BILLING-98).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/adaptSupabaseClientToEffectiveAccessPersistenceClients_test.ts
 *
 * Real supabase-js client + in-process fetch stub. No network, env, or secrets.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  adaptSupabaseClientToEffectiveAccessPersistenceClients,
} from "./adaptSupabaseClientToEffectiveAccessPersistenceClients.ts";
import type { CreateEffectiveAccessResolverDependencies } from "./createEffectiveAccessResolver.ts";
import {
  readTenantComplimentaryAccessCandidate,
  type ComplimentaryAccessGrantLookupClient,
} from "./readTenantComplimentaryAccessCandidate.ts";
import {
  readTenantAccessMode,
  type TenantAccessModeLookupClient,
} from "./readTenantAccessMode.ts";
import {
  readTenantStripeSubscriptionObservations,
  type TenantStripeSubscriptionObservationLookupClient,
} from "./readTenantStripeSubscriptionObservations.ts";
import type { ModeCapabilityProfiles } from "./resolveEffectiveAccess.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
};

const SYNTHETIC_URL = "https://b98-adapter.example.invalid";
const SYNTHETIC_KEY = "synthetic-test-key-not-a-secret";
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const TENANT_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2";
const PERIOD_END = "2023-12-14T22:01:40.000Z";

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

type RecordedRequest = {
  url: string;
  method: string;
  table: string;
  select: string | null;
  filters: Array<{ column: string; value: string }>;
};

type TableResponses = {
  tenants?: unknown;
  tenant_subscriptions?: unknown;
  tenant_complimentary_access_grants?: unknown;
};

type TableErrors = {
  tenants?: { code: string; message: string };
  tenant_subscriptions?: { code: string; message: string };
  tenant_complimentary_access_grants?: { code: string; message: string };
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseRestUrl(url: string): {
  table: string;
  select: string | null;
  filters: Array<{ column: string; value: string }>;
} {
  const parsed = new URL(url);
  const segments = parsed.pathname.split("/").filter((part) => part.length > 0);
  const table = segments[segments.length - 1] ?? "";
  const select = parsed.searchParams.get("select");
  const filters: Array<{ column: string; value: string }> = [];
  parsed.searchParams.forEach((value, column) => {
    if (column === "select") {
      return;
    }
    filters.push({
      column,
      value: value.startsWith("eq.") ? value.slice("eq.".length) : value,
    });
  });
  return { table, select, filters };
}

function createHarness(
  rows: TableResponses = {},
  errors: TableErrors = {},
) {
  const requests: RecordedRequest[] = [];

  const fetchStub: typeof fetch = (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    const parsed = parseRestUrl(url);
    requests.push({
      url,
      method: init?.method ?? "GET",
      table: parsed.table,
      select: parsed.select,
      filters: parsed.filters,
    });

    const table = parsed.table as keyof TableErrors;
    const tableError = errors[table];
    if (tableError !== undefined) {
      return Promise.resolve(jsonResponse({
        code: tableError.code,
        message: tableError.message,
        details: "",
        hint: null,
      }, 400));
    }

    if (table === "tenants") {
      const body = Object.prototype.hasOwnProperty.call(rows, "tenants")
        ? rows.tenants
        : { plan_code: "paid", is_demo: false };
      return Promise.resolve(jsonResponse(body));
    }
    if (table === "tenant_subscriptions") {
      const body = Object.prototype.hasOwnProperty.call(
        rows,
        "tenant_subscriptions",
      )
        ? rows.tenant_subscriptions
        : [{
          product_tier: "base",
          status: "active",
          current_period_end: PERIOD_END,
        }];
      return Promise.resolve(jsonResponse(body));
    }
    if (table === "tenant_complimentary_access_grants") {
      const body = Object.prototype.hasOwnProperty.call(
        rows,
        "tenant_complimentary_access_grants",
      )
        ? rows.tenant_complimentary_access_grants
        : { product_tier: "pro" };
      return Promise.resolve(jsonResponse(body));
    }

    return Promise.resolve(jsonResponse({
      code: "PGRST205",
      message: `unknown table ${table}`,
    }, 404));
  };

  const client = createClient(SYNTHETIC_URL, SYNTHETIC_KEY, {
    global: { fetch: fetchStub },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return { client, requests };
}

Deno.test("1. adapter construction does not fetch, query, or hit auth", () => {
  const { client, requests } = createHarness();
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);

  assertEquals(requests.length, 0, "construction must not fetch");
  assert(
    persistenceClients.accessModeClient !== undefined &&
      persistenceClients.stripeClient !== undefined &&
      persistenceClients.complimentaryClient !== undefined,
    "ports exist after construction",
  );
});

Deno.test("2–3. output is exactly the three persistence ports; no modeProfiles", () => {
  const { client } = createHarness();
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);

  assertEquals(
    Object.keys(persistenceClients).sort(),
    ["accessModeClient", "complimentaryClient", "stripeClient"].sort(),
    "exactly the three persistence slots",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(persistenceClients, "modeProfiles"),
    "must not include modeProfiles",
  );
});

Deno.test("4–7. adapters are assignable to the three lookup interfaces and B95 deps", () => {
  const { client } = createHarness();
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);

  const accessModeClient: TenantAccessModeLookupClient =
    persistenceClients.accessModeClient;
  const stripeClient: TenantStripeSubscriptionObservationLookupClient =
    persistenceClients.stripeClient;
  const complimentaryClient: ComplimentaryAccessGrantLookupClient =
    persistenceClients.complimentaryClient;

  const dependencies: CreateEffectiveAccessResolverDependencies = {
    ...persistenceClients,
    modeProfiles: SYNTHETIC_PROFILES,
  };

  assert(accessModeClient === persistenceClients.accessModeClient, "AM slot");
  assert(stripeClient === persistenceClients.stripeClient, "Stripe slot");
  assert(
    complimentaryClient === persistenceClients.complimentaryClient,
    "complimentary slot",
  );
  assert(
    dependencies.accessModeClient === persistenceClients.accessModeClient &&
      dependencies.stripeClient === persistenceClients.stripeClient &&
      dependencies.complimentaryClient ===
        persistenceClients.complimentaryClient &&
      dependencies.modeProfiles === SYNTHETIC_PROFILES,
    "B95 dependencies compile from adapter output + synthetic profiles",
  );
});

Deno.test("8+11–13+15–16. AccessMode reader through adapter: table, select, id, maybeSingle, data", async () => {
  const { client, requests } = createHarness({
    tenants: { plan_code: "paid", is_demo: false },
  });
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);

  const afterEq = persistenceClients.accessModeClient
    .from("tenants")
    .select("plan_code,is_demo")
    .eq("id", TENANT_A);
  assert(
    typeof afterEq.maybeSingle === "function",
    "AccessMode adapter exposes maybeSingle",
  );
  assertEquals(requests.length, 0, "chain before maybeSingle must not query");

  const result = await readTenantAccessMode({
    tenantId: TENANT_B,
    client: persistenceClients.accessModeClient,
  });

  assert(result.ok === true, `AccessMode reader expected success, got ${JSON.stringify(result)}`);
  assertEquals(result.mode, "standard", "paid + is_demo false → standard");
  assertEquals(requests.length, 1, "exactly one query; no retry");
  assertEquals(requests[0]?.table, "tenants", "table forwarded");
  assertEquals(requests[0]?.select, "plan_code,is_demo", "select forwarded");
  assertEquals(
    requests[0]?.filters,
    [{ column: "id", value: TENANT_B }],
    "tenants.id forwarded unchanged",
  );
  assert(
    requests[0]?.url.includes("/rest/v1/tenants"),
    "PostgREST tenants path",
  );
});

Deno.test("9+11–14+16. Stripe reader through adapter: table, select, tenant_id, provider", async () => {
  const { client, requests } = createHarness({
    tenant_subscriptions: [{
      product_tier: "pro",
      status: "active",
      current_period_end: PERIOD_END,
    }],
  });
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);

  const afterFirstEq = persistenceClients.stripeClient
    .from("tenant_subscriptions")
    .select("product_tier,status,current_period_end")
    .eq("tenant_id", TENANT_A);
  assert(
    typeof afterFirstEq.eq === "function",
    "Stripe adapter second eq is the terminal",
  );
  assert(
    !("maybeSingle" in afterFirstEq),
    "Stripe adapter must not expose maybeSingle after the first eq",
  );
  assertEquals(requests.length, 0, "first eq must not query");

  const result = await readTenantStripeSubscriptionObservations({
    tenantId: TENANT_B,
    client: persistenceClients.stripeClient,
  });

  assert(result.ok === true, `Stripe reader expected success, got ${JSON.stringify(result)}`);
  assertEquals(result.observations.length, 1, "one observation");
  assertEquals(result.observations[0]?.productTier, "pro", "pro preserved");
  assertEquals(result.observations[0]?.status, "active", "status preserved");
  assertEquals(
    result.observations[0]?.currentPeriodEnd,
    PERIOD_END,
    "period end preserved",
  );
  assertEquals(requests.length, 1, "exactly one query; no retry");
  assertEquals(
    requests[0]?.table,
    "tenant_subscriptions",
    "table forwarded",
  );
  assertEquals(
    requests[0]?.select,
    "product_tier,status,current_period_end",
    "select forwarded",
  );
  assertEquals(
    requests[0]?.filters,
    [
      { column: "tenant_id", value: TENANT_B },
      { column: "provider", value: "stripe" },
    ],
    "tenant_id and provider=stripe forwarded",
  );
});

Deno.test("10+11–13+15–16. complimentary reader through adapter: table, select, tenant_id, maybeSingle", async () => {
  const { client, requests } = createHarness({
    tenant_complimentary_access_grants: { product_tier: "base" },
  });
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);

  const afterEq = persistenceClients.complimentaryClient
    .from("tenant_complimentary_access_grants")
    .select("product_tier")
    .eq("tenant_id", TENANT_A);
  assert(
    typeof afterEq.maybeSingle === "function",
    "complimentary adapter exposes maybeSingle",
  );
  assertEquals(requests.length, 0, "chain before maybeSingle must not query");

  const result = await readTenantComplimentaryAccessCandidate({
    tenantId: TENANT_B,
    client: persistenceClients.complimentaryClient,
  });

  assert(result.ok === true, `complimentary reader expected success, got ${JSON.stringify(result)}`);
  assertEquals(
    result.candidate,
    { kind: "valid", tier: "base", expiresAt: null },
    "Base candidate preserved",
  );
  assertEquals(requests.length, 1, "exactly one query; no retry");
  assertEquals(
    requests[0]?.table,
    "tenant_complimentary_access_grants",
    "table forwarded",
  );
  assertEquals(requests[0]?.select, "product_tier", "select forwarded");
  assertEquals(
    requests[0]?.filters,
    [{ column: "tenant_id", value: TENANT_B }],
    "tenant_id forwarded unchanged",
  );
});

Deno.test("16. success envelope is forwarded without reinterpretation", async () => {
  const extraRow = {
    plan_code: "trial",
    is_demo: false,
    extra_field: "keep-me",
  };
  const { client, requests } = createHarness({ tenants: extraRow });
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);

  const result = await persistenceClients.accessModeClient
    .from("tenants")
    .select("plan_code,is_demo")
    .eq("id", TENANT_A)
    .maybeSingle();

  assertEquals(requests.length, 1, "one query");
  assertEquals(result.error, null, "error is null on success");
  assertEquals(result.data, extraRow, "data forwarded including extra fields");
});

Deno.test("17+18. error envelope is forwarded; no retry", async () => {
  const { client, requests } = createHarness({}, {
    tenants: {
      code: "57014",
      message: "canceling statement due to statement timeout RAW_DB_DETAIL",
    },
  });
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);

  const result = await persistenceClients.accessModeClient
    .from("tenants")
    .select("plan_code,is_demo")
    .eq("id", TENANT_A)
    .maybeSingle();

  assertEquals(requests.length, 1, "error path must not retry");
  assert(result.error !== null, "error slot populated");
  assertEquals(result.error.code, "57014", "error code forwarded");
  assertEquals(
    result.error.message,
    "canceling statement due to statement timeout RAW_DB_DETAIL",
    "error message forwarded unsanitized",
  );
  assertEquals(result.data, null, "failed lookup data is null");

  const readerResult = await readTenantAccessMode({
    tenantId: TENANT_A,
    client: persistenceClients.accessModeClient,
  });
  assert(readerResult.ok === false, "reader fail-closed");
  assertEquals(
    readerResult.reason,
    "tenant_lookup_failed",
    "reader classifies forwarded error",
  );
  assertEquals(requests.length, 2, "second call is a new lookup, not a retry");
});

Deno.test("19. no query during adapter construction; ports query independently", async () => {
  const { client, requests } = createHarness();
  const persistenceClients =
    adaptSupabaseClientToEffectiveAccessPersistenceClients(client);
  assertEquals(requests.length, 0, "zero queries at construction");

  await persistenceClients.accessModeClient
    .from("tenants")
    .select("plan_code,is_demo")
    .eq("id", TENANT_A)
    .maybeSingle();
  assertEquals(requests.length, 1, "AccessMode terminal queries once");

  await persistenceClients.stripeClient
    .from("tenant_subscriptions")
    .select("product_tier,status,current_period_end")
    .eq("tenant_id", TENANT_A)
    .eq("provider", "stripe");
  assertEquals(requests.length, 2, "Stripe terminal queries once");

  await persistenceClients.complimentaryClient
    .from("tenant_complimentary_access_grants")
    .select("product_tier")
    .eq("tenant_id", TENANT_A)
    .maybeSingle();
  assertEquals(requests.length, 3, "complimentary terminal queries once");
});

Deno.test("20. production adapter has no auth, env, privilege, or top-level HTTP", () => {
  const { client } = createHarness();
  const source = adaptSupabaseClientToEffectiveAccessPersistenceClients
    .toString();
  const forbidden = [
    "as any",
    "as unknown as",
    "@ts-ignore",
    "@ts-expect-error",
    "Deno.env",
    "Deno.serve",
    "createClient(",
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
    "createUserScopedClient",
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "authorizeTenantEffectiveAccess",
    "handleEffectiveAccessRequest",
    "modeProfiles",
    "console.log",
    "console.error",
    "console.warn",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `adapter must not contain ${token}`);
  }
  assert(source.includes("adaptAccessModeClient"), "delegates AccessMode");
  assert(source.includes("adaptStripeClient"), "delegates Stripe");
  assert(source.includes("adaptComplimentaryClient"), "delegates complimentary");
  void client;
});
