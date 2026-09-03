/**
 * Pure dependency binder: EffectiveAccess persistence dependencies →
 * `ResolveEffectiveAccess` (BILLING-95).
 *
 * Partial application only. The returned resolver forwards `tenantId` and
 * the caller-supplied dependencies unchanged to
 * resolveHttpSafeTenantEffectiveAccessFromPersistence and returns its
 * result as-is (EffectiveAccess | Response).
 *
 * Does NOT create, clone, default, or reinterpret any dependency.
 * Does NOT authenticate, authorize, choose audience, read env, build
 * clients, serialize, map persistence failures, or expose HTTP.
 *
 * ModeCapabilityProfiles and all persistence clients remain caller-supplied.
 */

import type { ResolveEffectiveAccess } from "./handleEffectiveAccessRequest.ts";
import { resolveHttpSafeTenantEffectiveAccessFromPersistence } from "./resolveHttpSafeTenantEffectiveAccessFromPersistence.ts";
import type { ResolveTenantEffectiveAccessFromPersistenceParams } from "./resolveTenantEffectiveAccessFromPersistence.ts";

/**
 * Everything the persistence resolver needs except the per-request
 * `tenantId`. Every field is required; `complimentaryClient` included.
 */
export type CreateEffectiveAccessResolverDependencies = Omit<
  ResolveTenantEffectiveAccessFromPersistenceParams,
  "tenantId"
>;

/**
 * Bind persistence dependencies once; resolve per tenantId later.
 * Each resolver invocation is one independent composition call.
 */
export function createEffectiveAccessResolver(
  dependencies: CreateEffectiveAccessResolverDependencies,
): ResolveEffectiveAccess {
  return (tenantId) =>
    resolveHttpSafeTenantEffectiveAccessFromPersistence({
      tenantId,
      accessModeClient: dependencies.accessModeClient,
      modeProfiles: dependencies.modeProfiles,
      stripeClient: dependencies.stripeClient,
      complimentaryClient: dependencies.complimentaryClient,
    });
}
