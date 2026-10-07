import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";
import { checkRateLimit } from "~/lib/rate-limit.server";

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

/**
 * Message unique pour tous les refus. Les quatre cas — inconnu, désactivé,
 * expiré, épuisé — mènent la cliente à la même action, et les distinguer
 * revenait à dire à qui devine des codes au hasard si la chaîne essayée en a
 * déjà été un.
 *
 * Attention à ne pas surestimer ce changement : l'endpoint a pour métier de
 * dire si un code est valide, donc l'oracle est irréductible pour un code
 * valide. Ce qui l'étouffe vraiment, c'est la limite de débit ci-dessous,
 * couplée à l'entropie des codes (voir `genPromoCode`).
 */
const REFUS = "Ce code n'est pas valide ou n'est plus utilisable";

// GET /api/promo?code=XXX&total=YYY  → valide le code et calcule la remise
//
// Il n'y a volontairement pas d'`action` ici. Une route POST incrémentait
// `used_count` sans authentification et sans lien avec une commande : rien ne
// l'appelait, elle doublait le décompte que `applyPostPaymentEffects` fait
// déjà au paiement confirmé, et elle permettait d'épuiser à distance la
// réserve d'usages d'un code à diffusion limitée.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim();
  const total = parseFloat(url.searchParams.get("total") ?? "0");

  if (!code) return json({ valid: false, error: "Code manquant" });

  // Large pour une cliente (qui en essaie deux ou trois), hermétique pour
  // l'énumération : 20 essais par dix minutes mettraient des siècles à
  // parcourir l'espace des codes.
  const autorise = await checkRateLimit(context, request, {
    name: "promo",
    max: 20,
    windowSeconds: 600,
  });
  if (!autorise) {
    return json({ valid: false, error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  }

  const db = getDB(context);
  const promo = await db
    .prepare("SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE")
    .bind(code)
    .first<PromoCode>();

  if (!promo) return json({ valid: false, error: REFUS });
  if (!promo.active) return json({ valid: false, error: REFUS });
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return json({ valid: false, error: REFUS });
  }
  if (promo.usage_limit !== null && promo.used_count >= promo.usage_limit) {
    return json({ valid: false, error: REFUS });
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
