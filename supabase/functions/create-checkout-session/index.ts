import {
  methodNotAllowed,
  jsonResponse,
  notImplemented,
} from "../_shared/http.ts";
import {
  parseAuthHeader,
  parseJsonBody,
  parseTenantBody,
  ensureTenantBillingAccess,
} from "../_shared/auth.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return jsonResponse({ data: { ok: true } }, 200);
  }

  if (req.method !== "POST") {
    return methodNotAllowed(req.method);
  }

  const auth = parseAuthHeader(req);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await parseJsonBody<unknown>(req);
  if (body instanceof Response) {
    return body;
  }

  const parsedTenant = parseTenantBody(body);
  if (parsedTenant instanceof Response) {
    return parsedTenant;
  }

  const authz = await ensureTenantBillingAccess(auth, parsedTenant.tenant_id);
  if (authz instanceof Response) {
    return authz;
  }

  return notImplemented(
    "Stripe checkout session is not active yet in this environment.",
  );
}

Deno.serve(handler);
