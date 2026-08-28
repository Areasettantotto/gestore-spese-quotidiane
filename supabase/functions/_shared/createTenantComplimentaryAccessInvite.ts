/**
 * Create a complimentary access invite for an existing tenant.
 *
 * Composes caller identity, product-level operator authority, tenant and
 * tier validation, a fixed 7-day expiry, bearer-token generation, and
 * INSERT into tenant_complimentary_access_invites. The raw token is
 * returned only after persistence of the invite row is confirmed.
 *
 * Client is injected. No createClient, env, or secrets.
 */

import {
  authorizeComplimentaryGrantOperator,
  type AuthorizeComplimentaryGrantOperatorFailureReason,
} from "./authorizeComplimentaryGrantOperator.ts";
import {
  generateComplimentaryInviteToken,
} from "./complimentaryInviteToken.ts";
import type { ProductTier } from "./resolveEffectiveAccess.ts";

export const COMPLIMENTARY_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const TABLE = "tenant_complimentary_access_invites";
const UNIQUE_VIOLATION_CODE = "23505";
const CONFIRMATION_COLUMNS = "id, tenant_id, product_tier, expires_at";
const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateTenantComplimentaryAccessInviteFailureReason =
  | "invalid_tenant_id"
  | "invalid_product_tier"
  | AuthorizeComplimentaryGrantOperatorFailureReason
  | "invalid_clock"
  | "complimentary_invite_token_generation_failed"
  | "complimentary_invite_token_conflict"
  | "complimentary_invite_persistence_failed";

export type CreatedComplimentaryAccessInvite = {
  id: string;
  tenantId: string;
  productTier: ProductTier;
  expiresAt: string;
  rawToken: string;
};

export type CreateTenantComplimentaryAccessInviteResult =
  | { ok: true; invite: CreatedComplimentaryAccessInvite }
  | { ok: false; reason: CreateTenantComplimentaryAccessInviteFailureReason };

export type ComplimentaryInvitePersistenceWriteError = {
  code?: string;
  message?: string;
};

export type ComplimentaryInvitePersistenceConfirmationRow = {
  id?: unknown;
  tenant_id?: unknown;
  product_tier?: unknown;
  expires_at?: unknown;
};

export type ComplimentaryInvitePersistenceWriteResponse = {
  data: ComplimentaryInvitePersistenceConfirmationRow | null;
  error: ComplimentaryInvitePersistenceWriteError | null;
};

export type ComplimentaryInviteInsertWriteValues = {
  tenant_id: string;
  product_tier: ProductTier;
  token_hash: string;
  issued_by: string;
  expires_at: string;
};

/**
 * Structural subset of a Supabase query builder for:
 *   INSERT: .from().insert(row).select(min).maybeSingle()
 * No upsert / onConflict / update / delete surface.
 */
export type ComplimentaryInvitePersistenceClient = {
  from: (table: string) => {
    insert: (values: ComplimentaryInviteInsertWriteValues) => {
      select: (columns: string) => {
        maybeSingle: () => PromiseLike<
          ComplimentaryInvitePersistenceWriteResponse
        >;
      };
    };
  };
};

export type CreateTenantComplimentaryAccessInviteParams = {
  client: ComplimentaryInvitePersistenceClient;
  callerUserId: unknown;
  configuredOperatorUserIds: unknown;
  tenantId: unknown;
  productTier: unknown;
  now?: () => Date;
  generateToken?: typeof generateComplimentaryInviteToken;
};

function fail(
  reason: CreateTenantComplimentaryAccessInviteFailureReason,
): Extract<CreateTenantComplimentaryAccessInviteResult, { ok: false }> {
  return { ok: false, reason };
}

