import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Form, Link, useActionData, useFetcher, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { ProduitFormFields } from "./admin.produits.nouveau";

export const meta: MetaFunction = () => [{ title: "Modifier produit — Admin DDM" }];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const product = await db
    .prepare("SELECT * FROM products WHERE id = ?")
    .bind(params.id).first();
  if (!product) throw new Response("Produit introuvable", { status: 404 });

  const { results: allCollections } = await db
    .prepare("SELECT id, name FROM collections WHERE active = 1 ORDER BY position ASC, id ASC")
    .all();

  const { results: productCollections } = await db
    .prepare("SELECT collection_id FROM product_collections WHERE product_id = ?")
    .bind(params.id).all();

  const assignedIds = new Set((productCollections as any[]).map((r: any) => r.collection_id));

  return json({ product, allCollections: allCollections ?? [], assignedIds: [...assignedIds] });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const n = (k: string) => { const v = g(k); return v ? Number(v) : null; };
  const b = (k: string) => f.get(k) === "1" ? 1 : 0;
  const db = context.cloudflare.env.DB;

  const intent = g("intent") || "update_product";

  if (intent === "update_collections") {
    const selected = f.getAll("collection_ids").map(Number);
    await db.prepare("DELETE FROM product_collections WHERE product_id = ?").bind(params.id).run();
    for (const cid of selected) {
      await db.prepare("INSERT OR IGNORE INTO product_collections (product_id, collection_id) VALUES (?, ?)")
        .bind(params.id, cid).run();
    }
    return json({ ok: true });
  }

  if (!g("name") || !g("price_cad") || !g("famille")) {
    return { error: "Nom, prix et famille sont requis." };
  }

  await db.prepare(`
    UPDATE products SET
      name=?, description=?, price_cad=?, compare_at_price_cad=?,
      category=?, famille=?,
      type_lace=?, texture=?, longueur_po=?, densite=?, couleur=?,
      hd_lace=?, glueless=?, pret_a_porter=?, quantite_meches=?,
      stock=?, image_key=?, featured=?,
      updated_at=datetime('now')
    WHERE id=?
  `).bind(
    g("name"), g("description") || null, Number(g("price_cad")), n("compare_at_price_cad"),
    g("famille") === "perruque" ? "perruque" :
    g("famille") === "accessoire" || g("famille") === "soin" ? g("famille") : "perruque",
    g("famille"),
    g("type_lace") || null, g("texture") || null,
    n("longueur_po"), n("densite"),
    g("couleur") || null,
    b("hd_lace"), b("glueless"), b("pret_a_porter"),
    n("quantite_meches"),
    Number(g("stock") || 0), g("image_key") || null,
    b("featured"), params.id
  ).run();

  throw redirect("/admin/produits");
}

function CollectionsPanel({
  allCollections,
  assignedIds,
}: {
  allCollections: { id: number; name: string }[];
  assignedIds: number[];
}) {
  const fetcher = useFetcher<{ ok?: boolean }>();
  const [selected, setSelected] = useState<Set<number>>(new Set(assignedIds));

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saved = fetcher.data?.ok && fetcher.state === "idle";

  return (
    <div className="border border-outline-variant rounded-lg p-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-3">Collections</h2>
      {allCollections.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Aucune collection active. <a href="/admin/collections" className="underline text-primary">Créer une collection</a></p>
      ) : (
        <fetcher.Form method="post" className="space-y-3">
          <input type="hidden" name="intent" value="update_collections" />
          <div className="grid grid-cols-2 gap-2">
            {allCollections.map((col: any) => (
              <label key={col.id} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  name="collection_ids"
                  value={col.id}
                  checked={selected.has(col.id)}
                  onChange={() => toggle(col.id)}
                  className="accent-primary w-4 h-4"
                />
                <span className="text-sm text-on-surface group-hover:text-primary transition-colors">{col.name}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={fetcher.state === "submitting"}
              className="text-xs bg-primary text-on-primary px-4 py-1.5 rounded font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
              {fetcher.state === "submitting" ? "Enregistrement…" : "Sauvegarder"}
            </button>
            {saved && <span className="text-xs text-secondary-container font-semibold flex items-center gap-1"><span className="material-symbols-outlined text-sm">check_circle</span> Sauvegardé</span>}
          </div>
        </fetcher.Form>
      )}
    </div>
  );
}

export default function EditProduit() {
  const { product, allCollections, assignedIds } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/produits" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">Modifier : {(product as any).name}</h1>
      </div>

      {data?.error && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container rounded text-sm">{data.error}</div>
      )}

      <Form method="post" className="space-y-6">
        <input type="hidden" name="intent" value="update_product" />
        <ProduitFormFields defaults={product as any} />
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={nav.state === "submitting"}
            className="bg-primary text-on-primary px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
            {nav.state === "submitting" ? "Enregistrement…" : "Enregistrer"}
          </button>
          <Link to="/admin/produits" className="px-6 py-2.5 text-sm border border-outline-variant text-on-surface-variant hover:text-primary transition-colors">
            Annuler
          </Link>
        </div>
      </Form>

      <div className="mt-8">
        <CollectionsPanel
          allCollections={allCollections as any}
          assignedIds={assignedIds as number[]}
        />
      </div>
    </div>
  );
}
