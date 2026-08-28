/**
 * Persistence-only writer for tenant_complimentary_access_grants.
 *
 * Executes one caller-chosen write: INSERT (first grant) or UPDATE
 * (existing grant). Does not authorize, authenticate, revoke, upsert,
 * retry, fall back across operations, read Stripe/IAM, or construct a
 * Supabase client.
 *
 * Client is injected. No createClient, env, or secrets.
 */

import type { ProductTier } from "./resolveEffectiveAccess.ts";

const TABLE = "tenant_complimentary_access_grants";
const UNIQUE_VIOLATION_CODE = "23505";
const CONFIRMATION_COLUMNS = "tenant_id";
const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PersistTenantComplimentaryAccessGrantFailureReason =
  | "invalid_tenant_id"
  | "invalid_product_tier"
  | "complimentary_access_grant_insert_conflict"
  | "complimentary_access_grant_update_miss"
  | "complimentary_access_grant_persistence_failed";

export type PersistTenantComplimentaryAccessGrantResult =
  | { ok: true; kind: "inserted" | "updated" }
  | { ok: false; reason: PersistTenantComplimentaryAccessGrantFailureReason };

/**
 * Explicit persistence intent. Insert and update are distinct operations.
 * There is no upsert / onConflict path.
 */
export type PersistTenantComplimentaryAccessGrantOperation =
  | { kind: "insert" }
  | { kind: "update" };

export type ComplimentaryAccessGrantPersistenceWriteError = {
  code?: string;
  message?: string;
};

export type ComplimentaryAccessGrantPersistenceConfirmationRow = {
  tenant_id?: unknown;
};

export type ComplimentaryAccessGrantPersistenceWriteResponse = {
  data: ComplimentaryAccessGrantPersistenceConfirmationRow | null;
  error: ComplimentaryAccessGrantPersistenceWriteError | null;
};

export type ComplimentaryAccessGrantInsertWriteValues = {
  tenant_id: string;
  product_tier: ProductTier;
};

export type ComplimentaryAccessGrantUpdateWriteValues = {
  product_tier: ProductTier;
};

/**
 * Structural subset of a Supabase query builder for:
 *   INSERT: .from().insert(row).select(min).maybeSingle()
 *   UPDATE: .from().update(row).eq(tenant_id).select(min).maybeSingle()
 * No upsert / onConflict / delete surface.
 */
export type ComplimentaryAccessGrantPersistenceFilterBuilder = {
  eq: (
    column: string,
    value: string,
  ) => ComplimentaryAccessGrantPersistenceFilterBuilder;
  select: (columns: string) => {
    maybeSingle: () => PromiseLike<
      ComplimentaryAccessGrantPersistenceWriteResponse
    >;
  };
};

export type ComplimentaryAccessGrantPersistenceClient = {
  from: (table: string) => {
    insert: (values: ComplimentaryAccessGrantInsertWriteValues) => {
      select: (columns: string) => {
        maybeSingle: () => PromiseLike<
          ComplimentaryAccessGrantPersistenceWriteResponse
        >;
      };
    };
    update: (
      values: ComplimentaryAccessGrantUpdateWriteValues,
    ) => ComplimentaryAccessGrantPersistenceFilterBuilder;
  };
};

export type PersistTenantComplimentaryAccessGrantParams = {
  client: ComplimentaryAccessGrantPersistenceClient;
  tenantId: unknown;
  productTier: unknown;
  operation: PersistTenantComplimentaryAccessGrantOperation;
};

function fail(
  reason: PersistTenantComplimentaryAccessGrantFailureReason,
): PersistTenantComplimentaryAccessGrantResult {
  return { ok: false, reason };
}

function succeed(
  kind: "inserted" | "updated",
): PersistTenantComplimentaryAccessGrantResult {
  return { ok: true, kind };
}

/**
 * Exact-identity UUID validation. Accepts only a syntactically valid
 * UUID string. Does not trim, lower-case, or otherwise rewrite the
 * value used for the DB write/filter.
 */
