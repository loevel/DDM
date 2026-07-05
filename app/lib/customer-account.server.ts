import type { AppLoadContext } from "@remix-run/cloudflare";
import { emailLayout, p, sendEmail, escapeHtml } from "~/lib/email.server";

// ── Changement d'email vérifié ───────────────────────────────────────────────
// L'email est l'identifiant de connexion (magic link) : le changement ne
// s'applique qu'après clic sur un lien envoyé à la NOUVELLE adresse, sinon une
// faute de frappe verrouillerait le client hors de son compte.

const EMAIL_CHANGE_TTL = 60 * 60 * 24; // 24 heures

type EmailChangePayload = { customerId: string; oldEmail: string; newEmail: string };

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Retourne "taken" si l'email appartient à un autre compte, sinon "sent". */
export async function requestEmailChange(
  customer: { id: string; email: string },
  newEmail: string,
  context: AppLoadContext,
  request: Request
): Promise<"taken" | "sent"> {
  const db = context.cloudflare.env.DB;

  const existing = await db
    .prepare("SELECT id FROM customers WHERE email = ? AND id != ?")
    .bind(newEmail, customer.id)
    .first();
  if (existing) return "taken";

  const token =
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "");
  const payload: EmailChangePayload = {
    customerId: customer.id,
    oldEmail: customer.email,
    newEmail,
  };
  await context.cloudflare.env.CACHE.put(`email_change:${token}`, JSON.stringify(payload), {
    expirationTtl: EMAIL_CHANGE_TTL,
  });

  const origin = new URL(request.url).origin;
  const confirmUrl = `${origin}/compte/changement-email?token=${token}`;

  const apiKey = context.cloudflare.env.RESEND_API_KEY as string | undefined;
  if (!apiKey) {
    console.log(`[DEV] Confirmation changement email pour ${newEmail} → ${confirmUrl}`);
    return "sent";
  }

  const html = emailLayout({
    eyebrow: "Votre compte",
    title: "Confirmez votre nouvelle adresse",
    content:
      p(`Vous avez demandé à remplacer l'adresse email de votre compte DDM Wigs (<strong>${escapeHtml(customer.email)}</strong>) par celle-ci.`) +
      p("Cliquez sur le bouton ci-dessous pour confirmer. Le changement ne sera appliqué qu'après cette confirmation."),
    cta: { label: "Confirmer mon email", url: confirmUrl },
    note: "Ce lien est valide 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce courriel.",
    footerReason: "Vous recevez ce courriel car un changement d'adresse a été demandé pour un compte DDM Wigs.",
  });
  const ok = await sendEmail({ apiKey, to: newEmail, subject: "Confirmez votre nouvelle adresse email — DDM Wigs", html });
  if (!ok) throw new Error("Impossible d'envoyer l'email de confirmation.");
  return "sent";
}

/** Applique le changement si le token est valide. Retourne le résultat, ou null. */
export async function confirmEmailChange(
  token: string,
  context: AppLoadContext
): Promise<{ oldEmail: string; newEmail: string } | null> {
  const cache = context.cloudflare.env.CACHE;
  const raw = await cache.get(`email_change:${token}`);
  if (!raw) return null;
  await cache.delete(`email_change:${token}`); // usage unique

  let payload: EmailChangePayload;
  try {
    payload = JSON.parse(raw) as EmailChangePayload;
  } catch {
    return null;
  }

  const db = context.cloudflare.env.DB;

  // Re-vérifie l'unicité : l'adresse a pu être prise entre la demande et le clic
  const taken = await db
    .prepare("SELECT id FROM customers WHERE email = ? AND id != ?")
    .bind(payload.newEmail, payload.customerId)
    .first();
  if (taken) return null;

  const updated = await db
    .prepare("UPDATE customers SET email = ?, updated_at = datetime('now') WHERE id = ? AND email = ?")
    .bind(payload.newEmail, payload.customerId, payload.oldEmail)
    .run();
  if (!updated.meta.changes) return null;

  // Suit l'abonné dans la liste newsletter (sans écraser un abonnement existant)
  const alreadySubscribed = await db
    .prepare("SELECT id FROM newsletter WHERE email = ?")
    .bind(payload.newEmail)
    .first();
  if (alreadySubscribed) {
    await db.prepare("DELETE FROM newsletter WHERE email = ?").bind(payload.oldEmail).run();
  } else {
    await db.prepare("UPDATE newsletter SET email = ? WHERE email = ?").bind(payload.newEmail, payload.oldEmail).run();
  }

  // Avertit l'ancienne adresse (détection de détournement de compte)
  const apiKey = context.cloudflare.env.RESEND_API_KEY as string | undefined;
  if (apiKey) {
    const html = emailLayout({
      eyebrow: "Votre compte",
      title: "Votre adresse email a été modifiée",
      content:
        p(`L'adresse email de votre compte DDM Wigs vient d'être remplacée par <strong>${escapeHtml(payload.newEmail)}</strong>.`) +
        p("Si vous êtes à l'origine de ce changement, vous n'avez rien à faire. Sinon, contactez-nous immédiatement pour sécuriser votre compte."),
      footerReason: "Vous recevez ce courriel car l'adresse de votre compte DDM Wigs a été modifiée.",
    });
    await sendEmail({ apiKey, to: payload.oldEmail, subject: "Votre adresse email a été modifiée — DDM Wigs", html });
  }

  return { oldEmail: payload.oldEmail, newEmail: payload.newEmail };
}

