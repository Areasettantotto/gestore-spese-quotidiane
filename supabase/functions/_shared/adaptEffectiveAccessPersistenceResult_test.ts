/**
 * Deno tests for adaptEffectiveAccessPersistenceResult (BILLING-92).
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/adaptEffectiveAccessPersistenceResult_test.ts
 *
 * No network/env/read/write capabilities required.
 */

import { adaptEffectiveAccessPersistenceResult } from "./adaptEffectiveAccessPersistenceResult.ts";
import type { Capability, EffectiveAccess } from "./resolveEffectiveAccess.ts";
import type {
  ResolveTenantEffectiveAccessFromPersistenceFailureReason,
  ResolveTenantEffectiveAccessFromPersistenceResult,
} from "./resolveTenantEffectiveAccessFromPersistence.ts";

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

/** Synthetic UUID — not a real tenant ID from production. */
const TENANT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1";
const RAW_DB_SECRET = "RAW_DB_SECRET_ALPHA";
const FAKE_SECRET = "sk_test_fake_secret";

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

const STANDARD_STRIPE_PRO: EffectiveAccess = {
  status: "granted",
  mode: "standard",
  tier: "pro",
  source: "stripe",
  expiresAt: null,
  capabilities: PRO_CAPABILITIES,
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

const OPAQUE_FAILURE_REASONS: readonly Exclude<
  ResolveTenantEffectiveAccessFromPersistenceFailureReason,
  "invalid_tenant_id"
>[] = [
  "tenant_not_found",
  "tenant_lookup_failed",
  "invalid_tenant_access_mode",
  "stripe_subscription_lookup_failed",
  "stripe_subscription_observation_invalid",
  "complimentary_access_grant_lookup_failed",
  "complimentary_access_grant_invalid",
];

const LEAK_TOKENS = [
  "tenant_not_found",
  "tenant_lookup_failed",
  "invalid_tenant_access_mode",
  "stripe_subscription_lookup_failed",
  "stripe_subscription_observation_invalid",
  "complimentary_access_grant_lookup_failed",
  "complimentary_access_grant_invalid",
  "invalid_tenant_id",
  "stripe",
  "complimentary",
  "plan_code",
  "SQLSTATE",
  "57014",
  TENANT_A,
  RAW_DB_SECRET,
  FAKE_SECRET,
] as const;

const LEAKY_EXTRAS = {
  tenantId: TENANT_A,
  error: {
    message: `SQLSTATE 57014 ${RAW_DB_SECRET}`,
    code: "57014",
  },
  plan_code: "paid",
  stripe: FAKE_SECRET,
  complimentary: "RAW_COMPLIMENTARY",
};

function successResult(
  effectiveAccess: EffectiveAccess,
): ResolveTenantEffectiveAccessFromPersistenceResult {
  return { ok: true, effectiveAccess };
}

function failureResult(
  reason: ResolveTenantEffectiveAccessFromPersistenceFailureReason,
): ResolveTenantEffectiveAccessFromPersistenceResult {
  return { ok: false, reason };
}

function asResult(
  value: unknown,
): ResolveTenantEffectiveAccessFromPersistenceResult {
  return value as ResolveTenantEffectiveAccessFromPersistenceResult;
}

function adaptWithoutThrow(
  result: ResolveTenantEffectiveAccessFromPersistenceResult,
): EffectiveAccess | Response {
  try {
    return adaptEffectiveAccessPersistenceResult(result);
  } catch (err) {
    throw new Error(
      `adapter must not throw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function readBody(response: Response): Promise<unknown> {
  return JSON.parse(await response.text());
}

function assertNoLeak(serialized: string, messagePrefix: string): void {
  const lowered = serialized.toLowerCase();
  for (const token of LEAK_TOKENS) {
    assert(
      !lowered.includes(token.toLowerCase()),
      `${messagePrefix} must not leak ${token}`,
    );
  }
}

function expectDomainSuccess(
  adapted: EffectiveAccess | Response,
  expected: EffectiveAccess,
  messagePrefix: string,
): asserts adapted is EffectiveAccess {
  assert(
    !(adapted instanceof Response),
    `${messagePrefix} must not be a Response`,
  );
  assert(adapted === expected, `${messagePrefix} same EffectiveAccess object`);
  assertEquals(adapted.status, expected.status, `${messagePrefix} status`);
  assertEquals(adapted.mode, expected.mode, `${messagePrefix} mode`);
  assertEquals(adapted.tier, expected.tier, `${messagePrefix} tier`);
  assertEquals(adapted.source, expected.source, `${messagePrefix} source`);
  assertEquals(
    adapted.expiresAt,
    expected.expiresAt,
    `${messagePrefix} expiresAt`,
  );
  assertEquals(
    adapted.capabilities,
    expected.capabilities,
    `${messagePrefix} capabilities`,
  );
  assert(
    adapted.capabilities === expected.capabilities,
    `${messagePrefix} capabilities same reference`,
  );
}

async function expectUnprocessable(
  adapted: EffectiveAccess | Response,
  messagePrefix: string,
): Promise<void> {
  assert(adapted instanceof Response, `${messagePrefix} expected Response`);
  assertEquals(adapted.status, 422, `${messagePrefix} status 422`);
  const body = await readBody(adapted);
  assertEquals(
    body,
    {
      error: {
        code: "UNPROCESSABLE_ENTITY",
        message: "Invalid tenant identifier.",
      },
    },
    `${messagePrefix} Pattern-A envelope`,
  );
  assertNoLeak(JSON.stringify(body), messagePrefix);
}

async function expectInternalError(
  adapted: EffectiveAccess | Response,
  messagePrefix: string,
): Promise<void> {
  assert(adapted instanceof Response, `${messagePrefix} expected Response`);
  assertEquals(adapted.status, 500, `${messagePrefix} status 500`);
  assert(
    adapted.status !== 404 &&
      adapted.status !== 403 &&
      adapted.status !== 502 &&
      adapted.status !== 503,
    `${messagePrefix} must not use 403/404/502/503`,
  );
  const body = await readBody(adapted);
  assertEquals(
    body,
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error.",
      },
    },
    `${messagePrefix} Pattern-A envelope`,
  );
  assertNoLeak(JSON.stringify(body), messagePrefix);
}

Deno.test("A. granted standard Base → same EffectiveAccess, not Response", () => {
  const adapted = adaptWithoutThrow(successResult(STANDARD_STRIPE_BASE));
  expectDomainSuccess(adapted, STANDARD_STRIPE_BASE, "A. Base");
});

Deno.test("B. granted standard Pro → same EffectiveAccess, not Response", () => {
  const adapted = adaptWithoutThrow(successResult(STANDARD_STRIPE_PRO));
  expectDomainSuccess(adapted, STANDARD_STRIPE_PRO, "B. Pro");
});

Deno.test("C. granted complimentary → source preserved, not Response", () => {
  const adapted = adaptWithoutThrow(successResult(STANDARD_COMPLIMENTARY_PRO));
  expectDomainSuccess(adapted, STANDARD_COMPLIMENTARY_PRO, "C. complimentary");
  assertEquals(adapted.source, "complimentary", "C. source preserved");
});

Deno.test("D. Demo → same EffectiveAccess, not Response", () => {
  const adapted = adaptWithoutThrow(successResult(DEMO_GRANTED));
  expectDomainSuccess(adapted, DEMO_GRANTED, "D. Demo");
});

Deno.test("E. Internal → same EffectiveAccess, not Response", () => {
  const adapted = adaptWithoutThrow(successResult(INTERNAL_GRANTED));
  expectDomainSuccess(adapted, INTERNAL_GRANTED, "E. Internal");
});

Deno.test("F. unentitled → same EffectiveAccess, not Response", () => {
  const adapted = adaptWithoutThrow(successResult(UNENTITLED));
  expectDomainSuccess(adapted, UNENTITLED, "F. unentitled");
});

Deno.test("G. invalid domain → same EffectiveAccess, not Response", () => {
  const adapted = adaptWithoutThrow(successResult(INVALID));
  expectDomainSuccess(adapted, INVALID, "G. invalid");
});

Deno.test("H. invalid_tenant_id → 422 UNPROCESSABLE_ENTITY transport-neutral", async () => {
  const adapted = adaptWithoutThrow(
    asResult({
      ok: false,
      reason: "invalid_tenant_id",
      ...LEAKY_EXTRAS,
    }),
  );
  await expectUnprocessable(adapted, "H. invalid_tenant_id");
});

Deno.test("I–O. other known failures → internalError() default, no leak", async () => {
  assertEquals(
    OPAQUE_FAILURE_REASONS.length,
    7,
    "exactly the 7 opaque reasons",
  );

  for (const reason of OPAQUE_FAILURE_REASONS) {
    const adapted = adaptWithoutThrow(
      asResult({
        ok: false,
        reason,
        ...LEAKY_EXTRAS,
      }),
    );
    await expectInternalError(adapted, `I–O. ${reason}`);
  }
});

Deno.test("I–O. tenant_not_found is opaque internalError, not 404", async () => {
  const adapted = adaptWithoutThrow(failureResult("tenant_not_found"));
  await expectInternalError(adapted, "tenant_not_found");
  assert(
    adapted instanceof Response && adapted.status === 500,
    "tenant_not_found must not become a distinct public status",
  );
});

Deno.test("P. unknown failure reason via cast → 500 INTERNAL_ERROR", async () => {
  const adapted = adaptWithoutThrow(
    asResult({
      ok: false,
      reason: "unknown_reason",
      ...LEAKY_EXTRAS,
    }),
  );
  await expectInternalError(adapted, "P. unknown reason");
});

Deno.test("Q. { ok: false } without reason → 500 INTERNAL_ERROR", async () => {
  const adapted = adaptWithoutThrow(asResult({ ok: false, ...LEAKY_EXTRAS }));
  await expectInternalError(adapted, "Q. ok false missing reason");
});

Deno.test("R. malformed discriminator → 500 INTERNAL_ERROR", async () => {
  const cases: unknown[] = [
    { ok: "true" },
    { ok: "false", reason: "invalid_tenant_id" },
    { ok: 1, effectiveAccess: STANDARD_STRIPE_BASE },
    { ok: 0, reason: "tenant_not_found" },
  ];
  for (const input of cases) {
    const adapted = adaptWithoutThrow(asResult(input));
    await expectInternalError(
      adapted,
      `R. malformed discriminator ${JSON.stringify(input)}`,
    );
  }
});

Deno.test("S. null/invalid runtime → 500 INTERNAL_ERROR", async () => {
  const cases: unknown[] = [
    null,
    undefined,
    "success",
    42,
    true,
    [],
    {},
    { effectiveAccess: STANDARD_STRIPE_BASE },
  ];
  for (const input of cases) {
    const adapted = adaptWithoutThrow(asResult(input));
    await expectInternalError(adapted, `S. ${String(input)}`);
  }
});

Deno.test("T. malformed success {ok:true} is not silent success", async () => {
  const missingAccess = adaptWithoutThrow(asResult({ ok: true }));
  await expectInternalError(missingAccess, "T. {ok:true}");

  const nullAccess = adaptWithoutThrow(
    asResult({ ok: true, effectiveAccess: null }),
  );
  await expectInternalError(nullAccess, "T. effectiveAccess null");

  const primitiveAccess = adaptWithoutThrow(
    asResult({ ok: true, effectiveAccess: "granted" }),
  );
  await expectInternalError(primitiveAccess, "T. effectiveAccess string");

  const arrayAccess = adaptWithoutThrow(
    asResult({ ok: true, effectiveAccess: [] }),
  );
  await expectInternalError(arrayAccess, "T. effectiveAccess array");
});

Deno.test("opaque failures never throw", () => {
  const inputs: unknown[] = [
    failureResult("invalid_tenant_id"),
    ...OPAQUE_FAILURE_REASONS.map((reason) => failureResult(reason)),
    { ok: false, reason: "unknown_reason" },
    { ok: false },
    { ok: "true" },
    null,
    undefined,
    {},
    { ok: true },
  ];
  for (const input of inputs) {
    const adapted = adaptWithoutThrow(asResult(input));
    assert(
      adapted instanceof Response || (typeof adapted === "object" && adapted !== null),
      "must return EffectiveAccess or Response",
    );
  }
});

Deno.test("production adapter has no persistence, HTTP orchestration, auth, or leak paths", () => {
  const source = adaptEffectiveAccessPersistenceResult.toString();
  const forbidden = [
    "Deno.env",
    "createClient",
    "service_role",
    "Stripe",
    "tenant_memberships",
    "ensureTenantMembership",
    "ensureTenantBillingAccess",
    "Deno.serve",
    "JSON.stringify",
    "console.log",
    "serializeEffectiveAccess",
    "resolveTenantEffectiveAccessFromPersistence(",
    "ModeCapabilityProfiles",
    "capabilitiesForTier",
  ];
  for (const token of forbidden) {
    assert(!source.includes(token), `adapter must not contain ${token}`);
  }
  assert(
    source.includes("internalError()"),
    "opaque failures must call internalError() with no arguments",
  );
  assert(
    !source.includes("internalError(value") &&
      !source.includes("internalError(reason") &&
      !source.includes("internalError(result"),
    "must not pass persistence details to internalError",
  );
});
