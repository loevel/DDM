import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";
import { checkRateLimit } from "~/lib/rate-limit.server";

// POST /api/cart-identify { cartId, email, name? }
// Lie un email à un cartId pour le suivi des paniers abandonnés.
// Appelé quand l'utilisateur saisit son email au checkout.
export async function action({ request, context }: ActionFunctionArgs) {
  const { cartId, email, name } = await request.json();

  if (!cartId || !email?.includes("@")) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
  }

  // Écrit une adresse arbitraire sur un panier dont on connaît l'identifiant,
  // et c'est cette adresse qui recevra le courriel de relance et son code de
  // remise. Appelé une fois par checkout en temps normal.
  const autorise = await checkRateLimit(context, request, {
    name: "cart-identify",
    max: 20,
    windowSeconds: 3600,
  });
  if (!autorise) {
    return Response.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const db = getDB(context);

  try {
    await db.prepare(`
      UPDATE abandoned_carts
      SET email = ?,
          customer_name = COALESCE(?, customer_name),
          updated_at = datetime('now')
      WHERE cart_id = ? AND status = 'active'
    `).bind(email.trim().toLowerCase(), name?.trim() || null, cartId).run();
  } catch {
    // Table absente → ignorer silencieusement
  }

  return Response.json({ ok: true });
}
