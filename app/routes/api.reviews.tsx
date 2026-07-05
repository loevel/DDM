import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";
import { getCustomerId } from "~/lib/session.server";
import { getCustomer } from "~/lib/auth.server";
import { reviewRewardEmail, sendEmail } from "~/lib/email.server";
import { checkRateLimit } from "~/lib/rate-limit.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return json({ reviews: [] });

  const db = getDB(context);
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
  const allowed = await checkRateLimit(context, request, { name: "reviews", max: 5, windowSeconds: 3600 });
  if (!allowed) return json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });

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

  const db = getDB(context);

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
      WHERE o.customer_email = ? AND oi.product_id = ?
        AND (o.payment_status = 'paid' OR o.status IN ('confirmed', 'shipped', 'delivered'))
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

  // Récompense : code -10 % (usage unique, 60 jours) après tout avis vérifié,
  // peu importe la note — offrir la récompense seulement pour les avis positifs
  // serait une pratique trompeuse (Loi sur la concurrence).
  if (verifiedPurchase) {
    try {
      const code = "MERCI" + Math.random().toString(36).slice(2, 6).toUpperCase();
      const exp = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
      await db
        .prepare("INSERT INTO promo_codes (code, type, value, min_order, usage_limit, active, expires_at) VALUES (?, 'percent', 10, 0, 1, 1, ?)")
        .bind(code, exp)
        .run();
      await db
        .prepare("UPDATE reviews SET reward_code = ? WHERE product_id = ? AND customer_email = ?")
        .bind(code, productId, customer.email)
        .run();

      const apiKey = (context as any).cloudflare.env.RESEND_API_KEY as string | undefined;
      if (apiKey) {
        const prenom = (customer.name ?? "").split(" ")[0];
        const { subject, html } = await reviewRewardEmail(db, { prenom, code });
        await sendEmail({ apiKey, to: customer.email, subject, html });
      }
    } catch (e) {
      // La récompense ne doit jamais bloquer la publication de l'avis
      console.error("[Reviews] Récompense échouée:", e);
    }
  }

  return json({ success: true, verified: verifiedPurchase === 1 });
}
