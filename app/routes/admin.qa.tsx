import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

interface QARow {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  customer_name: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const filter = url.searchParams.get("filtre") ?? "sans-reponse";

  const whereClause = filter === "sans-reponse"
    ? "WHERE pq.answered_at IS NULL"
    : filter === "repondues"
    ? "WHERE pq.answered_at IS NOT NULL"
    : "";

  const { results } = await db.prepare(`
    SELECT pq.*, p.name as product_name, p.slug as product_slug
    FROM product_questions pq
    JOIN products p ON p.id = pq.product_id
    ${whereClause}
    ORDER BY pq.created_at DESC
    LIMIT 100
  `).all<QARow>();

  return json({ questions: results ?? [], filter });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const f = await request.formData();
  const intent = String(f.get("intent") ?? "");

  if (intent === "answer") {
    const id = f.get("id");
    const answer = String(f.get("answer") ?? "").trim();
    if (!answer) return json({ error: "La réponse ne peut pas être vide." }, { status: 400 });
    await db.prepare(
      "UPDATE product_questions SET answer = ?, answered_at = datetime('now') WHERE id = ?"
    ).bind(answer, id).run();
    return json({ ok: true });
  }

  if (intent === "delete") {
    await db.prepare("DELETE FROM product_questions WHERE id = ?").bind(f.get("id")).run();
    return json({ ok: true });
  }

  return json({ error: "Action inconnue" }, { status: 400 });
}

export default function AdminQA() {
  const { questions, filter } = useLoaderData<typeof loader>();
  const [openId, setOpenId] = useState<number | null>(null);

  const tabs = [
    { key: "sans-reponse", label: "Sans réponse" },
    { key: "repondues", label: "Répondues" },
    { key: "toutes", label: "Toutes" },
  ];

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">help</span>
            Questions & Réponses
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Questions posées par les clientes sur les fiches produit</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-1 mb-6 border-b border-outline-variant">
        {tabs.map(t => (
          <Link key={t.key} to={`?filtre=${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              filter === t.key
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-primary"
            }`}>
            {t.label}
          </Link>
        ))}
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl mb-3 block text-primary/40">help_outline</span>
          <p>Aucune question dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map(q => (
            <QuestionRow key={q.id} q={q} isOpen={openId === q.id} onToggle={() => setOpenId(openId === q.id ? null : q.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionRow({ q, isOpen, onToggle }: { q: QARow; isOpen: boolean; onToggle: () => void }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [answerText, setAnswerText] = useState(q.answer ?? "");
  const saved = fetcher.data?.ok && fetcher.state === "idle";

  return (
    <div className={`bg-surface border rounded-lg overflow-hidden ${q.answered_at ? "border-outline-variant/30" : "border-primary/30"}`}>
      <button onClick={onToggle} className="w-full flex items-start gap-4 px-4 py-3 text-left hover:bg-surface-container-low transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-bold text-primary uppercase tracking-wider">
              {q.product_name}
            </span>
            {!q.answered_at && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase">À répondre</span>
            )}
          </div>
          <p className="text-sm font-semibold text-on-surface">Q : {q.question}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-on-surface-variant">{q.customer_name}</span>
            <span className="text-xs text-on-surface-variant">{new Date(q.created_at).toLocaleDateString("fr-CA")}</span>
          </div>
        </div>
        <span className={`material-symbols-outlined text-on-surface-variant text-xl shrink-0 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 border-t border-outline-variant/20 pt-3 space-y-3">
          {/* Réponse existante */}
          {q.answer && (
            <div className="bg-secondary/5 border border-secondary/20 rounded p-3">
              <p className="text-xs font-bold text-secondary uppercase tracking-wider mb-1">Réponse publiée</p>
              <p className="text-sm text-on-surface">{q.answer}</p>
            </div>
          )}

          {/* Formulaire de réponse */}
          <fetcher.Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="answer" />
            <input type="hidden" name="id" value={q.id} />
            <textarea
              name="answer"
              value={answerText}
              onChange={e => setAnswerText(e.target.value)}
              rows={3}
              placeholder="Écrire une réponse…"
              className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={fetcher.state === "submitting" || !answerText.trim()}
                className="px-4 py-1.5 bg-primary text-on-primary text-xs font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-50">
                {fetcher.state === "submitting" ? "Enregistrement…" : q.answer ? "Mettre à jour" : "Publier la réponse"}
              </button>
              {saved && (
                <span className="text-xs text-secondary font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check_circle</span> Publié
                </span>
              )}
              <fetcher.Form method="post" className="ml-auto">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={q.id} />
                <button type="submit" className="text-xs text-on-surface-variant hover:text-error transition-colors flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">delete</span>
                  Supprimer
                </button>
              </fetcher.Form>
            </div>
            {fetcher.data?.error && <p className="text-xs text-error">{fetcher.data.error}</p>}
          </fetcher.Form>
        </div>
      )}
    </div>
  );
}
