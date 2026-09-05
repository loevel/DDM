import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { Link, useLoaderData, useNavigation, Form, useActionData } from "@remix-run/react";
import { useState } from "react";
import { requireAdmin, logAdminAction } from "~/lib/admin-session.server";
import { uniqueSlug } from "~/lib/blog.server";
import { CATEGORIES, type BlogIdea } from "~/lib/blog";
import { slugify, readingMinutes } from "~/lib/markdown";
import { aiDraft, AiUnavailable } from "~/lib/ai.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  // Arrivée depuis « Écrire cet article » sur la page des idées : on pré-remplit
  // le formulaire plutôt que de faire retaper le sujet.
  const ideeId = Number(new URL(request.url).searchParams.get("idee"));
  let depart: BlogIdea | null = null;
  if (ideeId) {
    try {
      depart = await db.prepare("SELECT * FROM blog_ideas WHERE id = ?").bind(ideeId).first<BlogIdea>();
    } catch { /* migration absente */ }
  }

  let idees: BlogIdea[] = [];
  try {
    idees = ((await db
      .prepare("SELECT * FROM blog_ideas WHERE status IN ('idee','planifiee') ORDER BY planned_date IS NULL, planned_date ASC, id DESC LIMIT 8")
      .all<BlogIdea>()).results ?? []).filter(i => i.id !== ideeId);
  } catch { /* migration absente */ }
  return json({ idees, depart });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request, context);
  const env = context.cloudflare.env;
  const db = env.DB;
  const form = await request.formData();
  const g = (k: string) => String(form.get(k) ?? "").trim();

  const titre = g("title");
  if (!titre) return json({ error: "Donnez un titre ou un sujet à votre article." }, { status: 400 });

  // « Rédiger avec l'assistant » : on génère le corps AVANT de créer la ligne,
  // pour ne pas laisser de brouillon vide derrière si le modèle échoue.
  let body = "";
  if (g("mode") === "ia") {
    try {
      body = await aiDraft(env.AI, titre, g("angle") || undefined);
    } catch (e) {
      if (e instanceof AiUnavailable) {
        return json({ error: `${e.message} Vous pouvez tout de même écrire l'article vous-même.` }, { status: 503 });
      }
      throw e;
    }
  }

  const slug = await uniqueSlug(db, slugify(titre));
  const { meta } = await db
    .prepare(
      `INSERT INTO blog_posts (slug, title, body, category, author, status, reading_minutes)
       VALUES (?, ?, ?, ?, ?, 'draft', ?)`
    )
    .bind(slug, titre, body, g("category") || null, admin.email, readingMinutes(body))
    .run();

  const ideaId = Number(g("idea_id"));
  if (ideaId) {
    await db
      .prepare("UPDATE blog_ideas SET status = 'ecrite', post_id = ? WHERE id = ?")
      .bind(meta.last_row_id, ideaId).run();
  }

  await logAdminAction(context, {
    admin, action: "post.create", entity: "blog_post", entityId: meta.last_row_id,
    details: { title: titre, ia: g("mode") === "ia" }, request,
  });

  return redirect(`/admin/blog/${meta.last_row_id}`);
}

export default function NouvelArticle() {
  const { idees, depart } = useLoaderData<typeof loader>();
  const data = useActionData<{ error?: string }>();
  const nav = useNavigation();
  const [titre, setTitre] = useState(depart?.title ?? "");
  const [angle, setAngle] = useState(depart?.angle ?? "");

  const mode = nav.formData?.get("mode");
  const enCours = nav.state === "submitting";

  return (
    <div className="p-8 max-w-3xl">
      <Link
        to="/admin/blog"
        className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary mb-6"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Le Journal
      </Link>

      <h1 className="font-serif text-3xl text-on-surface mb-2">De quoi parle votre article&nbsp;?</h1>
      <p className="font-sans text-sm text-on-surface-variant mb-8">
        Écrivez simplement le sujet, en une phrase. Vous pourrez tout modifier ensuite.
      </p>

      {data?.error && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm">{data.error}</div>
      )}

      <Form method="post" className="space-y-5">
        {depart && <input type="hidden" name="idea_id" value={depart.id} />}
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
            Sujet ou titre <span className="text-error">*</span>
          </label>
          <input
            name="title" value={titre} onChange={e => setTitre(e.target.value)} autoFocus
            placeholder="Comment garder une perruque bouclée bien définie tout l'hiver"
            className="w-full border border-outline-variant rounded px-4 py-3 text-lg bg-surface focus:outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
            Angle <span className="font-normal normal-case tracking-normal text-on-surface-variant/60">— facultatif</span>
          </label>
          <textarea
            name="angle" rows={2} value={angle} onChange={e => setAngle(e.target.value)}
            placeholder="Ce que vous voulez que la lectrice retienne, ou l'erreur que vous voulez corriger."
            className="w-full border border-outline-variant rounded px-4 py-3 text-sm bg-surface focus:outline-none focus:border-primary resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
            Catégorie
          </label>
          <select
            name="category"
            className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary"
          >
            <option value="">— Aucune —</option>
            {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="submit" name="mode" value="ia" disabled={!titre.trim() || enCours}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-primary px-5 py-3.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-40 rounded"
          >
            <span className="material-symbols-outlined text-lg">auto_awesome</span>
            {enCours && mode === "ia" ? "Rédaction en cours…" : "Rédiger un brouillon pour moi"}
          </button>
          <button
            type="submit" name="mode" value="vide" disabled={!titre.trim() || enCours}
            className="flex-1 px-5 py-3.5 text-sm border border-outline-variant text-on-surface-variant hover:text-primary disabled:opacity-40 rounded"
          >
            {enCours && mode === "vide" ? "Création…" : "J'écris moi-même"}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant/70">
          Le brouillon généré est un point de départ&nbsp;: relisez-le et corrigez-le avant publication.
          Rien n'est mis en ligne tant que vous ne l'avez pas décidé.
        </p>
      </Form>

      {idees.length > 0 && (
        <div className="mt-12 pt-8 border-t border-outline-variant/40">
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-4">
            Ou partez d'une idée en attente
          </h2>
          <div className="space-y-2">
            {idees.map(idee => (
              <Form method="post" key={idee.id}>
                <input type="hidden" name="title" value={idee.title} />
                <input type="hidden" name="angle" value={idee.angle ?? ""} />
                <input type="hidden" name="idea_id" value={idee.id} />
                <button
                  type="submit" name="mode" value="ia" disabled={enCours}
                  className="w-full text-left bg-surface border border-outline-variant rounded-lg px-4 py-3 hover:border-primary transition-colors group disabled:opacity-40"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-on-surface group-hover:text-primary flex-1">{idee.title}</span>
                    <span className="material-symbols-outlined text-base text-on-surface-variant">auto_awesome</span>
                  </span>
                  {idee.angle && <span className="block text-sm text-on-surface-variant mt-0.5">{idee.angle}</span>}
                </button>
              </Form>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
