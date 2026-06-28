import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData } from "@remix-run/react";
import { getDB } from "~/lib/db.server";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

interface ReviewRow {
  id: number;
  product_id: number;
  product_name: string;
  product_slug: string;
  customer_name: string;
  rating: number;
  body: string | null;
  approved: number;
  created_at: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = getDB(context as any);
  const url = new URL(request.url);
  const filter = url.searchParams.get("filtre") ?? "en-attente";

  const approvedFilter = filter === "approuves" ? 1 : filter === "en-attente" ? 0 : null;

  const whereClause = approvedFilter !== null
    ? `WHERE r.approved = ${approvedFilter}`
    : "";

  const rows = (await db.prepare(`
    SELECT r.id, r.product_id, p.name AS product_name, p.slug AS product_slug,
           r.customer_name, r.rating, r.body, r.approved, r.created_at
    FROM reviews r
    JOIN products p ON p.id = r.product_id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT 100
  `).all<ReviewRow>()).results ?? [];

  const counts = (await db.prepare(`
    SELECT approved, COUNT(*) as n FROM reviews GROUP BY approved
  `).all<{ approved: number; n: number }>()).results ?? [];

  const pending = counts.find(c => c.approved === 0)?.n ?? 0;
  const approved = counts.find(c => c.approved === 1)?.n ?? 0;

  return json({ reviews: rows, filter, counts: { pending, approved, total: pending + approved } });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = getDB(context as any);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reviewId = Number(formData.get("reviewId"));

  if (!reviewId) return json({ error: "ID manquant" }, { status: 400 });

  if (intent === "approve") {
    await db.prepare("UPDATE reviews SET approved = 1 WHERE id = ?").bind(reviewId).run();
  } else if (intent === "reject") {
    await db.prepare("DELETE FROM reviews WHERE id = ?").bind(reviewId).run();
  }

  return json({ ok: true });
}

const STAR_COLORS = ["", "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e"];

export default function AdminAvis() {
  const { reviews, filter, counts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const optimisticIds = new Set(
    fetcher.state !== "idle" && fetcher.formData
      ? [Number(fetcher.formData.get("reviewId"))]
      : []
  );

  const visibleReviews = reviews.filter(r => !optimisticIds.has(r.id));

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl text-on-surface mb-1">Avis clients</h1>
          <p className="font-sans text-sm text-on-surface-variant">
            {counts.pending} en attente · {counts.approved} approuvés
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "en-attente", label: `En attente (${counts.pending})` },
          { key: "approuves",  label: `Approuvés (${counts.approved})` },
          { key: "tous",       label: `Tous (${counts.total})` },
        ].map(({ key, label }) => (
          <Link key={key} to={`?filtre=${key}`}
            className={`px-4 py-2 font-sans text-sm font-semibold border transition-colors ${
              filter === key
                ? "bg-primary text-on-primary border-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
            }`}>
            {label}
          </Link>
        ))}
      </div>

      {/* Liste */}
      {visibleReviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">rate_review</span>
          <p className="font-sans text-base text-on-surface-variant">
            {filter === "en-attente" ? "Aucun avis en attente de modération" : "Aucun avis trouvé"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleReviews.map(r => (
            <div key={r.id}
              className={`bg-surface border rounded-sm p-5 flex gap-5 transition-opacity ${
                optimisticIds.has(r.id) ? "opacity-40 pointer-events-none" : "border-outline-variant/40"
              }`}>

              {/* Rating */}
              <div className="shrink-0 flex flex-col items-center gap-1 w-12">
                <p className="font-serif text-3xl font-bold" style={{ color: STAR_COLORS[r.rating] }}>
                  {r.rating}
                </p>
                <div className="flex flex-col gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <div key={s} className="w-2 h-2 rounded-full"
                      style={{ background: s <= r.rating ? STAR_COLORS[r.rating] : "#e2e8f0" }} />
                  ))}
                </div>
              </div>

              {/* Contenu */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 mb-1 flex-wrap">
                  <p className="font-sans text-sm font-bold text-on-surface">{r.customer_name}</p>
                  <Link to={`/boutique/${r.product_slug}`} target="_blank"
                    className="font-sans text-xs text-primary hover:underline flex items-center gap-0.5">
                    {r.product_name}
                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                  </Link>
                  <span className="font-sans text-xs text-on-surface-variant ml-auto">
                    {new Date(r.created_at).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                </div>
                {r.body ? (
                  <p className="font-sans text-sm text-on-surface-variant leading-relaxed">{r.body}</p>
                ) : (
                  <p className="font-sans text-xs text-on-surface-variant/50 italic">Aucun commentaire</p>
                )}

                {r.approved === 1 && (
                  <span className="inline-flex items-center gap-1 mt-2 font-sans text-xs text-secondary font-semibold">
                    <span className="material-symbols-outlined text-xs">check_circle</span>
                    Publié
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 shrink-0">
                {r.approved === 0 && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="reviewId" value={r.id} />
                    <input type="hidden" name="intent" value="approve" />
                    <button type="submit"
                      className="flex items-center gap-1.5 px-3 py-2 bg-primary text-on-primary font-sans text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity whitespace-nowrap">
                      <span className="material-symbols-outlined text-sm">check</span>
                      Approuver
                    </button>
                  </fetcher.Form>
                )}
                <fetcher.Form method="post">
                  <input type="hidden" name="reviewId" value={r.id} />
                  <input type="hidden" name="intent" value="reject" />
                  <button type="submit"
                    className="flex items-center gap-1.5 px-3 py-2 border border-error/40 text-error font-sans text-xs font-bold uppercase tracking-wider hover:bg-error/10 transition-colors whitespace-nowrap">
                    <span className="material-symbols-outlined text-sm">delete</span>
                    Supprimer
                  </button>
                </fetcher.Form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
