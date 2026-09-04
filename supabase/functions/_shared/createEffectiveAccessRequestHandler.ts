/**
 * Bound EffectiveAccess request handler factory (BILLING-102).
 *
 * Caller-supplied PrivilegedEffectiveAccessResolverConfig
 * → BILLING-101 privileged resolver (once per factory invocation)
 * → BILLING-89 request core with BILLING-96 authorizer.
 *
 * Composition only. Does not read env, parse HTTP, create clients,
 * authorize, query, or decide ModeCapabilityProfiles.
 * The service-role key is an input only; it is not returned.
 */

import { authorizeTenantEffectiveAccess } from "./authorizeTenantEffectiveAccess.ts";
import {
  createPrivilegedEffectiveAccessResolver,
  type PrivilegedEffectiveAccessResolverConfig,
} from "./createPrivilegedEffectiveAccessResolver.ts";
import {
  handleEffectiveAccessRequest,
  type AuthorizeTenant,
  type ResolveEffectiveAccess,
} from "./handleEffectiveAccessRequest.ts";

/**
 * Two-argument request handler derived from BILLING-89's first two
 * parameters and return type. `tenantId` remains caller-supplied.
 */
export type EffectiveAccessRequestHandler = (
  request: Parameters<typeof handleEffectiveAccessRequest>[0],
  tenantId: Parameters<typeof handleEffectiveAccessRequest>[1],
) => ReturnType<typeof handleEffectiveAccessRequest>;

/**
 * Optional test seam. Production callers omit this argument.
 * Structural signatures match the real B101/B89/B96 contracts.
 */
export type CreateEffectiveAccessRequestHandlerDependencies = {
  createResolver?: (
    config: PrivilegedEffectiveAccessResolverConfig,
  ) => ResolveEffectiveAccess;
  handleRequest?: typeof handleEffectiveAccessRequest;
  authorizeTenant?: AuthorizeTenant;
};

/**
 * Bind B101 once, then return a handler that delegates exclusively to B89.
 * The same resolver instance is reused for every subsequent request.
 */
export function createEffectiveAccessRequestHandler(
  config: PrivilegedEffectiveAccessResolverConfig,
  dependencies: CreateEffectiveAccessRequestHandlerDependencies = {},
): EffectiveAccessRequestHandler {
  const createResolver: (
    resolverConfig: PrivilegedEffectiveAccessResolverConfig,
  ) => ResolveEffectiveAccess =
    dependencies.createResolver ?? createPrivilegedEffectiveAccessResolver;
  const handleRequest: typeof handleEffectiveAccessRequest =
    dependencies.handleRequest ?? handleEffectiveAccessRequest;
  const authorizeTenant: AuthorizeTenant =
    dependencies.authorizeTenant ?? authorizeTenantEffectiveAccess;

  const resolveEffectiveAccess = createResolver(config);

  return (request, tenantId) =>
    handleRequest(request, tenantId, {
      authorizeTenant,
      resolveEffectiveAccess,
    });
}
