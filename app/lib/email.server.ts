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
  demande_avis: {
    label: "Demande d'avis (12 jours après livraison)",
    variables: ["{prenom}", "{produit}"],
    subject: "Comment trouvez-vous {produit} ? 💛",
    body: "Bonjour {prenom} 👋\nVous profitez de votre {produit} depuis quelques semaines — nous serions ravies de connaître votre expérience !\nEn remerciement, vous recevrez un code -10% sur votre prochaine commande. Et si vous ajoutez une photo, vous gagnez 100 points fidélité au lieu de 25 !",
  },
  merci_avis: {
    label: "Merci pour votre avis (avec code -10 %)",
    variables: ["{prenom}", "{code}"],
    subject: "Merci pour votre avis — voici votre -10% 🎁",
    body: "Bonjour {prenom} 💛\nMerci d'avoir partagé votre avis ! Voici votre code de remerciement, valable 60 jours sur toute la boutique.",
  },
  rachat_relance: {
    label: "Relance de rachat (90 jours après livraison, avec code -15 %)",
    variables: ["{prenom}", "{produit}", "{code}"],
    subject: "Il est temps de chouchouter vos cheveux 💆‍♀️",
    body: "Bonjour {prenom} 💛\nCela fait quelques mois que vous portez votre {produit} — nous espérons qu'elle vous fait toujours rayonner.\nPour la garder aussi sublime qu'au premier jour, ou pour vous offrir une nouvelle pièce, voici un code privilège -15% rien que pour vous.",
  },
  quiz_reco: {
    label: "Quiz — sélection personnalisée + code -10 % (48 h)",
    variables: ["{prenom}", "{code}"],
    subject: "Ta sélection DDM Wigs + un code -10% rien que pour toi 💛",
    body: "Coucou {prenom} 💛\nMerci d'avoir complété notre quiz ! Voici les perruques qui te correspondent le mieux, choisies d'après tes réponses.\nEt pour te souhaiter la bienvenue, on t'offre -10% sur ta première commande — mais dépêche-toi, le code expire dans 48h.",
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

export async function reviewRequestEmail(
  db: D1Database,
  opts: { prenom: string; productName: string; slug: string }
): Promise<{ subject: string; html: string }> {
  const tpl = await getTemplate(db, "demande_avis");
  const vars = { prenom: opts.prenom || "", produit: opts.productName };
  return {
    subject: fillTemplate(tpl.subject, vars),
    html: emailLayout({
      eyebrow: "Votre avis compte",
      title: "Partagez votre expérience",
      content: bodyToHtml(fillTemplate(tpl.body, vars)),
      cta: { label: "Laisser mon avis →", url: `${SITE_URL}/boutique/${opts.slug}#avis` },
      note: "Deux minutes suffisent — votre avis aide d'autres clientes à choisir.",
      footerReason: "Vous recevez cet email suite à votre commande sur ddmwigs.com.",
    }),
  };
}

export async function reviewRewardEmail(
  db: D1Database,
  opts: { prenom: string; code: string }
): Promise<{ subject: string; html: string }> {
  const tpl = await getTemplate(db, "merci_avis");
  const vars = { prenom: opts.prenom || "", code: opts.code };
  return {
    subject: fillTemplate(tpl.subject, vars),
    html: emailLayout({
      eyebrow: "Merci",
      title: "Votre code de remerciement",
      content:
        bodyToHtml(fillTemplate(tpl.body, vars)) +
        `<div style="background:#fdf6f0;border:2px dashed #c9a87c;border-radius:4px;padding:16px 20px;margin:20px 0;text-align:center;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;color:#9b8b7a;text-transform:uppercase;letter-spacing:2px;">Votre code</p>
          <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#c9a87c;letter-spacing:4px;">${escapeHtml(opts.code)}</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9b8b7a;">-10% sur votre prochaine commande · Valable 60 jours</p>
        </div>`,
      cta: { label: "Découvrir la boutique →", url: `${SITE_URL}/boutique` },
      footerReason: "Vous recevez cet email car vous avez publié un avis sur ddmwigs.com.",
    }),
  };
}

export async function rebuyReminderEmail(
  db: D1Database,
  opts: { prenom: string; productName: string; code: string; unsubUrl?: string }
): Promise<{ subject: string; html: string }> {
  const tpl = await getTemplate(db, "rachat_relance");
  const vars = { prenom: opts.prenom || "", produit: opts.productName, code: opts.code };
  return {
    subject: fillTemplate(tpl.subject, vars),
    html: emailLayout({
      eyebrow: "Rien que pour vous",
      title: "Prête pour un nouveau moment ?",
      content:
        bodyToHtml(fillTemplate(tpl.body, vars)) +
        `<div style="background:#fdf6f0;border:2px dashed #c9a87c;border-radius:4px;padding:16px 20px;margin:20px 0;text-align:center;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;color:#9b8b7a;text-transform:uppercase;letter-spacing:2px;">Votre code privilège</p>
          <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#c9a87c;letter-spacing:4px;">${escapeHtml(opts.code)}</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9b8b7a;">-15% sur toute la boutique · Valable 30 jours</p>
        </div>`,
      cta: { label: "Renouveler ma sélection →", url: `${SITE_URL}/boutique` },
      note: `Un doute sur l'entretien ? Consultez notre <a href="${SITE_URL}/guide-entretien" style="color:#c9a87c;text-decoration:none;">guide d'entretien</a>.`,
      footerReason: "Vous recevez cet email suite à un achat sur ddmwigs.com.",
      unsubUrl: opts.unsubUrl,
    }),
  };
}

export type QuizRecoProduct = { name: string; slug: string; price_cad: number; imageUrl: string | null };

export async function quizRecommendationEmail(
  db: D1Database,
  opts: { prenom?: string; summary: string; products: QuizRecoProduct[]; code: string; unsubUrl?: string }
): Promise<{ subject: string; html: string }> {
  const tpl = await getTemplate(db, "quiz_reco");
  const vars = { prenom: opts.prenom || "", code: opts.code };

  const cards = opts.products.slice(0, 4).map(pr => {
    const url = `${SITE_URL}/boutique/${escapeHtml(pr.slug)}`;
    const thumb = pr.imageUrl
      ? `<img src="${escapeHtml(pr.imageUrl)}" width="80" height="100" alt="${escapeHtml(pr.name)}" style="display:block;width:80px;height:100px;object-fit:cover;border:1px solid #eaded3;">`
      : `<div style="width:80px;height:100px;background:#f0ebe6;"></div>`;
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr>
      <td width="80" style="padding:0 14px 0 0;vertical-align:top;"><a href="${url}" style="text-decoration:none;">${thumb}</a></td>
      <td style="vertical-align:top;padding-top:4px;">
        <a href="${url}" style="text-decoration:none;">
          <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:15px;color:#1a1a1a;">${escapeHtml(pr.name)}</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#c9a87c;">${pr.price_cad.toFixed(2)}&nbsp;$ CAD</p>
        </a>
      </td>
    </tr></table>`;
  }).join("");

  return {
    subject: fillTemplate(tpl.subject, vars),
    html: emailLayout({
      eyebrow: "Ta sélection personnalisée",
      title: "Tes perruques idéales",
      content:
        bodyToHtml(fillTemplate(tpl.body, vars)) +
        (opts.summary ? p(`<em style="color:#9b8b7a;">Ton profil : ${escapeHtml(opts.summary)}</em>`) : "") +
        `<div style="border-top:2px solid #1a1a1a;padding-top:16px;margin-top:8px;">${cards}</div>` +
        `<div style="background:#fdf6f0;border:2px dashed #c9a87c;border-radius:4px;padding:16px 20px;margin:20px 0;text-align:center;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;color:#9b8b7a;text-transform:uppercase;letter-spacing:2px;">Ton code de bienvenue</p>
          <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#c9a87c;letter-spacing:4px;">${escapeHtml(opts.code)}</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9b8b7a;">-10% sur ta première commande · Valable 48h</p>
        </div>`,
      cta: { label: "Magasiner ma sélection →", url: `${SITE_URL}/boutique` },
      note: "Ce code expire dans 48h — c'est le moment de te faire plaisir.",
      footerReason: "Tu reçois cet email car tu as complété le quiz sur ddmwigs.com.",
      unsubUrl: opts.unsubUrl,
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

/** Bloc visuel de la carte cadeau (code encadré doré, montant). */
function giftCardBlock(code: string, amountCad: number): string {
  return `
    <div style="background:#fdf6f0;border:2px dashed #c9a87c;border-radius:4px;padding:24px 20px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;color:#9b8b7a;text-transform:uppercase;letter-spacing:2px;">Votre carte cadeau</p>
      <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:34px;font-weight:bold;color:#1a1a1a;">${amountCad.toFixed(2)}&nbsp;$ <span style="font-size:16px;color:#9b8b7a;font-weight:normal;">CAD</span></p>
      <p style="margin:0;font-family:'Courier New',monospace;font-size:20px;font-weight:bold;color:#c9a87c;letter-spacing:3px;">${escapeHtml(code)}</p>
    </div>`;
}

export function giftCardRecipientEmail(opts: {
  recipientName: string;
  buyerName: string;
  code: string;
  amountCad: number;
  message?: string;
}): { subject: string; html: string } {
  const messageBlock = opts.message
    ? `<p style="margin:0 0 14px;font-family:Georgia,serif;font-size:15px;color:#6b5e52;line-height:1.7;font-style:italic;border-left:3px solid #c9a87c;padding-left:16px;white-space:pre-wrap;">« ${escapeHtml(opts.message)} »</p>`
    : "";
  return {
    subject: `${opts.buyerName} vous offre une carte cadeau DDM Wigs 🎁`,
    html: emailLayout({
      eyebrow: "Un cadeau pour vous",
      title: "Vous avez reçu une carte cadeau !",
      content:
        p(`Bonjour ${escapeHtml(opts.recipientName || "")},`.replace(" ,", ",")) +
        p(`<strong>${escapeHtml(opts.buyerName)}</strong> vous offre une carte cadeau à dépenser sur toute la boutique DDM Wigs &amp; More — perruques, extensions, accessoires et plus encore.`) +
        messageBlock +
        giftCardBlock(opts.code, opts.amountCad),
      cta: { label: "Magasiner maintenant →", url: `${SITE_URL}/boutique` },
      note: "Entrez ce code au moment du paiement. Utilisable en plusieurs fois, sans date d'expiration.",
      footerReason: "Vous recevez cet email car une carte cadeau vous a été offerte sur ddmwigs.com.",
    }),
  };
}

export function giftCardBuyerEmail(opts: {
  buyerName: string;
  recipientName?: string;
  recipientEmail?: string;
  code: string;
  amountCad: number;
  sentToRecipient: boolean;
}): { subject: string; html: string } {
  const delivery = opts.sentToRecipient && opts.recipientEmail
    ? p(`La carte a été envoyée par courriel à <strong>${escapeHtml(opts.recipientName || opts.recipientEmail)}</strong> (${escapeHtml(opts.recipientEmail)}). En voici une copie pour vos dossiers :`)
    : p("Voici votre carte cadeau — transmettez ce code à la personne de votre choix :");
  return {
    subject: `Votre carte cadeau de ${opts.amountCad.toFixed(2)} $ est prête 🎁`,
    html: emailLayout({
      eyebrow: "Merci pour votre achat",
      title: "Carte cadeau confirmée",
      content:
        p(`Bonjour ${escapeHtml(opts.buyerName)},`) +
        p("Merci ! Votre paiement a bien été reçu.") +
        delivery +
        giftCardBlock(opts.code, opts.amountCad),
      note: "Le code est utilisable en boutique en ligne, en plusieurs fois, sans date d'expiration.",
      footerReason: "Vous recevez cet email suite à votre achat d'une carte cadeau sur ddmwigs.com.",
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

// ── Programme d'ambassadrices ─────────────────────────────────────────────────

export function ambassadorApplicationAdminEmail(opts: {
  name: string;
  email: string;
  social?: string;
  audience?: string;
  message?: string;
}): { subject: string; html: string } {
  return {
    subject: `Nouvelle candidature ambassadrice — ${opts.name}`,
    html: emailLayout({
      eyebrow: "Programme ambassadrices",
      title: escapeHtml(opts.name),
      content:
        p(`<strong>${escapeHtml(opts.name)}</strong> — ${escapeHtml(opts.email)}`) +
        (opts.social ? p(`<span style="color:#c9a87c;">Réseaux :</span> ${escapeHtml(opts.social)}`) : "") +
        (opts.audience ? p(`<span style="color:#c9a87c;">Audience :</span> ${escapeHtml(opts.audience)}`) : "") +
        (opts.message
          ? `<p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px;color:#6b5e52;line-height:1.7;white-space:pre-wrap;border-left:3px solid #c9a87c;padding-left:16px;">${escapeHtml(opts.message)}</p>`
          : ""),
      cta: { label: "Examiner la candidature →", url: `${SITE_URL}/admin/ambassadrices` },
      footerReason: "Notification interne — candidature reçue via le programme ambassadrices.",
    }),
  };
}

