import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";

// POST /api/cart-identify { cartId, email, name? }
// Lie un email à un cartId pour le suivi des paniers abandonnés.
// Appelé quand l'utilisateur saisit son email au checkout.
export async function action({ request, context }: ActionFunctionArgs) {
  const { cartId, email, name } = await request.json();

  if (!cartId || !email?.includes("@")) {
    return Response.json({ error: "Données invalides" }, { status: 400 });
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
