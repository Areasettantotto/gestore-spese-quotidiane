/**
 * Server-side wrapper for complimentary invite redemption.
 *
 * Hashes a caller-supplied raw bearer token via BILLING-73 and invokes
 * the single DB RPC redeem_tenant_complimentary_access_invite with
 * p_token_hash only. Validates the RETURNS TABLE row and maps it to a
 * typed Result. Mutation, locking, expiry, revoke, and grant apply stay
 * in the database.
 *
 * Client is injected. No createClient, env, or secrets.
 */

import {
  hashComplimentaryInviteToken,
  type HashComplimentaryInviteTokenResult,
} from "./complimentaryInviteToken.ts";
import type { ProductTier } from "./resolveEffectiveAccess.ts";

const RPC_NAME = "redeem_tenant_complimentary_access_invite";
const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DOMAIN_FAILURE_REASONS = [
  "token_not_found",
  "invite_already_redeemed",
  "invite_revoked",
  "invite_expired",
] as const;

export type RedeemTenantComplimentaryAccessInviteDomainFailureReason =
  typeof DOMAIN_FAILURE_REASONS[number];

export type RedeemTenantComplimentaryAccessInviteFailureReason =
  | "invalid_raw_token"
  | "complimentary_invite_token_hash_failed"
  | RedeemTenantComplimentaryAccessInviteDomainFailureReason
  | "complimentary_invite_redemption_rpc_failed"
  | "complimentary_invite_redemption_invalid_response";

export type RedeemedComplimentaryAccessInvite = {
  inviteId: string;
  tenantId: string;
  productTier: ProductTier;
  redeemedAt: string;
};

export type RedeemTenantComplimentaryAccessInviteResult =
  | { ok: true; redemption: RedeemedComplimentaryAccessInvite }
  | { ok: false; reason: RedeemTenantComplimentaryAccessInviteFailureReason };

export type ComplimentaryInviteRedemptionRpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export type ComplimentaryInviteRedemptionRpcResponse = {
  data: unknown;
  error: ComplimentaryInviteRedemptionRpcError | null;
};

/**
 * Structural subset of a Supabase client for one RPC:
 *   .rpc(fn, { p_token_hash })
 * Thenable like the real supabase-js builder (await .rpc()).
 * RETURNS TABLE is classified as a one-element array.
 */
export type ComplimentaryInviteRedemptionRpcClient = {
  rpc: (
    fn: string,
    args: { p_token_hash: string },
  ) => PromiseLike<ComplimentaryInviteRedemptionRpcResponse>;
};

export type RedeemTenantComplimentaryAccessInviteParams = {
  client: ComplimentaryInviteRedemptionRpcClient;
  rawToken: unknown;
  hashRawToken?: (
    rawToken: unknown,
  ) => Promise<HashComplimentaryInviteTokenResult>;
};

function fail(
  reason: RedeemTenantComplimentaryAccessInviteFailureReason,
): Extract<RedeemTenantComplimentaryAccessInviteResult, { ok: false }> {
  return { ok: false, reason };
}

function succeed(
  redemption: RedeemedComplimentaryAccessInvite,
): RedeemTenantComplimentaryAccessInviteResult {
  return { ok: true, redemption };
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4ISH_REGEX.test(value);
}

function isProductTier(value: unknown): value is ProductTier {
  return value === "base" || value === "pro";
}

function isDomainFailureReason(
  value: unknown,
): value is RedeemTenantComplimentaryAccessInviteDomainFailureReason {
  return (
    value === "token_not_found" ||
    value === "invite_already_redeemed" ||
    value === "invite_revoked" ||
    value === "invite_expired"
  );
}

function confirmedRedeemedAt(value: unknown): string | null {
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

function classifyRedemptionRow(
  row: Record<string, unknown>,
): RedeemTenantComplimentaryAccessInviteResult {
  if (row.ok === true) {
    if (row.reason !== null) {
      return fail("complimentary_invite_redemption_invalid_response");
    }
    if (!isCanonicalUuid(row.invite_id)) {
      return fail("complimentary_invite_redemption_invalid_response");
    }
    if (!isCanonicalUuid(row.tenant_id)) {
      return fail("complimentary_invite_redemption_invalid_response");
    }
    if (!isProductTier(row.product_tier)) {
      return fail("complimentary_invite_redemption_invalid_response");
    }
    const redeemedAt = confirmedRedeemedAt(row.redeemed_at);
    if (redeemedAt === null) {
      return fail("complimentary_invite_redemption_invalid_response");
    }
    return succeed({
      inviteId: row.invite_id,
      tenantId: row.tenant_id,
      productTier: row.product_tier,
      redeemedAt,
    });
  }

  if (row.ok === false) {
    if (!isDomainFailureReason(row.reason)) {
      return fail("complimentary_invite_redemption_invalid_response");
    }
    if (
      row.invite_id !== null ||
      row.tenant_id !== null ||
      row.product_tier !== null ||
      row.redeemed_at !== null
    ) {
      return fail("complimentary_invite_redemption_invalid_response");
    }
    return fail(row.reason);
  }

  return fail("complimentary_invite_redemption_invalid_response");
}

function classifyRpcPayload(
  data: unknown,
): RedeemTenantComplimentaryAccessInviteResult {
  if (!Array.isArray(data) || data.length !== 1) {
    return fail("complimentary_invite_redemption_invalid_response");
  }

  const row = data[0];
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return fail("complimentary_invite_redemption_invalid_response");
  }

  return classifyRedemptionRow(row as Record<string, unknown>);
}

function classifyRpcEnvelope(
  response: unknown,
): RedeemTenantComplimentaryAccessInviteResult {
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response)
  ) {
    return fail("complimentary_invite_redemption_invalid_response");
  }

  const envelope = response as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(envelope, "error")) {
    return fail("complimentary_invite_redemption_invalid_response");
  }
  if (envelope.error === undefined) {
    return fail("complimentary_invite_redemption_invalid_response");
  }
  if (envelope.error !== null) {
    return fail("complimentary_invite_redemption_rpc_failed");
  }

  return classifyRpcPayload(envelope.data);
}

/**
 * Redeem a one-time complimentary invite by raw bearer token.
 * Fail-closed. One RPC. No retry, table writes, HTTP, env, or auth.
 */
export async function redeemTenantComplimentaryAccessInvite(
  params: RedeemTenantComplimentaryAccessInviteParams,
): Promise<RedeemTenantComplimentaryAccessInviteResult> {
  const hashRawToken = params.hashRawToken ?? hashComplimentaryInviteToken;

  let hashed: HashComplimentaryInviteTokenResult;
  try {
    hashed = await hashRawToken(params.rawToken);
  } catch {
    return fail("complimentary_invite_token_hash_failed");
  }

  if (hashed.ok === false) {
    if (hashed.reason === "invalid_raw_token") {
      return fail("invalid_raw_token");
    }
    return fail("complimentary_invite_token_hash_failed");
  }

  if (typeof hashed.tokenHash !== "string" || hashed.tokenHash.length === 0) {
    return fail("complimentary_invite_token_hash_failed");
  }

  const tokenHash = hashed.tokenHash;

  let response: ComplimentaryInviteRedemptionRpcResponse;
  try {
    response = await params.client.rpc(RPC_NAME, { p_token_hash: tokenHash });
  } catch {
    return fail("complimentary_invite_redemption_rpc_failed");
  }

  return classifyRpcEnvelope(response);
}
