import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_key: string | null;
  active: number;
  position: number;
  product_count?: number;
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = (context.cloudflare.env as any).DB;
  const { results } = await db.prepare(`
    SELECT c.*, COUNT(pc.product_id) as product_count
    FROM collections c
    LEFT JOIN product_collections pc ON pc.collection_id = c.id
    GROUP BY c.id
    ORDER BY c.position ASC, c.id ASC
  `).all<Collection>();

  return json({ collections: results ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = (context.cloudflare.env as any).DB;
  const form = await request.formData();
  const intent = form.get("intent") as string;
  const g = (k: string) => (form.get(k) as string)?.trim() || null;

  if (intent === "create") {
    const name = g("name");
    if (!name) return json({ error: "Le nom est requis." }, { status: 400 });
    const slug = g("slug") || slugify(name!);
    const description = g("description");
    const image_key = g("image_key");
    const { results: ex } = await db.prepare("SELECT MAX(position) as m FROM collections").all();
    const nextPos = ((ex?.[0] as any)?.m ?? -1) + 1;
    try {
      await db.prepare(
        "INSERT INTO collections (name, slug, description, image_key, active, position) VALUES (?, ?, ?, ?, 1, ?)"
      ).bind(name, slug, description, image_key, nextPos).run();
    } catch {
      return json({ error: "Ce slug existe déjà. Choisissez-en un autre." }, { status: 400 });
    }
    return json({ ok: true });
  }

  if (intent === "update") {
    const id = form.get("id");
    const name = g("name");
    if (!name) return json({ error: "Le nom est requis." }, { status: 400 });
    const slug = g("slug") || slugify(name!);
    try {
      await db.prepare(
        "UPDATE collections SET name=?, slug=?, description=?, image_key=?, updated_at=datetime('now') WHERE id=?"
      ).bind(name, slug, g("description"), g("image_key"), id).run();
    } catch {
      return json({ error: "Ce slug existe déjà." }, { status: 400 });
    }
    return json({ ok: true });
  }

  if (intent === "toggle") {
    const id = form.get("id");
    await db.prepare("UPDATE collections SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=?").bind(id).run();
    return json({ ok: true });
  }

  if (intent === "move_up" || intent === "move_down") {
    const id = Number(form.get("id"));
    const dir = intent === "move_up" ? -1 : 1;
    const { results: all } = await db.prepare("SELECT id, position FROM collections ORDER BY position ASC, id ASC").all();
    const idx = (all as any[]).findIndex((r: any) => r.id === id);
    const swapIdx = idx + dir;
    if (swapIdx >= 0 && swapIdx < (all as any[]).length) {
      const a = (all as any[])[idx];
      const b = (all as any[])[swapIdx];
      await db.prepare("UPDATE collections SET position=? WHERE id=?").bind(b.position, a.id).run();
      await db.prepare("UPDATE collections SET position=? WHERE id=?").bind(a.position, b.id).run();
    }
    return json({ ok: true });
  }

  if (intent === "delete") {
    const id = form.get("id");
    await db.prepare("DELETE FROM collections WHERE id=?").bind(id).run();
    return json({ ok: true });
  }

  return json({ error: "Action inconnue." }, { status: 400 });
}

function CollectionForm({
  initial,
  onCancel,
  error,
}: {
  initial?: Partial<Collection>;
  onCancel?: () => void;
  error?: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const isEdit = !!initial?.id;

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const err = fetcher.data?.error ?? error;

  return (
    <fetcher.Form method="post" className="space-y-4">
      <input type="hidden" name="intent" value={isEdit ? "update" : "create"} />
      {isEdit && <input type="hidden" name="id" value={initial.id} />}

      {err && <p className="text-sm text-error bg-error-container/30 px-3 py-2 rounded">{err}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            Nom <span className="text-error">*</span>
          </label>
          <input
            name="name"
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            required
            className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary"
            placeholder="Collection Hiver 2026"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            Slug (URL)
          </label>
          <input
            name="slug"
            value={slug}
            onChange={e => { setSlug(e.target.value); setSlugTouched(true); }}
            className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary font-mono"
            placeholder="hiver-2026"
          />
          <p className="text-[11px] text-on-surface-variant mt-1">/collections/{slug || "…"}</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
          Description
        </label>
        <textarea
          name="description"
          defaultValue={initial?.description ?? ""}
          rows={2}
          className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary resize-none"
          placeholder="Description courte affichée sur la page collection…"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
          Clé image bannière
        </label>
        <input
          name="image_key"
          defaultValue={initial?.image_key ?? ""}
          className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary font-mono"
          placeholder="collections/hiver-2026-banner.jpg"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={fetcher.state === "submitting"}
          className="bg-primary text-on-primary px-5 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60 rounded"
        >
          {fetcher.state === "submitting" ? "Enregistrement…" : isEdit ? "Mettre à jour" : "Créer la collection"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-5 py-2 text-sm border border-outline-variant text-on-surface-variant hover:text-primary rounded">
            Annuler
          </button>
        )}
      </div>
    </fetcher.Form>
  );
}

export default function AdminCollections() {
  const { collections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Collections</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Groupes de produits par thème ou saison</p>
        </div>
        {!showCreate && (
          <button
            onClick={() => { setShowCreate(true); setEditId(null); }}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 rounded"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Nouvelle collection
          </button>
        )}
      </div>

      {/* Formulaire de création */}
      {showCreate && (
        <div className="bg-surface-container-low border border-outline-variant rounded-lg p-5 mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-4">Nouvelle collection</h2>
          <CollectionForm onCancel={() => setShowCreate(false)} />
        </div>
      )}

      {/* Liste */}
      {collections.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl mb-3 block">collections_bookmark</span>
          <p>Aucune collection pour l'instant.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {collections.map((col, idx) => (
            <div key={col.id} className="bg-surface border border-outline-variant rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Ordre */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="move_up" />
                    <input type="hidden" name="id" value={col.id} />
                    <button type="submit" disabled={idx === 0}
                      className="p-0.5 text-on-surface-variant hover:text-primary disabled:opacity-20 transition-colors">
                      <span className="material-symbols-outlined text-sm leading-none">expand_less</span>
                    </button>
                  </fetcher.Form>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="move_down" />
                    <input type="hidden" name="id" value={col.id} />
                    <button type="submit" disabled={idx === collections.length - 1}
                      className="p-0.5 text-on-surface-variant hover:text-primary disabled:opacity-20 transition-colors">
                      <span className="material-symbols-outlined text-sm leading-none">expand_more</span>
                    </button>
                  </fetcher.Form>
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-on-surface text-sm">{col.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${col.active ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-high text-on-surface-variant"}`}>
                      {col.active ? "Active" : "Inactive"}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">
                      {col.product_count ?? 0} produit{(col.product_count ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant font-mono mt-0.5">/collections/{col.slug}</p>
                  {col.description && (
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">{col.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditId(editId === col.id ? null : col.id)}
                    className="p-2 text-on-surface-variant hover:text-primary transition-colors"
                    title="Modifier"
                  >
                    <span className="material-symbols-outlined text-base">edit</span>
                  </button>

                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={col.id} />
                    <button type="submit" title={col.active ? "Désactiver" : "Activer"}
                      className="p-2 text-on-surface-variant hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-base">
                        {col.active ? "visibility" : "visibility_off"}
                      </span>
                    </button>
                  </fetcher.Form>

                  <fetcher.Form method="post" onSubmit={e => {
                    if (!confirm(`Supprimer "${col.name}" ?`)) e.preventDefault();
                  }}>
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={col.id} />
                    <button type="submit" title="Supprimer"
                      className="p-2 text-on-surface-variant hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </fetcher.Form>
                </div>
              </div>

              {/* Formulaire d'édition inline */}
              {editId === col.id && (
                <div className="border-t border-outline-variant bg-surface-container-low px-4 py-4">
                  <CollectionForm
                    initial={col}
                    onCancel={() => setEditId(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
