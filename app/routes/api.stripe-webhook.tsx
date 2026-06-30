import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import Stripe from "stripe";

// POST /api/stripe-webhook  (Stripe → confirme le paiement)
export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env;
  const stripeSecret = env.STRIPE_SECRET_KEY as string | undefined;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET as string | undefined;

  if (!stripeSecret) return new Response("Not configured", { status: 503 });

  const stripe = new Stripe(stripeSecret, { apiVersion: "2025-04-30.basil" });
  const body = await request.text();

  let event: Stripe.Event;

  if (webhookSecret) {
    const sig = request.headers.get("stripe-signature");
    if (!sig) return new Response("Missing signature", { status: 400 });
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch {
      return new Response("Invalid signature", { status: 400 });
    }
  } else {
    event = JSON.parse(body) as Stripe.Event;
  }

  const db = env.DB;

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await db
      .prepare(`UPDATE orders SET
        payment_status = 'paid',
        payment_method = ?,
        status = 'confirmed',
        updated_at = datetime('now')
        WHERE stripe_payment_intent_id = ?`)
      .bind(pi.payment_method_types?.[0] ?? "card", pi.id)
      .run();
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    await db
      .prepare("UPDATE orders SET payment_status = 'failed', status = 'cancelled' WHERE stripe_payment_intent_id = ?")
      .bind(pi.id)
      .run();
  }

  return new Response("ok", { status: 200 });
}
