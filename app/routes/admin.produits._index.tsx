import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";

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
    await db.prepare("DELETE FROM products WHERE id = ?").bind(String(form.get("id"))).run();
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

export default function AdminProduits() {
  const { products, famille, search } = useLoaderData<typeof loader>();
  const familles = ["", "perruque", "meche", "closure", "frontal", "accessoire", "soin"];

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
      <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr className="border-b border-outline-variant/30">
              {["Produit", "Famille", "Caractéristiques", "Prix", "Stock", "★", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {products.map((p: any) => (
              <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                {/* Produit */}
                <td className="px-4 py-3">
                  <p className="font-medium text-on-surface">{p.name}</p>
                  <p className="text-xs text-on-surface-variant">{p.slug}</p>
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
                    {p.couleur && <Chip>{p.couleur}</Chip>}
                    {p.hd_lace ? <Chip accent>HD</Chip> : null}
                    {p.glueless ? <Chip accent>Sans colle</Chip> : null}
                    {p.pret_a_porter ? <Chip accent>Prêt à porter</Chip> : null}
                    {p.quantite_meches ? <Chip>{p.quantite_meches} mèche{p.quantite_meches > 1 ? "s" : ""}</Chip> : null}
                  </div>
                </td>

                {/* Prix */}
                <td className="px-4 py-3 font-semibold text-primary whitespace-nowrap">
                  {Number(p.price_cad).toFixed(2)} $
                </td>

                {/* Stock */}
                <td className="px-4 py-3">
                  <span className={`font-bold ${p.stock === 0 ? "text-error" : p.stock <= 2 ? "text-yellow-600" : "text-secondary"}`}>
                    {p.stock}
                  </span>
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
            ))}
          </tbody>
        </table>
        {products.length === 0 && (
          <p className="text-center py-12 text-on-surface-variant">Aucun produit{famille ? ` dans "${FAMILLE_LABELS[famille]}"` : ""}.</p>
        )}
      </div>
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
