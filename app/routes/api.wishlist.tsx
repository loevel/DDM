import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getCustomerId } from "~/lib/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = await getCustomerId(request, context);
  if (!customerId) return json({ inWishlist: false });

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return json({ inWishlist: false });

  const row = await context.cloudflare.env.DB
    .prepare("SELECT id FROM wishlists WHERE customer_id = ? AND product_id = ?")
    .bind(customerId, productId).first();

  return json({ inWishlist: !!row });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const customerId = await getCustomerId(request, context);
  if (!customerId) return json({ error: "Non connecté", inWishlist: false }, { status: 401 });

  const body = await request.json() as { productId: number };
  const { productId } = body;
  const db = context.cloudflare.env.DB;

  const existing = await db
    .prepare("SELECT id FROM wishlists WHERE customer_id = ? AND product_id = ?")
    .bind(customerId, productId).first();

  if (existing) {
    await db.prepare("DELETE FROM wishlists WHERE customer_id = ? AND product_id = ?")
      .bind(customerId, productId).run();
    return json({ inWishlist: false });
  } else {
    await db.prepare("INSERT OR IGNORE INTO wishlists (customer_id, product_id) VALUES (?, ?)")
      .bind(customerId, productId).run();
    return json({ inWishlist: true });
  }
}
