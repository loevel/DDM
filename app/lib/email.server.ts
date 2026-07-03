// ─────────────────────────────────────────────────────────────────────────────
// Module central des courriels — une seule mise en page de marque, des
// builders typés par type de courriel, et un envoi Resend unique.
//
// Les textes des courriels marketing (rappels panier, alerte stock) peuvent
// être personnalisés depuis /admin/courriels : les valeurs par défaut vivent
// ici (DEFAULT_TEMPLATES), les surcharges dans la table email_templates.
// ─────────────────────────────────────────────────────────────────────────────

const SITE_URL = "https://ddmwigs.com";
const FROM = "DDM Wigs & More <noreply@ddmwigs.com>";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Envoi ─────────────────────────────────────────────────────────────────────

export async function sendEmail(opts: {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    if (!r.ok) console.error(`[Email] Resend ${r.status} — ${await r.text()}`);
    return r.ok;
  } catch (e) {
    console.error("[Email] Envoi échoué:", e);
    return false;
  }
}

// ── Mise en page de marque ────────────────────────────────────────────────────

export function emailLayout(opts: {
  /** Petit texte doré en majuscules au-dessus du titre (ex. « Votre panier »). */
  eyebrow?: string;
  /** Titre principal. Omis si absent. */
  title?: string;
  /** Corps HTML (déjà échappé par l'appelant pour tout contenu externe). */
  content: string;
  /** Bouton d'action. */
  cta?: { label: string; url: string };
  /** Petite note grise sous le CTA. */
  note?: string;
  /** Texte du pied de page expliquant pourquoi le destinataire reçoit ce courriel. */
  footerReason: string;
  /** Lien de désabonnement (obligation LCAP pour tout courriel marketing). */
  unsubUrl?: string;
}): string {
  const { eyebrow, title, content, cta, note, footerReason, unsubUrl } = opts;

  const header = `
  <tr><td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#c9a87c;letter-spacing:3px;">DDM WIGS</p>
    <p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#ffffff80;letter-spacing:4px;text-transform:uppercase;">&amp; More</p>
  </td></tr>`;

  const heading = eyebrow || title ? `
  <tr><td style="padding:36px 40px 8px;text-align:center;">
    ${eyebrow ? `<p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#c9a87c;letter-spacing:3px;text-transform:uppercase;">${eyebrow}</p>` : ""}
    ${title ? `<h1 style="margin:10px 0 4px;font-family:Georgia,serif;font-size:24px;color:#1a1a1a;font-weight:normal;">${title}</h1>` : ""}
  </td></tr>` : "";

  const ctaBlock = cta ? `
  <tr><td style="padding:24px 40px 12px;text-align:center;">
    <a href="${cta.url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;padding:16px 36px;">${cta.label}</a>
  </td></tr>` : "";

  const noteBlock = note ? `
  <tr><td style="padding:4px 40px 8px;text-align:center;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#b5a89a;">${note}</p>
  </td></tr>` : "";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f2ed;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ed;padding:40px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;max-width:560px;width:100%;">
  ${header}
  ${heading}
  <tr><td style="padding:12px 40px 8px;">${content}</td></tr>
  ${ctaBlock}
  ${noteBlock}
  <tr><td style="padding:16px 40px 20px;"></td></tr>
  <tr><td style="background:#f7f2ed;padding:24px 40px;text-align:center;border-top:1px solid #e8ddd4;">
    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:13px;color:#9b8b7a;">DDM Wigs &amp; More</p>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#b5a89a;">
      ${footerReason}<br>
      ${unsubUrl ? `<a href="${unsubUrl}" style="color:#c9a87c;text-decoration:underline;">Se désabonner</a> · ` : ""}<a href="${SITE_URL}" style="color:#c9a87c;text-decoration:none;">Visiter la boutique</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Paragraphe standard du corps de courriel. */
export function p(html: string): string {
  return `<p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px;color:#6b5e52;line-height:1.7;">${html}</p>`;
}

// ── Templates éditables (admin/courriels) ─────────────────────────────────────

export type EmailTemplate = { subject: string; body: string };

/**
 * Valeurs par défaut. Le sujet et le corps acceptent des variables {prenom},
 * {produit}, {code}, {total} substituées à l'envoi. Le corps est du texte
 * simple : chaque ligne devient un paragraphe.
 */
