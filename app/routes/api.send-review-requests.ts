import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { reviewRequestEmail, sendEmail } from "~/lib/email.server";

interface DeliveredOrder {
  id: number;
  customer_name: string | null;
  customer_email: string;
  product_id: number | null;
  product_name: string | null;
  product_slug: string | null;
}

// Relance d'avis : 12 jours après la livraison, une seule fois par commande.
// Appelée par le Worker mailer (même mécanique que les rappels panier).
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;

  const secret = request.headers.get("x-cron-secret");
  const cronToken = env.CRON_TOKEN as string | undefined;
  if (!cronToken || secret !== cronToken) {
    return json({ error: "Non autorisé" }, { status: 401 });
  }

  const db: D1Database = env.DB;
  const apiKey: string = env.RESEND_API_KEY ?? "";
  if (!apiKey) return json({ error: "RESEND_API_KEY manquant" }, { status: 503 });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // Un article représentatif par commande (le premier), livrée depuis 12 jours+
  const { results: orders } = await db.prepare(`
    SELECT o.id, o.customer_name, o.customer_email,
           oi.product_id,
           COALESCE(oi.product_name, p.name) as product_name,
           COALESCE(oi.product_slug, p.slug) as product_slug
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.status = 'delivered'
      AND o.review_request_sent_at IS NULL
      AND o.customer_email IS NOT NULL
      AND o.delivered_at IS NOT NULL
      AND julianday('now') - julianday(o.delivered_at) >= 12
    GROUP BY o.id
    LIMIT 20
  `).all<DeliveredOrder>();

  for (const order of orders ?? []) {
    // Marquer d'abord : même si l'envoi échoue on ne re-tente qu'au prochain cron,
    // et on ne risque jamais de spammer la même cliente en boucle.
    await db.prepare("UPDATE orders SET review_request_sent_at = datetime('now') WHERE id = ?")
      .bind(order.id).run();

    if (!order.product_name || !order.product_slug) { skipped++; continue; }

    // Déjà un avis pour ce produit → pas de relance
    if (order.product_id) {
      try {
        const existing = await db
          .prepare("SELECT id FROM reviews WHERE product_id = ? AND customer_email = ?")
          .bind(order.product_id, order.customer_email).first();
        if (existing) { skipped++; continue; }
      } catch { /* table reviews absente → on relance quand même */ }
    }

    const prenom = (order.customer_name ?? "").split(" ")[0];
    const { subject, html } = await reviewRequestEmail(db, {
      prenom,
      productName: order.product_name,
      slug: order.product_slug,
    });

    if (await sendEmail({ apiKey, to: order.customer_email, subject, html })) sent++;
    else errors++;
  }

  return json({ ok: true, sent, skipped, errors });
}
