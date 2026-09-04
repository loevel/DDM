import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { Link, useLoaderData, useFetcher } from "@remix-run/react";
import { useState } from "react";
import { requireAdmin, logAdminAction } from "~/lib/admin-session.server";
import type { BlogIdea, BlogPost } from "~/lib/blog";
import { aiIdeas, AiUnavailable } from "~/lib/ai.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;

  let idees: BlogIdea[] = [];
  let migrationManquante = false;
  try {
    idees = ((await db
      .prepare("SELECT * FROM blog_ideas ORDER BY planned_date IS NULL, planned_date ASC, id DESC")
      .all<BlogIdea>()).results ?? []);
  } catch { migrationManquante = true; }

  // Les articles déjà programmés apparaissent dans le calendrier à côté des idées,
  // sinon on planifie à l'aveugle sans voir ce qui part déjà cette semaine-là.
  let programmes: Pick<BlogPost, "id" | "title" | "published_at" | "status">[] = [];
  try {
    programmes = ((await db
      .prepare(`SELECT id, title, published_at, status FROM blog_posts
                WHERE published_at IS NOT NULL AND status IN ('scheduled','published')
                ORDER BY published_at DESC LIMIT 60`)
      .all<Pick<BlogPost, "id" | "title" | "published_at" | "status">>()).results ?? []);
  } catch { /* migration absente */ }

  return json({ idees, programmes, migrationManquante });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request, context);
  const env = context.cloudflare.env;
  const db = env.DB;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const g = (k: string) => String(form.get(k) ?? "").trim();

  if (intent === "suggest") {
    const safe = async <T,>(sql: string): Promise<T[]> => {
      try { return ((await db.prepare(sql).all<T>()).results ?? []) as T[]; } catch { return []; }
    };
    const produits = await safe<{ name: string }>("SELECT name FROM products WHERE stock > 0 ORDER BY featured DESC LIMIT 30");
    const questions = await safe<{ question: string }>("SELECT question FROM product_questions ORDER BY id DESC LIMIT 20");
    const existantes = await safe<{ title: string }>("SELECT title FROM blog_ideas LIMIT 50");
    const traites = await safe<{ title: string }>("SELECT title FROM blog_posts LIMIT 50");

    let propositions;
    try {
      propositions = await aiIdeas(env.AI, {
        produits: produits.map(p => p.name),
        questions: questions.map(q => q.question),
        dejaTraites: [...traites.map(t => t.title), ...existantes.map(e => e.title)],
      });
    } catch (e) {
      if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
      throw e;
    }

    const stmt = db.prepare(
      "INSERT INTO blog_ideas (title, angle, keywords, source, status) VALUES (?, ?, ?, 'ia', 'idee')"
    );
    await db.batch(propositions.map(p => stmt.bind(p.title, p.angle, p.keywords)));
    await logAdminAction(context, {
      admin, action: "blog_ideas.suggest", entity: "blog_ideas",
      details: { n: propositions.length }, request,
    });
    return json({ ok: true, ajoutees: propositions.length });
  }

  if (intent === "create") {
    if (!g("title")) return json({ error: "Le titre est requis." }, { status: 400 });
    await db
      .prepare("INSERT INTO blog_ideas (title, angle, keywords, planned_date, source, status) VALUES (?, ?, ?, ?, 'manuelle', ?)")
      .bind(g("title"), g("angle") || null, g("keywords") || null, g("planned_date") || null,
        g("planned_date") ? "planifiee" : "idee")
      .run();
    return json({ ok: true });
  }

  const id = Number(form.get("id"));
  if (!id) return json({ error: "Idée introuvable." }, { status: 400 });

  if (intent === "plan") {
    const date = g("planned_date");
    await db
      .prepare("UPDATE blog_ideas SET planned_date = ?, status = ? WHERE id = ?")
      .bind(date || null, date ? "planifiee" : "idee", id)
      .run();
    return json({ ok: true });
  }

  if (intent === "abandon") {
    await db.prepare("UPDATE blog_ideas SET status = 'abandonnee' WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  if (intent === "restore") {
    await db.prepare("UPDATE blog_ideas SET status = 'idee' WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  if (intent === "delete") {
    await db.prepare("DELETE FROM blog_ideas WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  return json({ error: "Action inconnue." }, { status: 400 });
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function Calendrier({
  idees, programmes,
}: {
  idees: BlogIdea[];
  programmes: { id: number; title: string; published_at: string | null; status: string }[];
}) {
  const [offset, setOffset] = useState(0);
  const base = new Date();
  const vue = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const annee = vue.getFullYear();
  const mois = vue.getMonth();

  const premierJour = new Date(annee, mois, 1);
  // La grille commence un lundi : getDay() renvoie 0 pour dimanche.
  const decalage = (premierJour.getDay() + 6) % 7;
  const nbJours = new Date(annee, mois + 1, 0).getDate();

  const cle = (d: string | null) => (d ?? "").slice(0, 10);
  const parJour = new Map<string, { label: string; type: "idee" | "article"; id: number }[]>();
  for (const i of idees) {
    if (!i.planned_date || i.status === "abandonnee" || i.status === "ecrite") continue;
    const k = cle(i.planned_date);
    parJour.set(k, [...(parJour.get(k) ?? []), { label: i.title, type: "idee", id: i.id }]);
  }
  for (const p of programmes) {
    const k = cle(p.published_at);
    parJour.set(k, [...(parJour.get(k) ?? []), { label: p.title, type: "article", id: p.id }]);
  }

  const cases = [
    ...Array.from({ length: decalage }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => i + 1),
  ];
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-surface border border-outline-variant rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">
          {MOIS[mois]} {annee}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(o => o - 1)} className="p-1.5 text-on-surface-variant hover:text-primary rounded" title="Mois précédent">
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <button onClick={() => setOffset(0)} className="px-2 py-1 text-xs text-on-surface-variant hover:text-primary rounded">
            Aujourd'hui
          </button>
          <button onClick={() => setOffset(o => o + 1)} className="p-1.5 text-on-surface-variant hover:text-primary rounded" title="Mois suivant">
            <span className="material-symbols-outlined text-base">chevron_right</span>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["L", "M", "M", "J", "V", "S", "D"].map((j, i) => (
          <div key={i} className="text-center text-[10px] font-bold uppercase text-on-surface-variant/50 pb-1">{j}</div>
        ))}
        {cases.map((jour, i) => {
          if (jour === null) return <div key={`v${i}`} />;
          const k = `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
          const items = parJour.get(k) ?? [];
          return (
            <div
              key={k}
              className={`min-h-[4.5rem] border rounded p-1 ${
                k === aujourdhui ? "border-primary bg-primary/5" : "border-outline-variant/30"
              }`}
            >
              <span className={`text-[10px] tabular-nums ${k === aujourdhui ? "text-primary font-bold" : "text-on-surface-variant/60"}`}>
                {jour}
              </span>
              {items.map((it, n) => (
                <div
                  key={n}
                  title={it.label}
                  className={`mt-0.5 text-[10px] leading-tight px-1 py-0.5 rounded truncate ${
                    it.type === "article"
                      ? "bg-secondary-container text-on-secondary-container"
                      : "bg-tertiary-container text-on-tertiary-container"
                  }`}
                >
                  {it.label}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-tertiary-container inline-block" /> Idée planifiée
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-secondary-container inline-block" /> Article programmé
        </span>
      </div>
    </div>
  );
}

export default function IdeesBlog() {
  const { idees, programmes, migrationManquante } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string; ajoutees?: number }>();
  const [showForm, setShowForm] = useState(false);

  const enCours = fetcher.state !== "idle";
  const suggestion = enCours && fetcher.formData?.get("intent") === "suggest";

  const actives = idees.filter(i => i.status === "idee" || i.status === "planifiee");
  const ecrites = idees.filter(i => i.status === "ecrite");
  const abandonnees = idees.filter(i => i.status === "abandonnee");

  return (
    <div className="p-8">
      <Link to="/admin/blog" className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary mb-6">
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Le Journal
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl text-on-surface mb-1">Idées &amp; calendrier</h1>
          <p className="font-sans text-sm text-on-surface-variant">
            {actives.length} idée(s) en attente · {ecrites.length} déjà écrite(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-outline-variant text-on-surface-variant hover:text-primary rounded"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Ajouter une idée
          </button>
          <fetcher.Form method="post">
            <button
              type="submit" name="intent" value="suggest" disabled={enCours}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 rounded"
            >
              <span className="material-symbols-outlined text-base">auto_awesome</span>
              {suggestion ? "Recherche…" : "Suggérer des sujets"}
            </button>
          </fetcher.Form>
        </div>
      </div>

      {migrationManquante && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm">
          La table des idées n'existe pas encore. Appliquez la migration{" "}
          <code className="font-mono">migrations/44_blog.sql</code>.
        </div>
      )}
      {fetcher.data?.error && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm">{fetcher.data.error}</div>
      )}
      {fetcher.data?.ajoutees ? (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-secondary/10 border border-secondary/40 text-secondary font-sans text-sm">
          <span className="material-symbols-outlined text-base">check_circle</span>
          {fetcher.data.ajoutees} sujet(s) ajouté(s) — à vous de garder ceux qui vous parlent.
        </div>
      ) : null}

      {showForm && (
        <fetcher.Form method="post" className="bg-surface-container-low border border-outline-variant rounded-lg p-5 mb-6 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="intent" value="create" />
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
              Titre <span className="text-error">*</span>
            </label>
            <input name="title" required className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Angle</label>
            <input name="angle" className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Mots-clés</label>
            <input name="keywords" className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Date visée</label>
            <input type="date" name="planned_date" className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary" />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button type="submit" className="bg-primary text-on-primary px-5 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 rounded">
              Ajouter
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 text-sm border border-outline-variant text-on-surface-variant hover:text-primary rounded">
              Annuler
            </button>
          </div>
        </fetcher.Form>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_26rem] gap-6 items-start">
        <div className="space-y-2">
          {actives.length === 0 && !migrationManquante && (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-outline-variant rounded-lg">
              <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">lightbulb</span>
              <p className="font-sans text-base text-on-surface-variant mb-1">Aucune idée en attente</p>
              <p className="font-sans text-sm text-on-surface-variant/70">
                L'assistant peut en proposer à partir de votre catalogue et des questions de vos clientes.
              </p>
            </div>
          )}

          {actives.map(idee => (
            <div key={idee.id} className="bg-surface border border-outline-variant rounded-lg px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-on-surface">{idee.title}</span>
                    {idee.source === "ia" && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-surface-container-high text-on-surface-variant">
                        Assistant
                      </span>
                    )}
                  </div>
                  {idee.angle && <p className="text-sm text-on-surface-variant mt-0.5">{idee.angle}</p>}
                  {idee.keywords && (
                    <p className="text-xs text-on-surface-variant/60 mt-1 font-mono">{idee.keywords}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <fetcher.Form method="post" className="flex items-center gap-1">
                    <input type="hidden" name="intent" value="plan" />
                    <input type="hidden" name="id" value={idee.id} />
                    <input
                      type="date" name="planned_date" defaultValue={idee.planned_date?.slice(0, 10) ?? ""}
                      onChange={e => e.currentTarget.form?.requestSubmit()}
                      className="border border-outline-variant rounded px-2 py-1 text-xs bg-surface focus:outline-none focus:border-primary"
                    />
                  </fetcher.Form>
                  <Link
                    to={`/admin/blog/nouveau?idee=${idee.id}`}
                    title="Écrire cet article"
                    className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">edit_note</span>
                  </Link>
                  <fetcher.Form method="post">
                    <input type="hidden" name="id" value={idee.id} />
                    <button
                      type="submit" name="intent" value="abandon" title="Écarter"
                      className="p-2 text-on-surface-variant hover:text-error transition-colors"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </fetcher.Form>
                </div>
              </div>
            </div>
          ))}

          {abandonnees.length > 0 && (
            <details className="mt-6">
              <summary className="text-xs font-bold uppercase tracking-wider text-on-surface-variant cursor-pointer py-2">
                Écartées ({abandonnees.length})
              </summary>
              <div className="space-y-1 mt-2">
                {abandonnees.map(idee => (
                  <div key={idee.id} className="flex items-center gap-2 px-3 py-2 text-sm text-on-surface-variant/60 border border-outline-variant/40 rounded">
                    <span className="flex-1 line-through">{idee.title}</span>
                    <fetcher.Form method="post">
                      <input type="hidden" name="id" value={idee.id} />
                      <button type="submit" name="intent" value="restore" title="Remettre en attente" className="p-1 hover:text-primary">
                        <span className="material-symbols-outlined text-base">undo</span>
                      </button>
                    </fetcher.Form>
                    <fetcher.Form method="post" onSubmit={e => { if (!confirm("Supprimer définitivement ?")) e.preventDefault(); }}>
                      <input type="hidden" name="id" value={idee.id} />
                      <button type="submit" name="intent" value="delete" title="Supprimer" className="p-1 hover:text-error">
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </fetcher.Form>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        <Calendrier idees={idees} programmes={programmes} />
      </div>
    </div>
  );
}
