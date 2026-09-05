import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getAuthenticatedUser,
  parseAuthHeader,
} from "../_shared/auth.ts";
import { COMPLIMENTARY_GRANT_OPERATOR_USER_IDS } from "../_shared/authorizeComplimentaryGrantOperator.ts";
import { jsonResponse, withCorsHeaders } from "../_shared/http.ts";
import {
  revokeTenantComplimentaryAccessInvite,
  type ComplimentaryInviteRevocationClient,
  type RevokeTenantComplimentaryAccessInviteFailureReason,
  type RevokeTenantComplimentaryAccessInviteParams,
  type RevokeTenantComplimentaryAccessInviteResult,
} from "../_shared/revokeTenantComplimentaryAccessInvite.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const ALLOWED_BODY_KEYS = ["invite_id", "tenant_id"] as const;

type PublicErrorCode =
  | "method_not_allowed"
  | "authentication_required"
  | "invalid_json"
  | "invalid_request"
  | "forbidden"
  | "invite_not_revocable"
  | "complimentary_invite_unavailable"
  | "complimentary_invite_internal_error";

export type AuthenticatedCallerResult =
  | { ok: true; callerUserId: string }
  | { ok: false };

export type ComplimentaryInviteRevokeHandlerDependencies = {
  resolveAuthenticatedCaller: (
    req: Request,
  ) => Promise<AuthenticatedCallerResult>;
  readEnv: (key: string) => string | undefined;
  createPrivilegedClient: (
    supabaseUrl: string,
    serviceRoleKey: string,
  ) =>
    | ComplimentaryInviteRevocationClient
    | Promise<ComplimentaryInviteRevocationClient>;
  revokeInvite: (
    params: RevokeTenantComplimentaryAccessInviteParams,
  ) => Promise<RevokeTenantComplimentaryAccessInviteResult>;
};

function respond(
  status: number,
  body: unknown,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withCorsHeaders({
      "cache-control": "no-store",
      ...extraHeaders,
    }),
  });
}

function errorResponse(
  status: number,
  error: PublicErrorCode,
  extraHeaders: HeadersInit = {},
): Response {
  return respond(status, { error }, extraHeaders);
}

function defaultReadEnv(key: string): string | undefined {
  return Deno.env.get(key);
}

function defaultCreatePrivilegedClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): ComplimentaryInviteRevocationClient {
  return createClient(supabaseUrl, serviceRoleKey) as unknown as
    ComplimentaryInviteRevocationClient;
}

function hasExactAllowedBodyKeys(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body);
  if (keys.length !== ALLOWED_BODY_KEYS.length) {
    return false;
  }
  return ALLOWED_BODY_KEYS.every((allowed) => keys.includes(allowed));
}

function mapServiceFailure(
  reason: RevokeTenantComplimentaryAccessInviteFailureReason,
): { status: number; error: PublicErrorCode } {
  switch (reason) {
    case "invalid_invite_id":
    case "invalid_tenant_id":
      return { status: 422, error: "invalid_request" };
    case "forbidden":
      return { status: 403, error: "forbidden" };
    case "authority_unconfigured":
    case "authority_invalid_config":
      return { status: 503, error: "complimentary_invite_unavailable" };
    case "invite_not_revocable":
      return { status: 422, error: "invite_not_revocable" };
    case "invalid_caller_user_id":
    case "invalid_clock":
    case "complimentary_invite_persistence_failed":
      return { status: 500, error: "complimentary_invite_internal_error" };
    default: {
      const _exhaustive: never = reason;
      return { status: 500, error: "complimentary_invite_internal_error" };
    }
  }
}

/**
 * Authenticated HTTP adapter for complimentary invite pre-use revocation.
 * Domain rules stay in revokeTenantComplimentaryAccessInvite.
 */
export function createRevokeComplimentaryInviteHandler(
  deps: Partial<ComplimentaryInviteRevokeHandlerDependencies> = {},
): (req: Request) => Promise<Response> {
  async function defaultResolveAuthenticatedCaller(
    req: Request,
  ): Promise<AuthenticatedCallerResult> {
    const parsed = parseAuthHeader(req);
    if (parsed instanceof Response) {
      return { ok: false };
    }

    const user = await getAuthenticatedUser(parsed);
    if (user instanceof Response) {
      return { ok: false };
    }

    return { ok: true, callerUserId: user.userId };
  }

  const resolveAuthenticatedCaller = deps.resolveAuthenticatedCaller ??
    defaultResolveAuthenticatedCaller;
  const readEnv = deps.readEnv ?? defaultReadEnv;
  const createPrivilegedClient = deps.createPrivilegedClient ??
    defaultCreatePrivilegedClient;
  const revokeInvite = deps.revokeInvite ??
    revokeTenantComplimentaryAccessInvite;

  return async function complimentaryInviteRevokeHandler(
    req: Request,
  ): Promise<Response> {
    try {
      if (req.method === "OPTIONS") {
        return jsonResponse({ data: { ok: true } }, 200, {
          "cache-control": "no-store",
        });
      }

      if (req.method !== "POST") {
        return errorResponse(405, "method_not_allowed", { allow: "POST" });
      }

      const caller = await resolveAuthenticatedCaller(req);
      if (caller.ok === false) {
        return errorResponse(401, "authentication_required");
      }

      let parsedBody: unknown;
      try {
        parsedBody = await req.json();
      } catch {
        return errorResponse(400, "invalid_json");
      }

      if (
        parsedBody === null ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return errorResponse(422, "invalid_request");
      }

      const body = parsedBody as Record<string, unknown>;
      if (!hasExactAllowedBodyKeys(body)) {
        return errorResponse(422, "invalid_request");
      }

      const supabaseUrl = readEnv("SUPABASE_URL");
      const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        return errorResponse(503, "complimentary_invite_unavailable");
      }

      const configuredOperatorUserIds = readEnv(
        COMPLIMENTARY_GRANT_OPERATOR_USER_IDS,
      );
      const client = await createPrivilegedClient(supabaseUrl, serviceRoleKey);
      const result = await revokeInvite({
        client,
        callerUserId: caller.callerUserId,
        configuredOperatorUserIds,
        inviteId: body.invite_id,
        tenantId: body.tenant_id,
      });

      if (result.ok === true) {
        return respond(200, {
          revocation: {
            id: result.revocation.id,
            tenant_id: result.revocation.tenantId,
            revoked_at: result.revocation.revokedAt,
          },
        });
      }

      if (result.ok === false) {
        const mapped = mapServiceFailure(result.reason);
        return errorResponse(mapped.status, mapped.error);
      }

      return errorResponse(500, "complimentary_invite_internal_error");
    } catch {
      return errorResponse(500, "complimentary_invite_internal_error");
    }
  };
}

export const handler = createRevokeComplimentaryInviteHandler();

if (import.meta.main) {
  Deno.serve(handler);
}
