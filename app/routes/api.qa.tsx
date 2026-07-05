import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { checkRateLimit } from "~/lib/rate-limit.server";

// GET /api/qa?productId=X  → questions répondues
// POST /api/qa             → soumettre une nouvelle question
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return json({ questions: [] });

  const db = context.cloudflare.env.DB;
  const { results } = await db
    .prepare(
      "SELECT id, customer_name, question, answer, answered_at, created_at FROM product_questions WHERE product_id = ? AND answered_at IS NOT NULL ORDER BY answered_at DESC LIMIT 30"
    )
    .bind(Number(productId))
    .all();

  return json({ questions: results ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const allowed = await checkRateLimit(context, request, { name: "qa", max: 5, windowSeconds: 3600 });
  if (!allowed) return json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });

  const body = await request.json() as { productId?: number; customerName?: string; question?: string };
  const { productId, customerName, question } = body;

  if (!productId || !customerName?.trim() || !question?.trim()) {
    return json({ error: "Données invalides" }, { status: 400 });
  }

  const db = context.cloudflare.env.DB;
  await db
    .prepare("INSERT INTO product_questions (product_id, customer_name, question) VALUES (?,?,?)")
    .bind(productId, customerName.trim().slice(0, 100), question.trim().slice(0, 500))
    .run();

  return json({ success: true });
}
