/**
 * Read-only tenant-scoped Stripe subscription observations (BILLING-81).
 *
 * SELECT-only on public.tenant_subscriptions for provider = "stripe".
 * Returns one observation per persisted row. Does not choose a current
 * subscription, map status to entitlement, or produce EntitlementCandidate.
 *
 * Client is injected. No createClient, env, or secrets.
 */

import type { NormalizedStripeSubscription } from "./normalizeStripeSubscription.ts";

const TABLE = "tenant_subscriptions";
const PROVIDER = "stripe" as const;
const SELECT_COLUMNS = "product_tier,status,current_period_end";
const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReadTenantStripeSubscriptionObservationsFailureReason =
  | "invalid_tenant_id"
  | "stripe_subscription_lookup_failed"
  | "stripe_subscription_observation_invalid";

/**
 * One persisted Stripe tenant_subscriptions row, not an entitlement.
 *
 * productTier reuses the snapshot ProductTier plus persistence NULL.
 * currentPeriodEnd reuses the snapshot/persistence timestamptz string | null.
 * status is a non-empty exact persisted string: the DB CHECK is wider than
 * NormalizedStripeSubscription["status"] (adds suspended/unknown), and
 * BILLING-81 must not interpret status into valid/absent/invalid.
 */
export type TenantStripeSubscriptionObservation = {
  productTier: NormalizedStripeSubscription["productTier"] | null;
  status: string;
  currentPeriodEnd: NormalizedStripeSubscription["current_period_end"];
};

export type ReadTenantStripeSubscriptionObservationsResult =
  | { ok: true; observations: TenantStripeSubscriptionObservation[] }
  | {
    ok: false;
    reason: ReadTenantStripeSubscriptionObservationsFailureReason;
  };

export type TenantStripeSubscriptionObservationRow = {
  product_tier?: unknown;
  status?: unknown;
  current_period_end?: unknown;
};

export type TenantStripeSubscriptionObservationLookupError = {
  code?: string;
  message?: string;
};

export type TenantStripeSubscriptionObservationLookupResponse = {
  data: TenantStripeSubscriptionObservationRow[] | null;
  error: TenantStripeSubscriptionObservationLookupError | null;
};

/**
 * Minimal SELECT-only client surface.
 * Structural subset of a Supabase query builder for:
 *   .from(...).select(...).eq(tenant_id).eq(provider)
 * The second `.eq` resolves to a Promise (awaitable array response).
 * No .single / .maybeSingle / .limit / .order / mutation surface.
 */
export type TenantStripeSubscriptionObservationLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => PromiseLike<TenantStripeSubscriptionObservationLookupResponse>;
      };
    };
  };
};

export type ReadTenantStripeSubscriptionObservationsParams = {
  tenantId: unknown;
  client: TenantStripeSubscriptionObservationLookupClient;
};

function fail(
  reason: ReadTenantStripeSubscriptionObservationsFailureReason,
): ReadTenantStripeSubscriptionObservationsResult {
  return { ok: false, reason };
}

function succeed(
  observations: TenantStripeSubscriptionObservation[],
): ReadTenantStripeSubscriptionObservationsResult {
  return { ok: true, observations };
}

/**
 * Exact-identity UUID validation. Accepts only a syntactically valid
 * UUID string. Does not trim, lower-case, or otherwise rewrite the
 * value used for the DB filter.
 */
function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4ISH_REGEX.test(value);
}

function isProductTier(
  value: unknown,
): value is NormalizedStripeSubscription["productTier"] {
  return value === "base" || value === "pro";
}

/**
 * Exact persisted status. Non-empty, not whitespace-only.
 * Does not trim, lower-case, or match a status allowlist.
 */
function isPersistedStatus(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.trim().length > 0;
}

/**
 * Persistence/PostgREST timestamptz shape: null, or a non-empty string
 * that parses as a datetime. The original string is preserved; this does
 * not rewrite ISO, convert Unix seconds, or map to expiresAt.
 */
function parseCurrentPeriodEnd(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (
    typeof value !== "string" || value.length === 0 ||
    value.trim().length === 0
  ) {
    return { ok: false };
  }
  if (!Number.isFinite(Date.parse(value))) {
    return { ok: false };
  }
  return { ok: true, value };
}

function parseObservation(
  row: unknown,
): ReadTenantStripeSubscriptionObservationsResult {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return fail("stripe_subscription_observation_invalid");
  }

  const record = row as TenantStripeSubscriptionObservationRow;
  const rawTier = record.product_tier;
  let productTier: NormalizedStripeSubscription["productTier"] | null;
  if (rawTier === null) {
    productTier = null;
  } else if (isProductTier(rawTier)) {
    productTier = rawTier;
  } else {
    return fail("stripe_subscription_observation_invalid");
  }

  if (!isPersistedStatus(record.status)) {
    return fail("stripe_subscription_observation_invalid");
  }

  const periodEnd = parseCurrentPeriodEnd(record.current_period_end);
  if (!periodEnd.ok) {
    return fail("stripe_subscription_observation_invalid");
  }

  return succeed([{
    productTier,
    status: record.status,
    currentPeriodEnd: periodEnd.value,
  }]);
}

/**
 * Pure classifier for a SELECT envelope on tenant_subscriptions.
 *
 * Valid success: object with own `data` (array) and own `error === null`.
 * Valid DB failure: object with own `error !== null` (undefined is not null).
 * Missing fields, undefined error, or a non-object response are
 * lookup_failed. Empty `data: []` is success only when `error` is
 * explicitly null. Multiple rows are all preserved. A single malformed
 * row fails the entire result.
 */
export function classifyTenantStripeSubscriptionObservationsLookup(
  response: unknown,
): ReadTenantStripeSubscriptionObservationsResult {
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response)
  ) {
    return fail("stripe_subscription_lookup_failed");
  }

  const envelope = response as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(envelope, "error")) {
    return fail("stripe_subscription_lookup_failed");
  }
  if (!Object.prototype.hasOwnProperty.call(envelope, "data")) {
    return fail("stripe_subscription_lookup_failed");
  }

  // Do not coerce undefined → null. Only explicit null is a success error slot.
  if (envelope.error === undefined || envelope.error !== null) {
    return fail("stripe_subscription_lookup_failed");
  }

  const rows = envelope.data;
  if (!Array.isArray(rows)) {
    return fail("stripe_subscription_lookup_failed");
  }

  const observations: TenantStripeSubscriptionObservation[] = [];
  for (const row of rows) {
    const parsed = parseObservation(row);
    if (parsed.ok === false) {
      return parsed;
    }
    observations.push(parsed.observations[0]!);
  }

  return succeed(observations);
}

/**
 * Observe persisted Stripe tenant_subscriptions rows for a tenant.
 * SELECT-only. Fail-closed. Does not authorize the tenant or decide
 * entitlement.
 */
export async function readTenantStripeSubscriptionObservations(
  params: ReadTenantStripeSubscriptionObservationsParams,
): Promise<ReadTenantStripeSubscriptionObservationsResult> {
  if (!isCanonicalUuid(params.tenantId)) {
    return fail("invalid_tenant_id");
  }

  const tenantId = params.tenantId;

  try {
    const result = await params.client
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("provider", PROVIDER);

    return classifyTenantStripeSubscriptionObservationsLookup(result);
  } catch {
    // Do not surface raw exception details in the public contract.
    return fail("stripe_subscription_lookup_failed");
  }
}
