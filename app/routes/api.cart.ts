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

  const { productId, quantity } = await request.json<{ productId: number; quantity: number }>();
  const [cache, db] = [getCache(context), getDB(context)];

  const raw = await cache.get(cartKey(cartId));
  const cart: Cart = raw ? JSON.parse(raw) : { items: [], total: 0 };

  const product = await db.prepare("SELECT id, name, price_cad, slug FROM products WHERE id = ?").bind(productId).first<{ id: number; name: string; price_cad: number; slug: string }>();
  if (!product) return Response.json({ error: "Produit introuvable" }, { status: 404 });

  const idx = cart.items.findIndex((i: CartItem) => i.productId === productId);
  if (quantity <= 0) {
    if (idx !== -1) cart.items.splice(idx, 1);
  } else if (idx !== -1) {
    cart.items[idx].quantity = quantity;
  } else {
    cart.items.push({ productId, name: product.name, price_cad: product.price_cad, slug: product.slug, quantity });
  }

  cart.total = cart.items.reduce((s: number, i: CartItem) => s + i.price_cad * i.quantity, 0);
  await cache.put(cartKey(cartId), JSON.stringify(cart), { expirationTtl: 86400 * 7 });
  return Response.json(cart);
}
