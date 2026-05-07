import { badRequest, invalidJson, unauthorized } from "./http.ts";

export type AuthContext = {
  token: string;
};

export type TenantRequestBody = {
  tenant_id: string;
};

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
    return badRequest("Field 'tenant_id' is required and must be a non-empty string.");
  }

  return { tenant_id: maybeTenantId };
}

// Extension point for I2/I3:
// - validate JWT with Supabase Auth
// - check tenant membership/role server-side (admin|billing)
// - never trust role values provided by frontend payload
export async function ensureTenantBillingAccess(
  _auth: AuthContext,
  _tenantId: string,
): Promise<{ ok: true } | Response> {
  return { ok: true };
}
