import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useFetcher } from "@remix-run/react";
import { getDB } from "~/lib/db.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { isAmbassadorProgramEnabled } from "~/lib/settings.server";
import { ambassadorApplicationAdminEmail, sendEmail } from "~/lib/email.server";

export const meta: MetaFunction = () => [
  { title: "Programme Ambassadrices — DDM Wigs & More" },
  { name: "description", content: "Rejoins le cercle des ambassadrices DDM Wigs : ton code perso, une remise pour ta communauté et une commission sur chaque vente." },
];

export async function loader({ context }: LoaderFunctionArgs) {
  // Fonctionnalité désactivable dans /admin/parametres : page masquée si off.
  if (!(await isAmbassadorProgramEnabled(getDB(context)))) {
    throw new Response("Not Found", { status: 404 });
  }
  return json({});
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!(await isAmbassadorProgramEnabled(getDB(context)))) {
    throw new Response("Not Found", { status: 404 });
  }
  const allowed = await checkRateLimit(context, request, { name: "ambassador-apply", max: 3, windowSeconds: 3600 });
  if (!allowed) return json({ error: "Trop de tentatives. Réessaie plus tard." }, { status: 429 });

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const social = String(form.get("social") ?? "").trim().slice(0, 200) || null;
  const audience = String(form.get("audience") ?? "").trim().slice(0, 200) || null;
  const message = String(form.get("message") ?? "").trim().slice(0, 1000) || null;

  if (!name || !email.includes("@") || email.length < 5) {
    return json({ error: "Merci d'indiquer ton nom et une adresse courriel valide." }, { status: 400 });
  }

  const db = getDB(context);

  try {
    await db
      .prepare("INSERT INTO ambassadors (name, email, social_handle, audience, message) VALUES (?,?,?,?,?)")
      .bind(name, email, social, audience, message)
      .run();
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE")) {
      return json({ ok: true, already: true });
    }
    console.error("[Ambassadrices] Candidature échouée:", e);
    return json({ error: "Une erreur est survenue. Réessaie." }, { status: 500 });
  }

  // Notifier l'administration
  try {
    const apiKey = context.cloudflare.env.RESEND_API_KEY as string | undefined;
    if (apiKey) {
      let to = "contact@ddmwigs.ca";
      try {
        const row = await db.prepare("SELECT value FROM site_settings WHERE key = 'contact_email'").first<{ value: string }>();
        if (row?.value) to = row.value;
      } catch { /* défaut */ }
      const { subject, html } = ambassadorApplicationAdminEmail({
        name, email,
        social: social ?? undefined,
        audience: audience ?? undefined,
        message: message ?? undefined,
      });
      await sendEmail({ apiKey, to, subject, html });
    }
  } catch (e) {
    console.error("[Ambassadrices] Notif admin échouée:", e);
  }

  return json({ ok: true });
}

const BENEFITS = [
  { icon: "sell", title: "Un code rien qu'à toi", desc: "Ta communauté profite d'une remise exclusive avec ton code personnel." },
  { icon: "payments", title: "Une commission sur chaque vente", desc: "Tu gagnes un pourcentage sur chaque commande passée avec ton code." },
  { icon: "diamond", title: "Des produits premium", desc: "Représente des perruques cheveux humains 100%, éthiques et haut de gamme." },
];

export default function Ambassadrices() {
  const fetcher = useFetcher<{ ok?: boolean; already?: boolean; error?: string }>();
  const submitted = fetcher.data?.ok;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="px-6 md:px-10 lg:px-20 py-16 md:py-24 text-center">
        <span className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 uppercase tracking-widest mb-5">
          <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>volunteer_activism</span>
          Programme ambassadrices
        </span>
        <h1 className="font-serif text-3xl md:text-5xl text-on-surface mb-5 max-w-3xl mx-auto leading-tight">
          Deviens ambassadrice <span className="text-primary italic">DDM Wigs</span>
        </h1>
        <p className="font-sans text-base text-on-surface-variant max-w-xl mx-auto leading-relaxed">
          Tu aimes nos perruques et tu as une communauté qui te fait confiance ? Partage ce que tu portes, fais rayonner d'autres femmes, et sois récompensée pour chaque vente.
        </p>
      </section>

      {/* Avantages */}
      <section className="px-6 md:px-10 lg:px-20 pb-16">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {BENEFITS.map(b => (
            <div key={b.title} className="border border-outline-variant/60 bg-surface p-6 text-center">
              <span className="material-symbols-outlined text-3xl text-primary mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }}>{b.icon}</span>
              <h3 className="font-serif text-lg text-on-surface mb-2">{b.title}</h3>
              <p className="font-sans text-sm text-on-surface-variant leading-snug">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Formulaire */}
      <section className="px-6 pb-24">
        <div className="max-w-lg mx-auto">
          {submitted ? (
            <div className="border-2 border-primary bg-primary/5 p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-primary mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <h2 className="font-serif text-2xl text-on-surface mb-2">Candidature reçue 💛</h2>
              <p className="font-sans text-sm text-on-surface-variant">
                {fetcher.data?.already
                  ? "Tu as déjà une candidature en cours — on revient vers toi très vite !"
                  : "Merci ! Notre équipe étudie ta candidature et te répond par courriel sous quelques jours."}
              </p>
            </div>
          ) : (
            <div className="border border-outline-variant/60 bg-surface p-6 sm:p-8">
              <h2 className="font-serif text-2xl text-on-surface mb-1 text-center">Pose ta candidature</h2>
              <p className="font-sans text-sm text-on-surface-variant text-center mb-6">Ça prend deux minutes.</p>
              <fetcher.Form method="post" className="space-y-4">
                <input name="name" required placeholder="Ton nom complet *" className={inp} />
                <input name="email" type="email" required placeholder="Ton adresse courriel *" className={inp} />
                <input name="social" placeholder="Tes réseaux (@instagram, TikTok…)" className={inp} />
                <input name="audience" placeholder="Taille de ta communauté (ex. 5 000 abonnés)" className={inp} />
                <textarea name="message" rows={4} placeholder="Parle-nous un peu de toi et de ta communauté" className={`${inp} resize-none`} />
                {fetcher.data?.error && (
                  <p className="text-xs text-red-600 text-center">{fetcher.data.error}</p>
                )}
                <button
                  type="submit"
                  disabled={fetcher.state !== "idle"}
                  className="w-full bg-primary text-on-primary text-sm font-semibold py-3.5 uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {fetcher.state !== "idle" ? "Envoi…" : "Envoyer ma candidature"}
                </button>
              </fetcher.Form>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const inp = "w-full border border-outline-variant bg-background px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:outline-none transition-colors";
