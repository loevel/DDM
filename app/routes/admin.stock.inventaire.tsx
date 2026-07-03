import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Inventaire physique — Admin DDM" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const inventaireId = url.searchParams.get("id");

  // Liste des inventaires
  const { results: inventaires } = await db.prepare(`
    SELECT ip.*, COUNT(ipi.id) as nb_items,
      SUM(CASE WHEN ipi.quantite_comptee IS NOT NULL THEN 1 ELSE 0 END) as nb_comptes
    FROM inventaires_physiques ip
    LEFT JOIN inventaires_physiques_items ipi ON ipi.inventaire_id = ip.id
    GROUP BY ip.id ORDER BY ip.created_at DESC
  `).all();

  let inventaire = null;
  let items: any[] = [];

  if (inventaireId) {
    inventaire = await db.prepare("SELECT * FROM inventaires_physiques WHERE id = ?")
      .bind(inventaireId).first();

    const { results } = await db.prepare(`
      SELECT ipi.*, p.name as p_name, p.sku, p.localisation_entrepot, p.famille
      FROM inventaires_physiques_items ipi
      LEFT JOIN products p ON p.id = ipi.product_id
      WHERE ipi.inventaire_id = ?
      ORDER BY p.famille, p.name
    `).bind(inventaireId).all();
    items = results ?? [];
  }

  return json({ inventaires: inventaires ?? [], inventaire, items });
}

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const db = context.cloudflare.env.DB;
  const intent = g("intent");

  if (intent === "creer") {
    // Snapshot de tous les produits
    const { meta } = await db.prepare(`
      INSERT INTO inventaires_physiques (statut, notes) VALUES ('en_cours', ?)
    `).bind(g("notes") || null).run();
    const invId = meta.last_row_id;

    const { results: products } = await db
      .prepare("SELECT id, name, stock FROM products ORDER BY name").all();

    for (const p of (products as any[])) {
      await db.prepare(`
        INSERT INTO inventaires_physiques_items (inventaire_id, product_id, nom_produit, quantite_systeme)
        VALUES (?,?,?,?)
      `).bind(invId, p.id, p.name, p.stock).run();
    }
    throw redirect(`/admin/stock/inventaire?id=${invId}`);
  }

  if (intent === "sauvegarder_comptage") {
    const invId = g("inventaire_id");
    const itemIds = f.getAll("item_id[]");
    for (let i = 0; i < itemIds.length; i++) {
      const iid = String(itemIds[i]);
      const qte = f.getAll("qte_comptee[]")[i];
      const notes = String(f.getAll("item_notes[]")[i] ?? "");
      if (qte !== "" && qte !== null) {
        await db.prepare(`
          UPDATE inventaires_physiques_items SET quantite_comptee = ?, notes = ? WHERE id = ?
        `).bind(Number(qte), notes || null, iid).run();
      }
    }
    return json({ ok: true, msg: "Comptage sauvegardé." });
  }

  if (intent === "valider") {
    const invId = g("inventaire_id");
    const { results: items } = await db.prepare(`
      SELECT * FROM inventaires_physiques_items WHERE inventaire_id = ? AND quantite_comptee IS NOT NULL
    `).bind(invId).all();

    for (const item of (items as any[])) {
      const ecart = item.quantite_comptee - item.quantite_systeme;
      if (ecart === 0) continue;

      const type = ecart > 0 ? "ajustement_positif" : "ajustement_negatif";
      const produit = await db.prepare("SELECT stock FROM products WHERE id = ?")
        .bind(item.product_id).first() as any;
      const stockAvant = produit?.stock ?? item.quantite_systeme;
      const stockApres = stockAvant + ecart;

      await db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(Math.max(0, stockApres), item.product_id).run();

      await db.prepare(`
        INSERT INTO stock_mouvements (product_id, type, quantite, stock_avant, stock_apres, reference_type, reference_id, notes)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(
        item.product_id, "inventaire", ecart, stockAvant, Math.max(0, stockApres),
        "inventaire", invId, `Ajustement inventaire #${invId}`
      ).run();
    }

    await db.prepare(`
      UPDATE inventaires_physiques SET statut = 'termine', termine_at = datetime('now') WHERE id = ?
    `).bind(invId).run();

    throw redirect("/admin/stock/inventaire");
  }

  if (intent === "annuler") {
    await db.prepare("UPDATE inventaires_physiques SET statut = 'annule' WHERE id = ?")
      .bind(g("inventaire_id")).run();
    throw redirect("/admin/stock/inventaire");
  }

  return json({ ok: false });
}

