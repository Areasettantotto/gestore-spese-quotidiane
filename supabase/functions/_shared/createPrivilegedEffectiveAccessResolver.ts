/**
 * Privileged EffectiveAccess resolver factory (BILLING-101).
 *
 * Caller-supplied Supabase URL + service-role key + ModeCapabilityProfiles
 * → BILLING-99 persistence clients → BILLING-95 ResolveEffectiveAccess.
 *
 * Composition only. Does not create readers, adapters, or resolver logic.
 * Does not read, clone, default, or interpret modeProfiles.
 * Does not read env, query, authorize, or expose HTTP.
 * The service-role key is an input only; it is not returned.
 */

import {
  createEffectiveAccessResolver,
  type CreateEffectiveAccessResolverDependencies,
} from "./createEffectiveAccessResolver.ts";
import {
  createPrivilegedEffectiveAccessPersistenceClients,
  type PrivilegedEffectiveAccessPersistenceConfig,
} from "./createPrivilegedEffectiveAccessPersistenceClients.ts";
import type { ModeCapabilityProfiles } from "./resolveEffectiveAccess.ts";

export type PrivilegedEffectiveAccessResolverConfig =
  PrivilegedEffectiveAccessPersistenceConfig & {
    modeProfiles: ModeCapabilityProfiles;
  };

/**
 * Optional test seam. Production callers omit this argument.
 * Structural signatures avoid importing B98 and forwarding B99's
 * transport-factory seam.
 */
export type CreatePrivilegedEffectiveAccessResolverDependencies = {
  createPersistenceClients?: (
    config: PrivilegedEffectiveAccessPersistenceConfig,
  ) => ReturnType<typeof createPrivilegedEffectiveAccessPersistenceClients>;
  createResolver?: (
    dependencies: CreateEffectiveAccessResolverDependencies,
  ) => ReturnType<typeof createEffectiveAccessResolver>;
};

/**
 * Bind privileged persistence (B99) and caller-supplied mode profiles
 * onto the EffectiveAccess resolver (B95). One B99 call, one B95 call.
 */
export function createPrivilegedEffectiveAccessResolver(
  config: PrivilegedEffectiveAccessResolverConfig,
  dependencies: CreatePrivilegedEffectiveAccessResolverDependencies = {},
): ReturnType<typeof createEffectiveAccessResolver> {
  const createPersistenceClients =
    dependencies.createPersistenceClients ??
    createPrivilegedEffectiveAccessPersistenceClients;
  const createResolver =
    dependencies.createResolver ?? createEffectiveAccessResolver;

  const persistenceClients = createPersistenceClients({
    supabaseUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
  });

  return createResolver({
    accessModeClient: persistenceClients.accessModeClient,
    stripeClient: persistenceClients.stripeClient,
    complimentaryClient: persistenceClients.complimentaryClient,
    modeProfiles: config.modeProfiles,
  });
}