// ── Suppression de compte (Loi 25 / PIPEDA) ──────────────────────────────────
// Anonymisation plutôt que purge totale : les commandes sont conservées
// (obligations fiscales ARC / Revenu Québec ~6 ans) mais détachées de toute
// donnée identifiante. Tout le reste du profil est supprimé.

export async function deleteCustomerAccount(
  customerId: string,
  context: AppLoadContext
): Promise<void> {
  const db = context.cloudflare.env.DB;

  const customer = await db
    .prepare("SELECT email FROM customers WHERE id = ?")
    .bind(customerId)
    .first<{ email: string }>();
  if (!customer) return;
  const email = customer.email;

  await db.batch([
    // Commandes conservées (montants, taxes, statuts — obligations fiscales)
    // mais anonymisées : nom, email, téléphone et adresse de livraison effacés
    db.prepare(`UPDATE orders SET
      customer_name = 'Compte supprimé', customer_email = 'supprime@anonyme.invalid',
      customer_phone = NULL, shipping_address = NULL
      WHERE customer_email = ? OR customer_id = ?`).bind(email, customerId),
    db.prepare("UPDATE orders SET customer_id = NULL WHERE customer_id = ?").bind(customerId),
    // Données personnelles supprimées
    db.prepare("DELETE FROM customer_addresses WHERE customer_id = ?").bind(customerId),
    db.prepare("DELETE FROM wishlists WHERE customer_id = ?").bind(customerId),
    db.prepare("DELETE FROM magic_tokens WHERE email = ?").bind(email),
    db.prepare("DELETE FROM newsletter WHERE email = ?").bind(email),
    // Historiques conservés mais anonymisés
    db.prepare("UPDATE abandoned_carts SET email = NULL, customer_name = NULL WHERE email = ?").bind(email),
    db.prepare("UPDATE reviews SET customer_email = NULL WHERE customer_email = ?").bind(email),
    db.prepare("UPDATE contact_messages SET nom = 'Compte supprimé', email = 'supprime@anonyme.invalid', tel = NULL WHERE email = ?").bind(email),
    db.prepare("UPDATE referrals SET referrer_email = 'compte-supprime' WHERE referrer_email = ?").bind(email),
    db.prepare("UPDATE referrals SET referred_email = 'compte-supprime' WHERE referred_email = ?").bind(email),
    // Le profil lui-même (préférences, quiz, date de naissance…)
    db.prepare("DELETE FROM customers WHERE id = ?").bind(customerId),
  ]);

  // Confirmation à l'adresse supprimée — dernière communication
  const apiKey = context.cloudflare.env.RESEND_API_KEY as string | undefined;
  if (apiKey) {
    const html = emailLayout({
      eyebrow: "Votre compte",
      title: "Votre compte a été supprimé",
      content:
        p("Votre compte DDM Wigs et vos données personnelles (profil, adresses, préférences, favoris) ont été supprimés, conformément à votre demande.") +
        p("Les registres de commandes sont conservés de façon anonymisée pour la durée exigée par les lois fiscales canadiennes.") +
        p("Merci d'avoir fait partie de la famille DDM. Vous serez toujours la bienvenue."),
      footerReason: "Dernier courriel envoyé à cette adresse : votre compte DDM Wigs a été supprimé.",
    });
    await sendEmail({ apiKey, to: email, subject: "Confirmation de suppression de votre compte — DDM Wigs", html });
  }
}