export default function InventairePhysique() {
  const { inventaires, inventaire, items } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const inv = inventaire as any;

  const nbComptes = items.filter(i => i.quantite_comptee !== null).length;
  const ecarts = items.filter(i => i.quantite_comptee !== null && i.quantite_comptee !== i.quantite_systeme);

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin/stock" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">Inventaire physique</h1>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Liste des inventaires + création */}
        <div className="space-y-4">
          <div className="bg-surface border border-outline-variant/30 p-5">
            <h2 className="font-semibold text-on-surface mb-4">Nouvel inventaire</h2>
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="creer" />
              <textarea name="notes" placeholder="Notes optionnelles (ex: inventaire fin de mois, après livraison…)"
                rows={2} className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
              <button type="submit" disabled={nav.state === "submitting"}
                className="w-full bg-primary text-on-primary py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg">add_circle</span>
                Démarrer un inventaire
              </button>
            </Form>
          </div>

          <div className="bg-surface border border-outline-variant/30 p-5">
            <h2 className="font-semibold text-on-surface mb-3">Historique</h2>
            <div className="space-y-2">
              {(inventaires as any[]).length === 0 && (
                <p className="text-sm text-on-surface-variant">Aucun inventaire.</p>
              )}
              {(inventaires as any[]).map(i => (
                <Link key={i.id} to={`?id=${i.id}`}
                  className={`block p-3 border transition-colors ${inv?.id === i.id ? "border-primary bg-primary/5" : "border-outline-variant hover:border-primary"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 ${
                      i.statut === "termine" ? "bg-green-100 text-green-700" :
                      i.statut === "annule" ? "bg-surface-container text-on-surface-variant" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>{i.statut}</span>
                    <span className="text-[10px] text-on-surface-variant">{i.created_at?.split("T")[0]}</span>
                  </div>
                  <p className="text-xs font-medium text-on-surface">
                    {i.nb_comptes}/{i.nb_items} compté{i.nb_comptes > 1 ? "s" : ""}
                  </p>
                  {i.notes && <p className="text-[10px] text-on-surface-variant mt-0.5 truncate">{i.notes}</p>}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Feuille de comptage */}
        {inv ? (
          <div className="col-span-2 space-y-4">
            <div className="bg-surface border border-outline-variant/30 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-on-surface">Inventaire du {inv.created_at?.split("T")[0]}</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {nbComptes}/{items.length} produits comptés
                    {ecarts.length > 0 && <span className="text-error font-semibold ml-2">· {ecarts.length} écart{ecarts.length > 1 ? "s" : ""}</span>}
                  </p>
                </div>
                {inv.statut === "en_cours" && (
                  <div className="flex gap-2">
                    <Form method="post">
                      <input type="hidden" name="intent" value="annuler" />
                      <input type="hidden" name="inventaire_id" value={inv.id} />
                      <button type="submit" className="text-xs px-3 py-1.5 border border-error/30 text-error hover:bg-error hover:text-on-error transition-colors">
                        Annuler
                      </button>
                    </Form>
                    <Form method="post" onSubmit={e => { if (!confirm(`Valider et appliquer ${ecarts.length} ajustement(s) ?`)) e.preventDefault(); }}>
                      <input type="hidden" name="intent" value="valider" />
                      <input type="hidden" name="inventaire_id" value={inv.id} />
                      <button type="submit" disabled={nav.state === "submitting" || nbComptes === 0}
                        className="text-xs px-4 py-1.5 bg-secondary text-on-secondary font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Valider & appliquer
                      </button>
                    </Form>
                  </div>
                )}
              </div>

              {/* Barre de progression */}
              <div className="h-1.5 bg-outline-variant/30 mb-4">
                <div className="h-full bg-primary transition-all" style={{ width: `${items.length ? (nbComptes/items.length)*100 : 0}%` }} />
              </div>

              {/* Table de comptage */}
              <Form method="post">
                <input type="hidden" name="intent" value="sauvegarder_comptage" />
                <input type="hidden" name="inventaire_id" value={inv.id} />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-outline-variant/30">
                        {["Produit", "SKU", "Emplacement", "Système", "Compté", "Écart", "Notes"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-on-surface-variant uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {items.map(item => {
                        const ecart = item.quantite_comptee !== null ? item.quantite_comptee - item.quantite_systeme : null;
                        return (
                          <tr key={item.id} className={`${ecart !== null && ecart !== 0 ? "bg-yellow-50" : ""} hover:bg-surface-container-low`}>
                            <td className="px-3 py-2">
                              <input type="hidden" name="item_id[]" value={item.id} />
                              <p className="font-medium text-on-surface">{item.nom_produit}</p>
                              <span className="text-[10px] text-primary/70">{item.famille}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-on-surface-variant">{item.sku ?? "—"}</td>
                            <td className="px-3 py-2 text-on-surface-variant">{item.localisation_entrepot ?? "—"}</td>
                            <td className="px-3 py-2 text-center font-bold text-on-surface">{item.quantite_systeme}</td>
                            <td className="px-3 py-2">
                              {inv.statut === "en_cours" ? (
                                <input type="number" name="qte_comptee[]" min="0"
                                  defaultValue={item.quantite_comptee ?? ""}
                                  placeholder="—"
                                  className="w-16 border border-outline-variant bg-surface px-2 py-1 text-center focus:outline-none focus:border-primary" />
                              ) : (
                                <span className="font-bold">{item.quantite_comptee ?? "—"}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {ecart !== null ? (
                                <span className={`font-bold ${ecart > 0 ? "text-secondary" : ecart < 0 ? "text-error" : "text-on-surface-variant"}`}>
                                  {ecart > 0 ? `+${ecart}` : ecart}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {inv.statut === "en_cours" ? (
                                <input type="text" name="item_notes[]" defaultValue={item.notes ?? ""}
                                  placeholder="Notes…" className="w-full border border-outline-variant/50 bg-surface px-2 py-1 text-xs focus:outline-none focus:border-primary" />
                              ) : (
                                <span className="text-on-surface-variant">{item.notes ?? "—"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {inv.statut === "en_cours" && (
                  <div className="mt-4 flex justify-end">
                    <button type="submit" disabled={nav.state === "submitting"}
                      className="bg-primary text-on-primary px-6 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90">
                      {nav.state === "submitting" ? "Sauvegarde…" : "Sauvegarder le comptage"}
                    </button>
                  </div>
                )}
              </Form>
            </div>
          </div>
        ) : (
          <div className="col-span-2 flex items-center justify-center bg-surface border border-outline-variant/30 border-dashed">
            <div className="text-center py-20">
              <span className="material-symbols-outlined text-6xl text-outline-variant block mb-3">fact_check</span>
              <p className="text-on-surface-variant text-sm">Sélectionnez un inventaire ou créez-en un nouveau.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
