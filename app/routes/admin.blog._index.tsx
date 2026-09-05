import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { Link, useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import { requireAdmin, logAdminAction } from "~/lib/admin-session.server";
import { uniqueSlug } from "~/lib/blog.server";
import { categoryLabel, type BlogPost } from "~/lib/blog";
import { slugify } from "~/lib/markdown";

export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const status = new URL(request.url).searchParams.get("status") ?? "";

  let posts: BlogPost[] = [];
  let migrationManquante = false;
  try {
    let q = "SELECT * FROM blog_posts";
    const params: unknown[] = [];
    if (status) { q += " WHERE status = ?"; params.push(status); }
    q += " ORDER BY COALESCE(published_at, updated_at) DESC, id DESC";
    posts = ((await db.prepare(q).bind(...params).all<BlogPost>()).results ?? []);
  } catch {
    migrationManquante = true;
  }

  let ideesEnAttente = 0;
  try {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM blog_ideas WHERE status IN ('idee','planifiee')")
      .first<{ n: number }>();
    ideesEnAttente = row?.n ?? 0;
  } catch { /* migration absente */ }

  return json({ posts, status, migrationManquante, ideesEnAttente });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = Number(form.get("id"));
  if (!id) return json({ error: "Article introuvable." }, { status: 400 });

  if (intent === "publish" || intent === "unpublish") {
    const publier = intent === "publish";
    await db
      .prepare(
        `UPDATE blog_posts
         SET status = ?,
             published_at = CASE WHEN ? = 1 THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(publier ? "published" : "draft", publier ? 1 : 0, id)
      .run();
    await logAdminAction(context, {
      admin, action: publier ? "post.publish" : "post.unpublish",
      entity: "blog_post", entityId: id, request,
    });
    return json({ ok: true });
  }

  if (intent === "duplicate") {
    const src = await db.prepare("SELECT * FROM blog_posts WHERE id = ?").bind(id).first<BlogPost>();
    if (!src) return json({ error: "Article introuvable." }, { status: 404 });
    const slug = await uniqueSlug(db, slugify(`${src.title} copie`));
    const { meta } = await db
      .prepare(
        `INSERT INTO blog_posts (slug, title, excerpt, body, cover_image_key, cover_alt,
           category, tags, author, status, seo_title, seo_description, reading_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
      )
      .bind(slug, `${src.title} (copie)`, src.excerpt, src.body, src.cover_image_key, src.cover_alt,
        src.category, src.tags, src.author, src.seo_title, src.seo_description, src.reading_minutes)
      .run();
    await logAdminAction(context, {
      admin, action: "post.duplicate", entity: "blog_post", entityId: id, request,
    });
    return redirect(`/admin/blog/${meta.last_row_id}`);
  }

  if (intent === "delete") {
    const post = await db.prepare("SELECT title FROM blog_posts WHERE id = ?").bind(id).first<{ title: string }>();
    await db.prepare("DELETE FROM blog_post_products WHERE post_id = ?").bind(id).run();
    await db.prepare("DELETE FROM blog_posts WHERE id = ?").bind(id).run();
    await logAdminAction(context, {
      admin, action: "post.delete", entity: "blog_post", entityId: id,
      details: { title: post?.title }, request,
    });
    return json({ ok: true });
  }

  return json({ error: "Action inconnue." }, { status: 400 });
}

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "draft", label: "Brouillons" },
  { value: "scheduled", label: "Programmés" },
  { value: "published", label: "En ligne" },
] as const;