export function ambassadorApprovedEmail(opts: {
  name: string;
  code: string;
  discountPercent: number;
  commissionRate: number;
}): { subject: string; html: string } {
  const firstName = (opts.name || "").split(" ")[0];
  const link = `${SITE_URL}/r/${encodeURIComponent(opts.code)}`;
  return {
    subject: "Bienvenue dans le cercle des ambassadrices DDM Wigs 💛",
    html: emailLayout({
      eyebrow: "Félicitations",
      title: "Tu fais partie de la famille !",
      content:
        p(`Coucou ${escapeHtml(firstName)} 💛`) +
        p("Ta candidature est acceptée — bienvenue parmi les ambassadrices DDM Wigs &amp; More ! Voici ton code personnel :") +
        `<div style="background:#fdf6f0;border:2px dashed #c9a87c;border-radius:4px;padding:20px;margin:20px 0;text-align:center;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;color:#9b8b7a;text-transform:uppercase;letter-spacing:2px;">Ton code personnel</p>
          <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:28px;font-weight:bold;color:#c9a87c;letter-spacing:4px;">${escapeHtml(opts.code)}</p>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9b8b7a;">-${opts.discountPercent}% pour ta communauté · ${opts.commissionRate}% de commission pour toi</p>
        </div>` +
        p("Partage ton code ou ton lien personnel : chaque commande passée avec te fait gagner une commission.") +
        p(`<span style="color:#c9a87c;">Ton lien :</span> <a href="${link}" style="color:#c9a87c;word-break:break-all;">${link}</a>`),
      cta: { label: "Découvrir la boutique →", url: `${SITE_URL}/boutique` },
      note: "Une question sur le programme ? Réponds simplement à ce courriel.",
      footerReason: "Vous recevez cet email car vous avez rejoint le programme ambassadrices de ddmwigs.com.",
    }),
  };
}
