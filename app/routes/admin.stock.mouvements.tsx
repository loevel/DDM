import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { MouvementRow } from "./admin.stock._index";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Mouvements de stock — Admin DDM" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  const q = url.searchParams.get("q") ?? "";
  const limit = 100;

  let where = "1=1";
  const binds: any[] = [];
  if (type) { where += " AND sm.type = ?"; binds.push(type); }
  if (q) { where += " AND (p.name LIKE ? OR sm.notes LIKE ?)"; binds.push(`%${q}%`, `%${q}%`); }

  const { results } = await db.prepare(`
    SELECT sm.*, p.name as product_name
    FROM stock_mouvements sm
    LEFT JOIN products p ON p.id = sm.product_id
    WHERE ${where}
    ORDER BY sm.created_at DESC
    LIMIT ${limit}
  `).bind(...binds).all();

  const { results: products } = await db.prepare("SELECT id, name FROM products ORDER BY name").all();

  return json({ mouvements: results ?? [], type, q, products: products ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const db = context.cloudflare.env.DB;

  if (g("intent") === "ajustement_manuel") {
    const productId = g("product_id");
    const type = g("type");
    const qte = Math.abs(Number(g("quantite")));
    const notes = g("notes");

    const produit = await db.prepare("SELECT stock FROM products WHERE id = ?").bind(productId).first() as any;
    const stockAvant = produit?.stock ?? 0;
    const delta = (type === "ajustement_positif" || type === "retour_client") ? qte : -qte;
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

const TYPES = [
  "", "reception", "vente", "retour_client", "retour_fournisseur",
  "ajustement_positif", "ajustement_negatif", "perte", "inventaire",
];
const TYPE_LABELS: Record<string, string> = {
  reception: "Réception", vente: "Vente", retour_client: "Retour client",
  retour_fournisseur: "Retour fourn.", ajustement_positif: "Ajust. +",
  ajustement_negatif: "Ajust. −", perte: "Perte", inventaire: "Inventaire",
};

export default function StockMouvements() {
  const { mouvements, type, q, products } = useLoaderData<typeof loader>();

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin/stock" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">
          Mouvements de stock <span className="text-on-surface-variant font-normal text-lg">({mouvements.length})</span>
        </h1>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Filtres */}
        <div className="col-span-2 bg-surface border border-outline-variant/30 p-5">
          <h2 className="text-sm font-semibold text-on-surface mb-3">Filtres</h2>
          <Form method="get" className="flex gap-3 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {TYPES.map(t => (
                <button key={t} type="submit" name="type" value={t}
                  className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border transition-colors ${
                    type === t ? "bg-primary text-on-primary border-primary" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                  }`}>
                  {t ? (TYPE_LABELS[t] ?? t) : "Tous"}
                </button>
              ))}
            </div>
            {type && <input type="hidden" name="type" value={type} />}
            <input name="q" defaultValue={q} placeholder="Rechercher produit / notes…"
              className="border border-outline-variant bg-surface px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-primary" />
          </Form>
        </div>

        {/* Ajustement manuel */}
        <div className="bg-surface border border-outline-variant/30 p-5">
          <h2 className="text-sm font-semibold text-on-surface mb-3">Ajustement manuel</h2>
          <Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="ajustement_manuel" />
            <select name="product_id" required
              className="w-full border border-outline-variant bg-surface px-3 py-2 text-xs focus:outline-none focus:border-primary">
              <option value="">— Choisir un produit —</option>
              {(products as any[]).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select name="type"
              className="w-full border border-outline-variant bg-surface px-3 py-2 text-xs focus:outline-none focus:border-primary">
              <option value="ajustement_positif">+ Entrée / correction</option>
              <option value="ajustement_negatif">− Sortie / correction</option>
              <option value="retour_client">Retour client (revendable)</option>
              <option value="perte">Perte / casse</option>
            </select>
            <div className="flex gap-2">
              <input name="quantite" type="number" min="1" defaultValue={1} placeholder="Qté"
                className="w-20 border border-outline-variant bg-surface px-3 py-2 text-xs focus:outline-none focus:border-primary" />
              <input name="notes" placeholder="Motif / notes…"
                className="flex-1 border border-outline-variant bg-surface px-3 py-2 text-xs focus:outline-none focus:border-primary" />
            </div>
            <button type="submit"
              className="w-full bg-primary text-on-primary py-2 text-xs font-semibold uppercase tracking-wider hover:opacity-90">
              Enregistrer
            </button>
          </Form>
        </div>
      </div>

      {/* Table mouvements */}
      <div className="bg-surface border border-outline-variant/30 overflow-x-auto">
        <table className="w-full text-xs min-w-[800px]">
          <thead className="bg-surface-container-low border-b border-outline-variant/30">
            <tr>
              {["Date / heure", "Produit", "Type", "Quantité", "Stock avant", "Stock après", "Coût unit.", "Référence", "Notes"].map(h => (
                <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {(mouvements as any[]).map(m => <MouvementRow key={m.id} m={m} />)}
          </tbody>
        </table>
        {mouvements.length === 0 && (
          <p className="text-center py-12 text-on-surface-variant text-sm">Aucun mouvement trouvé.</p>
        )}
      </div>
    </div>
  );
}
