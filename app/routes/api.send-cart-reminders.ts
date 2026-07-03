import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { cartReminderEmail, sendEmail } from "~/lib/email.server";

interface CartItem {
  name: string;
  quantity: number;
  price_cad: number;
  slug: string;
}

interface AbandonedCart {
  id: number;
  email: string;
  customer_name: string | null;
  items_json: string;
  total_cad: number;
  recovery_promo_code: string | null;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  reminder_3_sent_at: string | null;
}

// ── Promo code helper ──────────────────────────────────────────────────────────
async function ensurePromo(db: D1Database, id: number, existing: string | null): Promise<string> {
  if (existing) return existing;
  const code = "RETOUR" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const exp = new Date(Date.now() + 72 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);
  try {
    await db.prepare("INSERT INTO promo_codes (code,type,value,active,expires_at,min_order_cad) VALUES (?,'percent',10,1,?,0)").bind(code, exp).run();
  } catch { /* doublon */ }
  await db.prepare("UPDATE abandoned_carts SET recovery_promo_code=? WHERE id=?").bind(code, id).run();
  return code;
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;

  // Protégé par CRON_TOKEN (variable Pages, même valeur que CRON_SECRET du Worker)
  const secret = request.headers.get("x-cron-secret");
  const cronToken = env.CRON_TOKEN as string | undefined;
  if (!cronToken || secret !== cronToken) {
    return json({ error: "Non autorisé" }, { status: 401 });
  }

  const db: D1Database = env.DB;
  const apiKey: string = env.RESEND_API_KEY ?? "";

  if (!apiKey) return json({ error: "RESEND_API_KEY manquant" }, { status: 503 });

  let sent = 0;
  let errors = 0;

  // ── R1 : 1h+ après abandon, pas encore contacté ────────────────────────────
  const { results: r1 } = await db.prepare(`
    SELECT * FROM abandoned_carts
    WHERE status IN ('active','abandoned') AND email IS NOT NULL
      AND reminder_1_sent_at IS NULL
      AND ROUND((julianday('now') - julianday(updated_at)) * 24 * 60) >= 60
      AND ROUND((julianday('now') - julianday(updated_at)) * 24 * 60) < 1440
    LIMIT 20
  `).all<AbandonedCart>();

  for (const cart of r1) {
    const items = JSON.parse(cart.items_json) as CartItem[];
    if (!items.length) continue;
    const { subject, html } = await cartReminderEmail(db, { firstName: cart.customer_name?.split(" ")[0] ?? "", items, total: cart.total_cad, num: 1 });
    if (await sendEmail({ apiKey, to: cart.email, subject, html })) {
      await db.prepare("UPDATE abandoned_carts SET reminder_1_sent_at=datetime('now'),status='abandoned',updated_at=datetime('now') WHERE id=?").bind(cart.id).run();
      sent++;
    } else { errors++; }
  }

  // ── R2 : 24h+ après R1, code promo inclus ─────────────────────────────────
  const { results: r2 } = await db.prepare(`
    SELECT * FROM abandoned_carts
    WHERE status='abandoned' AND email IS NOT NULL
      AND reminder_1_sent_at IS NOT NULL AND reminder_2_sent_at IS NULL
      AND ROUND((julianday('now') - julianday(reminder_1_sent_at)) * 24 * 60) >= 1440
    LIMIT 20
  `).all<AbandonedCart>();

  for (const cart of r2) {
    const items = JSON.parse(cart.items_json) as CartItem[];
    if (!items.length) continue;
    const promo = await ensurePromo(db, cart.id, cart.recovery_promo_code);
    const { subject, html } = await cartReminderEmail(db, { firstName: cart.customer_name?.split(" ")[0] ?? "", items, total: cart.total_cad, promoCode: promo, num: 2 });
    if (await sendEmail({ apiKey, to: cart.email, subject, html })) {
      await db.prepare("UPDATE abandoned_carts SET reminder_2_sent_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(cart.id).run();
      sent++;
    } else { errors++; }
  }

  // ── R3 : 72h+ après R2, dernier rappel ────────────────────────────────────
  const { results: r3 } = await db.prepare(`
    SELECT * FROM abandoned_carts
    WHERE status='abandoned' AND email IS NOT NULL
      AND reminder_2_sent_at IS NOT NULL AND reminder_3_sent_at IS NULL
      AND ROUND((julianday('now') - julianday(reminder_2_sent_at)) * 24 * 60) >= 4320
    LIMIT 20
  `).all<AbandonedCart>();

  for (const cart of r3) {
    const items = JSON.parse(cart.items_json) as CartItem[];
    if (!items.length) continue;
    const promo = await ensurePromo(db, cart.id, cart.recovery_promo_code);
    const { subject, html } = await cartReminderEmail(db, { firstName: cart.customer_name?.split(" ")[0] ?? "", items, total: cart.total_cad, promoCode: promo, num: 3 });
    if (await sendEmail({ apiKey, to: cart.email, subject, html })) {
      await db.prepare("UPDATE abandoned_carts SET reminder_3_sent_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(cart.id).run();
      sent++;
    } else { errors++; }
  }

  return json({ ok: true, sent, errors });
}
