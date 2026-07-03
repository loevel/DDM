import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { getAdminUser, logAdminAction } from "~/lib/admin-session.server";
import { isAdminAuthenticated } from "~/lib/admin-session.server";
import { newsletterEmail, sendEmail } from "~/lib/email.server";

export const meta: MetaFunction = () => [{ title: "Newsletter — Admin DDM" }];

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;

  // Compte des abonnés
  const [customerSubs, newsletterSubs] = await Promise.all([
    db.prepare("SELECT COUNT(*) as count FROM customers WHERE newsletter_optin = 1").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) as count FROM newsletter WHERE unsubscribed_at IS NULL").first<{ count: number }>(),
  ]);

  // Historique des envois (30 derniers)
  const { results: history } = await db.prepare(`
    SELECT * FROM admin_audit_log
    WHERE action = 'newsletter.send'
    ORDER BY created_at DESC LIMIT 30
  `).all<{ id: number; admin_email: string; details: string | null; created_at: string }>();

  return json({
    customerSubs: customerSubs?.count ?? 0,
    newsletterSubs: newsletterSubs?.count ?? 0,
    history: history ?? [],
  });
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const apiKey = (context.cloudflare.env as any).RESEND_API_KEY as string | undefined;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "send") {
    if (!apiKey) return json({ error: "RESEND_API_KEY non configuré." });

    const subject = String(form.get("subject") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    const ctaLabel = String(form.get("cta_label") ?? "").trim();
    const ctaUrl = String(form.get("cta_url") ?? "").trim();
    const audience = String(form.get("audience") ?? "all");

    if (!subject || !body) return json({ error: "Sujet et corps requis." });

    // Destinataires avec leur jeton de désabonnement (exigence LCAP/CASL)
    const recipients = new Map<string, string>(); // email → unsub_token

    if (audience === "all" || audience === "customers") {
      const { results } = await db
        .prepare("SELECT email, unsub_token FROM customers WHERE newsletter_optin = 1 AND email IS NOT NULL")
        .all<{ email: string; unsub_token: string | null }>();
      for (const r of results ?? []) {
        if (r.unsub_token) recipients.set(r.email.toLowerCase(), r.unsub_token);
      }
    }

    if (audience === "all" || audience === "newsletter") {
      const { results } = await db
        .prepare("SELECT email, unsub_token FROM newsletter WHERE email IS NOT NULL AND unsubscribed_at IS NULL")
        .all<{ email: string; unsub_token: string | null }>();
      for (const r of results ?? []) {
        if (r.unsub_token && !recipients.has(r.email.toLowerCase())) {
          recipients.set(r.email.toLowerCase(), r.unsub_token);
        }
      }
    }

    const list = [...recipients.entries()];
    if (list.length === 0) return json({ error: "Aucun destinataire trouvé." });

    let sent = 0;
    let errors = 0;

    // Envoi par lots de 10 pour respecter les limites Resend
    for (let i = 0; i < list.length; i += 10) {
      const batch = list.slice(i, i + 10);
      await Promise.all(batch.map(async ([email, token]) => {
        const unsubUrl = `https://ddmwigs.com/desabonnement?token=${token}`;
        const html = newsletterEmail({ subject, body, ctaLabel, ctaUrl, unsubUrl });
        const ok = await sendEmail({ apiKey, to: email, subject, html });
        if (ok) sent++; else errors++;
      }));
    }

    // Log dans l'audit
    const admin = await getAdminUser(request, context);
    await logAdminAction(context, {
      admin: admin,
      action: "newsletter.send",
      entity: "newsletter",
      details: { subject, audience, sent, errors, total: list.length },
      request,
    });

    return json({ success: true, sent, errors, total: list.length });
  }

  return json({ error: "Action inconnue." });
}

// ── UI ────────────────────────────────────────────────────────────────────────