function succeed(
  invite: CreatedComplimentaryAccessInvite,
): CreateTenantComplimentaryAccessInviteResult {
  return { ok: true, invite };
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

function isProductTier(value: unknown): value is ProductTier {
  return value === "base" || value === "pro";
}

function isUniqueViolation(
  error: ComplimentaryInvitePersistenceWriteError | null,
): boolean {
  return error?.code === UNIQUE_VIOLATION_CODE;
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

function confirmedExpiresAt(value: unknown): string | null {
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

function classifyConfirmedInsert(params: {
  response: ComplimentaryInvitePersistenceWriteResponse;
  tenantId: string;
  productTier: ProductTier;
}):
  | {
    ok: true;
    invite: Omit<CreatedComplimentaryAccessInvite, "rawToken">;
  }
  | {
    ok: false;
    reason: CreateTenantComplimentaryAccessInviteFailureReason;
  } {
  const { response, tenantId, productTier } = params;

  if (response.error) {
    if (isUniqueViolation(response.error)) {
      return fail("complimentary_invite_token_conflict");
    }
    return fail("complimentary_invite_persistence_failed");
  }

  const row = response.data;
  if (row === null || typeof row !== "object") {
    return fail("complimentary_invite_persistence_failed");
  }

  if (!isCanonicalUuid(row.id)) {
    return fail("complimentary_invite_persistence_failed");
  }
  if (row.tenant_id !== tenantId) {
    return fail("complimentary_invite_persistence_failed");
  }
  if (row.product_tier !== productTier) {
    return fail("complimentary_invite_persistence_failed");
  }

  const expiresAt = confirmedExpiresAt(row.expires_at);
  if (expiresAt === null) {
    return fail("complimentary_invite_persistence_failed");
  }

  return {
    ok: true,
    invite: {
      id: row.id,
      tenantId,
      productTier,
      expiresAt,
    },
  };
}

/**
 * Create a one-time complimentary invite for an existing tenant.
 * Fail-closed. INSERT only. No retry, HTTP, env, or membership checks.
 */
export async function createTenantComplimentaryAccessInvite(
  params: CreateTenantComplimentaryAccessInviteParams,
): Promise<CreateTenantComplimentaryAccessInviteResult> {
  if (!isCanonicalUuid(params.tenantId)) {
    return fail("invalid_tenant_id");
  }
  if (!isProductTier(params.productTier)) {
    return fail("invalid_product_tier");
  }

  const tenantId = params.tenantId;
  const productTier = params.productTier;

  const authority = authorizeComplimentaryGrantOperator({
    callerUserId: params.callerUserId,
    configuredOperatorUserIds: params.configuredOperatorUserIds,
  });
  if (authority.ok === false) {
    return fail(authority.reason);
  }
  if (typeof params.callerUserId !== "string") {
    return fail("invalid_caller_user_id");
  }
  const issuedBy = params.callerUserId;

  const now = resolveClock(params.now ?? defaultNow);
  if (now === null) {
    return fail("invalid_clock");
  }

  const expiresAt = new Date(now.getTime() + COMPLIMENTARY_INVITE_LIFETIME_MS);
  if (!Number.isFinite(expiresAt.getTime())) {
    return fail("invalid_clock");
  }

  const generateToken = params.generateToken ?? generateComplimentaryInviteToken;
  let pair: Awaited<ReturnType<typeof generateComplimentaryInviteToken>>;
  try {
    pair = await generateToken();
  } catch {
    return fail("complimentary_invite_token_generation_failed");
  }

  const values: ComplimentaryInviteInsertWriteValues = {
    tenant_id: tenantId,
    product_tier: productTier,
    token_hash: pair.tokenHash,
    issued_by: issuedBy,
    expires_at: expiresAt.toISOString(),
  };

  let response: ComplimentaryInvitePersistenceWriteResponse;
  try {
    response = await params.client
      .from(TABLE)
      .insert(values)
      .select(CONFIRMATION_COLUMNS)
      .maybeSingle();
  } catch {
    return fail("complimentary_invite_persistence_failed");
  }

  const confirmed = classifyConfirmedInsert({
    response,
    tenantId,
    productTier,
  });
  if (confirmed.ok === false) {
    return confirmed;
  }

  return succeed({
    ...confirmed.invite,
    rawToken: pair.rawToken,
  });
}
