import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { getAdminUser, logAdminAction } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Produits — Admin DDM" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const famille = url.searchParams.get("famille") ?? "";
  const search = url.searchParams.get("q") ?? "";

  let query = "SELECT * FROM products";
  const conditions: string[] = [];
  const binds: any[] = [];

  if (famille) { conditions.push("famille = ?"); binds.push(famille); }
  if (search) { conditions.push("(name LIKE ? OR slug LIKE ?)"); binds.push(`%${search}%`, `%${search}%`); }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY famille, name";

  const products = await context.cloudflare.env.DB.prepare(query).bind(...binds).all();
  return json({ products: products.results, famille, search });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const db = context.cloudflare.env.DB;

  if (intent === "delete") {
    const id = String(form.get("id"));
    const product = await db.prepare("SELECT name FROM products WHERE id = ?").bind(id).first<{ name: string }>();
    await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    await logAdminAction(context, {
      admin: await getAdminUser(request, context),
      action: "product.delete", entity: "product", entityId: id,
      details: { name: product?.name }, request,
    });
    return json({ ok: true });
  }
  if (intent === "toggle-featured") {
    const current = Number(form.get("featured"));
    await db.prepare("UPDATE products SET featured = ? WHERE id = ?").bind(current ? 0 : 1, String(form.get("id"))).run();
    return json({ ok: true });
  }
  return json({ ok: false });
}

const FAMILLE_LABELS: Record<string, string> = {
  perruque: "Perruque", meche: "Mèche", closure: "Closure",
  frontal: "Frontal", accessoire: "Accessoire", soin: "Soin",
};
const FAMILLE_COLORS: Record<string, string> = {
  perruque: "bg-primary/10 text-primary",
  meche: "bg-secondary/10 text-secondary",
  closure: "bg-tertiary/10 text-on-tertiary-container",
  frontal: "bg-tertiary-container/50 text-on-tertiary-container",
  accessoire: "bg-surface-container-highest text-on-surface",
  soin: "bg-green-100 text-green-800",
};

const TEXTURE_LABELS: Record<string, string> = {
  "lisse": "Lisse", "body-wave": "Body Wave", "water-wave": "Water Wave",
  "deep-wave": "Deep Wave", "loose-wave": "Loose Wave", "boucle": "Bouclé",
  "kinky-curly": "Kinky Curly", "kinky-straight": "Kinky Straight",
  "bob": "Bob", "avec-frange": "Avec frange", "autre": "Autre",
};

const TAUX_USD_CAD = 1.38;

function calcMarge(p: any) {
  if (!p.prix_achat_usd || !p.price_cad) return null;
  const cout = (Number(p.prix_achat_usd) + Number(p.frais_expedition_usd || 0))
    * TAUX_USD_CAD * (1 + Number(p.frais_douane_pct || 0) / 100);
  const pct = ((Number(p.price_cad) - cout) / Number(p.price_cad)) * 100;
  return { pct, brute: Number(p.price_cad) - cout };
}

