import { createClient } from "@supabase/supabase-js";
import { badRequest, forbidden, invalidJson, unauthorized, unprocessableEntity } from "./http.ts";

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
};

export type AuthContext = {
  token: string;
};

export type TenantRequestBody = {
  tenant_id: string;
};

type AuthenticatedUserContext = {
  userId: string;
};

const UUID_V4ISH_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseEdgeConfig():
  | { supabaseUrl: string; supabaseAnonKey: string }
  | Response {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    return unauthorized();
  }

  return { supabaseUrl, supabaseAnonKey };
}

function createUserScopedClient(token: string) {
  const envConfig = getSupabaseEdgeConfig();
  if (envConfig instanceof Response) {
    return envConfig;
  }

  return createClient(envConfig.supabaseUrl, envConfig.supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function parseAuthHeader(req: Request): AuthContext | Response {
  const headerValue = req.headers.get("authorization");
  if (!headerValue) {
    return unauthorized();
  }

  const [scheme, token] = headerValue.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return unauthorized();
  }

  return { token };
}

export async function parseJsonBody<T>(req: Request): Promise<T | Response> {
  try {
    return (await req.json()) as T;
  } catch {
    return invalidJson();
  }
}

export function parseTenantBody(body: unknown): TenantRequestBody | Response {
  if (!body || typeof body !== "object") {
    return badRequest("Body must be a JSON object.");
  }

  const maybeTenantId = (body as Record<string, unknown>).tenant_id;
  if (typeof maybeTenantId !== "string" || maybeTenantId.trim().length === 0) {
    return unprocessableEntity("Field 'tenant_id' is required and must be a UUID string.");
  }

  const tenantId = maybeTenantId.trim();
  if (!UUID_V4ISH_REGEX.test(tenantId)) {
    return unprocessableEntity("Field 'tenant_id' must be a valid UUID.");
  }

  return { tenant_id: tenantId };
}

export async function getAuthenticatedUser(
  auth: AuthContext,
): Promise<AuthenticatedUserContext | Response> {
  const supabase = createUserScopedClient(auth.token);
  if (supabase instanceof Response) {
    return supabase;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return unauthorized();
  }

  return { userId: data.user.id };
}

export async function ensureTenantBillingAccess(
  auth: AuthContext,
  tenantId: string,
): Promise<{ ok: true } | Response> {
  const user = await getAuthenticatedUser(auth);
  if (user instanceof Response) {
    return user;
  }

  const supabase = createUserScopedClient(auth.token);
  if (supabase instanceof Response) {
    return supabase;
  }

  const { data: membership, error } = await supabase
    .from("tenant_memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.userId)
    .maybeSingle<{ role: "admin" | "user" | "billing" }>();

  if (error) {
    return forbidden();
  }

  if (!membership) {
    return forbidden();
  }

  if (membership.role !== "admin" && membership.role !== "billing") {
    return forbidden();
  }

  return { ok: true };
}
