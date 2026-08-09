/**
 * Read-only billing customer → tenant resolver (I4.3BF).
 *
 * Trust boundary: tenant_id is resolved exclusively from
 * public.tenant_billing_customers via (provider, provider_customer_id).
 *
 * No Stripe API, no metadata/event/customer fallback, no writes,
 * no W_sub / Snapshot / webhook wiring.
 */

export type ResolveBillingCustomerTenantFailureReason =
  | "invalid_provider"
  | "invalid_provider_customer_id"
  | "tenant_mapping_not_found"
  | "tenant_mapping_ambiguous"
  | "tenant_mapping_lookup_failed"
  | "tenant_mapping_invalid";

export type ResolveBillingCustomerTenantResult =
  | { ok: true; tenant_id: string }
  | { ok: false; reason: ResolveBillingCustomerTenantFailureReason };

export type TenantBillingCustomerMappingRow = {
  tenant_id: unknown;
};

export type TenantBillingCustomerLookupError = {
  code?: string;
  message?: string;
};

export type TenantBillingCustomerLookupResponse = {
  data: TenantBillingCustomerMappingRow[] | null;
  error: TenantBillingCustomerLookupError | null;
};

/**
 * Minimal SELECT-only client surface.
 * Structural subset of a Supabase query builder for:
 *   .from(...).select(...).eq(provider).eq(provider_customer_id)
 * The second `.eq` resolves to a Promise (awaitable), matching how callers
 * consume the filtered query without `.maybeSingle()` (array classification
 * stays in this module for explicit ambiguous handling).
 */
export type BillingCustomerTenantLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => PromiseLike<TenantBillingCustomerLookupResponse>;
      };
    };
  };
};

export type ResolveBillingCustomerTenantParams = {
  provider: unknown;
  provider_customer_id: unknown;
  client: BillingCustomerTenantLookupClient;
};

function fail(
  reason: ResolveBillingCustomerTenantFailureReason,
): ResolveBillingCustomerTenantResult {
  return { ok: false, reason };
}

/**
 * Canonical non-empty string check without casing/whitespace mutation.
 * Empty string fails; values are used exactly as provided for DB filters.
 */
function isNonEmptyCanonicalString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidTenantId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Pure classifier for a SELECT result on tenant_billing_customers.
 * Never picks the first row when multiple rows are present.
 */
export function classifyTenantBillingCustomerLookup(params: {
  error: TenantBillingCustomerLookupError | null;
  rows: TenantBillingCustomerMappingRow[] | null;
}): ResolveBillingCustomerTenantResult {
  if (params.error) {
    return fail("tenant_mapping_lookup_failed");
  }

  const rows = params.rows;
  if (!Array.isArray(rows)) {
    return fail("tenant_mapping_lookup_failed");
  }

  if (rows.length === 0) {
    return fail("tenant_mapping_not_found");
  }

  if (rows.length > 1) {
    return fail("tenant_mapping_ambiguous");
  }

  const tenantId = rows[0]?.tenant_id;
  if (!isValidTenantId(tenantId)) {
    return fail("tenant_mapping_invalid");
  }

  return { ok: true, tenant_id: tenantId };
}

/**
 * Resolve tenant_id from a provider billing customer mapping.
 * SELECT-only on public.tenant_billing_customers. Fail-closed.
 */
export async function resolveBillingCustomerTenant(
  params: ResolveBillingCustomerTenantParams,
): Promise<ResolveBillingCustomerTenantResult> {
  if (!isNonEmptyCanonicalString(params.provider)) {
    return fail("invalid_provider");
  }
  if (!isNonEmptyCanonicalString(params.provider_customer_id)) {
    return fail("invalid_provider_customer_id");
  }

  // Exact filter identity — no toLowerCase / trim canonicalization.
  const provider = params.provider;
  const providerCustomerId = params.provider_customer_id;

  let data: TenantBillingCustomerMappingRow[] | null = null;
  let error: TenantBillingCustomerLookupError | null = null;

  try {
    const result = await params.client
      .from("tenant_billing_customers")
      .select("tenant_id")
      .eq("provider", provider)
      .eq("provider_customer_id", providerCustomerId);

    data = Array.isArray(result.data) ? result.data : null;
    error = result.error ?? null;
  } catch {
    // Do not surface raw exception details in the public contract.
    return fail("tenant_mapping_lookup_failed");
  }

  return classifyTenantBillingCustomerLookup({ error, rows: data });
}
