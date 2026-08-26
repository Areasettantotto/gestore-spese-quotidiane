/**
 * Atomic tenant_subscriptions snapshot + W_sub persistence helper (BILLING-47).
 *
 * Executes one caller-authorized write: INSERT (first observation) or
 * conditional UPDATE / CAS on the observed W_sub. Does not classify BH
 * admission, reread BI, refetch Stripe, write processed_at, or bump
 * billing_state_revision (G1 increments the current tenant-level value by 1
 * as a DB side effect of the tenant_subscriptions write).
 *
 * Client is injected. No createClient, env, or secrets.
 */

import type { NormalizedStripeSubscription } from "./normalizeStripeSubscription.ts";

const PROVIDER = "stripe" as const;
const UNIQUE_VIOLATION_CODE = "23505";
const CONFIRMATION_COLUMNS = "id";

export type PersistTenantSubscriptionCandidateFailureReason =
  | "subscription_insert_conflict"
  | "subscription_cas_miss"
  | "subscription_persistence_failed";

export type PersistTenantSubscriptionCandidateResult =
  | { ok: true; kind: "inserted" | "updated" }
  | { ok: false; reason: PersistTenantSubscriptionCandidateFailureReason };

/**
 * Expected W_sub for UPDATE CAS.
 *
 * Discriminated union: uninitialized vs initialized. Initialized
 * structurally requires both watermark fields. Runtime validates
 * type/content of both values before the query; malformed / half-null
 * input is rejected fail-closed without a write. Uninitialized pins
 * IS NULL on both columns; initialized pins equality on both observed
 * values. This compiler configuration does not prove that `null` is
 * unassignable to the initialized number/string fields.
 */
export type PersistTenantSubscriptionCandidateExpectedWatermark =
  | { kind: "uninitialized" }
  | {
    kind: "initialized";
    last_applied_provider_event_created_at: number;
    last_applied_provider_event_id: string;
  };

export type PersistTenantSubscriptionCandidateOperation =
  | { kind: "insert" }
  | {
    kind: "update";
    expected_watermark: PersistTenantSubscriptionCandidateExpectedWatermark;
  };

export type TenantSubscriptionPersistenceWriteError = {
  code?: string;
  message?: string;
};

export type TenantSubscriptionPersistenceConfirmationRow = {
  id?: unknown;
};

export type TenantSubscriptionPersistenceWriteResponse = {
  data: TenantSubscriptionPersistenceConfirmationRow | null;
  error: TenantSubscriptionPersistenceWriteError | null;
};

export type TenantSubscriptionInsertWriteValues = {
  tenant_id: string;
  provider: typeof PROVIDER;
  provider_subscription_id: string;
  provider_customer_id: string;
  plan_code: NormalizedStripeSubscription["plan_code"];
  product_tier: NormalizedStripeSubscription["productTier"];
  status: NormalizedStripeSubscription["status"];
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  last_applied_provider_event_created_at: number;
  last_applied_provider_event_id: string;
};

export type TenantSubscriptionUpdateWriteValues = {
  provider_subscription_id: string;
  provider_customer_id: string;
  plan_code: NormalizedStripeSubscription["plan_code"];
  product_tier: NormalizedStripeSubscription["productTier"];
  status: NormalizedStripeSubscription["status"];
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  last_applied_provider_event_created_at: number;
  last_applied_provider_event_id: string;
};

/**
 * Structural subset of a Supabase query builder for:
 *   INSERT: .from().insert(row).select(min).maybeSingle()
 *   UPDATE: .from().update(row).eq/eq/eq + is/is or eq/eq .select(min).maybeSingle()
 * No upsert / onConflict surface.
 */
export type TenantSubscriptionPersistenceFilterBuilder = {
  eq: (
    column: string,
    value: string | number,
  ) => TenantSubscriptionPersistenceFilterBuilder;
  is: (
    column: string,
    value: null,
  ) => TenantSubscriptionPersistenceFilterBuilder;
  select: (columns: string) => {
    maybeSingle: () => PromiseLike<TenantSubscriptionPersistenceWriteResponse>;
  };
};

export type TenantSubscriptionPersistenceClient = {
  from: (table: string) => {
    insert: (values: TenantSubscriptionInsertWriteValues) => {
      select: (columns: string) => {
        maybeSingle: () => PromiseLike<
          TenantSubscriptionPersistenceWriteResponse
        >;
      };
    };
    update: (
      values: TenantSubscriptionUpdateWriteValues,
    ) => TenantSubscriptionPersistenceFilterBuilder;
  };
};

export type PersistTenantSubscriptionCandidateParams = {
  client: TenantSubscriptionPersistenceClient;
  /** BF tenant authority. Never derived from the Stripe snapshot. */
  tenant_id: string;
  snapshot: NormalizedStripeSubscription;
  /** Current Event.created (Unix seconds). Written as the new W_sub timestamp. */
  provider_event_created_at: number;
  /** Current Event.id exact identity. Written as the new W_sub event id. */
  provider_event_id: string;
  operation: PersistTenantSubscriptionCandidateOperation;
};

function fail(
  reason: PersistTenantSubscriptionCandidateFailureReason,
): PersistTenantSubscriptionCandidateResult {
  return { ok: false, reason };
}