function StatusPill({ post }: { post: BlogPost }) {
  const programmeAVenir =
    post.status === "scheduled" && post.published_at && post.published_at > new Date().toISOString().slice(0, 19).replace("T", " ");
  const [texte, cls] = programmeAVenir
    ? ["Programmé", "bg-tertiary-container text-on-tertiary-container"]
    : post.status === "published" || post.status === "scheduled"
    ? ["En ligne", "bg-secondary-container text-on-secondary-container"]
    : ["Brouillon", "bg-surface-container-high text-on-surface-variant"];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${cls}`}>
      {texte}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("fr-CA", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function AdminBlogIndex() {
  const { posts, status, migrationManquante, ideesEnAttente } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string }>();
  const [, setParams] = useSearchParams();

  const pendingId = fetcher.state !== "idle" && fetcher.formData
    ? Number(fetcher.formData.get("id"))
    : null;

  const enLigne = posts.filter(p => p.status !== "draft").length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl text-on-surface mb-1">Le Journal</h1>
          <p className="font-sans text-sm text-on-surface-variant">
            {enLigne} en ligne · {posts.length - enLigne} brouillon(s)
            {ideesEnAttente > 0 && ` · ${ideesEnAttente} idée(s) en attente`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/blog/idees"
            className="flex items-center gap-2 px-4 py-2 text-sm border border-outline-variant text-on-surface-variant hover:text-primary rounded"
          >
            <span className="material-symbols-outlined text-base">lightbulb</span>
            Idées d'articles
          </Link>
          <Link
            to="/admin/blog/nouveau"
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 rounded"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Nouvel article
          </Link>
        </div>
      </div>

      {migrationManquante && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm">
          La table du blog n'existe pas encore. Appliquez la migration :{" "}
          <code className="font-mono">wrangler d1 execute ddm-wigs-db --remote --file=./migrations/44_blog.sql</code>
        </div>
      )}

      {fetcher.data?.error && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm">{fetcher.data.error}</div>
      )}

      <div className="flex items-center gap-1 mb-5">
        {STATUTS.map(s => (
          <button
            key={s.value}
            onClick={() => setParams(s.value ? { status: s.value } : {}, { preventScrollReset: true })}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              status === s.value
                ? "bg-primary text-on-primary font-semibold"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">article</span>
          <p className="font-sans text-base text-on-surface-variant mb-1">Aucun article pour l'instant</p>
          <p className="font-sans text-sm text-on-surface-variant/70">
            Partez d'une idée, ou laissez l'assistant vous proposer des sujets.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-outline-variant/30 overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-surface-container-low">
              <tr className="border-b border-outline-variant/30">
                {["Article", "Catégorie", "Statut", "Parution", "Lecture", "Vues", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {posts.map(post => (
                <tr
                  key={post.id}
                  className={`hover:bg-surface-container-low transition-colors ${
                    pendingId === post.id ? "opacity-40 pointer-events-none" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {post.cover_image_key ? (
                        <img src={post.cover_image_key} alt="" className="w-12 h-12 object-cover shrink-0" />
                      ) : (
                        <div className="w-12 h-12 bg-surface-container shrink-0 flex items-center justify-center">
                          <span className="material-symbols-outlined text-base text-outline-variant">image</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link to={`/admin/blog/${post.id}`} className="font-medium text-on-surface hover:text-primary block truncate">
                          {post.title}
                        </Link>
                        <span className="font-mono text-xs text-on-surface-variant/60">/blog/{post.slug}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                    {categoryLabel(post.category) ?? "—"}
                  </td>
                  <td className="px-4 py-3"><StatusPill post={post} /></td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{formatDate(post.published_at)}</td>
                  <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{post.reading_minutes} min</td>
                  <td className="px-4 py-3 text-on-surface-variant tabular-nums">{post.views}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {post.status !== "draft" && (
                        <a
                          href={`/blog/${post.slug}`} target="_blank" rel="noreferrer"
                          title="Voir en ligne"
                          className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">open_in_new</span>
                        </a>
                      )}
                      <fetcher.Form method="post" className="contents">
                        <input type="hidden" name="id" value={post.id} />
                        <button
                          type="submit" name="intent" value={post.status === "draft" ? "publish" : "unpublish"}
                          title={post.status === "draft" ? "Publier" : "Repasser en brouillon"}
                          className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">
                            {post.status === "draft" ? "publish" : "unpublished"}
                          </span>
                        </button>
                        <button
                          type="submit" name="intent" value="duplicate" title="Dupliquer"
                          className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">content_copy</span>
                        </button>
                      </fetcher.Form>
                      <fetcher.Form
                        method="post" className="contents"
                        onSubmit={e => { if (!confirm(`Supprimer « ${post.title} » ?`)) e.preventDefault(); }}
                      >
                        <input type="hidden" name="id" value={post.id} />
                        <button
                          type="submit" name="intent" value="delete" title="Supprimer"
                          className="p-2 text-on-surface-variant hover:text-error transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </fetcher.Form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
