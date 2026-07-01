import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";
import { getCustomerId } from "~/lib/session.server";
import { getCustomer } from "~/lib/auth.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return json({ reviews: [] });

  const db = getDB(context as any);
  const result = await db
    .prepare(
      "SELECT id, customer_name, rating, body, photos, verified_purchase, created_at FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT 20"
    )
    .bind(Number(productId))
    .all<{ id: number; customer_name: string; rating: number; body: string | null; photos: string | null; verified_purchase: number; created_at: string }>();

  return json({ reviews: result.results ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Vérifier session
  const customerId = await getCustomerId(request, context as any);
  if (!customerId) {
    return json({ error: "Vous devez être connectée pour laisser un avis.", code: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const customer = await getCustomer(customerId, context as any);
  if (!customer) {
    return json({ error: "Session invalide.", code: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const body = await request.json() as {
    productId?: number;
    rating?: number;
    reviewBody?: string;
    photos?: string[];
  };

  const { productId, rating, reviewBody, photos } = body;

  if (!productId || !rating || rating < 1 || rating > 5) {
    return json({ error: "Données invalides" }, { status: 400 });
  }

  const db = getDB(context as any);

  const product = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
  if (!product) return json({ error: "Produit introuvable" }, { status: 404 });

  // Vérifier si la cliente a déjà posté un avis pour ce produit
  const existing = await db
    .prepare("SELECT id FROM reviews WHERE product_id = ? AND customer_email = ?")
    .bind(productId, customer.email)
    .first();
  if (existing) {
    return json({ error: "Vous avez déjà laissé un avis pour ce produit.", code: "ALREADY_REVIEWED" }, { status: 409 });
  }

  // Vérifier achat vérifié
  const purchase = await db
    .prepare(`
      SELECT oi.id FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.customer_email = ? AND oi.product_id = ? AND o.payment_status = 'paid'
      LIMIT 1
    `)
    .bind(customer.email, productId)
    .first();

  const verifiedPurchase = purchase ? 1 : 0;

  const photosJson = Array.isArray(photos) && photos.length > 0
    ? JSON.stringify(photos.slice(0, 5).filter((u: string) => typeof u === "string"))
    : null;

  // Approbation auto si achat vérifié, sinon en modération
  const approved = verifiedPurchase ? 1 : 0;

  await db
    .prepare("INSERT INTO reviews (product_id, customer_name, customer_email, rating, body, photos, verified_purchase, approved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(productId, customer.name?.trim() || customer.email.split("@")[0], customer.email, rating, (reviewBody ?? "").trim().slice(0, 1000) || null, photosJson, verifiedPurchase, approved)
    .run();

  return json({ success: true, verified: verifiedPurchase === 1 });
}
