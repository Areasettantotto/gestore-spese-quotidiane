/**
 * Revoke an unused complimentary access invite (pre-use only).
 *
 * Composes caller identity, product-level operator authority, tenant and
 * invite identity validation, and one conditional UPDATE on
 * tenant_complimentary_access_invites. A redeemed invite cannot be
 * revoked. An already-revoked invite is not rewritten.
 *
 * Client is injected. No createClient, env, or secrets.
 */

import {
  authorizeComplimentaryGrantOperator,
  type AuthorizeComplimentaryGrantOperatorFailureReason,
} from "./authorizeComplimentaryGrantOperator.ts";

const TABLE = "tenant_complimentary_access_invites";
const CONFIRMATION_COLUMNS = "id, tenant_id, revoked_at";
const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RevokeTenantComplimentaryAccessInviteFailureReason =
  | "invalid_invite_id"
  | "invalid_tenant_id"
  | AuthorizeComplimentaryGrantOperatorFailureReason
  | "invalid_clock"
  | "invite_not_revocable"
  | "complimentary_invite_persistence_failed";

export type RevokedComplimentaryAccessInvite = {
  id: string;
  tenantId: string;
  revokedAt: string;
};

export type RevokeTenantComplimentaryAccessInviteResult =
  | { ok: true; revocation: RevokedComplimentaryAccessInvite }
  | { ok: false; reason: RevokeTenantComplimentaryAccessInviteFailureReason };

export type ComplimentaryInviteRevocationWriteError = {
  code?: string;
  message?: string;
};

export type ComplimentaryInviteRevocationConfirmationRow = {
  id?: unknown;
  tenant_id?: unknown;
  revoked_at?: unknown;
};

export type ComplimentaryInviteRevocationWriteResponse = {
  data: ComplimentaryInviteRevocationConfirmationRow | null;
  error: ComplimentaryInviteRevocationWriteError | null;
};

export type ComplimentaryInviteRevocationWriteValues = {
  revoked_at: string;
};

/**
 * Structural subset of a Supabase query builder for:
 *   UPDATE: .from().update(row).eq().eq().is().is().select(min).maybeSingle()
 * No insert / upsert / onConflict / delete / select-only surface.
 */
export type ComplimentaryInviteRevocationFilterBuilder = {
  eq: (
    column: string,
    value: string,
  ) => ComplimentaryInviteRevocationFilterBuilder;
  is: (
    column: string,
    value: null,
  ) => ComplimentaryInviteRevocationFilterBuilder;
  select: (columns: string) => {
    maybeSingle: () => PromiseLike<ComplimentaryInviteRevocationWriteResponse>;
  };
};

export type ComplimentaryInviteRevocationClient = {
  from: (table: string) => {
    update: (
      values: ComplimentaryInviteRevocationWriteValues,
    ) => ComplimentaryInviteRevocationFilterBuilder;
  };
};

export type RevokeTenantComplimentaryAccessInviteParams = {
  client: ComplimentaryInviteRevocationClient;
  callerUserId: unknown;
  configuredOperatorUserIds: unknown;
  inviteId: unknown;
  tenantId: unknown;
  now?: () => Date;
};

function fail(
  reason: RevokeTenantComplimentaryAccessInviteFailureReason,
): Extract<RevokeTenantComplimentaryAccessInviteResult, { ok: false }> {
  return { ok: false, reason };
}

function succeed(
  revocation: RevokedComplimentaryAccessInvite,
): RevokeTenantComplimentaryAccessInviteResult {
  return { ok: true, revocation };
}

function defaultNow(): Date {
  return new Date();
}

/**
 * Exact-identity UUID validation. Accepts only a syntactically valid
 * UUID string. Does not trim, lower-case, or otherwise rewrite the value.
 */
function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4ISH_REGEX.test(value);
}

function resolveClock(readNow: () => Date): Date | null {
  let now: Date;
  try {
    now = readNow();
  } catch {
    return null;
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return null;
  }
  return now;
}

function confirmedRevokedAt(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      return null;
    }
    return value;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function classifyConfirmedUpdate(params: {
  response: ComplimentaryInviteRevocationWriteResponse;
  inviteId: string;
  tenantId: string;
}): RevokeTenantComplimentaryAccessInviteResult {
  const { response, inviteId, tenantId } = params;

  if (response.error) {
    return fail("complimentary_invite_persistence_failed");
  }

  const row = response.data;
  if (row === null) {
    return fail("invite_not_revocable");
  }
  if (typeof row !== "object") {
    return fail("complimentary_invite_persistence_failed");
  }

  if (row.id !== inviteId) {
    return fail("complimentary_invite_persistence_failed");
  }
  if (row.tenant_id !== tenantId) {
    return fail("complimentary_invite_persistence_failed");
  }

  const revokedAt = confirmedRevokedAt(row.revoked_at);
  if (revokedAt === null) {
    return fail("complimentary_invite_persistence_failed");
  }

  return succeed({
    id: inviteId,
    tenantId,
    revokedAt,
  });
}

/**
 * Revoke a one-time complimentary invite that has not been redeemed.
 * Fail-closed. One conditional UPDATE. No retry, HTTP, env, or membership.
 */
export async function revokeTenantComplimentaryAccessInvite(
  params: RevokeTenantComplimentaryAccessInviteParams,
): Promise<RevokeTenantComplimentaryAccessInviteResult> {
  if (!isCanonicalUuid(params.inviteId)) {
    return fail("invalid_invite_id");
  }
  if (!isCanonicalUuid(params.tenantId)) {
    return fail("invalid_tenant_id");
  }

  const inviteId = params.inviteId;
  const tenantId = params.tenantId;

  const authority = authorizeComplimentaryGrantOperator({
    callerUserId: params.callerUserId,
    configuredOperatorUserIds: params.configuredOperatorUserIds,
  });
  if (authority.ok === false) {
    return fail(authority.reason);
  }

  const now = resolveClock(params.now ?? defaultNow);
  if (now === null) {
    return fail("invalid_clock");
  }

  const values: ComplimentaryInviteRevocationWriteValues = {
    revoked_at: now.toISOString(),
  };

  let response: ComplimentaryInviteRevocationWriteResponse;
  try {
    response = await params.client
      .from(TABLE)
      .update(values)
      .eq("id", inviteId)
      .eq("tenant_id", tenantId)
      .is("redeemed_at", null)
      .is("revoked_at", null)
      .select(CONFIRMATION_COLUMNS)
      .maybeSingle();
  } catch {
    return fail("complimentary_invite_persistence_failed");
  }

  return classifyConfirmedUpdate({
    response,
    inviteId,
    tenantId,
  });
}
