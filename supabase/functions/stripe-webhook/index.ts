// @ts-expect-error Deno runtime import resolved at edge deploy/runtime.
import Stripe from "https://esm.sh/stripe@14.25.0?target=denonext";
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

type StripeWebhookEvent = {
  id: string;
  type: string;
  livemode: boolean;
  created: number;
};

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

  let event: StripeWebhookEvent;
  try {
    const stripe = new Stripe("sk_test_placeholder", {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret) as StripeWebhookEvent;
  } catch {
    console.error("[stripe-webhook] Invalid signature.");
    return badRequest("Invalid Stripe signature.");
  }

  console.info("[stripe-webhook] Event verified.", {
    event_id: event.id,
    event_type: event.type,
    livemode: event.livemode,
    created: event.created,
  });

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
