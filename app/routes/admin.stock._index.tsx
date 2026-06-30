import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Gestion du stock — Admin DDM" }];

const TAUX = 1.38;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const famille = url.searchParams.get("famille") ?? "";

  let q = "SELECT * FROM products";
  if (famille) q += ` WHERE famille = '${famille}'`;
  q += " ORDER BY famille, name";

  const { results: products } = await db.prepare(q).all();

  // Mouvements récents
  const { results: mouvements } = await db.prepare(`
    SELECT sm.*, p.name as product_name
    FROM stock_mouvements sm
    LEFT JOIN products p ON p.id = sm.product_id
    ORDER BY sm.created_at DESC
    LIMIT 20
  `).all();

  return json({ products: products ?? [], mouvements: mouvements ?? [], famille });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const db = context.cloudflare.env.DB;

  if (g("intent") === "ajustement") {
    const productId = g("product_id");
    const type = g("type"); // ajustement_positif ou ajustement_negatif
    const qte = Math.abs(Number(g("quantite")));
    const notes = g("notes");
    if (!productId || !qte) return json({ error: "Données manquantes" });

    const produit = await db.prepare("SELECT stock FROM products WHERE id = ?").bind(productId).first() as any;
    const stockAvant = produit?.stock ?? 0;
    const delta = type === "ajustement_positif" ? qte : -qte;
    const stockApres = Math.max(0, stockAvant + delta);

    await db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(stockApres, productId).run();

    await db.prepare(`
      INSERT INTO stock_mouvements (product_id, type, quantite, stock_avant, stock_apres, reference_type, notes)
      VALUES (?,?,?,?,?,?,?)
    `).bind(productId, type, delta, stockAvant, stockApres, "manuel", notes || null).run();

    return json({ ok: true });
  }

  return json({ ok: false });
}

