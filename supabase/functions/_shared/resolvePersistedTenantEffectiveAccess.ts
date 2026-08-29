/**
 * Thin composition: persisted Stripe observations → candidate → tenant access.
 *
 * For commercial (standard) mode, reads Stripe subscription observations,
 * maps them to the Stripe entitlement candidate, then delegates final
 * composition (complimentary + domain resolver) to
 * resolveTenantEffectiveAccess.
 *
 * Demo and Internal do not observe Stripe subscriptions or complimentary
 * grants. Those modes are delegated with an absent Stripe candidate so
 * the existing resolveTenantEffectiveAccess fast-path skips complimentary
 * lookup.
 *
 * A Stripe reader failure is a composition failure: it is not coerced to
 * an absent or invalid candidate and does not continue into complimentary
 * composition. A semantically invalid Stripe candidate is forwarded
 * normally.
 *
 * Clients are injected. No createClient, env, or secrets.
 */

import { mapTenantStripeSubscriptionObservationsToCandidate } from "./mapTenantStripeSubscriptionObservationsToCandidate.ts";
import {
  readTenantStripeSubscriptionObservations,
  type ReadTenantStripeSubscriptionObservationsFailureReason,
  type TenantStripeSubscriptionObservationLookupClient,
} from "./readTenantStripeSubscriptionObservations.ts";
import {
  resolveTenantEffectiveAccess,
  type ResolveTenantEffectiveAccessFailureReason,
} from "./resolveTenantEffectiveAccess.ts";
import type {
  AccessMode,
  EffectiveAccess,
  ModeCapabilityProfiles,
} from "./resolveEffectiveAccess.ts";
import type { ComplimentaryAccessGrantLookupClient } from "./readTenantComplimentaryAccessCandidate.ts";

export type ResolvePersistedTenantEffectiveAccessFailureReason =
  | ReadTenantStripeSubscriptionObservationsFailureReason
  | ResolveTenantEffectiveAccessFailureReason;

export type ResolvePersistedTenantEffectiveAccessResult =
  | { ok: true; effectiveAccess: EffectiveAccess }
  | {
    ok: false;
    reason: ResolvePersistedTenantEffectiveAccessFailureReason;
  };

export type ResolvePersistedTenantEffectiveAccessParams = {
  tenantId: unknown;
  mode: AccessMode;
  modeProfiles: ModeCapabilityProfiles;
  stripeClient: TenantStripeSubscriptionObservationLookupClient;
  complimentaryClient: ComplimentaryAccessGrantLookupClient;
};

function fail(
  reason: ResolvePersistedTenantEffectiveAccessFailureReason,
): ResolvePersistedTenantEffectiveAccessResult {
  return { ok: false, reason };
}

/**
 * Compose persisted Stripe observations into tenant effective access.
 * Stripe lookup only on the standard path. Fail-closed on Stripe lookup.
 * Demo/Internal skip commercial lookups.
 */
export async function resolvePersistedTenantEffectiveAccess(
  params: ResolvePersistedTenantEffectiveAccessParams,
): Promise<ResolvePersistedTenantEffectiveAccessResult> {
  if (params.mode === "demo" || params.mode === "internal") {
    return await resolveTenantEffectiveAccess({
      tenantId: params.tenantId,
      client: params.complimentaryClient,
      mode: params.mode,
      stripeCandidate: { kind: "absent" },
      modeProfiles: params.modeProfiles,
    });
  }

  const stripeResult = await readTenantStripeSubscriptionObservations({
    tenantId: params.tenantId,
    client: params.stripeClient,
  });

  if (stripeResult.ok === false) {
    return fail(stripeResult.reason);
  }

  const stripeCandidate = mapTenantStripeSubscriptionObservationsToCandidate(
    stripeResult.observations,
  );

  return await resolveTenantEffectiveAccess({
    tenantId: params.tenantId,
    client: params.complimentaryClient,
    mode: params.mode,
    stripeCandidate,
    modeProfiles: params.modeProfiles,
  });
}
