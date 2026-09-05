/**
 * Production top-level EffectiveAccess Edge entrypoint (BILLING-106).
 *
 * HTTP method/body/tenant gate + privileged runtime config
 * → BILLING-102 once per valid config
 * → BILLING-89/B96/B101 chain with canonicalModeCapabilityProfiles.
 *
 * Does not parse JWT, authorize membership, look up AccessMode,
 * choose capability profiles from HTTP/env, or transform Responses.
 */

import { parseJsonBody, parseTenantBody } from "../_shared/auth.ts";
import {
  createEffectiveAccessRequestHandler,
  type EffectiveAccessRequestHandler,
} from "../_shared/createEffectiveAccessRequestHandler.ts";
import type { PrivilegedEffectiveAccessResolverConfig } from "../_shared/createPrivilegedEffectiveAccessResolver.ts";
import {
  jsonResponse,
  methodNotAllowed,
  serviceUnavailable,
} from "../_shared/http.ts";
import { canonicalModeCapabilityProfiles } from "../_shared/modeCapabilityProfiles.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

export type EffectiveAccessEdgeHandlerDependencies = {
  readEnv?: (key: string) => string | undefined;
  createRequestHandler?: (
    config: PrivilegedEffectiveAccessResolverConfig,
  ) => EffectiveAccessRequestHandler;
};

function defaultReadEnv(key: string): string | undefined {
  return Deno.env.get(key);
}

/**
 * Testable Edge factory. Production callers omit dependencies.
 * B102 is bound on the first request that needs a valid privileged config
 * and reused for subsequent requests on the same handler instance.
 */
export function createEffectiveAccessEdgeHandler(
  dependencies: EffectiveAccessEdgeHandlerDependencies = {},
): (req: Request) => Promise<Response> {
  const readEnv = dependencies.readEnv ?? defaultReadEnv;
  const createRequestHandler = dependencies.createRequestHandler ??
    createEffectiveAccessRequestHandler;

  let boundHandler: EffectiveAccessRequestHandler | null = null;

  return async function effectiveAccessEdgeHandler(
    req: Request,
  ): Promise<Response> {
    if (req.method === "OPTIONS") {
      return jsonResponse({ data: { ok: true } }, 200);
    }

    if (req.method !== "POST") {
      return methodNotAllowed(req.method);
    }

    const body = await parseJsonBody(req);
    if (body instanceof Response) {
      return body;
    }

    const parsedTenant = parseTenantBody(body);
    if (parsedTenant instanceof Response) {
      return parsedTenant;
    }

    if (boundHandler === null) {
      const supabaseUrl = readEnv("SUPABASE_URL");
      const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        return serviceUnavailable();
      }

      boundHandler = createRequestHandler({
        supabaseUrl,
        serviceRoleKey,
        modeProfiles: canonicalModeCapabilityProfiles,
      });
    }

    return boundHandler(req, parsedTenant.tenant_id);
  };
}

export const handler = createEffectiveAccessEdgeHandler();

if (import.meta.main) {
  Deno.serve(handler);
}
