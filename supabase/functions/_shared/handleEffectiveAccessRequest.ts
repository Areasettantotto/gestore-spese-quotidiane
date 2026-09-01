/**
 * HTTP orchestration core for already-authorized EffectiveAccess (BILLING-89).
 *
 * Request + tenantId + injected dependencies → HTTP-safe JSON Response.
 *
 * Does NOT choose audience, HTTP method/path, tenantId parsing, privileged
 * clients, persistence, commercial providers, or capability profiles.
 * Authorization and domain resolution are caller-supplied.
 */

import { parseAuthHeader, type AuthContext } from "./auth.ts";
import { jsonResponse } from "./http.ts";
import type { EffectiveAccess } from "./resolveEffectiveAccess.ts";
import { serializeEffectiveAccess } from "./serializeEffectiveAccess.ts";

/**
 * Minimal authorization success. Callers may return richer objects
 * (`userId`, `role`, …). This core only distinguishes success from a
 * failure Response and must not read extra fields.
 */
export type AuthorizeTenantOk = {
  readonly ok: true;
};

export type AuthorizeTenant = (
  auth: AuthContext,
  tenantId: string,
) => Promise<AuthorizeTenantOk | Response>;

/**
 * Already-resolved EffectiveAccess, or an HTTP-safe failure prepared by
 * the caller/adapter. This core does not map persistence reasons to status.
 */
export type ResolveEffectiveAccess = (
  tenantId: string,
) => Promise<EffectiveAccess | Response>;

export type HandleEffectiveAccessRequestDependencies = {
  authorizeTenant: AuthorizeTenant;
  resolveEffectiveAccess: ResolveEffectiveAccess;
};

/**
 * Fail-closed HTTP core:
 * parse auth → authorize tenant → resolve EffectiveAccess → serialize → 200.
 *
 * `tenantId` is forwarded unchanged. Auth/authorization failures skip later
 * steps. A resolver Response is returned as-is.
 */
export async function handleEffectiveAccessRequest(
  request: Request,
  tenantId: string,
  dependencies: HandleEffectiveAccessRequestDependencies,
): Promise<Response> {
  const auth = parseAuthHeader(request);
  if (auth instanceof Response) {
    return auth;
  }

  const authorized = await dependencies.authorizeTenant(auth, tenantId);
  if (authorized instanceof Response) {
    return authorized;
  }

  const resolved = await dependencies.resolveEffectiveAccess(tenantId);
  if (resolved instanceof Response) {
    return resolved;
  }

  return jsonResponse({
    data: serializeEffectiveAccess(resolved),
  });
}