export const DEFAULT_TEMPLATES: Record<string, EmailTemplate & { label: string; variables: string[] }> = {
  panier_rappel_1: {
    label: "Panier abandonné — rappel 1 (après 1 h)",
    variables: ["{prenom}", "{total}"],
    subject: "Vous avez oublié quelque chose… 🛍️",
    body: "Bonjour {prenom} 👋\nVous avez laissé de magnifiques articles dans votre panier DDM Wigs. Ils n'attendent que vous !",
  },
  panier_rappel_2: {
    label: "Panier abandonné — rappel 2 (après 24 h, avec code -10 %)",
    variables: ["{prenom}", "{total}", "{code}"],
    subject: "Votre panier expire bientôt + code exclusif 💕",
    body: "Bonjour {prenom} 💕\nVotre panier DDM Wigs expire bientôt. Pour vous remercier, voici un code exclusif -10%.",
  },
  panier_rappel_3: {
    label: "Panier abandonné — rappel 3 (dernier, après 72 h)",
    variables: ["{prenom}", "{total}", "{code}"],
    subject: "Dernière chance pour votre panier DDM Wigs ✨",
    body: "Bonjour {prenom} ✨\nDernier rappel — votre panier DDM Wigs est encore disponible, mais pas pour longtemps.",
  },
  alerte_stock: {
    label: "Alerte de retour en stock",
    variables: ["{prenom}", "{produit}"],
    subject: "{produit} est de retour en stock ! 🎉",
    body: "Bonjour {prenom} 🎉\nBonne nouvelle — le produit que vous avez ajouté à vos favoris est de nouveau disponible :",
  },
};

/** Charge un template : surcharge en base si elle existe, sinon défaut du code. */
export async function getTemplate(db: D1Database, key: string): Promise<EmailTemplate> {
  const fallback = DEFAULT_TEMPLATES[key];
  if (!fallback) throw new Error(`Template inconnu : ${key}`);
  try {
    const row = await db
      .prepare("SELECT subject, body FROM email_templates WHERE key = ?")
      .bind(key)
      .first<EmailTemplate>();
    return row ?? { subject: fallback.subject, body: fallback.body };
  } catch {
    // Table absente (migration pas encore appliquée) → défauts du code
    return { subject: fallback.subject, body: fallback.body };
  }
}

/** Substitue {prenom}, {produit}, {code}, {total}… — les valeurs sont échappées. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? escapeHtml(vars[k]) : m));
}

/** Corps texte simple → paragraphes HTML (les variables sont déjà substituées). */
export function bodyToHtml(body: string): string {
  return body
    .split(/\n+/)
    .filter(l => l.trim())
    .map(l => p(l.trim()))
    .join("");
}

// ── Builders typés ────────────────────────────────────────────────────────────

export function magicLinkEmail(opts: { magicUrl: string; ttlMin: number }): { subject: string; html: string } {
  return {
    subject: "Votre lien de connexion — DDM Wigs & More",
    html: emailLayout({
      eyebrow: "Espace client",
      title: "Votre lien de connexion",
      content:
        p("Bonjour,") +
        p(`Cliquez sur le bouton ci-dessous pour accéder à votre espace client. Ce lien est valide pendant <strong>${opts.ttlMin} minutes</strong> et ne peut être utilisé qu'une fois.`),
      cta: { label: "Accéder à mon espace", url: opts.magicUrl },
      note: `Si vous n'avez pas demandé ce lien, ignorez simplement cet email.<br>Ou copiez cette URL : <span style="color:#c9a87c;word-break:break-all">${opts.magicUrl}</span>`,
      footerReason: "Vous recevez cet email car une connexion a été demandée avec votre adresse.",
    }),
  };
}