function isValidTenantId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4ISH_REGEX.test(value);
}

function isProductTier(value: unknown): value is ProductTier {
  return value === "base" || value === "pro";
}

function isUniqueViolation(
  error: ComplimentaryAccessGrantPersistenceWriteError | null,
): boolean {
  return error?.code === UNIQUE_VIOLATION_CODE;
}

function classifyConfirmedWrite(params: {
  response: ComplimentaryAccessGrantPersistenceWriteResponse;
  successKind: "inserted" | "updated";
  uniqueViolationReason:
    | PersistTenantComplimentaryAccessGrantFailureReason
    | null;
  emptySuccessReason: PersistTenantComplimentaryAccessGrantFailureReason;
}): PersistTenantComplimentaryAccessGrantResult {
  const { response, successKind, uniqueViolationReason, emptySuccessReason } =
    params;

  if (response.error) {
    if (uniqueViolationReason && isUniqueViolation(response.error)) {
      return fail(uniqueViolationReason);
    }
    return fail("complimentary_access_grant_persistence_failed");
  }

  if (response.data !== null && typeof response.data === "object") {
    return succeed(successKind);
  }

  return fail(emptySuccessReason);
}

async function persistInsert(
  params: {
    client: ComplimentaryAccessGrantPersistenceClient;
    tenantId: string;
    productTier: ProductTier;
  },
): Promise<PersistTenantComplimentaryAccessGrantResult> {
  const values: ComplimentaryAccessGrantInsertWriteValues = {
    tenant_id: params.tenantId,
    product_tier: params.productTier,
  };

  let response: ComplimentaryAccessGrantPersistenceWriteResponse;
  try {
    response = await params.client
      .from(TABLE)
      .insert(values)
      .select(CONFIRMATION_COLUMNS)
      .maybeSingle();
  } catch {
    return fail("complimentary_access_grant_persistence_failed");
  }

  return classifyConfirmedWrite({
    response,
    successKind: "inserted",
    uniqueViolationReason: "complimentary_access_grant_insert_conflict",
    emptySuccessReason: "complimentary_access_grant_persistence_failed",
  });
}

async function persistUpdate(
  params: {
    client: ComplimentaryAccessGrantPersistenceClient;
    tenantId: string;
    productTier: ProductTier;
  },
): Promise<PersistTenantComplimentaryAccessGrantResult> {
  const values: ComplimentaryAccessGrantUpdateWriteValues = {
    product_tier: params.productTier,
  };

  let response: ComplimentaryAccessGrantPersistenceWriteResponse;
  try {
    response = await params.client
      .from(TABLE)
      .update(values)
      .eq("tenant_id", params.tenantId)
      .select(CONFIRMATION_COLUMNS)
      .maybeSingle();
  } catch {
    return fail("complimentary_access_grant_persistence_failed");
  }

  return classifyConfirmedWrite({
    response,
    successKind: "updated",
    uniqueViolationReason: null,
    emptySuccessReason: "complimentary_access_grant_update_miss",
  });
}

/**
 * Persist a current complimentary grant for a tenant.
 * One INSERT or one UPDATE. Fail-closed. No retry, upsert, or HTTP.
 */
export async function persistTenantComplimentaryAccessGrant(
  params: PersistTenantComplimentaryAccessGrantParams,
): Promise<PersistTenantComplimentaryAccessGrantResult> {
  if (!isValidTenantId(params.tenantId)) {
    return fail("invalid_tenant_id");
  }
  if (!isProductTier(params.productTier)) {
    return fail("invalid_product_tier");
  }

  const tenantId = params.tenantId;
  const productTier = params.productTier;
  const operation = params.operation;

  if (operation.kind === "insert") {
    return await persistInsert({
      client: params.client,
      tenantId,
      productTier,
    });
  }
  if (operation.kind === "update") {
    return await persistUpdate({
      client: params.client,
      tenantId,
      productTier,
    });
  }

  return fail("complimentary_access_grant_persistence_failed");
}