export default function AdminProduits() {
  const { products, famille, search } = useLoaderData<typeof loader>();
  const familles = ["", "perruque", "meche", "closure", "frontal", "accessoire", "soin"];

  const alertesStock = (products as any[]).filter(p =>
    p.stock <= (p.seuil_alerte_stock ?? 3) && p.stock >= 0
  );
  const ruptures = (products as any[]).filter(p => p.stock === 0);
  const sansAchat = (products as any[]).filter(p => !p.prix_achat_usd);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">
          Produits <span className="text-on-surface-variant font-normal text-lg">({products.length})</span>
        </h1>
        <Link to="/admin/produits/nouveau"
          className="bg-primary text-on-primary px-5 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">add</span>
          Nouveau produit
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard icon="inventory_2" label="Total produits" value={String(products.length)} />
        <KpiCard icon="warning" label="Alertes stock" value={String(alertesStock.length)}
          danger={alertesStock.length > 0} />
        <KpiCard icon="block" label="En rupture" value={String(ruptures.length)}
          danger={ruptures.length > 0} />
        <KpiCard icon="help" label="Sans coût d'achat" value={String(sansAchat.length)}
          warn={sansAchat.length > 0} />
      </div>

      {/* Alertes stock */}
      {alertesStock.length > 0 && (
        <div className="mb-5 border border-error/30 bg-error-container/20 p-4">
          <p className="text-xs font-bold text-error uppercase tracking-wider mb-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">warning</span>
            Stock faible — {alertesStock.length} produit{alertesStock.length > 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {alertesStock.map((p: any) => (
              <Link key={p.id} to={`/admin/produits/${p.id}`}
                className="text-xs px-2 py-1 bg-surface border border-error/30 text-error hover:bg-error/10 transition-colors">
                {p.name} — {p.stock} en stock
                {p.stock_en_commande > 0 && <span className="text-on-surface-variant"> (+{p.stock_en_commande} en commande)</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <Form method="get" className="flex gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {familles.map(f => (
            <button key={f} type="submit" name="famille" value={f}
              className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border transition-colors ${famille === f ? "bg-primary text-on-primary border-primary" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}>
              {f ? FAMILLE_LABELS[f] : "Tous"}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          <input name="q" defaultValue={search} placeholder="Rechercher…"
            className="border border-outline-variant bg-surface px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-primary" />
          {search && <input type="hidden" name="famille" value={famille} />}
          <button type="submit" className="px-3 py-1.5 border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary">
            <span className="material-symbols-outlined text-sm">search</span>
          </button>
        </div>
      </Form>

      {/* Table */}
      <div className="bg-surface border border-outline-variant/30 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-surface-container-low">
            <tr className="border-b border-outline-variant/30">
              {["Produit / SKU", "Famille", "Caractéristiques", "Prix vente", "Marge", "Stock", "Fournisseur", "★", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {(products as any[]).map((p: any) => {
              const marge = calcMarge(p);
              const seuil = p.seuil_alerte_stock ?? 3;
              const stockAlert = p.stock <= seuil;
              const stockColor = p.stock === 0 ? "text-error font-bold" : stockAlert ? "text-yellow-600 font-bold" : "text-secondary";

              return (
                <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                  {/* Produit */}
                  <td className="px-4 py-3">
                    <p className="font-medium text-on-surface leading-snug">{p.name}</p>
                    <div className="flex gap-2 mt-0.5">
                      {p.sku && <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container px-1">{p.sku}</span>}
                      {p.localisation_entrepot && <span className="text-[10px] text-on-surface-variant">📍 {p.localisation_entrepot}</span>}
                    </div>
                    {p.notes_internes && (
                      <p className="text-[10px] text-on-surface-variant mt-0.5 truncate max-w-[180px] italic" title={p.notes_internes}>
                        💬 {p.notes_internes}
                      </p>
                    )}
                  </td>

                  {/* Famille */}
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase ${FAMILLE_COLORS[p.famille ?? p.category] ?? "bg-surface-container text-on-surface"}`}>
                      {FAMILLE_LABELS[p.famille ?? p.category] ?? p.famille}
                    </span>
                  </td>

                  {/* Caractéristiques */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.texture && <Chip>{TEXTURE_LABELS[p.texture] ?? p.texture}</Chip>}
                      {p.type_lace && <Chip>{p.type_lace.toUpperCase()}</Chip>}
                      {p.longueur_po && <Chip>{p.longueur_po} po</Chip>}
                      {p.densite && <Chip>{p.densite}%</Chip>}
                      {p.qualite_cheveux && <Chip>{p.qualite_cheveux}</Chip>}
                      {p.cap_size && <Chip>{p.cap_size}</Chip>}
                      {p.hd_lace ? <Chip accent>HD</Chip> : null}
                      {p.glueless ? <Chip accent>Sans colle</Chip> : null}
                      {p.pret_a_porter ? <Chip accent>Prêt à porter</Chip> : null}
                    </div>
                  </td>

                  {/* Prix vente */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-semibold text-primary">{Number(p.price_cad).toFixed(2)} $</p>
                    {p.prix_achat_usd && (
                      <p className="text-[10px] text-on-surface-variant">Achat: {Number(p.prix_achat_usd).toFixed(2)} USD</p>
                    )}
                  </td>

                  {/* Marge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {marge ? (
                      <div>
                        <p className={`font-bold text-sm ${marge.pct >= 40 ? "text-secondary" : marge.pct >= 20 ? "text-primary" : "text-error"}`}>
                          {marge.pct.toFixed(1)}%
                        </p>
                        <p className="text-[10px] text-on-surface-variant">{marge.brute.toFixed(2)} $ brut</p>
                      </div>
                    ) : (
                      <span className="text-[10px] text-outline-variant">—</span>
                    )}
                  </td>

                  {/* Stock */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        {stockAlert && p.stock > 0 && (
                          <span className="material-symbols-outlined text-yellow-600 text-sm">warning</span>
                        )}
                        {p.stock === 0 && (
                          <span className="material-symbols-outlined text-error text-sm">block</span>
                        )}
                        <span className={stockColor}>{p.stock}</span>
                      </div>
                      {p.stock_en_commande > 0 && (
                        <span className="text-[10px] text-on-surface-variant">+{p.stock_en_commande} en cmd</span>
                      )}
                    </div>
                  </td>

                  {/* Fournisseur */}
                  <td className="px-4 py-3">
                    {p.fournisseur ? (
                      <div>
                        <p className="text-xs text-on-surface font-medium truncate max-w-[120px]">{p.fournisseur}</p>
                        {p.ref_fournisseur && <p className="text-[10px] text-on-surface-variant font-mono">{p.ref_fournisseur}</p>}
                        {p.url_fournisseur && (
                          <a href={p.url_fournisseur} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-xs">open_in_new</span> Voir
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-outline-variant">—</span>
                    )}
                  </td>

                  {/* Vedette */}
                  <td className="px-4 py-3">
                    <Form method="post">
                      <input type="hidden" name="intent" value="toggle-featured" />
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="featured" value={p.featured} />
                      <button type="submit"
                        className={`material-symbols-outlined text-xl transition-colors ${p.featured ? "text-primary" : "text-outline-variant hover:text-primary"}`}>
                        {p.featured ? "star" : "star_border"}
                      </button>
                    </Form>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link to={`/admin/produits/${p.id}`}
                        className="text-xs px-3 py-1.5 border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
                        Modifier
                      </Link>
                      <Form method="post" onSubmit={e => { if (!confirm("Supprimer ce produit ?")) e.preventDefault(); }}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit"
                          className="text-xs px-3 py-1.5 border border-error/30 text-error hover:bg-error hover:text-on-error transition-colors">
                          Supprimer
                        </button>
                      </Form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.length === 0 && (
          <p className="text-center py-12 text-on-surface-variant">Aucun produit{famille ? ` dans "${FAMILLE_LABELS[famille]}"` : ""}.</p>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, danger, warn }: {
  icon: string; label: string; value: string; danger?: boolean; warn?: boolean;
}) {
  return (
    <div className={`p-4 border ${danger ? "border-error/30 bg-error-container/10" : warn ? "border-yellow-400/30 bg-yellow-50" : "border-outline-variant/30 bg-surface"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-lg ${danger ? "text-error" : warn ? "text-yellow-600" : "text-on-surface-variant"}`}>{icon}</span>
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${danger ? "text-error" : warn ? "text-yellow-700" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${accent ? "bg-primary/10 text-primary" : "bg-surface-container-high text-on-surface-variant"}`}>
      {children}
    </span>
  );
}