export function orderStatusEmail(opts: {
  reference: string;
  customerName: string;
  status: "confirmed" | "shipped" | "delivered" | "cancelled";
  tracking?: string;
  carrier?: string;
}): { subject: string; html: string } | null {
  const ref = escapeHtml(opts.reference);
  const SUBJECT: Record<string, string> = {
    confirmed: `Votre commande ${opts.reference} est confirmée ✅`,
    shipped: `Votre commande ${opts.reference} a été expédiée 📦`,
    delivered: `Votre commande ${opts.reference} a été livrée 🎉`,
    cancelled: `Votre commande ${opts.reference} a été annulée`,
  };
  const TITLE: Record<string, string> = {
    confirmed: "Commande confirmée",
    shipped: "Commande expédiée",
    delivered: "Commande livrée",
    cancelled: "Commande annulée",
  };
  const subject = SUBJECT[opts.status];
  if (!subject) return null;

  const bodyMap: Record<string, string> = {
    confirmed:
      p(`Bonne nouvelle ! Votre commande <strong>${ref}</strong> a été confirmée et est en cours de préparation.`) +
      p("Nous vous enverrons un autre email dès qu'elle sera expédiée."),
    shipped:
      p(`Votre commande <strong>${ref}</strong> est en route !`) +
      (opts.carrier ? p(`<strong>Transporteur :</strong> ${escapeHtml(opts.carrier)}`) : "") +
      (opts.tracking
        ? p(`<strong>Numéro de suivi :</strong> <code style="background:#f0ebe6;padding:2px 6px;border-radius:3px">${escapeHtml(opts.tracking)}</code>`)
        : p("Vous recevrez les informations de suivi séparément.")),
    delivered:
      p(`Votre commande <strong>${ref}</strong> a bien été livrée. Nous espérons que vous êtes satisfaite !`) +
      p("N'hésitez pas à nous contacter si vous avez la moindre question."),
    cancelled:
      p(`Votre commande <strong>${ref}</strong> a été annulée.`) +
      p("Si vous avez des questions, n'hésitez pas à nous contacter."),
  };

  return {
    subject,
    html: emailLayout({
      eyebrow: "Votre commande",
      title: TITLE[opts.status],
      content: p(`Bonjour ${escapeHtml(opts.customerName)},`) + bodyMap[opts.status],
      footerReason: "Vous recevez cet email au sujet de votre commande sur ddmwigs.com.",
    }),
  };
}

export async function stockAlertEmail(
  db: D1Database,
  opts: { prenom: string; productName: string; slug: string }
): Promise<{ subject: string; html: string }> {
  const tpl = await getTemplate(db, "alerte_stock");
  const vars = { prenom: opts.prenom || "", produit: opts.productName };
  return {
    subject: fillTemplate(tpl.subject, vars).replace(/\s{2,}/g, " ").trim(),
    html: emailLayout({
      eyebrow: "Alerte stock",
      title: "De retour en boutique !",
      content:
        bodyToHtml(fillTemplate(tpl.body, vars)) +
        `<div style="border:2px solid #c9a87c;padding:20px;text-align:center;margin-top:8px;">
          <p style="margin:0;font-family:Georgia,serif;font-size:18px;color:#1a1a1a;font-weight:bold;">${escapeHtml(opts.productName)}</p>
        </div>`,
      cta: { label: "Voir le produit →", url: `${SITE_URL}/boutique/${opts.slug}` },
      note: "Les stocks sont limités — commandez vite !",
      footerReason: "Vous recevez cet email car vous avez activé les alertes de stock.",
      unsubUrl: `${SITE_URL}/compte/profil`,
    }),
  };
}

export type CartReminderItem = { name: string; quantity: number; price_cad: number };

