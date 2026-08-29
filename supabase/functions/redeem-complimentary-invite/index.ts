import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, withCorsHeaders } from "../_shared/http.ts";
import {
  redeemTenantComplimentaryAccessInvite,
  type ComplimentaryInviteRedemptionRpcClient,
  type RedeemTenantComplimentaryAccessInviteFailureReason,
  type RedeemTenantComplimentaryAccessInviteParams,
  type RedeemTenantComplimentaryAccessInviteResult,
} from "../_shared/redeemTenantComplimentaryAccessInvite.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const ALLOWED_BODY_KEYS = ["token"] as const;

type PublicErrorCode =
  | "method_not_allowed"
  | "invalid_json"
  | "invalid_request"
  | "invite_not_redeemable"
  | "complimentary_invite_unavailable"
  | "complimentary_invite_internal_error";

export type RedeemComplimentaryInviteHandlerDependencies = {
  readEnv: (key: string) => string | undefined;
  createPrivilegedClient: (
    supabaseUrl: string,
    serviceRoleKey: string,
  ) =>
    | ComplimentaryInviteRedemptionRpcClient
    | Promise<ComplimentaryInviteRedemptionRpcClient>;
  redeemInvite: (
    params: RedeemTenantComplimentaryAccessInviteParams,
  ) => Promise<RedeemTenantComplimentaryAccessInviteResult>;
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
): ComplimentaryInviteRedemptionRpcClient {
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
  reason: RedeemTenantComplimentaryAccessInviteFailureReason,
): { status: number; error: PublicErrorCode } {
  switch (reason) {
    case "invalid_raw_token":
    case "token_not_found":
    case "invite_already_redeemed":
    case "invite_revoked":
    case "invite_expired":
      return { status: 422, error: "invite_not_redeemable" };
    case "complimentary_invite_token_hash_failed":
    case "complimentary_invite_redemption_rpc_failed":
    case "complimentary_invite_redemption_invalid_response":
      return { status: 500, error: "complimentary_invite_internal_error" };
    default: {
      const _exhaustive: never = reason;
      return { status: 500, error: "complimentary_invite_internal_error" };
    }
  }
}

/**
 * Unauthenticated HTTP adapter for complimentary invite redemption.
 * The raw invite token is the bearer capability. Domain rules stay in
 * redeemTenantComplimentaryAccessInvite.
 */
export function createRedeemComplimentaryInviteHandler(
  deps: Partial<RedeemComplimentaryInviteHandlerDependencies> = {},
): (req: Request) => Promise<Response> {
  const readEnv = deps.readEnv ?? defaultReadEnv;
  const createPrivilegedClient = deps.createPrivilegedClient ??
    defaultCreatePrivilegedClient;
  const redeemInvite = deps.redeemInvite ??
    redeemTenantComplimentaryAccessInvite;

  return async function redeemComplimentaryInviteHandler(
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

      const client = await createPrivilegedClient(supabaseUrl, serviceRoleKey);
      const result = await redeemInvite({
        client,
        rawToken: body.token,
      });

      if (result.ok === true) {
        return respond(200, {
          redemption: {
            product_tier: result.redemption.productTier,
            redeemed_at: result.redemption.redeemedAt,
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

export const handler = createRedeemComplimentaryInviteHandler();

if (import.meta.main) {
  Deno.serve(handler);
}