export default function AdminNewsletter() {
  const { customerSubs, newsletterSubs, history } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const sending = nav.state === "submitting";
  const totalSubs = customerSubs + newsletterSubs;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-serif text-2xl text-on-surface mb-1">Newsletter</h1>
        <p className="text-sm text-on-surface-variant">
          Envoyez un email à vos abonnés directement depuis l'admin.
        </p>
      </div>

      {/* Stats abonnés */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Clients abonnés", value: customerSubs, icon: "person" },
          { label: "Abonnés boutique", value: newsletterSubs, icon: "mail" },
          { label: "Total destinataires", value: totalSubs, icon: "group", highlight: true },
        ].map(s => (
          <div key={s.label} className={`bg-surface border p-4 ${s.highlight ? "border-primary" : "border-outline-variant/30"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-on-surface-variant uppercase tracking-wider">{s.label}</span>
              <span className={`material-symbols-outlined text-base ${s.highlight ? "text-primary" : "text-on-surface-variant"}`}>{s.icon}</span>
            </div>
            <p className={`text-2xl font-bold ${s.highlight ? "text-primary" : "text-on-surface"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Feedback */}
      {actionData && "success" in actionData && actionData.success && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-secondary/10 border border-secondary/40">
          <span className="material-symbols-outlined text-secondary text-base shrink-0 mt-0.5">check_circle</span>
          <div>
            <p className="text-sm font-semibold text-secondary">Newsletter envoyée avec succès !</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {actionData.sent} envoi(s) réussi(s) · {actionData.errors} erreur(s) · {actionData.total} destinataires
            </p>
          </div>
        </div>
      )}
      {actionData && "error" in actionData && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-error/5 border border-error/30">
          <span className="material-symbols-outlined text-error text-base shrink-0">error</span>
          <p className="text-sm text-error">{actionData.error}</p>
        </div>
      )}

      {/* Formulaire composition */}
      <Form method="post" className="space-y-5">
        <input type="hidden" name="intent" value="send" />

        <div className="bg-surface border border-outline-variant/40">
          <div className="px-5 py-3 border-b border-outline-variant/40 bg-surface-container-low flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">edit_note</span>
            <p className="text-sm font-bold text-on-surface">Composer la newsletter</p>
          </div>
          <div className="p-5 space-y-4">

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                Audience
              </label>
              <select name="audience" className={inp}>
                <option value="all">Tous ({totalSubs} contacts)</option>
                <option value="customers">Clients abonnés seulement ({customerSubs})</option>
                <option value="newsletter">Abonnés boutique seulement ({newsletterSubs})</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                Sujet *
              </label>
              <input
                name="subject"
                required
                placeholder="Nouveauté DDM Wigs — Découvrez notre collection printemps"
                className={inp}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                Corps du message * <span className="text-on-surface-variant/60 font-normal normal-case">(une ligne = un paragraphe)</span>
              </label>
              <textarea
                name="body"
                required
                rows={8}
                placeholder={"Bonjour,\n\nNous sommes ravis de vous présenter notre nouvelle collection de perruques en cheveux humains 100%.\n\nDécouvrez des styles variés : bouclé, lisse, ondulé — tous disponibles dès maintenant en boutique."}
                className={`${inp} resize-y`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                  Bouton (texte)
                </label>
                <input
                  name="cta_label"
                  placeholder="Découvrir la collection"
                  className={inp}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
                  Bouton (URL)
                </label>
                <input
                  name="cta_url"
                  type="url"
                  placeholder="https://ddmwigs.com/boutique"
                  className={inp}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-on-surface-variant">
            Les emails sont envoyés depuis <span className="font-mono">noreply@ddmwigs.com</span> via Resend.
          </p>
          <button
            type="submit"
            disabled={sending}
            className="px-8 py-2.5 bg-primary text-on-primary text-sm font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? (
              <>
                <span className="w-4 h-4 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
                Envoi en cours…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">send</span>
                Envoyer la newsletter
              </>
            )}
          </button>
        </div>
      </Form>

      {/* Historique */}
      {history.length > 0 && (
        <div className="mt-10 bg-surface border border-outline-variant/40">
          <div className="px-5 py-3 border-b border-outline-variant/40 bg-surface-container-low flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">history</span>
            <p className="text-sm font-bold text-on-surface">Historique des envois</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="text-left px-5 py-2.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Date</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Sujet</th>
                <th className="text-right px-3 py-2.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Envoyés</th>
                <th className="text-right px-5 py-2.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Erreurs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {history.map(h => {
                let details: any = {};
                try { details = JSON.parse(h.details ?? "{}"); } catch { /* */ }
                return (
                  <tr key={h.id} className="hover:bg-surface-container-low">
                    <td className="px-5 py-3 text-xs text-on-surface-variant">{h.created_at.split("T")[0]}</td>
                    <td className="px-3 py-3 text-xs text-on-surface truncate max-w-[220px]">{details.subject ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-right font-semibold text-secondary">{details.sent ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-right text-error">{details.errors > 0 ? details.errors : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inp = "w-full px-3 py-2 h-10 border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors";