export async function cartReminderEmail(
  db: D1Database,
  opts: { firstName: string; items: CartReminderItem[]; total: number; promoCode?: string; num: 1 | 2 | 3 }
): Promise<{ subject: string; html: string }> {
  const tpl = await getTemplate(db, `panier_rappel_${opts.num}`);
  const vars = {
    prenom: opts.firstName || "",
    total: `${opts.total.toFixed(2)} $`,
    code: opts.promoCode ?? "",
  };

  const rows = opts.items.map(i => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0e8e0;font-family:Georgia,serif;font-size:14px;color:#2d2d2d;">${escapeHtml(i.name)} <span style="color:#9b8b7a;font-size:12px;font-family:Arial,sans-serif;">×${i.quantity}</span></td>
      <td style="padding:10px 0;border-bottom:1px solid #f0e8e0;text-align:right;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#2d2d2d;white-space:nowrap;">${(i.price_cad * i.quantity).toFixed(2)}&nbsp;$</td>
    </tr>`).join("");

  const promoBlock = opts.promoCode ? `
    <div style="background:#fdf6f0;border:2px dashed #c9a87c;border-radius:4px;padding:16px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;color:#9b8b7a;text-transform:uppercase;letter-spacing:2px;">Code exclusif pour vous</p>
      <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#c9a87c;letter-spacing:4px;">${escapeHtml(opts.promoCode)}</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9b8b7a;">-10% sur votre commande · Valable 72h</p>
    </div>` : "";

  const TITLES = ["Vous avez oublié quelque chose !", "Votre panier expire bientôt", "Dernière chance"];
  const CTAS = ["Finaliser mon achat →", "Utiliser mon code et commander →", "Commander maintenant →"];
  const NOTES = [
    "Votre panier est sauvegardé pendant 7 jours.",
    opts.promoCode ? `Le code ${escapeHtml(opts.promoCode)} est valable 72h.` : "Profitez-en avant qu'il expire.",
    "Cette offre ne sera pas renouvelée.",
  ];

  return {
    subject: fillTemplate(tpl.subject, vars),
    html: emailLayout({
      eyebrow: "Votre panier",
      title: TITLES[opts.num - 1],
      content:
        bodyToHtml(fillTemplate(tpl.body, vars)) +
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #1a1a1a;margin-top:8px;">
          ${rows}
          <tr>
            <td style="padding:14px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#6b5e52;">Total</td>
            <td style="padding:14px 0 0;text-align:right;font-family:Georgia,serif;font-size:20px;font-weight:bold;color:#c9a87c;">${opts.total.toFixed(2)}&nbsp;$ CAD</td>
          </tr>
        </table>` +
        promoBlock,
      cta: { label: CTAS[opts.num - 1], url: `${SITE_URL}/panier` },
      note: `${NOTES[opts.num - 1]}<br>Une question ? Écrivez-nous sur <a href="https://wa.me/23797193723" style="color:#c9a87c;text-decoration:none;">WhatsApp</a>`,
      footerReason: "Vous recevez cet email car vous avez commencé une commande sur ddmwigs.com.",
    }),
  };
}

export function newsletterEmail(opts: {
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  unsubUrl: string;
}): string {
  return emailLayout({
    title: escapeHtml(opts.subject),
    content: bodyToHtml(escapeHtml(opts.body)),
    cta: opts.ctaLabel && opts.ctaUrl ? { label: escapeHtml(opts.ctaLabel), url: opts.ctaUrl } : undefined,
    footerReason: "Vous recevez cet email car vous êtes abonné à notre newsletter.",
    unsubUrl: opts.unsubUrl,
  });
}

export function contactNotificationEmail(opts: {
  nom: string;
  email: string;
  tel?: string;
  sujet?: string;
  message: string;
}): { subject: string; html: string } {
  return {
    subject: `Nouveau message de ${opts.nom}${opts.sujet ? ` — ${opts.sujet}` : ""}`,
    html: emailLayout({
      eyebrow: "Nouveau message via ddmwigs.com",
      title: escapeHtml(opts.nom),
      content:
        p(`<strong>${escapeHtml(opts.nom)}</strong> — ${escapeHtml(opts.email)}${opts.tel ? ` — ${escapeHtml(opts.tel)}` : ""}`) +
        (opts.sujet ? p(`<span style="color:#c9a87c;text-transform:uppercase;letter-spacing:1px;font-size:12px;">${escapeHtml(opts.sujet)}</span>`) : "") +
        `<p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px;color:#6b5e52;line-height:1.7;white-space:pre-wrap;border-left:3px solid #c9a87c;padding-left:16px;">${escapeHtml(opts.message)}</p>`,
      cta: { label: "Répondre depuis l'admin →", url: `${SITE_URL}/admin/clients?tab=messages` },
      footerReason: "Notification interne — message reçu via le formulaire de contact.",
    }),
  };
}

export function contactReplyEmail(opts: {
  nom: string;
  sujet?: string;
  originalMessage: string;
  replyText: string;
}): { subject: string; html: string } {
  return {
    subject: `Re: ${opts.sujet || "Votre message"} — DDM Wigs & More`,
    html: emailLayout({
      eyebrow: "Notre réponse",
      content:
        p(`Bonjour ${escapeHtml(opts.nom)},`) +
        `<p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px;color:#6b5e52;line-height:1.7;white-space:pre-wrap;">${escapeHtml(opts.replyText)}</p>` +
        `<p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#9b8b7a;line-height:1.6;border-left:3px solid #e8ddd4;padding-left:12px;">Votre message :<br>${escapeHtml(opts.originalMessage)}</p>`,
      footerReason: "Vous recevez cet email en réponse à votre message sur ddmwigs.com.",
    }),
  };
}
