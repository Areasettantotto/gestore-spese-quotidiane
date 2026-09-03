/**
 * EffectiveAccess tenant authorization (BILLING-96).
 *
 * Audience: any authenticated tenant member, via ensureTenantMembership.
 * Does not choose HTTP, persistence, clients, env, or capability profiles.
 *
 * AuthContext + tenantId + optional membership dependencies
 *   → ensureTenantMembership
 *   → failure Response unchanged
 *   → { ok: true }
 *
 * Compatible with AuthorizeTenant (BILLING-89): extra optional dependencies
 * are ignored when the function is used as a two-argument authorizer.
 */

import {
  ensureTenantMembership,
  type AuthContext,
  type EnsureTenantMembershipDependencies,
} from "./auth.ts";
import type { AuthorizeTenantOk } from "./handleEffectiveAccessRequest.ts";

export async function authorizeTenantEffectiveAccess(
  auth: AuthContext,
  tenantId: string,
  dependencies?: EnsureTenantMembershipDependencies,
): Promise<AuthorizeTenantOk | Response> {
  const membership = await ensureTenantMembership(
    auth,
    tenantId,
    dependencies,
  );
  if (membership instanceof Response) {
    return membership;
  }

  return { ok: true };
}
