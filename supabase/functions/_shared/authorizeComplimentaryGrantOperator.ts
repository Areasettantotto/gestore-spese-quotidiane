/**
 * Product-level authorization for complimentary grant operators.
 *
 * Pure / dependency-light: decides whether an authenticated caller UUID
 * is present on a caller-supplied operator allowlist. Does not read JWT,
 * Deno.env, tenant memberships, Stripe, or the complimentary grant table.
 * Does not construct a Supabase client or persist grants.
 *
 * The future HTTP handler injects:
 *   1. callerUserId from the authenticated Auth user
 *   2. the raw server-side allowlist string
 *
 * Canonical server-side env name (not read here):
 *   COMPLIMENTARY_GRANT_OPERATOR_USER_IDS
 */

/**
 * Canonical env name for the complimentary grant operator allowlist.
 * Value is the name string only. Callers read the env; this module does not.
 */
export const COMPLIMENTARY_GRANT_OPERATOR_USER_IDS =
  "COMPLIMENTARY_GRANT_OPERATOR_USER_IDS";

const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthorizeComplimentaryGrantOperatorParams = {
  callerUserId: unknown;
  configuredOperatorUserIds: unknown;
};

export type AuthorizeComplimentaryGrantOperatorFailureReason =
  | "invalid_caller_user_id"
  | "authority_unconfigured"
  | "authority_invalid_config"
  | "forbidden";

export type AuthorizeComplimentaryGrantOperatorResult =
  | { ok: true }
  | { ok: false; reason: AuthorizeComplimentaryGrantOperatorFailureReason };

type ParsedAllowlist =
  | { ok: true; ids: Set<string> }
  | {
    ok: false;
    reason: Extract<
      AuthorizeComplimentaryGrantOperatorFailureReason,
      "authority_unconfigured" | "authority_invalid_config"
    >;
  };

function fail(
  reason: AuthorizeComplimentaryGrantOperatorFailureReason,
): AuthorizeComplimentaryGrantOperatorResult {
  return { ok: false, reason };
}

function succeed(): AuthorizeComplimentaryGrantOperatorResult {
  return { ok: true };
}

/**
 * Exact-identity UUID validation. Accepts only a syntactically valid
 * UUID string. Does not trim, lower-case, or rewrite the caller identity.
 */
function isValidCallerUserId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4ISH_REGEX.test(value);
}

/**
 * Parse the injected CSV allowlist. Token trim is allowed. Any empty or
 * syntactically invalid token fails the entire config — no partial list.
 */
function parseOperatorAllowlist(raw: unknown): ParsedAllowlist {
  if (raw === undefined || raw === null) {
    return { ok: false, reason: "authority_unconfigured" };
  }
  if (typeof raw !== "string") {
    return { ok: false, reason: "authority_invalid_config" };
  }
  if (raw.trim().length === 0) {
    return { ok: false, reason: "authority_unconfigured" };
  }

  const ids = new Set<string>();
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (trimmed.length === 0 || !UUID_V4ISH_REGEX.test(trimmed)) {
      return { ok: false, reason: "authority_invalid_config" };
    }
    ids.add(trimmed.toLowerCase());
  }

  return { ok: true, ids };
}

/**
 * Authorize a caller UUID against the complimentary grant operator allowlist.
 * Fail-closed. Comparison is case-insensitive on hex characters only.
 */
export function authorizeComplimentaryGrantOperator(
  params: AuthorizeComplimentaryGrantOperatorParams,
): AuthorizeComplimentaryGrantOperatorResult {
  if (!isValidCallerUserId(params.callerUserId)) {
    return fail("invalid_caller_user_id");
  }

  const allowlist = parseOperatorAllowlist(params.configuredOperatorUserIds);
  if (allowlist.ok === false) {
    return fail(allowlist.reason);
  }

  if (!allowlist.ids.has(params.callerUserId.toLowerCase())) {
    return fail("forbidden");
  }

  return succeed();
}
