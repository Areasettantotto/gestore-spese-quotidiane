/**
 * Thin composition: persisted AccessMode → persisted EffectiveAccess (BILLING-85).
 *
 * Reads AccessMode first. On reader failure the composition stops:
 * no Stripe lookup, no complimentary lookup, no EffectiveAccess.
 *
 * On success, AccessMode is forwarded unchanged to
 * resolvePersistedTenantEffectiveAccess together with the caller-supplied
 * tenantId, modeProfiles, and commercial clients.
 *
 * Orchestration only. Does not reinterpret AccessMode, invent ProductTier,
 * authorize the caller, query the database, or create clients/env.
 *
 * Clients are injected. No createClient, env, or secrets.
 */

import {
  readTenantAccessMode,
  type ReadTenantAccessModeFailureReason,
  type TenantAccessModeLookupClient,
} from "./readTenantAccessMode.ts";
import {
  resolvePersistedTenantEffectiveAccess,
  type ResolvePersistedTenantEffectiveAccessFailureReason,
} from "./resolvePersistedTenantEffectiveAccess.ts";
import type { ComplimentaryAccessGrantLookupClient } from "./readTenantComplimentaryAccessCandidate.ts";
import type { TenantStripeSubscriptionObservationLookupClient } from "./readTenantStripeSubscriptionObservations.ts";
import type {
  EffectiveAccess,
  ModeCapabilityProfiles,
} from "./resolveEffectiveAccess.ts";

export type ResolveTenantEffectiveAccessFromPersistenceFailureReason =
  | ReadTenantAccessModeFailureReason
  | ResolvePersistedTenantEffectiveAccessFailureReason;

export type ResolveTenantEffectiveAccessFromPersistenceResult =
  | { ok: true; effectiveAccess: EffectiveAccess }
  | {
    ok: false;
    reason: ResolveTenantEffectiveAccessFromPersistenceFailureReason;
  };

export type ResolveTenantEffectiveAccessFromPersistenceParams = {
  tenantId: unknown;
  accessModeClient: TenantAccessModeLookupClient;
  modeProfiles: ModeCapabilityProfiles;
  stripeClient: TenantStripeSubscriptionObservationLookupClient;
  complimentaryClient: ComplimentaryAccessGrantLookupClient;
};

function fail(
  reason: ResolveTenantEffectiveAccessFromPersistenceFailureReason,
): ResolveTenantEffectiveAccessFromPersistenceResult {
  return { ok: false, reason };
}

/**
 * Compose persisted AccessMode into persisted tenant effective access.
 * AccessMode lookup always runs first. Fail-closed on AccessMode lookup.
 * Commercial lookups run only after a successful AccessMode read, and
 * only via the existing persisted-access wrapper.
 */
export async function resolveTenantEffectiveAccessFromPersistence(
  params: ResolveTenantEffectiveAccessFromPersistenceParams,
): Promise<ResolveTenantEffectiveAccessFromPersistenceResult> {
  const accessModeResult = await readTenantAccessMode({
    tenantId: params.tenantId,
    client: params.accessModeClient,
  });

  if (accessModeResult.ok === false) {
    return fail(accessModeResult.reason);
  }

  return await resolvePersistedTenantEffectiveAccess({
    tenantId: params.tenantId,
    mode: accessModeResult.mode,
    modeProfiles: params.modeProfiles,
    stripeClient: params.stripeClient,
    complimentaryClient: params.complimentaryClient,
  });
}
