import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Paramètres — Admin DDM" }];

const FIELDS = [
  "whatsapp_number",
  "instagram_url",
  "tiktok_url",
  "facebook_url",
  "contact_email",
  "site_slogan",
  "footer_note",
] as const;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const { results } = await db
    .prepare("SELECT key, value FROM site_settings")
    .all<{ key: string; value: string }>();

  const settings: Record<string, string> = {};
  for (const row of results ?? []) settings[row.key] = row.value;

  return json({ settings });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const form = await request.formData();

  for (const key of FIELDS) {
    const value = ((form.get(key) as string) ?? "").trim();
    await db
      .prepare(
        "INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
      )
      .bind(key, value)
      .run();
  }

  return json({ ok: true });
}

// ── Champ réutilisable ────────────────────────────────────────────────────────
function Field({
  name,
  label,
  value,
  type = "text",
  placeholder,
  hint,
  textarea,
}: {
  name: string;
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  textarea?: boolean;
}) {
  return (
    <div>
      <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
        {label}
      </label>
      {textarea ? (
        <textarea
          name={name}
          defaultValue={value}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors resize-y"
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          placeholder={placeholder}
          className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors"
        />
      )}
      {hint && <p className="font-sans text-[11px] text-on-surface-variant mt-1.5">{hint}</p>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-outline-variant/40">
      <div className="px-5 py-3 border-b border-outline-variant/40 bg-surface-container-low flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-primary">{icon}</span>
        <p className="font-sans text-sm font-bold text-on-surface">{title}</p>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

export default function AdminParametres() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const saving = navigation.state !== "idle";

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="font-serif text-2xl text-on-surface mb-1">Paramètres du site</h1>
        <p className="font-sans text-sm text-on-surface-variant">
          Coordonnées, réseaux sociaux et contenu affichés sur la boutique.
        </p>
      </div>

      {actionData?.ok && (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-secondary/10 border border-secondary/40 text-secondary font-sans text-sm">
          <span className="material-symbols-outlined text-base">check_circle</span>
          Paramètres sauvegardés avec succès.
        </div>
      )}

      <Form method="post" className="space-y-6">
        <Section title="Contact" icon="contact_support">
          <Field
            name="whatsapp_number"
            label="Numéro WhatsApp"
            value={settings.whatsapp_number ?? ""}
            placeholder="+1XXXXXXXXXX"
            hint="Format international, ex : +15145551234"
          />
          <Field
            name="contact_email"
            label="Email de contact"
            type="email"
            value={settings.contact_email ?? ""}
            placeholder="contact@ddmwigs.ca"
          />
        </Section>

        <Section title="Réseaux sociaux" icon="share">
          <Field
            name="instagram_url"
            label="Instagram"
            type="url"
            value={settings.instagram_url ?? ""}
            placeholder="https://instagram.com/..."
          />
          <Field
            name="tiktok_url"
            label="TikTok"
            type="url"
            value={settings.tiktok_url ?? ""}
            placeholder="https://tiktok.com/@..."
          />
          <Field
            name="facebook_url"
            label="Facebook"
            type="url"
            value={settings.facebook_url ?? ""}
            placeholder="https://facebook.com/..."
          />
        </Section>

        <Section title="Contenu" icon="edit_note">
          <div className="sm:col-span-2">
            <Field
              name="site_slogan"
              label="Slogan du site"
              value={settings.site_slogan ?? ""}
              placeholder="Perruques en cheveux humains 100% — Montréal"
            />
          </div>
          <div className="sm:col-span-2">
            <Field
              name="footer_note"
              label="Note footer"
              value={settings.footer_note ?? ""}
              placeholder="Texte affiché en bas de page"
              textarea
            />
          </div>
        </Section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-2.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Sauvegarder les paramètres"}
          </button>
        </div>
      </Form>
    </div>
  );
}
