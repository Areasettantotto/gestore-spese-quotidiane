/**
 * Thin composition: tenantId → persisted EffectiveAccess → HTTP-safe
 * EffectiveAccess | Response (BILLING-93).
 *
 * Calls resolveTenantEffectiveAccessFromPersistence with the caller params
 * object unchanged, then returns adaptEffectiveAccessPersistenceResult of
 * that result. No extra policy, mapping, serialization, or HTTP envelope.
 *
 * Return type is the resolver contract used by handleEffectiveAccessRequest
 * (EffectiveAccess | Response). This module does not call that core, choose
 * audience, authenticate, or create clients/env.
 *
 * ModeCapabilityProfiles remain caller-supplied and are forwarded as-is.
 */

import { adaptEffectiveAccessPersistenceResult } from "./adaptEffectiveAccessPersistenceResult.ts";
import {
  resolveTenantEffectiveAccessFromPersistence,
  type ResolveTenantEffectiveAccessFromPersistenceParams,
} from "./resolveTenantEffectiveAccessFromPersistence.ts";
import type { EffectiveAccess } from "./resolveEffectiveAccess.ts";

/**
 * Compose persisted tenant effective access into an HTTP-safe domain value
 * or failure Response. Persistence runs first; adaptation is the only
 * subsequent step.
 */
export async function resolveHttpSafeTenantEffectiveAccessFromPersistence(
  params: ResolveTenantEffectiveAccessFromPersistenceParams,
): Promise<EffectiveAccess | Response> {
  const persisted = await resolveTenantEffectiveAccessFromPersistence(params);
  return adaptEffectiveAccessPersistenceResult(persisted);
}
