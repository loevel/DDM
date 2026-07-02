import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import Stripe from "stripe";

// POST /api/stripe-webhook  (Stripe → confirme le paiement)
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const stripeSecret = env.STRIPE_SECRET_KEY as string | undefined;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET as string | undefined;

  if (!stripeSecret) return new Response("Not configured", { status: 503 });
  // La vérification de signature est obligatoire — configurer STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) return new Response("Webhook secret manquant", { status: 503 });

  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-06-24.dahlia" });
  const body = await request.text();

  let event: Stripe.Event;
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
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

    // Décrémenter stock + créer mouvements de vente pour chaque article
    try {
      const paidOrder = await db
        .prepare("SELECT id FROM orders WHERE stripe_payment_intent_id = ?")
        .bind(pi.id)
        .first<{ id: number }>();

      if (paidOrder) {
        const { results: items } = await db
          .prepare("SELECT product_id, quantity, unit_price_cad, variant_id FROM order_items WHERE order_id = ?")
          .bind(paidOrder.id)
          .all<{ product_id: number; quantity: number; unit_price_cad: number; variant_id: number | null }>();

        for (const item of items ?? []) {
          if (!item.product_id) continue;

          // Décrémenter le stock de la variante si applicable
          if (item.variant_id) {
            const variant = await db
              .prepare("SELECT stock FROM product_variants WHERE id = ?")
              .bind(item.variant_id)
              .first<{ stock: number }>();
            if (variant) {
              const newVStock = Math.max(0, variant.stock - item.quantity);
              await db.prepare("UPDATE product_variants SET stock = ? WHERE id = ?")
                .bind(newVStock, item.variant_id).run();
            }
          }

          const product = await db
            .prepare("SELECT stock FROM products WHERE id = ?")
            .bind(item.product_id)
            .first<{ stock: number }>();
          if (!product) continue;

          const stockAvant = product.stock;
          const stockApres = Math.max(0, stockAvant - item.quantity);

          await db.prepare("UPDATE products SET stock = ? WHERE id = ?")
            .bind(stockApres, item.product_id).run();

          await db.prepare(`INSERT INTO stock_mouvements
            (product_id, type, quantite, stock_avant, stock_apres, cout_unitaire_cad, reference_type, reference_id)
            VALUES (?, 'vente', ?, ?, ?, ?, 'order', ?)`)
            .bind(item.product_id, item.quantity, stockAvant, stockApres, item.unit_price_cad, paidOrder.id)
            .run();
        }
      }
    } catch { /* ne pas bloquer le webhook si erreur stock */ }

    // Décompter l'utilisation du code promo (au paiement confirmé seulement,
    // pour ne pas brûler les usages sur des checkouts abandonnés)
    try {
      const orderPromo = await db
        .prepare("SELECT promo_code FROM orders WHERE stripe_payment_intent_id = ?")
        .bind(pi.id)
        .first<{ promo_code: string | null }>();
      if (orderPromo?.promo_code) {
        await db.prepare("UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?")
          .bind(orderPromo.promo_code).run();
      }
    } catch { /* ne pas bloquer le webhook */ }

    // Marquer le panier abandonné comme récupéré
    try {
      const paidOrderForCart = await db
        .prepare("SELECT customer_email, reference FROM orders WHERE stripe_payment_intent_id = ?")
        .bind(pi.id)
        .first<{ customer_email: string; reference: string }>();

      if (paidOrderForCart?.customer_email) {
        await db.prepare(`
          UPDATE abandoned_carts
          SET status = 'recovered',
              order_reference = ?,
              updated_at = datetime('now')
          WHERE email = ? AND status IN ('active', 'abandoned')
        `).bind(paidOrderForCart.reference, paidOrderForCart.customer_email).run();
      }
    } catch { /* ne pas bloquer le webhook */ }

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
