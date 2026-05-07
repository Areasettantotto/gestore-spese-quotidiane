import { methodNotAllowed, jsonResponse, notImplemented } from "../_shared/http.ts";

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

  // Placeholder for I2/I3:
  // - read raw body for Stripe signature verification
  // - verify stripe-signature header with webhook secret
  // - process events idempotently and persist audit records
  await req.text();

  return notImplemented("Stripe webhook processing is not active yet in this environment.");
}

Deno.serve(handler);
