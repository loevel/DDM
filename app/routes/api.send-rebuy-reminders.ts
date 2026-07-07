import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { rebuyReminderEmail, sendEmail } from "~/lib/email.server";

const SITE_URL = "https://ddmwigs.com";

interface RebuyOrder {
  id: number;
  customer_name: string | null;
  customer_email: string;
  product_name: string | null;
  unsub_token: string | null;
}

// Relance de rachat : 90 jours après la livraison, une seule fois par commande.
// Une perruque cheveux humains se renouvelle tous les 6-12 mois — on relance la
// cliente avec un rappel d'entretien et un code privilège -15 % (usage unique,
// 30 jours) pour déclencher le rachat. Appelée par le Worker mailer, même
// mécanique que les rappels panier et les demandes d'avis.
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

  // Un article représentatif par commande (le premier), livrée depuis 90 jours+.
  // Le token de désabonnement de la cliente (LCAP) est récupéré via la fiche CRM.
  const { results: orders } = await db.prepare(`
    SELECT o.id, o.customer_name, o.customer_email,
           COALESCE(oi.product_name, p.name) as product_name,
           c.unsub_token
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN customers c ON c.id = o.customer_id
    WHERE o.status = 'delivered'
      AND o.rebuy_email_sent_at IS NULL
      AND o.customer_email IS NOT NULL
      AND o.delivered_at IS NOT NULL
      AND julianday('now') - julianday(o.delivered_at) >= 90
    GROUP BY o.id
    LIMIT 20
  `).all<RebuyOrder>();

  for (const order of orders ?? []) {
    // Marquer d'abord : même si l'envoi échoue on ne re-tente qu'au prochain
    // cron, et on ne risque jamais de relancer la même cliente en boucle.
    await db.prepare("UPDATE orders SET rebuy_email_sent_at = datetime('now') WHERE id = ?")
      .bind(order.id).run();

    if (!order.product_name) { skipped++; continue; }

    // Code privilège unique : -15 %, usage unique, valable 30 jours.
    const code = "RETOUR" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const exp = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
    try {
      await db.prepare(
        "INSERT INTO promo_codes (code, type, value, min_order, usage_limit, active, expires_at) VALUES (?, 'percent', 15, 0, 1, 1, ?)"
      ).bind(code, exp).run();
    } catch (e) {
      // Sans code valide l'email n'a pas de sens → on passe (la commande reste
      // marquée pour ne pas boucler).
      console.error("[Rebuy] Création du code échouée:", e);
      errors++;
      continue;
    }

    const prenom = (order.customer_name ?? "").split(" ")[0];
    const unsubUrl = order.unsub_token ? `${SITE_URL}/desabonnement?token=${order.unsub_token}` : undefined;
    const { subject, html } = await rebuyReminderEmail(db, {
      prenom,
      productName: order.product_name,
      code,
      unsubUrl,
    });

    if (await sendEmail({ apiKey, to: order.customer_email, subject, html })) sent++;
    else errors++;
  }

  return json({ ok: true, sent, skipped, errors });
}
