/**
 * Read-only tenant-scoped AccessMode reader (BILLING-84).
 *
 * SELECT-only on public.tenants for plan_code + is_demo.
 * Returns AccessMode for one persisted tenant row.
 * Does not compose effective access, authorize the caller, or write.
 *
 * Client is injected. No createClient, env, or secrets.
 */

import type { AccessMode } from "./resolveEffectiveAccess.ts";

const TABLE = "tenants";
const SELECT_COLUMNS = "plan_code,is_demo";
const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STANDARD_PLAN_CODES = new Set(["free", "trial", "paid"]);
const KNOWN_PLAN_CODES = new Set(["free", "trial", "paid", "internal", "demo"]);

export type ReadTenantAccessModeFailureReason =
  | "invalid_tenant_id"
  | "tenant_not_found"
  | "tenant_lookup_failed"
  | "invalid_tenant_access_mode";

export type ReadTenantAccessModeResult =
  | { ok: true; mode: AccessMode }
  | { ok: false; reason: ReadTenantAccessModeFailureReason };

export type TenantAccessModeRow = {
  plan_code?: unknown;
  is_demo?: unknown;
};

export type TenantAccessModeLookupError = {
  code?: string;
  message?: string;
};

export type TenantAccessModeLookupResponse = {
  data: TenantAccessModeRow | null;
  error: TenantAccessModeLookupError | null;
};

/**
 * Minimal SELECT-only client surface.
 * Structural subset of a Supabase query builder for:
 *   .from(...).select(...).eq(id).maybeSingle()
 * maybeSingle is used because tenants.id is the primary key:
 * zero rows → null; one row → object; multiple rows → query error.
 */
export type TenantAccessModeLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<TenantAccessModeLookupResponse>;
      };
    };
  };
};

export type ReadTenantAccessModeParams = {
  tenantId: unknown;
  client: TenantAccessModeLookupClient;
};

function fail(
  reason: ReadTenantAccessModeFailureReason,
): ReadTenantAccessModeResult {
  return { ok: false, reason };
}

function succeed(mode: AccessMode): ReadTenantAccessModeResult {
  return { ok: true, mode };
}

/**
 * Exact-identity UUID validation. Accepts only a syntactically valid
 * UUID string. Does not trim, lower-case, or otherwise rewrite the
 * value used for the DB filter.
 */
function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4ISH_REGEX.test(value);
}

function isKnownPlanCode(value: unknown): value is string {
  return typeof value === "string" && KNOWN_PLAN_CODES.has(value);
}

/**
 * Map a present tenants row to AccessMode.
 *
 * Precedence after both fields are well-shaped:
 * 1. is_demo === true → demo
 * 2. plan_code === "demo" → demo
 * 3. plan_code === "internal" → internal
 * 4. plan_code in {free, trial, paid} → standard
 *
 * Unknown / missing / non-boolean shapes fail closed.
 * standard is commercial AccessMode, not a catalog tier.
 */
function parseTenantAccessModeRow(
  row: unknown,
): ReadTenantAccessModeResult {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return fail("invalid_tenant_access_mode");
  }

  const record = row as TenantAccessModeRow;

  if (typeof record.is_demo !== "boolean") {
    return fail("invalid_tenant_access_mode");
  }

  if (!isKnownPlanCode(record.plan_code)) {
    return fail("invalid_tenant_access_mode");
  }

  if (record.is_demo === true) {
    return succeed("demo");
  }

  if (record.plan_code === "demo") {
    return succeed("demo");
  }

  if (record.plan_code === "internal") {
    return succeed("internal");
  }

  if (STANDARD_PLAN_CODES.has(record.plan_code)) {
    return succeed("standard");
  }

  return fail("invalid_tenant_access_mode");
}

/**
 * Pure classifier for a maybeSingle SELECT envelope on public.tenants.
 *
 * Valid success: object with own `data` (row object) and own `error === null`.
 * Missing tenant: own `data === null` and own `error === null`.
 * Valid DB failure: object with own `error !== null` (undefined is not null).
 * Missing fields, undefined error, array data, or a non-object response
 * are lookup_failed. A present row with invalid plan_code / is_demo
 * is invalid_tenant_access_mode.
 */
export function classifyTenantAccessModeLookup(
  response: unknown,
): ReadTenantAccessModeResult {
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response)
  ) {
    return fail("tenant_lookup_failed");
  }

  const envelope = response as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(envelope, "error")) {
    return fail("tenant_lookup_failed");
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, "data")) {
    return fail("tenant_lookup_failed");
  }

  // Do not coerce undefined → null. Only explicit null is a success error slot.
  if (envelope.error === undefined || envelope.error !== null) {
    return fail("tenant_lookup_failed");
  }

  const row = envelope.data;
  if (row === null) {
    return fail("tenant_not_found");
  }

  // maybeSingle yields one object. An array is an unexpected envelope.
  if (typeof row !== "object" || Array.isArray(row)) {
    return fail("tenant_lookup_failed");
  }

  return parseTenantAccessModeRow(row);
}

/**
 * Read AccessMode for a tenant from persisted tenants.plan_code / is_demo.
 * SELECT-only. Fail-closed. Does not authorize the tenant or compose access.
 */
export async function readTenantAccessMode(
  params: ReadTenantAccessModeParams,
): Promise<ReadTenantAccessModeResult> {
  if (!isCanonicalUuid(params.tenantId)) {
    return fail("invalid_tenant_id");
  }

  const tenantId = params.tenantId;

  try {
    const result = await params.client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq("id", tenantId)
      .maybeSingle();

    return classifyTenantAccessModeLookup(result);
  } catch {
    // Do not surface raw exception details in the public contract.
    return fail("tenant_lookup_failed");
  }
}
