import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";

// API de gestion des médias produit (galerie)
//
//  DELETE /api/product-media?mediaId=X        → supprime un média
//  POST   /api/product-media                  → ajoute un média
//         body JSON : { productId, url, position?, alt_text?, type? }
//  PATCH  /api/product-media                  → met à jour position et/ou alt_text
//         body JSON : { id, position?, alt_text? }
export async function action({ request, context }: ActionFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const method = request.method.toUpperCase();

  // ── DELETE ──────────────────────────────────────────────────────────────
  if (method === "DELETE") {
    const url = new URL(request.url);
    const mediaId = url.searchParams.get("mediaId");
    if (!mediaId) return json({ error: "mediaId requis" }, { status: 400 });
    await db.prepare("DELETE FROM product_media WHERE id = ?").bind(mediaId).run();
    return json({ ok: true });
  }

  // Les autres méthodes attendent un corps JSON
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  // ── POST (ajout) ────────────────────────────────────────────────────────
  if (method === "POST") {
    const { productId, url, position, alt_text, type } = body;
    if (!productId || !url) {
      return json({ error: "productId et url requis" }, { status: 400 });
    }
    await db
      .prepare(
        "INSERT INTO product_media (product_id, type, url, thumbnail_url, alt_text, position) VALUES (?,?,?,?,?,?)"
      )
      .bind(productId, type || "image", url, null, alt_text || null, Number(position ?? 0))
      .run();
    const row = await db.prepare("SELECT last_insert_rowid() as id").first<{ id: number }>();
    return json({ ok: true, id: row?.id });
  }

  // ── PATCH (réordonner / alt text) ────────────────────────────────────────
  if (method === "PATCH") {
    const { id, position, alt_text } = body;
    if (!id) return json({ error: "id requis" }, { status: 400 });

    const hasPos = position !== undefined && position !== null;
    const hasAlt = alt_text !== undefined;

    if (hasPos && hasAlt) {
      await db
        .prepare("UPDATE product_media SET position = ?, alt_text = ? WHERE id = ?")
        .bind(Number(position), alt_text || null, id)
        .run();
    } else if (hasPos) {
      await db
        .prepare("UPDATE product_media SET position = ? WHERE id = ?")
        .bind(Number(position), id)
        .run();
    } else if (hasAlt) {
      await db
        .prepare("UPDATE product_media SET alt_text = ? WHERE id = ?")
        .bind(alt_text || null, id)
        .run();
    } else {
      return json({ error: "Rien à mettre à jour (position ou alt_text requis)" }, { status: 400 });
    }
    return json({ ok: true });
  }

  return json({ error: "Méthode non supportée" }, { status: 405 });
}
