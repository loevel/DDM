import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return json({ reviews: [] });

  const db = getDB(context as any);
  const result = await db
    .prepare(
      "SELECT id, customer_name, rating, body, created_at FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT 20"
    )
    .bind(Number(productId))
    .all<{ id: number; customer_name: string; rating: number; body: string | null; created_at: string }>();

  return json({ reviews: result.results ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json() as {
    productId?: number;
    customerName?: string;
    rating?: number;
    reviewBody?: string;
    photos?: string[];
  };

  const { productId, customerName, rating, reviewBody, photos } = body;

  if (!productId || !customerName?.trim() || !rating || rating < 1 || rating > 5) {
    return json({ error: "Données invalides" }, { status: 400 });
  }

  const db = getDB(context as any);

  const product = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
  if (!product) return json({ error: "Produit introuvable" }, { status: 404 });

  const photosJson = Array.isArray(photos) && photos.length > 0
    ? JSON.stringify(photos.slice(0, 5).filter((u: string) => typeof u === "string"))
    : null;

  await db
    .prepare("INSERT INTO reviews (product_id, customer_name, rating, body, photos) VALUES (?, ?, ?, ?, ?)")
    .bind(productId, customerName.trim().slice(0, 100), rating, (reviewBody ?? "").trim().slice(0, 1000) || null, photosJson)
    .run();

  return json({ success: true });
}
