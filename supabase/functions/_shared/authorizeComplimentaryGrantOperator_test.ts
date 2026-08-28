/**
 * Deno tests for authorizeComplimentaryGrantOperator.
 *
 * Run:
 *   deno test --no-lock \
 *     supabase/functions/_shared/authorizeComplimentaryGrantOperator_test.ts
 *
 * No network/env/read/write capabilities required.
 * Operator UUIDs are synthetic fixtures — not real Auth user ids.
 */

import {
  authorizeComplimentaryGrantOperator,
  COMPLIMENTARY_GRANT_OPERATOR_USER_IDS,
  type AuthorizeComplimentaryGrantOperatorFailureReason,
  type AuthorizeComplimentaryGrantOperatorParams,
  type AuthorizeComplimentaryGrantOperatorResult,
} from "./authorizeComplimentaryGrantOperator.ts";

declare const Deno: {
  test: (name: string, fn: () => void) => void;
};

const OPERATOR_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea1";
const OPERATOR_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea2";
const OPERATOR_C = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea3";
const STRANGER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeaf";
const OPERATOR_A_UPPER = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEA1";

const SYNTHETIC_EMAIL = "operator@example.test";

function assert(condition: boolean, message: string): void {
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

function expectSuccess(
  result: AuthorizeComplimentaryGrantOperatorResult,
): asserts result is Extract<
  AuthorizeComplimentaryGrantOperatorResult,
  { ok: true }
> {
  if (result.ok !== true) {
    throw new Error(
      `expected success, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(
    Object.keys(result).sort(),
    ["ok"].sort(),
    "public success contract exposes only ok",
  );
}

function expectFailure(
  result: AuthorizeComplimentaryGrantOperatorResult,
  reason: AuthorizeComplimentaryGrantOperatorFailureReason,
): void {
  if (result.ok !== false) {
    throw new Error(
      `expected failure ${reason}, got ${JSON.stringify(result)}`,
    );
  }
  assertEquals(result.reason, reason, "failure reason");
  assertEquals(
    Object.keys(result).sort(),
    ["ok", "reason"].sort(),
    "public failure contract exposes only ok+reason",
  );
}

function authorize(
  params: AuthorizeComplimentaryGrantOperatorParams,
): AuthorizeComplimentaryGrantOperatorResult {
  return authorizeComplimentaryGrantOperator(params);
}

function assertNoSensitiveLeak(
  result: AuthorizeComplimentaryGrantOperatorResult,
  rawAllowlist: unknown,
): void {
  const serialized = JSON.stringify(result);
  if (typeof rawAllowlist === "string" && rawAllowlist.length > 0) {
    assert(
      !serialized.includes(rawAllowlist),
      "failure must not expose the raw allowlist",
    );
  }
  assert(
    !serialized.includes(SYNTHETIC_EMAIL),
    "failure must not expose email tokens",
  );
  assert(
    !serialized.includes("tenant_memberships"),
    "failure must not mention tenant_memberships",
  );
  assert(
    !serialized.includes("service_role"),
    "failure must not mention service_role",
  );
}

Deno.test("1. single allowlisted caller → authorized", () => {
  const result = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: OPERATOR_A,
  });
  expectSuccess(result);
});

Deno.test("2. caller allowlisted among several operators → authorized", () => {
  const result = authorize({
    callerUserId: OPERATOR_B,
    configuredOperatorUserIds: `${OPERATOR_A},${OPERATOR_B},${OPERATOR_C}`,
  });
  expectSuccess(result);
});

Deno.test("3. valid caller absent from allowlist → forbidden", () => {
  const raw = `${OPERATOR_A},${OPERATOR_B}`;
  const result = authorize({
    callerUserId: STRANGER,
    configuredOperatorUserIds: raw,
  });
  expectFailure(result, "forbidden");
  assertNoSensitiveLeak(result, raw);
});

Deno.test("4. config undefined → authority_unconfigured", () => {
  const result = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: undefined,
  });
  expectFailure(result, "authority_unconfigured");
  assertNoSensitiveLeak(result, undefined);
});

Deno.test("5. config null → authority_unconfigured", () => {
  const result = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: null,
  });
  expectFailure(result, "authority_unconfigured");
  assertNoSensitiveLeak(result, null);
});

Deno.test("5b. config non-string → authority_invalid_config", () => {
  for (const invalid of [1, true, { ids: OPERATOR_A }, [OPERATOR_A]]) {
    const result = authorize({
      callerUserId: OPERATOR_A,
      configuredOperatorUserIds: invalid,
    });
    expectFailure(result, "authority_invalid_config");
    assertNoSensitiveLeak(result, invalid);
  }
});

Deno.test("6. config empty / whitespace → authority_unconfigured", () => {
  for (const blank of ["", " ", "   ", "\t", "\n", " \t\n "]) {
    const result = authorize({
      callerUserId: OPERATOR_A,
      configuredOperatorUserIds: blank,
    });
    expectFailure(result, "authority_unconfigured");
    assertNoSensitiveLeak(result, blank);
  }
});

Deno.test("7. invalid caller → invalid_caller_user_id", () => {
  const validConfig = `${OPERATOR_A},${OPERATOR_B}`;
  for (
    const invalid of [
      null,
      undefined,
      "",
      " ",
      "   ",
      "not-a-uuid",
      "caller-a",
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeea",
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeaZ",
      "aaaaaaaa-bbbb-0ccc-8ddd-eeeeeeeeeea1",
      ` ${OPERATOR_A} `,
      `\t${OPERATOR_A}`,
      `${OPERATOR_A} `,
      ` ${OPERATOR_A}`,
      1,
      true,
      {},
      [],
    ]
  ) {
    const result = authorize({
      callerUserId: invalid,
      configuredOperatorUserIds: validConfig,
    });
    expectFailure(result, "invalid_caller_user_id");
    assertNoSensitiveLeak(result, validConfig);
  }
});

Deno.test(
  "8. one invalid UUID among valid tokens → entire config fail-closed",
  () => {
    const raw = `${OPERATOR_A},not-a-uuid,${OPERATOR_B}`;
    const matching = authorize({
      callerUserId: OPERATOR_A,
      configuredOperatorUserIds: raw,
    });
    expectFailure(matching, "authority_invalid_config");
    assertNoSensitiveLeak(matching, raw);

    const other = authorize({
      callerUserId: OPERATOR_B,
      configuredOperatorUserIds: raw,
    });
    expectFailure(other, "authority_invalid_config");
  },
);

Deno.test("9. config with email → authority_invalid_config", () => {
  const raw = `${OPERATOR_A},${SYNTHETIC_EMAIL}`;
  const result = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: raw,
  });
  expectFailure(result, "authority_invalid_config");
  assertNoSensitiveLeak(result, raw);

  const emailOnly = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: SYNTHETIC_EMAIL,
  });
  expectFailure(emailOnly, "authority_invalid_config");
  assertNoSensitiveLeak(emailOnly, SYNTHETIC_EMAIL);
});

Deno.test("10. config with wildcard → authority_invalid_config", () => {
  for (
    const raw of [
      "*",
      `${OPERATOR_A},*`,
      `*,${OPERATOR_A}`,
      `${OPERATOR_A},*,${OPERATOR_B}`,
    ]
  ) {
    const result = authorize({
      callerUserId: OPERATOR_A,
      configuredOperatorUserIds: raw,
    });
    expectFailure(result, "authority_invalid_config");
    assertNoSensitiveLeak(result, raw);
  }
});

Deno.test("11. duplicate authorized UUID is deterministic", () => {
  const raw = `${OPERATOR_A},${OPERATOR_A}`;
  const first = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: raw,
  });
  const second = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: `${OPERATOR_A}, ${OPERATOR_A}`,
  });
  expectSuccess(first);
  expectSuccess(second);
  assertEquals(first, second, "duplicate tokens yield the same success");

  const stranger = authorize({
    callerUserId: STRANGER,
    configuredOperatorUserIds: raw,
  });
  expectFailure(stranger, "forbidden");
});

Deno.test("12. whitespace between CSV tokens is trimmed", () => {
  const result = authorize({
    callerUserId: OPERATOR_B,
    configuredOperatorUserIds: ` ${OPERATOR_A} , ${OPERATOR_B} , ${OPERATOR_C} `,
  });
  expectSuccess(result);
});

Deno.test("13. uppercase/lowercase UUID comparison is equivalent", () => {
  const lowerConfig = authorize({
    callerUserId: OPERATOR_A_UPPER,
    configuredOperatorUserIds: OPERATOR_A,
  });
  expectSuccess(lowerConfig);

  const upperConfig = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: OPERATOR_A_UPPER,
  });
  expectSuccess(upperConfig);

  const mixedList = authorize({
    callerUserId: OPERATOR_A_UPPER,
    configuredOperatorUserIds: `${OPERATOR_A_UPPER},${OPERATOR_B}`,
  });
  expectSuccess(mixedList);
});

Deno.test("14. failure result does not expose the raw allowlist", () => {
  const distinctive =
    `${OPERATOR_A},${OPERATOR_B},aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee99`;
  const result = authorize({
    callerUserId: STRANGER,
    configuredOperatorUserIds: distinctive,
  });
  expectFailure(result, "forbidden");
  assertNoSensitiveLeak(result, distinctive);
  const serialized = JSON.stringify(result);
  assert(!serialized.includes(OPERATOR_A), "must not echo operator A");
  assert(!serialized.includes(OPERATOR_B), "must not echo operator B");
  assert(!serialized.includes(STRANGER), "must not echo the caller UUID");
});

Deno.test("15. helper is sync and does not perform DB/API/env reads", () => {
  const result = authorize({
    callerUserId: OPERATOR_A,
    configuredOperatorUserIds: OPERATOR_A,
  });
  expectSuccess(result);
  assert(
    !(result instanceof Promise),
    "helper must not return a Promise",
  );

  const body = authorizeComplimentaryGrantOperator.toString();
  for (
    const forbidden of [
      "Deno.env",
      "Deno.env.get",
      "createClient",
      "ensureTenantBillingAccess",
      "getAuthenticatedUser",
      "persistTenantComplimentaryAccessGrant",
      "tenant_memberships",
      "service_role",
      "Stripe",
    ]
  ) {
    assert(
      !body.includes(forbidden),
      `helper body must not reference ${forbidden}`,
    );
  }
});

Deno.test("16. tenant admin/billing are not part of the contract", () => {
  const reasons: readonly AuthorizeComplimentaryGrantOperatorFailureReason[] = [
    "invalid_caller_user_id",
    "authority_unconfigured",
    "authority_invalid_config",
    "forbidden",
  ];
  const serializedReasons = reasons.join(",");
  assert(
    !serializedReasons.includes("admin"),
    "failure reasons must not include tenant admin",
  );
  assert(
    !serializedReasons.includes("billing"),
    "failure reasons must not include tenant billing",
  );

  const result = authorize({
    callerUserId: STRANGER,
    configuredOperatorUserIds: OPERATOR_A,
  });
  expectFailure(result, "forbidden");
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("admin"), "result must not mention admin");
  assert(!serialized.includes("billing"), "result must not mention billing");
  assert(
    !serialized.includes("tenant_memberships"),
    "result must not mention tenant_memberships",
  );
  assertEquals(
    COMPLIMENTARY_GRANT_OPERATOR_USER_IDS,
    "COMPLIMENTARY_GRANT_OPERATOR_USER_IDS",
    "canonical env name is the name string only",
  );
});

Deno.test("17. invalid config has no authorization fallback", () => {
  const cases: unknown[] = [
    `${OPERATOR_A},`,
    `,${OPERATOR_A}`,
    `${OPERATOR_A},,${OPERATOR_B}`,
    `${OPERATOR_A},not-a-uuid`,
    `${OPERATOR_A},${SYNTHETIC_EMAIL}`,
    `${OPERATOR_A},*`,
    "*",
    SYNTHETIC_EMAIL,
    0,
    false,
  ];
  for (const raw of cases) {
    const result = authorize({
      callerUserId: OPERATOR_A,
      configuredOperatorUserIds: raw,
    });
    expectFailure(result, "authority_invalid_config");
    assertNoSensitiveLeak(result, raw);
  }
});
