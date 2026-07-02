import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/react";
import type { Cart, CartItem } from "~/lib/db.server";
import { getCache, getDB } from "~/lib/db.server";

function cartKey(id: string) { return `cart:${id}`; }

export async function loader({ request, context }: LoaderFunctionArgs) {
  const cartId = new URL(request.url).searchParams.get("cartId");
  if (!cartId) return Response.json({ items: [], total: 0 });
  const cache = getCache(context);
  const data = await cache.get(cartKey(cartId));
  return Response.json(data ? JSON.parse(data) : { items: [], total: 0 });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const cartId = new URL(request.url).searchParams.get("cartId");
  if (!cartId) return Response.json({ error: "cartId requis" }, { status: 400 });

  const { productId, quantity, variantId, variantName } = await request.json<{
    productId: number;
    quantity: number;
    variantId?: number;
    variantName?: string;
  }>();

  const [cache, db] = [getCache(context), getDB(context)];

  const raw = await cache.get(cartKey(cartId));
  const cart: Cart = raw ? JSON.parse(raw) : { items: [], total: 0 };

  const product = await db
    .prepare("SELECT id, name, price_cad, slug FROM products WHERE id = ?")
    .bind(productId)
    .first<{ id: number; name: string; price_cad: number; slug: string }>();
  if (!product) return Response.json({ error: "Produit introuvable" }, { status: 404 });

  let effectivePrice = product.price_cad;
  if (variantId) {
    const variant = await db
      .prepare("SELECT id, stock, price_adjustment_cad FROM product_variants WHERE id = ? AND product_id = ?")
      .bind(variantId, productId)
      .first<{ id: number; stock: number; price_adjustment_cad: number }>();
    if (!variant) return Response.json({ error: "Déclinaison introuvable" }, { status: 404 });
    if (quantity > 0 && variant.stock < quantity) {
      return Response.json({ error: "Stock insuffisant pour cette déclinaison" }, { status: 400 });
    }
    effectivePrice = product.price_cad + variant.price_adjustment_cad;
  }

  const idx = cart.items.findIndex(
    (i: CartItem) => i.productId === productId && (i.variantId ?? null) === (variantId ?? null)
  );

  if (quantity <= 0) {
    if (idx !== -1) cart.items.splice(idx, 1);
  } else if (idx !== -1) {
    cart.items[idx].quantity = quantity;
    cart.items[idx].price_cad = effectivePrice;
  } else {
    cart.items.push({
      productId,
      name: product.name,
      price_cad: effectivePrice,
      slug: product.slug,
      quantity,
      ...(variantId ? { variantId, variantName } : {}),
    });
  }

  cart.total = cart.items.reduce((s: number, i: CartItem) => s + i.price_cad * i.quantity, 0);
  await cache.put(cartKey(cartId), JSON.stringify(cart), { expirationTtl: 86400 * 7 });

  // Persister le snapshot en D1 pour le suivi des paniers abandonnés
  try {
    if (cart.items.length > 0) {
      await db.prepare(`
        INSERT INTO abandoned_carts (cart_id, items_json, total_cad, status, updated_at)
        VALUES (?, ?, ?, 'active', datetime('now'))
        ON CONFLICT(cart_id) DO UPDATE SET
          items_json = excluded.items_json,
          total_cad = excluded.total_cad,
          status = CASE WHEN status = 'recovered' THEN 'recovered' ELSE 'active' END,
          updated_at = datetime('now')
      `).bind(cartId, JSON.stringify(cart.items), cart.total).run();
    } else {
      // Panier vidé → marquer comme expiré
      await db.prepare(`
        UPDATE abandoned_carts SET status = 'expired', updated_at = datetime('now')
        WHERE cart_id = ? AND status = 'active'
      `).bind(cartId).run();
    }
  } catch {
    // Table pas encore créée : ne pas bloquer l'opération principale
  }

  return Response.json(cart);
}
