import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getAuthenticatedUser,
  parseAuthHeader,
} from "../_shared/auth.ts";
import { COMPLIMENTARY_GRANT_OPERATOR_USER_IDS } from "../_shared/authorizeComplimentaryGrantOperator.ts";
import {
  createTenantComplimentaryAccessInvite,
  type ComplimentaryInvitePersistenceClient,
  type CreateTenantComplimentaryAccessInviteFailureReason,
  type CreateTenantComplimentaryAccessInviteParams,
  type CreateTenantComplimentaryAccessInviteResult,
} from "../_shared/createTenantComplimentaryAccessInvite.ts";
import { jsonResponse, withCorsHeaders } from "../_shared/http.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const ALLOWED_BODY_KEYS = ["product_tier", "tenant_id"] as const;

type PublicErrorCode =
  | "method_not_allowed"
  | "authentication_required"
  | "invalid_json"
  | "invalid_request"
  | "forbidden"
  | "complimentary_invite_unavailable"
  | "complimentary_invite_internal_error"
  | "complimentary_invite_token_conflict";

export type AuthenticatedCallerResult =
  | { ok: true; callerUserId: string }
  | { ok: false };

export type ComplimentaryInviteHandlerDependencies = {
  resolveAuthenticatedCaller: (
    req: Request,
  ) => Promise<AuthenticatedCallerResult>;
  readEnv: (key: string) => string | undefined;
  createPrivilegedClient: (
    supabaseUrl: string,
    serviceRoleKey: string,
  ) =>
    | ComplimentaryInvitePersistenceClient
    | Promise<ComplimentaryInvitePersistenceClient>;
  createInvite: (
    params: CreateTenantComplimentaryAccessInviteParams,
  ) => Promise<CreateTenantComplimentaryAccessInviteResult>;
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
): ComplimentaryInvitePersistenceClient {
  return createClient(supabaseUrl, serviceRoleKey);
}

function hasExactAllowedBodyKeys(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body);
  if (keys.length !== ALLOWED_BODY_KEYS.length) {
    return false;
  }
  return ALLOWED_BODY_KEYS.every((allowed) => keys.includes(allowed));
}

function mapServiceFailure(
  reason: CreateTenantComplimentaryAccessInviteFailureReason,
): { status: number; error: PublicErrorCode } {
  switch (reason) {
    case "invalid_tenant_id":
    case "invalid_product_tier":
      return { status: 422, error: "invalid_request" };
    case "forbidden":
      return { status: 403, error: "forbidden" };
    case "authority_unconfigured":
    case "authority_invalid_config":
      return { status: 503, error: "complimentary_invite_unavailable" };
    case "complimentary_invite_token_conflict":
      return { status: 409, error: "complimentary_invite_token_conflict" };
    case "invalid_caller_user_id":
    case "invalid_clock":
    case "complimentary_invite_token_generation_failed":
    case "complimentary_invite_persistence_failed":
      return { status: 500, error: "complimentary_invite_internal_error" };
    default: {
      const _exhaustive: never = reason;
      return { status: 500, error: "complimentary_invite_internal_error" };
    }
  }
}

/**
 * Authenticated HTTP adapter for complimentary invite creation.
 * Domain rules stay in createTenantComplimentaryAccessInvite.
 */
export function createComplimentaryInviteHandler(
  deps: Partial<ComplimentaryInviteHandlerDependencies> = {},
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
  const createInvite = deps.createInvite ??
    createTenantComplimentaryAccessInvite;

  return async function complimentaryInviteHandler(
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
      const result = await createInvite({
        client,
        callerUserId: caller.callerUserId,
        configuredOperatorUserIds,
        tenantId: body.tenant_id,
        productTier: body.product_tier,
      });

      if (result.ok === true) {
        return respond(201, {
          invite: {
            id: result.invite.id,
            tenant_id: result.invite.tenantId,
            product_tier: result.invite.productTier,
            expires_at: result.invite.expiresAt,
            token: result.invite.rawToken,
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

export const handler = createComplimentaryInviteHandler();

if (import.meta.main) {
  Deno.serve(handler);
}
