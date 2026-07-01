import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Form, Link, useActionData, useFetcher, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { ProduitFormFields, VariantsEditor } from "./admin.produits.nouveau";
import type { MediaItem, VariantRow } from "./admin.produits.nouveau";

export const meta: MetaFunction = () => [{ title: "Modifier produit — Admin DDM" }];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;

  const [product, allCollections, productCollections, media, variantsResult, fournisseursResult] = await Promise.all([
    db.prepare("SELECT * FROM products WHERE id = ?").bind(params.id).first(),
    db.prepare("SELECT id, name FROM collections WHERE active = 1 ORDER BY position ASC, id ASC").all(),
    db.prepare("SELECT collection_id FROM product_collections WHERE product_id = ?").bind(params.id).all(),
    db.prepare("SELECT type, url, thumbnail_url, alt_text FROM product_media WHERE product_id = ? ORDER BY position ASC")
      .bind(params.id).all<MediaItem>(),
    db.prepare("SELECT id, name, price_adjustment_cad, stock, sku FROM product_variants WHERE product_id = ? ORDER BY id ASC")
      .bind(params.id).all<VariantRow & { id: number }>().catch(() => ({ results: [] })),
    db.prepare("SELECT id, nom FROM fournisseurs ORDER BY nom ASC").all<{ id: number; nom: string }>().catch(() => ({ results: [] })),
  ]);

  if (!product) throw new Response("Produit introuvable", { status: 404 });

  const assignedIds = new Set((productCollections.results as any[]).map((r: any) => r.collection_id));

  return json({
    product,
    allCollections: allCollections.results ?? [],
    assignedIds: [...assignedIds],
    media: media.results ?? [],
    variants: (variantsResult.results ?? []) as (VariantRow & { id: number })[],
    fournisseurs: (fournisseursResult.results ?? []) as { id: number; nom: string }[],
  });
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

  // Médias : extraire la 1ère image pour image_key (compat rétroactive)
  let mediaItems: MediaItem[] = [];
  try { mediaItems = JSON.parse(g("media_json") || "[]"); } catch { mediaItems = []; }
  const firstImageUrl = mediaItems.find(m => m.type === "image")?.url ?? null;

  await db.prepare(`
    UPDATE products SET
      name=?, description=?, price_cad=?, compare_at_price_cad=?,
      category=?, famille=?,
      type_lace=?, texture=?, longueur_po=?, densite=?, couleur=?,
      hd_lace=?, glueless=?, pret_a_porter=?, quantite_meches=?,
      stock=?, image_key=?, featured=?,
      prix_achat_usd=?, frais_expedition_usd=?, frais_douane_pct=?,
      fournisseur_id=?, ref_fournisseur=?,
      delai_livraison_jours=?, pays_fabrication=?,
      date_derniere_commande=?, date_prochain_reapprovisionnement=?,
      qualite_cheveux=?, origine_cheveux=?, cap_size=?, nb_combs=?,
      seuil_alerte_stock=?, stock_en_commande=?, sku=?, poids_g=?, localisation_entrepot=?,
      meta_title=?, meta_description=?, tags=?, notes_internes=?,
      updated_at=datetime('now')
    WHERE id=?
  `).bind(
    g("name"), g("description") || null, Number(g("price_cad")), n("compare_at_price_cad"),
    g("famille") === "perruque" ? "perruque" :
    g("famille") === "accessoire" || g("famille") === "soin" ? g("famille") : "perruque",
    g("famille"),
    g("type_lace") || null, g("texture") || null,
    n("longueur_po"), n("densite"), g("couleur") || null,
    b("hd_lace"), b("glueless"), b("pret_a_porter"), n("quantite_meches"),
    Number(g("stock") || 0), firstImageUrl, b("featured"),
    n("prix_achat_usd"), n("frais_expedition_usd"), n("frais_douane_pct") ?? 0,
    n("fournisseur_id"), g("ref_fournisseur") || null,
    n("delai_livraison_jours"), g("pays_fabrication") || "Chine",
    g("date_derniere_commande") || null, g("date_prochain_reapprovisionnement") || null,
    g("qualite_cheveux") || null, g("origine_cheveux") || null,
    g("cap_size") || null, n("nb_combs"),
    Number(g("seuil_alerte_stock") || 3), Number(g("stock_en_commande") || 0),
    g("sku") || null, n("poids_g"), g("localisation_entrepot") || null,
    g("meta_title") || null, g("meta_description") || null,
    g("tags") || null, g("notes_internes") || null,
    params.id
  ).run();

  // Remplacer tous les médias du produit
  await db.prepare("DELETE FROM product_media WHERE product_id = ?").bind(params.id).run();
  for (let i = 0; i < mediaItems.length; i++) {
    const m = mediaItems[i];
    await db.prepare(
      "INSERT INTO product_media (product_id, type, url, thumbnail_url, alt_text, position) VALUES (?,?,?,?,?,?)"
    ).bind(params.id, m.type, m.url, m.thumbnail_url || null, m.alt_text || null, i).run();
  }

  // Remplacer toutes les variantes et synchroniser le stock produit
  type VariantInput = { name: string; stock: number; price_adjustment_cad: number; sku?: string };
  let variants: VariantInput[] = [];
  try { variants = JSON.parse(g("variants_json") || "[]"); } catch { variants = []; }
  await db.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(params.id).run();
  let totalVariantStock = 0;
  for (const v of variants) {
    if (!v.name) continue;
    await db.prepare(
      "INSERT INTO product_variants (product_id, name, price_adjustment_cad, stock, sku) VALUES (?,?,?,?,?)"
    ).bind(params.id, v.name, v.price_adjustment_cad ?? 0, v.stock ?? 0, v.sku || null).run();
    totalVariantStock += Number(v.stock ?? 0);
  }
  if (variants.length > 0) {
    await db.prepare("UPDATE products SET stock = ? WHERE id = ?").bind(totalVariantStock, params.id).run();
  }

  throw redirect("/admin/produits");
}

// ─── Panel Collections ────────────────────────────────────────────────────────

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
    <div className="bg-surface border border-outline-variant/30 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-base text-primary">collections_bookmark</span>
        <h2 className="font-semibold text-on-surface">Collections</h2>
      </div>
      {allCollections.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          Aucune collection active.{" "}
          <a href="/admin/collections" className="underline text-primary">Créer une collection</a>
        </p>
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
              className="text-xs bg-primary text-on-primary px-4 py-1.5 font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
              {fetcher.state === "submitting" ? "Enregistrement…" : "Sauvegarder"}
            </button>
            {saved && (
              <span className="text-xs text-secondary font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span> Sauvegardé
              </span>
            )}
          </div>
        </fetcher.Form>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditProduit() {
  const { product, allCollections, assignedIds, media, variants, fournisseurs } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();

  const defaults = { ...(product as any), media };
  const initialVariants = (variants as VariantRow[]) ?? [];

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/produits" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">Modifier : {(product as any).name}</h1>
      </div>

      {data?.error && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm">{data.error}</div>
      )}

      <Form method="post" className="space-y-6">
        <input type="hidden" name="intent" value="update_product" />
        <ProduitFormFields defaults={defaults} fournisseurs={fournisseurs as any} />
        <VariantsEditor initialVariants={initialVariants} />
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
