/**
 * Read-only tenant_subscriptions row observation reader (I4.3BI).
 *
 * Trust boundary: observes the row identified by exact
 * (provider, provider_subscription_id) and returns ROW_ABSENT or ROW_PRESENT
 * with tenant_id + W_sub. Does not decide ownership (K2) or admission (BH).
 *
 * SELECT-only. No writes, no Stripe, no classifier call, no env, no wall-clock.
 */

export type ReadTenantSubscriptionObservationFailureReason =
  | "invalid_provider"
  | "invalid_provider_subscription_id"
  | "subscription_observation_lookup_failed"
  | "subscription_observation_ambiguous"
  | "subscription_observation_invalid";

/**
 * Explicit row observation. ROW_ABSENT is only zero matching rows —
 * never inferred from W_sub NULL/NULL.
 */
export type TenantSubscriptionRowObservation =
  | { kind: "row_absent" }
  | {
    kind: "row_present";
    tenant_id: string;
    last_applied_provider_event_created_at: number | null;
    last_applied_provider_event_id: string | null;
  };

export type ReadTenantSubscriptionObservationResult =
  | { ok: true; observation: TenantSubscriptionRowObservation }
  | { ok: false; reason: ReadTenantSubscriptionObservationFailureReason };

export type TenantSubscriptionObservationRow = {
  tenant_id: unknown;
  last_applied_provider_event_created_at: unknown;
  last_applied_provider_event_id: unknown;
};

export type TenantSubscriptionObservationLookupError = {
  code?: string;
  message?: string;
};

export type TenantSubscriptionObservationLookupResponse = {
  data: TenantSubscriptionObservationRow[] | null;
  error: TenantSubscriptionObservationLookupError | null;
};

/**
 * Minimal SELECT-only client surface.
 * Structural subset of a Supabase query builder for:
 *   .from(...).select(...).eq(provider).eq(provider_subscription_id)
 * The second `.eq` resolves to a Promise (awaitable), matching how callers
 * consume the filtered query without `.maybeSingle()` (array classification
 * stays in this module for explicit ambiguous handling).
 */
export type TenantSubscriptionObservationLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        eq: (
          column: string,
          value: string,
        ) => PromiseLike<TenantSubscriptionObservationLookupResponse>;
      };
    };
  };
};

export type ReadTenantSubscriptionObservationParams = {
  provider: unknown;
  provider_subscription_id: unknown;
  client: TenantSubscriptionObservationLookupClient;
};

function fail(
  reason: ReadTenantSubscriptionObservationFailureReason,
): ReadTenantSubscriptionObservationResult {
  return { ok: false, reason };
}

function succeed(
  observation: TenantSubscriptionRowObservation,
): ReadTenantSubscriptionObservationResult {
  return { ok: true, observation };
}

/**
 * Exact-identity validation: non-empty string that is not whitespace-only.
 * Does not trim/lower-case the value used for DB filters — identity is preserved.
 * Whitespace-only is rejected (fail-closed) without querying.
 */
function isValidExactIdentityString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim().length > 0;
}

function isValidTenantId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * W_sub admission timestamp from DB: null, or finite safe integer >= 0.
 * No Date, no string coercion, no wall-clock.
 */
function isValidWatermarkCreatedAt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/**
 * W_sub event id from DB: null, or exact non-empty non-whitespace-only string.
 * No trim/lower-case mutation of the returned identity.
 */
function isValidWatermarkEventId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim().length > 0;
}

/**
 * Validate a single present row. Strategy A for half-null:
 * return ROW_PRESENT faithfully when each non-null field is type-valid;
 * leave semantic half-null / admission decisions to classifySubscriptionEventAdmission.
 * Do not collapse half-null to null/null.
 */
function parsePresentRow(
  row: TenantSubscriptionObservationRow,
): ReadTenantSubscriptionObservationResult {
  if (!isValidTenantId(row.tenant_id)) {
    return fail("subscription_observation_invalid");
  }

  const rawCreatedAt = row.last_applied_provider_event_created_at;
  const rawEventId = row.last_applied_provider_event_id;

  let createdAt: number | null;
  if (rawCreatedAt === null) {
    createdAt = null;
  } else if (isValidWatermarkCreatedAt(rawCreatedAt)) {
    createdAt = rawCreatedAt;
  } else {
    return fail("subscription_observation_invalid");
  }

  let eventId: string | null;
  if (rawEventId === null) {
    eventId = null;
  } else if (isValidWatermarkEventId(rawEventId)) {
    eventId = rawEventId;
  } else {
    return fail("subscription_observation_invalid");
  }

  return succeed({
    kind: "row_present",
    tenant_id: row.tenant_id,
    last_applied_provider_event_created_at: createdAt,
    last_applied_provider_event_id: eventId,
  });
}

/**
 * Pure classifier for a SELECT result on tenant_subscriptions.
 * Never picks the first row when multiple rows are present.
 * ROW_ABSENT only when the array is empty (not from W NULL/NULL).
 */
export function classifyTenantSubscriptionObservationLookup(params: {
  error: TenantSubscriptionObservationLookupError | null;
  rows: TenantSubscriptionObservationRow[] | null;
}): ReadTenantSubscriptionObservationResult {
  if (params.error) {
    return fail("subscription_observation_lookup_failed");
  }

  const rows = params.rows;
  if (!Array.isArray(rows)) {
    return fail("subscription_observation_lookup_failed");
  }

  if (rows.length === 0) {
    return succeed({ kind: "row_absent" });
  }

  if (rows.length > 1) {
    return fail("subscription_observation_ambiguous");
  }

  const row = rows[0];
  if (!row || typeof row !== "object") {
    return fail("subscription_observation_invalid");
  }

  return parsePresentRow(row);
}

/**
 * Observe a tenant_subscriptions row by exact provider + provider_subscription_id.
 * SELECT-only. Fail-closed. Does not call the admission classifier.
 */
export async function readTenantSubscriptionObservation(
  params: ReadTenantSubscriptionObservationParams,
): Promise<ReadTenantSubscriptionObservationResult> {
  if (!isValidExactIdentityString(params.provider)) {
    return fail("invalid_provider");
  }
  if (!isValidExactIdentityString(params.provider_subscription_id)) {
    return fail("invalid_provider_subscription_id");
  }

  // Exact filter identity — no toLowerCase / trim canonicalization.
  const provider = params.provider;
  const providerSubscriptionId = params.provider_subscription_id;

  let data: TenantSubscriptionObservationRow[] | null = null;
  let error: TenantSubscriptionObservationLookupError | null = null;

  try {
    const result = await params.client
      .from("tenant_subscriptions")
      .select(
        "tenant_id,last_applied_provider_event_created_at,last_applied_provider_event_id",
      )
      .eq("provider", provider)
      .eq("provider_subscription_id", providerSubscriptionId);

    data = Array.isArray(result.data) ? result.data : null;
    error = result.error ?? null;
  } catch {
    // Do not surface raw exception details in the public contract.
    return fail("subscription_observation_lookup_failed");
  }

  return classifyTenantSubscriptionObservationLookup({ error, rows: data });
}
