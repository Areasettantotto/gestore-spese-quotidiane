/**
 * Thin composition: complimentary grant reader → effective access.
 *
 * For commercial (standard) mode, reads the current complimentary
 * candidate for an already-resolved tenant, then forwards it into
 * resolveEffectiveAccess together with the caller-supplied Stripe
 * candidate and mode inputs.
 *
 * Demo and Internal do not observe tenant_complimentary_access_grants.
 * Those modes are delegated to resolveEffectiveAccess, which applies
 * the mode profile before any commercial slot.
 *
 * Does not reimplement Stripe lookup, rewrite precedence, accept
 * source from the caller or DB, authorize the tenant, or write.
 * Complimentary lookup failure on the standard path is fail-closed
 * and is never coerced to an absent candidate.
 *
 * Client is injected. No createClient, env, or secrets.
 */

import {
  readTenantComplimentaryAccessCandidate,
  type ComplimentaryAccessGrantLookupClient,
  type ReadTenantComplimentaryAccessCandidateFailureReason,
} from "./readTenantComplimentaryAccessCandidate.ts";
import {
  resolveEffectiveAccess,
  type AccessMode,
  type EffectiveAccess,
  type EntitlementCandidate,
  type ModeCapabilityProfiles,
} from "./resolveEffectiveAccess.ts";

export type ResolveTenantEffectiveAccessFailureReason =
  ReadTenantComplimentaryAccessCandidateFailureReason;

export type ResolveTenantEffectiveAccessResult =
  | { ok: true; effectiveAccess: EffectiveAccess }
  | { ok: false; reason: ResolveTenantEffectiveAccessFailureReason };

export type ResolveTenantEffectiveAccessParams = {
  tenantId: unknown;
  client: ComplimentaryAccessGrantLookupClient;
  mode: AccessMode;
  stripeCandidate: EntitlementCandidate;
  modeProfiles: ModeCapabilityProfiles;
};

function fail(
  reason: ResolveTenantEffectiveAccessFailureReason,
): ResolveTenantEffectiveAccessResult {
  return { ok: false, reason };
}

function succeed(
  effectiveAccess: EffectiveAccess,
): ResolveTenantEffectiveAccessResult {
  return { ok: true, effectiveAccess };
}

/**
 * Compose tenant complimentary observation with an already-produced
 * Stripe candidate. Complimentary SELECT only on the standard path.
 * Fail-closed on complimentary lookup. Demo/Internal skip that lookup.
 */
export async function resolveTenantEffectiveAccess(
  params: ResolveTenantEffectiveAccessParams,
): Promise<ResolveTenantEffectiveAccessResult> {
  if (params.mode === "demo" || params.mode === "internal") {
    return succeed(
      resolveEffectiveAccess({
        mode: params.mode,
        stripeCandidate: params.stripeCandidate,
        complimentaryCandidate: { kind: "absent" },
        modeProfiles: params.modeProfiles,
      }),
    );
  }

  const complimentaryResult = await readTenantComplimentaryAccessCandidate({
    client: params.client,
    tenantId: params.tenantId,
  });

  if (complimentaryResult.ok === false) {
    return fail(complimentaryResult.reason);
  }

  return succeed(
    resolveEffectiveAccess({
      mode: params.mode,
      stripeCandidate: params.stripeCandidate,
      complimentaryCandidate: complimentaryResult.candidate,
      modeProfiles: params.modeProfiles,
    }),
  );
}
