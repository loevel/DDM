import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

// POST /api/abandoned-cart-action
// { action: "remind_1"|"remind_2"|"remind_3"|"recover"|"generate_promo", cartDbId: number }
export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) return json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json<{
    action: "remind_1" | "remind_2" | "remind_3" | "recover" | "generate_promo";
    cartDbId: number;
    notes?: string;
  }>();

  const db = getDB(context);

  const cart = await db
    .prepare("SELECT * FROM abandoned_carts WHERE id = ?")
    .bind(body.cartDbId)
    .first<{
      id: number;
      cart_id: string;
      email: string | null;
      customer_name: string | null;
      items_json: string;
      total_cad: number;
      status: string;
      recovery_promo_code: string | null;
    }>();

  if (!cart) return json({ error: "Panier introuvable" }, { status: 404 });

  if (body.action === "recover") {
    await db.prepare(
      "UPDATE abandoned_carts SET status = 'recovered', updated_at = datetime('now'), notes = ? WHERE id = ?"
    ).bind(body.notes || null, cart.id).run();
    return json({ ok: true, status: "recovered" });
  }

  if (body.action === "generate_promo") {
    if (cart.recovery_promo_code) {
      return json({ ok: true, promoCode: cart.recovery_promo_code });
    }
    // Générer un code promo unique de 10% valable 72h
    const code = "RETOUR" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);

    try {
      await db.prepare(`
        INSERT INTO promo_codes (code, type, value, active, expires_at, min_order_cad)
        VALUES (?, 'percent', 10, 1, ?, 0)
      `).bind(code, expiresAt).run();
    } catch {
      // Code déjà existant → réessayer avec suffix aléatoire
    }

    await db.prepare(
      "UPDATE abandoned_carts SET recovery_promo_code = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(code, cart.id).run();

    return json({ ok: true, promoCode: code });
  }

  // Rappels 1, 2, 3 → mettre à jour le timestamp correspondant
  const reminderField = body.action === "remind_1"
    ? "reminder_1_sent_at"
    : body.action === "remind_2"
    ? "reminder_2_sent_at"
    : "reminder_3_sent_at";

  await db.prepare(`
    UPDATE abandoned_carts
    SET ${reminderField} = datetime('now'),
        status = 'abandoned',
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(cart.id).run();

  // Construire le message WhatsApp
  const items = JSON.parse(cart.items_json) as Array<{
    name: string;
    quantity: number;
    price_cad: number;
  }>;

  const lignes = items.map(i => `• ${i.name} × ${i.quantity} = ${(i.price_cad * i.quantity).toFixed(2)} $`).join("\n");

  const messages: Record<string, string> = {
    remind_1: `Bonjour${cart.customer_name ? " " + cart.customer_name.split(" ")[0] : ""} 👋\n\nVous avez laissé des articles dans votre panier DDM Wigs !\n\n${lignes}\n\n💰 Total : ${cart.total_cad.toFixed(2)} $ CAD\n\nVotre panier vous attend ici : https://ddmwigs.com/panier\n\nBesoin d'aide ? Répondez à ce message 😊`,

    remind_2: `Bonjour${cart.customer_name ? " " + cart.customer_name.split(" ")[0] : ""} 💕\n\nVotre panier DDM Wigs expire bientôt !\n\n${lignes}\n\n💰 Total : ${cart.total_cad.toFixed(2)} $ CAD\n\n${cart.recovery_promo_code ? `🎁 Code promo exclusif : *${cart.recovery_promo_code}* (-10%)\n\n` : ""}Finalisez votre commande : https://ddmwigs.com/panier`,

    remind_3: `Bonjour${cart.customer_name ? " " + cart.customer_name.split(" ")[0] : ""} 🌟\n\nDernière chance ! Votre panier DDM Wigs :\n\n${lignes}\n\n💰 Total : ${cart.total_cad.toFixed(2)} $ CAD\n\n${cart.recovery_promo_code ? `🎁 Code : *${cart.recovery_promo_code}* (-10%)\n\n` : ""}Commander maintenant : https://ddmwigs.com/panier\n\nDes questions ? Écrivez-nous 💬`,
  };

  const message = messages[body.action] ?? "";

  return json({ ok: true, whatsappMessage: message, reminderField });
}
