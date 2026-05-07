import {
  methodNotAllowed,
  jsonResponse,
  serviceUnavailable,
  unprocessableEntity,
  upstreamError,
} from "../_shared/http.ts";
import {
  parseAuthHeader,
  parseJsonBody,
  parseTenantBody,
  ensureTenantBillingAccess,
} from "../_shared/auth.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

type CheckoutPlanCode = "pro_monthly" | "pro";
type CheckoutRequestBody = {
  tenant_id: string;
  plan_code?: unknown;
};

const BILLING_NOT_CONFIGURED_MESSAGE = "Billing checkout is not configured.";

function normalizePlanCode(body: unknown): { planCode: "pro_monthly" } | Response {
  if (!body || typeof body !== "object") {
    return unprocessableEntity("Field 'plan_code' is required and must be one of: pro_monthly, pro.");
  }

  const planCode = (body as CheckoutRequestBody).plan_code;
  if (typeof planCode !== "string") {
    return unprocessableEntity("Field 'plan_code' is required and must be one of: pro_monthly, pro.");
  }

  const normalizedInput = planCode.trim().toLowerCase() as CheckoutPlanCode;
  if (normalizedInput !== "pro_monthly" && normalizedInput !== "pro") {
    return unprocessableEntity("Field 'plan_code' is required and must be one of: pro_monthly, pro.");
  }

  if (normalizedInput === "pro") {
    return { planCode: "pro_monthly" };
  }

  return { planCode: normalizedInput };
}

function getAppBaseUrl(): string | Response {
  const rawBaseUrl = Deno.env.get("APP_BASE_URL") ?? Deno.env.get("SITE_URL");
  if (!rawBaseUrl) {
    console.error("[create-checkout-session] Missing APP_BASE_URL/SITE_URL.");
    return serviceUnavailable(BILLING_NOT_CONFIGURED_MESSAGE);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    console.error("[create-checkout-session] Invalid APP_BASE_URL/SITE_URL format.");
    return serviceUnavailable(BILLING_NOT_CONFIGURED_MESSAGE);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    console.error("[create-checkout-session] APP_BASE_URL/SITE_URL protocol is not allowed.");
    return serviceUnavailable(BILLING_NOT_CONFIGURED_MESSAGE);
  }

  return parsed.toString().replace(/\/+$/, "");
}

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

  const body = await parseJsonBody<CheckoutRequestBody>(req);
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

  const parsedPlan = normalizePlanCode(body);
  if (parsedPlan instanceof Response) {
    return parsedPlan;
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const proMonthlyPriceId = Deno.env.get("STRIPE_PRICE_ID_PRO_MONTHLY");
  const appBaseUrl = getAppBaseUrl();

  if (appBaseUrl instanceof Response) {
    return appBaseUrl;
  }

  if (!stripeSecretKey || !proMonthlyPriceId) {
    console.error("[create-checkout-session] Missing Stripe billing env configuration.");
    return serviceUnavailable(BILLING_NOT_CONFIGURED_MESSAGE);
  }

  if (!stripeSecretKey.startsWith("sk_test_")) {
    console.error("[create-checkout-session] Stripe key is not test-mode.");
    return serviceUnavailable(BILLING_NOT_CONFIGURED_MESSAGE);
  }

  const successUrl = `${appBaseUrl}/?billing=checkout_success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appBaseUrl}/?billing=checkout_cancelled`;

  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": proMonthlyPriceId,
    "line_items[0][quantity]": "1",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: parsedTenant.tenant_id,
    "metadata[tenant_id]": parsedTenant.tenant_id,
    "metadata[user_id]": authz.userId,
    "metadata[plan_code]": parsedPlan.planCode,
    "subscription_data[metadata][tenant_id]": parsedTenant.tenant_id,
    "subscription_data[metadata][user_id]": authz.userId,
    "subscription_data[metadata][plan_code]": parsedPlan.planCode,
  });

  let stripeResponse: Response;
  try {
    stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch {
    console.error(
      "[create-checkout-session] Stripe request network error.",
      {
        tenant_id: parsedTenant.tenant_id,
        user_id: authz.userId,
        plan_code: parsedPlan.planCode,
      },
    );
    return upstreamError("Unable to create checkout session.");
  }

  const stripeRequestId = stripeResponse.headers.get("request-id");
  if (!stripeResponse.ok) {
    console.error(
      "[create-checkout-session] Stripe returned non-success status.",
      {
        tenant_id: parsedTenant.tenant_id,
        user_id: authz.userId,
        plan_code: parsedPlan.planCode,
        stripe_status: stripeResponse.status,
        stripe_request_id: stripeRequestId,
      },
    );
    return upstreamError("Unable to create checkout session.");
  }

  let stripePayload: unknown;
  try {
    stripePayload = await stripeResponse.json();
  } catch {
    console.error(
      "[create-checkout-session] Stripe returned invalid JSON.",
      {
        tenant_id: parsedTenant.tenant_id,
        user_id: authz.userId,
        plan_code: parsedPlan.planCode,
        stripe_status: stripeResponse.status,
        stripe_request_id: stripeRequestId,
      },
    );
    return upstreamError("Unable to create checkout session.");
  }

  const checkoutUrl =
    typeof stripePayload === "object" &&
      stripePayload !== null &&
      "url" in stripePayload &&
      typeof stripePayload.url === "string"
      ? stripePayload.url
      : null;

  if (!checkoutUrl) {
    console.error(
      "[create-checkout-session] Stripe response missing checkout URL.",
      {
        tenant_id: parsedTenant.tenant_id,
        user_id: authz.userId,
        plan_code: parsedPlan.planCode,
        stripe_status: stripeResponse.status,
        stripe_request_id: stripeRequestId,
      },
    );
    return upstreamError("Unable to create checkout session.");
  }

  return jsonResponse(
    {
      data: {
        checkout_url: checkoutUrl,
      },
    },
    200,
  );
}

Deno.serve(handler);