export default function AdminStock() {
  const { products, mouvements, famille } = useLoaderData<typeof loader>();
  const ps = products as any[];

  // KPIs
  const valeurStock = ps.reduce((s, p) =>
    s + (p.stock * (p.prix_achat_usd ?? 0) * TAUX), 0);
  const valeurVente = ps.reduce((s, p) => s + (p.stock * p.price_cad), 0);
  const ruptures = ps.filter(p => p.stock === 0);
  const alertes = ps.filter(p => p.stock > 0 && p.stock <= (p.seuil_alerte_stock ?? 3));
  const enCommande = ps.filter(p => (p.stock_en_commande ?? 0) > 0);

  const familles = ["", "perruque", "meche", "closure", "frontal", "accessoire", "soin"];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Gestion du stock</h1>
        <div className="flex gap-3">
          <Link to="/admin/stock/inventaire"
            className="flex items-center gap-2 border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-lg">fact_check</span>
            Inventaire physique
          </Link>
          <Link to="/admin/stock/mouvements"
            className="flex items-center gap-2 border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-lg">history</span>
            Tous les mouvements
          </Link>
          <a href="/api/export-csv?type=stock"
            className="flex items-center gap-2 border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-lg">download</span>
            Exporter CSV
          </a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <Kpi icon="warehouse" label="Unités en stock" value={ps.reduce((s,p) => s+p.stock, 0).toString()} />
        <Kpi icon="payments" label="Valeur stock (coût)" value={`${valeurStock.toFixed(0)} $`} sub="CAD" />
        <Kpi icon="trending_up" label="Valeur stock (vente)" value={`${valeurVente.toFixed(0)} $`} sub="CAD" />
        <Kpi icon="warning" label="En rupture" value={ruptures.length.toString()} danger={ruptures.length > 0} />
        <Kpi icon="notification_important" label="Alertes stock" value={alertes.length.toString()} warn={alertes.length > 0} />
      </div>

      {/* En commande */}
      {enCommande.length > 0 && (
        <div className="mb-5 p-4 bg-blue-50 border border-blue-200">
          <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">local_shipping</span>
            En commande chez le fournisseur
          </p>
          <div className="flex flex-wrap gap-2">
            {enCommande.map((p: any) => (
              <span key={p.id} className="text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1">
                {p.name} — +{p.stock_en_commande} unités attendues
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filtre famille */}
      <Form method="get" className="flex gap-1 mb-5 flex-wrap">
        {familles.map(f => (
          <button key={f} type="submit" name="famille" value={f}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border transition-colors ${
              famille === f ? "bg-primary text-on-primary border-primary" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
            }`}>
            {f || "Tous"}
          </button>
        ))}
      </Form>

      {/* Table stock */}
      <div className="bg-surface border border-outline-variant/30 overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low border-b border-outline-variant/30">
            <tr>
              {["Produit", "Stock", "En cmd", "Seuil", "Valeur coût", "Valeur vente", "Localisation", "Ajustement rapide"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {ps.map(p => {
              const seuil = p.seuil_alerte_stock ?? 3;
              const alerte = p.stock <= seuil && p.stock > 0;
              const rupture = p.stock === 0;
              const valeurCout = p.stock * (p.prix_achat_usd ?? 0) * TAUX;
              const valeurVte = p.stock * p.price_cad;

              return (
                <tr key={p.id} className={`hover:bg-surface-container-low transition-colors ${rupture ? "bg-error-container/5" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-on-surface text-xs leading-snug">{p.name}</p>
                    {p.sku && <span className="text-[10px] font-mono text-on-surface-variant">{p.sku}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {rupture && <span className="material-symbols-outlined text-error text-sm">block</span>}
                      {alerte && <span className="material-symbols-outlined text-yellow-600 text-sm">warning</span>}
                      <span className={`font-bold text-sm ${rupture ? "text-error" : alerte ? "text-yellow-600" : "text-secondary"}`}>
                        {p.stock}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">
                    {p.stock_en_commande > 0 ? <span className="text-blue-600 font-semibold">+{p.stock_en_commande}</span> : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{seuil}</td>
                  <td className="px-4 py-3 text-xs">
                    {p.prix_achat_usd ? `${valeurCout.toFixed(2)} $` : <span className="text-outline-variant">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-primary">{valeurVte.toFixed(2)} $</td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{p.localisation_entrepot ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Form method="post" className="flex items-center gap-1">
                      <input type="hidden" name="intent" value="ajustement" />
                      <input type="hidden" name="product_id" value={p.id} />
                      <select name="type" className="border border-outline-variant bg-surface text-xs px-1.5 py-1 focus:outline-none">
                        <option value="ajustement_positif">+ Entrée</option>
                        <option value="ajustement_negatif">− Sortie</option>
                        <option value="perte">Perte</option>
                      </select>
                      <input name="quantite" type="number" min="1" defaultValue={1}
                        className="w-12 border border-outline-variant bg-surface text-xs px-1.5 py-1 text-center focus:outline-none" />
                      <button type="submit" className="text-xs px-2 py-1 bg-primary text-on-primary hover:opacity-80">
                        OK
                      </button>
                    </Form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mouvements récents */}
      <div className="bg-surface border border-outline-variant/30 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">history</span>
            <h2 className="font-semibold text-on-surface">Derniers mouvements</h2>
          </div>
          <Link to="/admin/stock/mouvements" className="text-xs text-primary hover:underline">Voir tout →</Link>
        </div>
        {(mouvements as any[]).length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-6">Aucun mouvement enregistré pour l'instant.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-outline-variant/30">
                {["Date", "Produit", "Type", "Qté", "Stock après", "Réf.", "Notes"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-on-surface-variant uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {(mouvements as any[]).map(m => (
                <MouvementRow key={m.id} m={m} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function MouvementRow({ m }: { m: any }) {
  const TYPE_CONFIG: Record<string, { label: string; color: string; sign: string }> = {
    reception:           { label: "Réception",         color: "text-secondary",  sign: "+" },
    vente:               { label: "Vente",              color: "text-primary",    sign: "−" },
    retour_client:       { label: "Retour client",      color: "text-blue-600",   sign: "+" },
    retour_fournisseur:  { label: "Retour fourn.",      color: "text-orange-600", sign: "−" },
    ajustement_positif:  { label: "Ajust. +",           color: "text-secondary",  sign: "+" },
    ajustement_negatif:  { label: "Ajust. −",           color: "text-error",      sign: "−" },
    perte:               { label: "Perte",              color: "text-error",      sign: "−" },
    inventaire:          { label: "Inventaire",         color: "text-on-surface", sign: "±" },
  };
  const tc = TYPE_CONFIG[m.type] ?? { label: m.type, color: "text-on-surface-variant", sign: "" };
  return (
    <tr className="hover:bg-surface-container-low">
      <td className="px-3 py-2 text-on-surface-variant">{m.created_at?.replace("T", " ").slice(0, 16)}</td>
      <td className="px-3 py-2 font-medium text-on-surface">{m.product_name ?? `#${m.product_id}`}</td>
      <td className="px-3 py-2"><span className={`font-semibold ${tc.color}`}>{tc.label}</span></td>
      <td className="px-3 py-2"><span className={`font-bold ${tc.color}`}>{tc.sign}{Math.abs(m.quantite)}</span></td>
      <td className="px-3 py-2 text-on-surface">{m.stock_apres ?? "—"}</td>
      <td className="px-3 py-2 text-on-surface-variant">{m.reference_type ?? "—"}</td>
      <td className="px-3 py-2 text-on-surface-variant truncate max-w-[150px]">{m.notes ?? "—"}</td>
    </tr>
  );
}

function Kpi({ icon, label, value, sub, danger, warn }: {
  icon: string; label: string; value: string; sub?: string; danger?: boolean; warn?: boolean;
}) {
  return (
    <div className={`p-4 border ${danger ? "border-error/30 bg-error-container/10" : warn ? "border-yellow-400/30 bg-yellow-50" : "border-outline-variant/30 bg-surface"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-lg ${danger ? "text-error" : warn ? "text-yellow-600" : "text-primary"}`}>{icon}</span>
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-bold ${danger ? "text-error" : warn ? "text-yellow-700" : "text-on-surface"}`}>{value}</p>
      {sub && <p className="text-[10px] text-on-surface-variant">{sub}</p>}
    </div>
  );
}