function succeed(
  kind: "inserted" | "updated",
): PersistTenantSubscriptionCandidateResult {
  return { ok: true, kind };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidProviderEventCreatedAt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isUniqueViolation(
  error: TenantSubscriptionPersistenceWriteError | null,
): boolean {
  return error?.code === UNIQUE_VIOLATION_CODE;
}

function snapshotWriteFields(snapshot: NormalizedStripeSubscription) {
  return {
    provider_subscription_id: snapshot.provider_subscription_id,
    provider_customer_id: snapshot.provider_customer_id,
    plan_code: snapshot.plan_code,
    product_tier: snapshot.productTier,
    status: snapshot.status,
    current_period_start: snapshot.current_period_start,
    current_period_end: snapshot.current_period_end,
    cancel_at_period_end: snapshot.cancel_at_period_end,
    trial_ends_at: snapshot.trial_ends_at,
  };
}

function watermarkWriteFields(
  providerEventCreatedAt: number,
  providerEventId: string,
) {
  return {
    last_applied_provider_event_created_at: providerEventCreatedAt,
    last_applied_provider_event_id: providerEventId,
  };
}

function classifyConfirmedWrite(params: {
  response: TenantSubscriptionPersistenceWriteResponse;
  successKind: "inserted" | "updated";
  uniqueViolationReason: PersistTenantSubscriptionCandidateFailureReason | null;
  emptySuccessReason: PersistTenantSubscriptionCandidateFailureReason;
}): PersistTenantSubscriptionCandidateResult {
  const { response, successKind, uniqueViolationReason, emptySuccessReason } =
    params;

  if (response.error) {
    if (uniqueViolationReason && isUniqueViolation(response.error)) {
      return fail(uniqueViolationReason);
    }
    return fail("subscription_persistence_failed");
  }

  if (response.data !== null && typeof response.data === "object") {
    return succeed(successKind);
  }

  return fail(emptySuccessReason);
}

async function persistInsert(
  params: PersistTenantSubscriptionCandidateParams,
): Promise<PersistTenantSubscriptionCandidateResult> {
  const values: TenantSubscriptionInsertWriteValues = {
    tenant_id: params.tenant_id,
    provider: PROVIDER,
    ...snapshotWriteFields(params.snapshot),
    ...watermarkWriteFields(
      params.provider_event_created_at,
      params.provider_event_id,
    ),
  };

  let response: TenantSubscriptionPersistenceWriteResponse;
  try {
    response = await params.client
      .from("tenant_subscriptions")
      .insert(values)
      .select(CONFIRMATION_COLUMNS)
      .maybeSingle();
  } catch {
    return fail("subscription_persistence_failed");
  }

  return classifyConfirmedWrite({
    response,
    successKind: "inserted",
    uniqueViolationReason: "subscription_insert_conflict",
    emptySuccessReason: "subscription_persistence_failed",
  });
}

async function persistUpdate(
  params: PersistTenantSubscriptionCandidateParams,
  expectedWatermark: PersistTenantSubscriptionCandidateExpectedWatermark,
): Promise<PersistTenantSubscriptionCandidateResult> {
  if (expectedWatermark.kind === "initialized") {
    if (
      !isValidProviderEventCreatedAt(
        expectedWatermark.last_applied_provider_event_created_at,
      ) ||
      !isNonEmptyString(expectedWatermark.last_applied_provider_event_id)
    ) {
      return fail("subscription_persistence_failed");
    }
  } else if (expectedWatermark.kind !== "uninitialized") {
    return fail("subscription_persistence_failed");
  }

  const values: TenantSubscriptionUpdateWriteValues = {
    ...snapshotWriteFields(params.snapshot),
    ...watermarkWriteFields(
      params.provider_event_created_at,
      params.provider_event_id,
    ),
  };

  let response: TenantSubscriptionPersistenceWriteResponse;
  try {
    let query = params.client
      .from("tenant_subscriptions")
      .update(values)
      .eq("provider", PROVIDER)
      .eq(
        "provider_subscription_id",
        params.snapshot.provider_subscription_id,
      )
      .eq("tenant_id", params.tenant_id);

    if (expectedWatermark.kind === "uninitialized") {
      query = query
        .is("last_applied_provider_event_created_at", null)
        .is("last_applied_provider_event_id", null);
    } else {
      query = query
        .eq(
          "last_applied_provider_event_created_at",
          expectedWatermark.last_applied_provider_event_created_at,
        )
        .eq(
          "last_applied_provider_event_id",
          expectedWatermark.last_applied_provider_event_id,
        );
    }

    response = await query.select(CONFIRMATION_COLUMNS).maybeSingle();
  } catch {
    return fail("subscription_persistence_failed");
  }

  return classifyConfirmedWrite({
    response,
    successKind: "updated",
    uniqueViolationReason: null,
    emptySuccessReason: "subscription_cas_miss",
  });
}

/**
 * Persist a BH-admitted tenant_subscriptions candidate.
 * One INSERT or one CAS UPDATE. Fail-closed. No retry, reread, or HTTP.
 */
export async function persistTenantSubscriptionCandidate(
  params: PersistTenantSubscriptionCandidateParams,
): Promise<PersistTenantSubscriptionCandidateResult> {
  if (!isNonEmptyString(params.tenant_id)) {
    return fail("subscription_persistence_failed");
  }
  if (!isValidProviderEventCreatedAt(params.provider_event_created_at)) {
    return fail("subscription_persistence_failed");
  }
  if (!isNonEmptyString(params.provider_event_id)) {
    return fail("subscription_persistence_failed");
  }
  if (!isNonEmptyString(params.snapshot?.provider_subscription_id)) {
    return fail("subscription_persistence_failed");
  }

  const operation = params.operation;
  if (operation.kind === "insert") {
    return await persistInsert(params);
  }
  if (operation.kind === "update") {
    return await persistUpdate(params, operation.expected_watermark);
  }

  return fail("subscription_persistence_failed");
}
