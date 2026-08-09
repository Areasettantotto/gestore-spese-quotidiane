/**
 * Pure W_sub / K2 admission classifier for Subscription Events (I4.3BH).
 *
 * Classifies which future admission branch should run given:
 *   - current Event identity (provider_event_created_at, provider_event_id)
 *   - billing_event completion flag (processed vs not)
 *   - observed tenant_subscriptions row presence + W_sub
 *
 * Does NOT execute INSERT/UPDATE/CAS, Stripe, Supabase, Snapshot, or webhook wiring.
 * Deterministic: same input → same output. No wall-clock / network / mutable state.
 */

export type SubscriptionEventAdmissionFailureReason =
  | "invalid_provider_event_created_at"
  | "invalid_provider_event_id"
  | "invalid_watermark"
  | "inconsistent_same_event";

/**
 * Semantic admission class. Candidate kinds describe future paths only —
 * this module never builds CAS predicates or DB statements.
 */
export type SubscriptionEventAdmissionKind =
  | "candidate_row_absent"
  | "candidate_row_present_uninitialized"
  | "candidate_newer_event"
  | "candidate_equal_timestamp_distinct_event"
  | "stale_event"
  | "partial_retry"
  | "already_applied";

export type ClassifySubscriptionEventAdmissionResult =
  | { ok: true; kind: SubscriptionEventAdmissionKind }
  | { ok: false; reason: SubscriptionEventAdmissionFailureReason };

/**
 * Explicit row presence. Do NOT infer absent from W_sub NULL/NULL:
 * ROW_ABSENT → future INSERT; ROW_PRESENT + NULL/NULL → future conditional UPDATE/CAS.
 */
export type TenantSubscriptionAdmissionRowObservation =
  | { presence: "absent" }
  | {
    presence: "present";
    last_applied_provider_event_created_at: unknown;
    last_applied_provider_event_id: unknown;
  };

export type ClassifySubscriptionEventAdmissionParams = {
  /** Provider Event.created (Unix seconds integer). Not Subscription timestamp. */
  provider_event_created_at: unknown;
  /** Provider Event.id exact identity. Not a chronological clock / tie-break. */
  provider_event_id: unknown;
  /**
   * Whether the current billing_event is already completed.
   * Runtime source remains processed_at NULL / NOT NULL; this classifier
   * receives only the boolean discriminant.
   */
  billing_event_processed: boolean;
  tenant_subscription_row: TenantSubscriptionAdmissionRowObservation;
};

function fail(
  reason: SubscriptionEventAdmissionFailureReason,
): ClassifySubscriptionEventAdmissionResult {
  return { ok: false, reason };
}

function succeed(
  kind: SubscriptionEventAdmissionKind,
): ClassifySubscriptionEventAdmissionResult {
  return { ok: true, kind };
}

/**
 * Event / W_sub admission timestamp: finite integer number (bigint-compatible
 * safe integer range). No Date.now, no string coercion, no wall-clock.
 */
function isValidProviderEventCreatedAt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

/**
 * Exact-identity non-empty string. Empty fails. No trim / toLowerCase mutation.
 * Whitespace-containing values are kept as-is when length > 0.
 */
function isValidProviderEventId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

type InitializedWatermark = {
  last_applied_provider_event_created_at: number;
  last_applied_provider_event_id: string;
};

type WatermarkParseResult =
  | { ok: true; state: "uninitialized" }
  | { ok: true; state: "initialized"; watermark: InitializedWatermark }
  | { ok: false };

/**
 * W_sub for ROW_PRESENT:
 *   A. both NULL → uninitialized
 *   B. both valorized → initialized (validated)
 *   half-null or invalid valorized fields → fail-closed (invalid_watermark)
 */
function parsePresentWatermark(row: {
  last_applied_provider_event_created_at: unknown;
  last_applied_provider_event_id: unknown;
}): WatermarkParseResult {
  const createdAt = row.last_applied_provider_event_created_at;
  const eventId = row.last_applied_provider_event_id;

  const createdNull = createdAt === null;
  const idNull = eventId === null;

  if (createdNull && idNull) {
    return { ok: true, state: "uninitialized" };
  }

  // Half-null: one NULL, one present — local inconsistency, do not reinterpret.
  if (createdNull !== idNull) {
    return { ok: false };
  }

  if (!isValidProviderEventCreatedAt(createdAt)) {
    return { ok: false };
  }
  if (!isValidProviderEventId(eventId)) {
    return { ok: false };
  }

  return {
    ok: true,
    state: "initialized",
    watermark: {
      last_applied_provider_event_created_at: createdAt,
      last_applied_provider_event_id: eventId,
    },
  };
}

/**
 * Classify K2/W_sub admission for a Subscription Event.
 * Pure / deterministic / fail-closed. Does not mutate or I/O.
 */
export function classifySubscriptionEventAdmission(
  params: ClassifySubscriptionEventAdmissionParams,
): ClassifySubscriptionEventAdmissionResult {
  if (!isValidProviderEventCreatedAt(params.provider_event_created_at)) {
    return fail("invalid_provider_event_created_at");
  }
  if (!isValidProviderEventId(params.provider_event_id)) {
    return fail("invalid_provider_event_id");
  }

  // Exact Event identity — no trim / case canonicalization.
  const eventCreatedAt = params.provider_event_created_at;
  const eventId = params.provider_event_id;
  const billingEventProcessed = params.billing_event_processed;

  const row = params.tenant_subscription_row;

  if (row.presence === "absent") {
    return succeed("candidate_row_absent");
  }

  if (row.presence !== "present") {
    // Defensive: unknown presence discriminant → fail-closed as watermark/local.
    return fail("invalid_watermark");
  }

  const watermark = parsePresentWatermark(row);
  if (!watermark.ok) {
    return fail("invalid_watermark");
  }

  if (watermark.state === "uninitialized") {
    return succeed("candidate_row_present_uninitialized");
  }

  const w = watermark.watermark;
  const sameEventId = w.last_applied_provider_event_id === eventId;

  if (sameEventId) {
    if (w.last_applied_provider_event_created_at === eventCreatedAt) {
      // Same Event identity + same watermark time.
      // Distinguish partial retry (billing_event not completed) from already applied.
      if (billingEventProcessed) {
        return succeed("already_applied");
      }
      return succeed("partial_retry");
    }
    // Same event.id cannot be treated as a chronologically different Event.
    return fail("inconsistent_same_event");
  }

  // Distinct event.id — compare ONLY Event.created vs W.created.
  // NEVER use event.id as chronological clock or lexicographic tie-break.
  const wCreatedAt = w.last_applied_provider_event_created_at;

  if (eventCreatedAt > wCreatedAt) {
    return succeed("candidate_newer_event");
  }
  if (eventCreatedAt < wCreatedAt) {
    return succeed("stale_event");
  }
  // Equal timestamp + distinct event id → candidate; no id ordering.
  return succeed("candidate_equal_timestamp_distinct_event");
}
