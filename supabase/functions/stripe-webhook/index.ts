// @ts-expect-error Deno runtime import resolved at edge deploy/runtime.
import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
// @ts-expect-error Deno runtime import resolved at edge deploy/runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  badRequest,
  methodNotAllowed,
  jsonResponse,
  serviceUnavailable,
} from "../_shared/http.ts";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const WEBHOOK_NOT_CONFIGURED_MESSAGE = "Stripe webhook is not configured.";
const ALLOWED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
]);

function extractStripeCustomerIdString(customer: unknown): string | null {
  if (typeof customer === "string") {
    const trimmed = customer.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (customer !== null && typeof customer === "object" && "id" in customer) {
    const id = (customer as { id: unknown }).id;
    if (typeof id === "string") {
      const trimmed = id.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

async function persistTenantBillingCustomerCorrelation(
  supabase: ReturnType<typeof createClient>,
  event: Stripe.Event,
): Promise<{ ok: true } | { ok: false }> {
  if (event.type !== "checkout.session.completed") {
    return { ok: true };
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const customerId = extractStripeCustomerIdString(session.customer);
  const metaTenantId = session.metadata?.tenant_id;
  const tenantId =
    typeof metaTenantId === "string" && metaTenantId.trim().length > 0
      ? metaTenantId.trim()
      : null;

  const has_customer = customerId !== null;
  const has_tenant_id = tenantId !== null;

  if (!has_customer || !has_tenant_id) {
    console.warn(
      "[stripe-webhook] tenant billing customer correlation skipped",
      {
        event_id: event.id,
        event_type: event.type,
        has_customer,
        has_tenant_id,
      },
    );
    return { ok: true };
  }

  const { error } = await supabase
    .from("tenant_billing_customers")
    .upsert(
      {
        tenant_id: tenantId,
        provider: "stripe",
        provider_customer_id: customerId,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "provider,provider_customer_id",
      },
    );

  if (error) {
    console.error("[stripe-webhook] tenant_billing_customers upsert failed", {
      event_id: event.id,
      event_type: event.type,
      tenant_id: tenantId,
      customer_id: customerId,
      error_code: error.code,
    });
    return { ok: false };
  }

  return { ok: true };
}

function getStripeWebhookSecret(): string | Response {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("[stripe-webhook] Missing STRIPE_WEBHOOK_SECRET.");
    return serviceUnavailable(WEBHOOK_NOT_CONFIGURED_MESSAGE);
  }
  return secret;
}

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return jsonResponse({ data: { ok: true } }, 200);
  }

  if (req.method !== "POST") {
    return methodNotAllowed(req.method);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return badRequest("Missing Stripe-Signature header.");
  }

  const webhookSecret = getStripeWebhookSecret();
  if (webhookSecret instanceof Response) {
    return webhookSecret;
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = new Stripe("sk_test_placeholder", {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    ) as Stripe.Event;

    console.info("[stripe-webhook] Event verified.", {
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      created: event.created,
    });
  } catch {
    console.error("[stripe-webhook] Invalid signature.");
    return badRequest("Invalid Stripe signature.");
  }

  if (event.livemode === true) {
    return badRequest("Live mode events are not accepted in this environment.");
  }

  if (!ALLOWED_EVENT_TYPES.has(event.type)) {
    return jsonResponse(
      {
        data: {
          received: true,
          ignored: true,
          event_type: event.type,
        },
      },
      200,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("[stripe-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    return jsonResponse(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Billing event persistence is not configured.",
        },
      },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data, error } = await supabase
    .from("billing_events")
    .upsert(
      {
        provider: "stripe",
        provider_event_id: event.id,
        event_type: event.type,
        tenant_id: null,
        processed_at: new Date().toISOString(),
        processing_error: null,
        payload: event,
      },
      {
        onConflict: "provider,provider_event_id",
        ignoreDuplicates: true,
      },
    )
    .select("id");

  if (error) {
    console.error("[stripe-webhook] billing_events upsert failed", {
      event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      error_code: error.code,
    });
    return jsonResponse(
      {
        error: {
          code: "UPSTREAM_ERROR",
          message: "Failed to persist billing event.",
        },
      },
      500,
    );
  }

  const rows = data ?? [];
  const duplicate = rows.length === 0;
  const stored = !duplicate;

  console.info("[stripe-webhook] billing_events persisted", {
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    stored,
    duplicate,
  });

  const tenantBillingCustomerResult = await persistTenantBillingCustomerCorrelation(
    supabase,
    event,
  );
  if (!tenantBillingCustomerResult.ok) {
    return jsonResponse(
      {
        error: {
          code: "UPSTREAM_ERROR",
          message: "Failed to persist tenant billing customer correlation.",
        },
      },
      500,
    );
  }

  return jsonResponse(
    {
      data: {
        received: true,
        event_id: event.id,
        event_type: event.type,
      },
    },
    200,
  );
}

Deno.serve(handler);
