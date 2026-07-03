import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { requireAdmin, logAdminAction } from "~/lib/admin-session.server";
import { DEFAULT_TEMPLATES } from "~/lib/email.server";

export const meta: MetaFunction = () => [{ title: "Courriels — Admin DDM" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  let overrides: Record<string, { subject: string; body: string }> = {};
  try {
    const { results } = await db.prepare("SELECT key, subject, body FROM email_templates").all<{
      key: string; subject: string; body: string;
    }>();
    overrides = Object.fromEntries((results ?? []).map(r => [r.key, { subject: r.subject, body: r.body }]));
  } catch { /* table absente : tout en défauts */ }

  const templates = Object.entries(DEFAULT_TEMPLATES).map(([key, def]) => ({
    key,
    label: def.label,
    variables: def.variables,
    subject: overrides[key]?.subject ?? def.subject,
    body: overrides[key]?.body ?? def.body,
    customized: key in overrides,
  }));

  return json({ templates });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const key = String(form.get("key") ?? "");

  if (!(key in DEFAULT_TEMPLATES)) return json({ error: "Template inconnu.", key });

  if (intent === "save") {
    const subject = String(form.get("subject") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (!subject || !body) return json({ error: "Le sujet et le corps sont requis.", key });

    await db.prepare(`
      INSERT INTO email_templates (key, subject, body, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET subject = excluded.subject, body = excluded.body, updated_at = datetime('now')
    `).bind(key, subject, body).run();

    await logAdminAction(context, { admin, action: "email_template_save", entity: "email_templates", entityId: key, details: subject, request });
    return json({ ok: true, key });
  }

  if (intent === "reset") {
    await db.prepare("DELETE FROM email_templates WHERE key = ?").bind(key).run();
    await logAdminAction(context, { admin, action: "email_template_reset", entity: "email_templates", entityId: key, request });
    return json({ ok: true, key });
  }

  return json({ error: "Action inconnue.", key });
}

export default function AdminCourriels() {
  const { templates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-on-surface mb-2">Courriels automatiques</h1>
      <p className="text-sm text-on-surface-variant mb-8 leading-relaxed">
        Personnalisez le sujet et le texte des courriels marketing. La mise en page
        (logo, couleurs, bouton, pied de page avec désabonnement) est fixe et ne peut
        pas être cassée. Les courriels transactionnels (connexion, commandes) ne sont
        pas éditables. Chaque ligne du texte devient un paragraphe.
      </p>

      <div className="space-y-6">
        {templates.map((t: any) => {
          const submitting = nav.state === "submitting" && nav.formData?.get("key") === t.key;
          const saved = actionData && "ok" in actionData && actionData.key === t.key;
          const error = actionData && "error" in actionData && actionData.key === t.key ? actionData.error : null;

          return (
            <div key={t.key} className="bg-surface border border-outline-variant/30 p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-semibold text-on-surface">{t.label}</h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Variables disponibles : {t.variables.map((v: string) => (
                      <code key={v} className="bg-surface-container px-1.5 py-0.5 mx-0.5 rounded-sm">{v}</code>
                    ))}
                  </p>
                </div>
                {t.customized && (
                  <span className="shrink-0 text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5">
                    Personnalisé
                  </span>
                )}
              </div>

              {error && <p className="text-xs text-error bg-error-container/40 p-2 mb-3 rounded-sm">{error}</p>}
              {saved && <p className="text-xs text-green-700 bg-green-50 border border-green-200 p-2 mb-3 rounded-sm">Enregistré.</p>}

              <Form method="post" className="space-y-3">
                <input type="hidden" name="key" value={t.key} />
                <div>
                  <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1">Sujet</label>
                  <input
                    type="text" name="subject" defaultValue={t.subject} required
                    className="w-full text-sm border border-outline-variant/40 bg-transparent p-2.5 focus:outline-none focus:border-primary rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1">Texte</label>
                  <textarea
                    name="body" rows={3} defaultValue={t.body} required
                    className="w-full text-sm border border-outline-variant/40 bg-transparent p-2.5 focus:outline-none focus:border-primary rounded-sm resize-y leading-relaxed"
                  />
                </div>
                <div className="flex items-center justify-end gap-3">
                  {t.customized && (
                    <button
                      type="submit" name="intent" value="reset" disabled={submitting}
                      className="text-xs text-on-surface-variant hover:text-error underline underline-offset-2 disabled:opacity-50"
                    >
                      Rétablir le texte d'origine
                    </button>
                  )}
                  <button
                    type="submit" name="intent" value="save" disabled={submitting}
                    className="flex items-center gap-1.5 bg-primary text-on-primary text-xs font-semibold uppercase tracking-wider px-4 py-2 hover:bg-on-primary-container transition-colors disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-sm">save</span>
                    {submitting ? "Enregistrement…" : "Enregistrer"}
                  </button>
                </div>
              </Form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
