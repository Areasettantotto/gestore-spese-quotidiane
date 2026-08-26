/**
 * Read-only tenant complimentary access grant candidate reader.
 *
 * Observes the current complimentary commercial candidate for an
 * already-resolved tenant. SELECT-only on
 * public.tenant_complimentary_access_grants.
 *
 * Does not write, grant, revoke, read Stripe, compose effective access,
 * or authorize the caller. Source is not stored on the row and is not
 * returned on the candidate; the complimentary slot is the authority.
 *
 * Client is injected. No createClient, env, or secrets.
 */

import type {
  EntitlementCandidate,
  ProductTier,
} from "./resolveEffectiveAccess.ts";

export type ReadTenantComplimentaryAccessCandidateFailureReason =
  | "invalid_tenant_id"
  | "complimentary_access_grant_lookup_failed"
  | "complimentary_access_grant_invalid";

export type ReadTenantComplimentaryAccessCandidateResult =
  | { ok: true; candidate: EntitlementCandidate }
  | { ok: false; reason: ReadTenantComplimentaryAccessCandidateFailureReason };

export type ComplimentaryAccessGrantRow = {
  product_tier: unknown;
};

export type ComplimentaryAccessGrantLookupError = {
  code?: string;
  message?: string;
};

export type ComplimentaryAccessGrantLookupResponse = {
  data: ComplimentaryAccessGrantRow | null;
  error: ComplimentaryAccessGrantLookupError | null;
};

/**
 * Minimal SELECT-only client surface.
 * Structural subset of a Supabase query builder for:
 *   .from(...).select(...).eq(tenant_id).maybeSingle()
 */
export type ComplimentaryAccessGrantLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<ComplimentaryAccessGrantLookupResponse>;
      };
    };
  };
};

export type ReadTenantComplimentaryAccessCandidateParams = {
  client: ComplimentaryAccessGrantLookupClient;
  tenantId: unknown;
};

function fail(
  reason: ReadTenantComplimentaryAccessCandidateFailureReason,
): ReadTenantComplimentaryAccessCandidateResult {
  return { ok: false, reason };
}

function succeed(
  candidate: EntitlementCandidate,
): ReadTenantComplimentaryAccessCandidateResult {
  return { ok: true, candidate };
}

/**
 * Exact-identity validation: non-empty string that is not whitespace-only.
 * Does not trim/lower-case the value used for the DB filter.
 */
function isValidTenantId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim().length > 0;
}

function isProductTier(value: unknown): value is ProductTier {
  return value === "base" || value === "pro";
}

function validCandidate(tier: ProductTier): EntitlementCandidate {
  return { kind: "valid", tier, expiresAt: null };
}

/**
 * Pure classifier for a maybeSingle SELECT on tenant_complimentary_access_grants.
 * Query error is never treated as absence. Invalid product_tier is never
 * coerced and never returned as a domain candidate.
 */
export function classifyTenantComplimentaryAccessGrantLookup(params: {
  error: ComplimentaryAccessGrantLookupError | null;
  row: ComplimentaryAccessGrantRow | null;
}): ReadTenantComplimentaryAccessCandidateResult {
  if (params.error) {
    return fail("complimentary_access_grant_lookup_failed");
  }

  const row = params.row;
  if (row === null) {
    return succeed({ kind: "absent" });
  }

  if (typeof row !== "object") {
    return fail("complimentary_access_grant_invalid");
  }

  if (!isProductTier(row.product_tier)) {
    return fail("complimentary_access_grant_invalid");
  }

  return succeed(validCandidate(row.product_tier));
}

/**
 * Read the current complimentary commercial candidate for a tenant.
 * SELECT-only. Fail-closed. Does not query Stripe storage.
 */
export async function readTenantComplimentaryAccessCandidate(
  params: ReadTenantComplimentaryAccessCandidateParams,
): Promise<ReadTenantComplimentaryAccessCandidateResult> {
  if (!isValidTenantId(params.tenantId)) {
    return fail("invalid_tenant_id");
  }

  const tenantId = params.tenantId;

  let data: ComplimentaryAccessGrantRow | null | undefined;
  let error: ComplimentaryAccessGrantLookupError | null = null;

  try {
    const result = await params.client
      .from("tenant_complimentary_access_grants")
      .select("product_tier")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    data = result.data;
    error = result.error ?? null;
  } catch {
    // Do not surface raw exception details in the public contract.
    return fail("complimentary_access_grant_lookup_failed");
  }

  if (error) {
    return fail("complimentary_access_grant_lookup_failed");
  }

  if (data === undefined) {
    return fail("complimentary_access_grant_lookup_failed");
  }

  return classifyTenantComplimentaryAccessGrantLookup({ error: null, row: data });
}
