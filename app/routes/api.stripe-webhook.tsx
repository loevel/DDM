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

    // Sauvegarder l'adresse de livraison si la cliente n'en a pas encore
    try {
      const order = await db
        .prepare("SELECT customer_email, shipping_address FROM orders WHERE stripe_payment_intent_id = ?")
        .bind(pi.id)
        .first<{ customer_email: string; shipping_address: string }>();

      if (order?.shipping_address) {
        const addr = JSON.parse(order.shipping_address) as {
          line1?: string; city?: string; province?: string; postal_code?: string;
        };

        if (addr.line1 && addr.city && addr.postal_code) {
          const customer = await db
            .prepare("SELECT id FROM customers WHERE email = ?")
            .bind(order.customer_email)
            .first<{ id: string }>();

          if (customer) {
            const existing = await db
              .prepare("SELECT COUNT(*) as n FROM customer_addresses WHERE customer_id = ?")
              .bind(customer.id)
              .first<{ n: number }>();

            if (!existing || existing.n === 0) {
              await db
                .prepare(`INSERT INTO customer_addresses
                  (customer_id, label, street, city, province, postal_code, country, is_default)
                  VALUES (?, 'Domicile', ?, ?, ?, ?, 'Canada', 1)`)
                .bind(customer.id, addr.line1, addr.city, addr.province ?? "QC", addr.postal_code)
                .run();
            }
          }
        }
      }
    } catch { /* ne pas bloquer si la sauvegarde échoue */ }
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
