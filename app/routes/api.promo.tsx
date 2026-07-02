import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";

interface PromoCode {
  id: number;
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_order: number;
  usage_limit: number | null;
  used_count: number;
  active: number;
  expires_at: string | null;
}

// GET /api/promo?code=XXX&total=YYY  → valide le code et calcule la remise
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const total = parseFloat(url.searchParams.get("total") ?? "0");

  if (!code) return json({ valid: false, error: "Code manquant" });

  const db = getDB(context);
  const promo = await db
    .prepare("SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE")
    .bind(code)
    .first<PromoCode>();

  if (!promo) return json({ valid: false, error: "Code invalide" });
  if (!promo.active) return json({ valid: false, error: "Ce code est désactivé" });
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return json({ valid: false, error: "Ce code a expiré" });
  }
  if (promo.usage_limit !== null && promo.used_count >= promo.usage_limit) {
    return json({ valid: false, error: "Ce code a atteint sa limite d'utilisation" });
  }
  if (total < promo.min_order) {
    return json({
      valid: false,
      error: `Commande minimum de ${promo.min_order.toFixed(2)} $ requise`,
    });
  }

  const discount = promo.type === "percent"
    ? Math.min(total * (promo.value / 100), total)
    : Math.min(promo.value, total);

  return json({
    valid: true,
    code: promo.code,
    type: promo.type,
    value: promo.value,
    discount: Math.round(discount * 100) / 100,
    finalTotal: Math.round((total - discount) * 100) / 100,
    label: promo.type === "percent" ? `-${promo.value}%` : `-${promo.value.toFixed(2)} $`,
  });
}

// POST /api/promo  → confirme l'utilisation du code (incrémente used_count)
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const body = await request.json() as { code?: string };
  if (!body.code) return json({ error: "Code manquant" }, { status: 400 });

  const db = getDB(context);
  await db
    .prepare("UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ? COLLATE NOCASE AND active = 1")
    .bind(body.code)
    .run();

  return json({ ok: true });
}
