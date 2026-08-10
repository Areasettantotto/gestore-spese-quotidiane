/**
 * Read-only Stripe Subscription pre-admission context orchestrator (I4.3BL / K2).
 *
 * Sequence (non-negotiable):
 *   BJ (fetchNormalizedStripeSubscription)
 *   → identity continuity (bootstrap === normalized.provider_subscription_id)
 *   → BF (resolveBillingCustomerTenant)
 *   → BI (readTenantSubscriptionObservation)
 *   → ownership fail-closed
 *
 * No BH / processed_at / Event input / webhook payload / writes / CAS / Snapshot.
 * No Deno.env. No Stripe SDK import. No artificial client casts.
 */

import {
  fetchNormalizedStripeSubscription,
  type FetchNormalizedStripeSubscriptionResult,
} from "./fetchNormalizedStripeSubscription.ts";
import type {
  NormalizeStripeSubscriptionConfig,
  NormalizedStripeSubscription,
} from "./normalizeStripeSubscription.ts";
import type { StripeSubscriptionRetrieveClient } from "./refetchStripeSubscription.ts";
import {
  resolveBillingCustomerTenant,
  type BillingCustomerTenantLookupClient,
  type ResolveBillingCustomerTenantFailureReason,
} from "./resolveBillingCustomerTenant.ts";
import {
  readTenantSubscriptionObservation,
  type ReadTenantSubscriptionObservationFailureReason,
  type TenantSubscriptionObservationLookupClient,
  type TenantSubscriptionRowObservation,
} from "./readTenantSubscriptionObservation.ts";

/** Stripe provider literal used for BF / BI lookups (schema-aligned). */
const STRIPE_PROVIDER = "stripe";

export type ResolveStripeSubscriptionPreAdmissionContextParams = {
  /** Bootstrap subscription identity — sole identity input (exact; no trim/lower). */
  provider_subscription_id: unknown;
  /** Structural Stripe retrieve client (same contract as BJ/BG). */
  stripe: StripeSubscriptionRetrieveClient;
  /** Forwarded verbatim to BJ → BE — never read from env here. */
  config: NormalizeStripeSubscriptionConfig;
  /** SELECT-only BF client (distinct field; may share a runtime object later). */
  billingCustomerTenantClient: BillingCustomerTenantLookupClient;
  /** SELECT-only BI client (distinct field; may share a runtime object later). */
  tenantSubscriptionObservationClient: TenantSubscriptionObservationLookupClient;
};

export type ResolveStripeSubscriptionPreAdmissionContextSuccess = {
  ok: true;
  /** Normalized subscription produced by BJ — no reinterpretation. */
  normalized_subscription: NormalizedStripeSubscription;
  /** Tenant resolved exclusively by BF. */
  tenant_id: string;
  /** Full BI observation (ROW_ABSENT or ROW_PRESENT including W NULL/NULL). */
  observation: TenantSubscriptionRowObservation;
};

/**
 * Failures preserve primitive reasons. New orchestrator-only reasons:
 *   subscription_identity_mismatch
 *   subscription_ownership_mismatch
 *
 * BJ refetch / normalize failures reuse BJ stage names so callers can
 * distinguish without renaming primitive reasons.
 */
export type ResolveStripeSubscriptionPreAdmissionContextFailure =
  | {
    ok: false;
    stage: "refetch";
    reason: Extract<
      FetchNormalizedStripeSubscriptionResult,
      { ok: false; stage: "refetch" }
    >["reason"];
  }
  | {
    ok: false;
    stage: "normalize";
    reason: Extract<
      FetchNormalizedStripeSubscriptionResult,
      { ok: false; stage: "normalize" }
    >["reason"];
  }
  | {
    ok: false;
    stage: "identity";
    reason: "subscription_identity_mismatch";
  }
  | {
    ok: false;
    stage: "resolve_tenant";
    reason: ResolveBillingCustomerTenantFailureReason;
  }
  | {
    ok: false;
    stage: "observe_subscription";
    reason: ReadTenantSubscriptionObservationFailureReason;
  }
  | {
    ok: false;
    stage: "ownership";
    reason: "subscription_ownership_mismatch";
  };

export type ResolveStripeSubscriptionPreAdmissionContextResult =
  | ResolveStripeSubscriptionPreAdmissionContextSuccess
  | ResolveStripeSubscriptionPreAdmissionContextFailure;

/**
 * Build a read-only pre-admission context for a Stripe Subscription.
 * Fail-closed at every stage. Does not classify admission or mutate state.
 */
export async function resolveStripeSubscriptionPreAdmissionContext(
  params: ResolveStripeSubscriptionPreAdmissionContextParams,
): Promise<ResolveStripeSubscriptionPreAdmissionContextResult> {
  // 1–3. BJ first — fresh provider-authoritative refetch → normalize.
  const bjResult = await fetchNormalizedStripeSubscription({
    provider_subscription_id: params.provider_subscription_id,
    stripe: params.stripe,
    config: params.config,
  });

  if (bjResult.ok === false) {
    // Preserve BJ stage + reason verbatim (refetch vs normalize).
    // Narrow by stage so the correlated reason stays correctly typed.
    if (bjResult.stage === "refetch") {
      return {
        ok: false,
        stage: "refetch",
        reason: bjResult.reason,
      };
    }
    return {
      ok: false,
      stage: "normalize",
      reason: bjResult.reason,
    };
  }

  const normalized = bjResult.value;

  // 4–5. Identity continuity: bootstrap id EXACTLY equals normalized id.
  // No trim / lowercase / canonicalize — mismatch → fail-closed.
  if (normalized.provider_subscription_id !== params.provider_subscription_id) {
    return {
      ok: false,
      stage: "identity",
      reason: "subscription_identity_mismatch",
    };
  }

  // 6–7. BF — tenant from billing customer mapping only.
  const bfResult = await resolveBillingCustomerTenant({
    provider: STRIPE_PROVIDER,
    provider_customer_id: normalized.provider_customer_id,
    client: params.billingCustomerTenantClient,
  });

  if (bfResult.ok === false) {
    return {
      ok: false,
      stage: "resolve_tenant",
      reason: bfResult.reason,
    };
  }

  const tenantId = bfResult.tenant_id;

  // 8–9. BI — observe tenant_subscriptions row by normalized subscription id.
  const biResult = await readTenantSubscriptionObservation({
    provider: STRIPE_PROVIDER,
    provider_subscription_id: normalized.provider_subscription_id,
    client: params.tenantSubscriptionObservationClient,
  });

  if (biResult.ok === false) {
    return {
      ok: false,
      stage: "observe_subscription",
      reason: biResult.reason,
    };
  }

  const observation = biResult.observation;

  // 10. Ownership fail-closed (no remap / upsert / metadata fallback).
  if (observation.kind === "row_absent") {
    // No tenant row to compare — BF tenant is the sole ownership authority
    // for a future INSERT (not performed here).
    return {
      ok: true,
      normalized_subscription: normalized,
      tenant_id: tenantId,
      observation,
    };
  }

  // ROW_PRESENT (including W NULL/NULL) — compare tenant_id exactly.
  if (observation.tenant_id !== tenantId) {
    return {
      ok: false,
      stage: "ownership",
      reason: "subscription_ownership_mismatch",
    };
  }

  return {
    ok: true,
    normalized_subscription: normalized,
    tenant_id: tenantId,
    observation,
  };
}
