import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";

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

// ── Email HTML ─────────────────────────────────────────────────────────────────
function buildEmail(opts: {
  firstName: string;
  items: CartItem[];
  total: number;
  promoCode?: string;
  num: 1 | 2 | 3;
}): { subject: string; html: string } {
  const { firstName, items, total, promoCode, num } = opts;
  const name = firstName ? ` ${firstName}` : "";
  const cartUrl = "https://ddmwigs.com/panier";

  const rows = items.map(i => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0e8e0;font-family:Georgia,serif;font-size:14px;color:#2d2d2d;">${i.name} <span style="color:#9b8b7a;font-size:12px;font-family:Arial,sans-serif;">×${i.quantity}</span></td>
      <td style="padding:10px 0;border-bottom:1px solid #f0e8e0;text-align:right;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#2d2d2d;white-space:nowrap;">${(i.price_cad * i.quantity).toFixed(2)}&nbsp;$</td>
    </tr>`).join("");

  const promoBlock = promoCode ? `
    <div style="background:#fdf6f0;border:2px dashed #c9a87c;border-radius:4px;padding:16px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;color:#9b8b7a;text-transform:uppercase;letter-spacing:2px;">Code exclusif pour vous</p>
      <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#c9a87c;letter-spacing:4px;">${promoCode}</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9b8b7a;">-10% sur votre commande · Valable 72h</p>
    </div>` : "";

  const subjects = [
    "Vous avez oublié quelque chose… 🛍️",
    "Votre panier expire bientôt + code exclusif 💕",
    "Dernière chance pour votre panier DDM Wigs ✨",
  ];

  const intros = [
    `Bonjour${name} 👋<br><br>Vous avez laissé de magnifiques articles dans votre panier DDM Wigs. Ils n'attendent que vous !`,
    `Bonjour${name} 💕<br><br>Votre panier DDM Wigs expire bientôt. Pour vous remercier, voici un code exclusif&nbsp;-10%.`,
    `Bonjour${name} ✨<br><br>Dernier rappel — votre panier DDM Wigs est encore disponible, mais pas pour longtemps.`,
  ];

  const ctas = ["Finaliser mon achat →", "Utiliser mon code et commander →", "Commander maintenant →"];
  const notes = [
    "Votre panier est sauvegardé pendant 7 jours.",
    promoCode ? `Le code ${promoCode} est valable 72h.` : "Profitez-en avant qu'il expire.",
    "Cette offre ne sera pas renouvelée.",
  ];

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f2ed;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ed;padding:40px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;max-width:560px;width:100%;">
  <tr><td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#c9a87c;letter-spacing:3px;">DDM WIGS</p>
    <p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#ffffff80;letter-spacing:4px;text-transform:uppercase;">&amp; More</p>
  </td></tr>
  <tr><td style="padding:36px 40px 20px;text-align:center;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#c9a87c;letter-spacing:3px;text-transform:uppercase;">Votre panier</p>
    <h1 style="margin:10px 0 16px;font-family:Georgia,serif;font-size:24px;color:#1a1a1a;font-weight:normal;">${["Vous avez oublié quelque chose !","Votre panier expire bientôt","Dernière chance"][num-1]}</h1>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#6b5e52;line-height:1.7;">${intros[num-1]}</p>
  </td></tr>
  <tr><td style="padding:0 40px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #1a1a1a;">
      ${rows}
      <tr>
        <td style="padding:14px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#6b5e52;">Total</td>
        <td style="padding:14px 0 0;text-align:right;font-family:Georgia,serif;font-size:20px;font-weight:bold;color:#c9a87c;">${total.toFixed(2)}&nbsp;$ CAD</td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 40px;">${promoBlock}</td></tr>
  <tr><td style="padding:28px 40px 12px;text-align:center;">
    <a href="${cartUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;padding:16px 36px;">${ctas[num-1]}</a>
  </td></tr>
  <tr><td style="padding:8px 40px;text-align:center;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9b8b7a;">Une question ? Écrivez-nous sur <a href="https://wa.me/23797193723" style="color:#c9a87c;text-decoration:none;">WhatsApp</a></p>
  </td></tr>
  <tr><td style="padding:4px 40px 20px;text-align:center;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#b5a89a;">${notes[num-1]}</p>
  </td></tr>
  <tr><td style="background:#f7f2ed;padding:24px 40px;text-align:center;border-top:1px solid #e8ddd4;">
    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:13px;color:#9b8b7a;">DDM Wigs &amp; More</p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#b5a89a;">Vous recevez cet email car vous avez commencé une commande sur ddmwigs.com.<br><a href="https://ddmwigs.com" style="color:#c9a87c;text-decoration:none;">Visiter notre boutique</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: subjects[num - 1], html };
}

// ── Resend HTTP call ───────────────────────────────────────────────────────────
async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "DDM Wigs <noreply@ddmwigs.com>", to: [to], subject, html }),
    });
    return r.ok;
  } catch { return false; }
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
  const env = (context as any).cloudflare.env;

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
    const { subject, html } = buildEmail({ firstName: cart.customer_name?.split(" ")[0] ?? "", items, total: cart.total_cad, num: 1 });
    if (await sendEmail(apiKey, cart.email, subject, html)) {
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
    const { subject, html } = buildEmail({ firstName: cart.customer_name?.split(" ")[0] ?? "", items, total: cart.total_cad, promoCode: promo, num: 2 });
    if (await sendEmail(apiKey, cart.email, subject, html)) {
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
    const { subject, html } = buildEmail({ firstName: cart.customer_name?.split(" ")[0] ?? "", items, total: cart.total_cad, promoCode: promo, num: 3 });
    if (await sendEmail(apiKey, cart.email, subject, html)) {
      await db.prepare("UPDATE abandoned_carts SET reminder_3_sent_at=datetime('now'),updated_at=datetime('now') WHERE id=?").bind(cart.id).run();
      sent++;
    } else { errors++; }
  }

  return json({ ok: true, sent, errors });
}
