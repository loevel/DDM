import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Fournisseur — Admin DDM" }];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const [fournisseur, produits] = await Promise.all([
    db.prepare("SELECT * FROM fournisseurs WHERE id = ?").bind(params.id).first(),
    db.prepare(
      "SELECT id, name, slug, price_cad, stock, ref_fournisseur, delai_livraison_jours FROM products WHERE fournisseur_id = ? ORDER BY name ASC"
    ).bind(params.id).all(),
  ]);
  if (!fournisseur) throw new Response("Fournisseur introuvable", { status: 404 });
  return json({ fournisseur, produits: produits.results ?? [] });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const f = await request.formData();
  const intent = String(f.get("intent") ?? "update");

  if (intent === "delete") {
    await db.prepare("UPDATE products SET fournisseur_id = NULL WHERE fournisseur_id = ?").bind(params.id).run();
    await db.prepare("DELETE FROM fournisseurs WHERE id = ?").bind(params.id).run();
    throw redirect("/admin/fournisseurs");
  }

  const nom = String(f.get("nom") ?? "").trim();
  if (!nom) return json({ error: "Le nom est requis." });

  await db.prepare(`
    UPDATE fournisseurs SET
      nom = ?, url = ?, email = ?, telephone = ?, pays = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    nom,
    String(f.get("url") ?? "").trim() || null,
    String(f.get("email") ?? "").trim() || null,
    String(f.get("telephone") ?? "").trim() || null,
    String(f.get("pays") ?? "").trim() || null,
    String(f.get("notes") ?? "").trim() || null,
    params.id,
  ).run();

  return json({ ok: true });
}

const inp = "w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary";

export default function FournisseurDetail() {
  const { fournisseur: f, produits } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const fo = f as any;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/fournisseurs" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">{fo.nom}</h1>
      </div>

      {/* Formulaire édition */}
      <div className="bg-surface border border-outline-variant/30 p-6 mb-6">
        <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-primary">local_shipping</span>
          Informations fournisseur
        </h2>

        {data?.error && (
          <div className="mb-4 p-3 bg-error-container text-on-error-container text-sm">{data.error}</div>
        )}
        {(data as any)?.ok && (
          <div className="mb-4 p-3 bg-secondary/10 text-secondary text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span> Sauvegardé.
          </div>
        )}

        <Form method="post" className="grid grid-cols-2 gap-4">
          <input type="hidden" name="intent" value="update" />
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Nom *</label>
            <input name="nom" defaultValue={fo.nom} required className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Site web</label>
            <input name="url" type="url" defaultValue={fo.url ?? ""} placeholder="https://..." className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Email / WhatsApp / WeChat</label>
            <input name="email" defaultValue={fo.email ?? ""} placeholder="contact@..." className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Téléphone</label>
            <input name="telephone" defaultValue={fo.telephone ?? ""} placeholder="+86..." className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Pays</label>
            <input name="pays" defaultValue={fo.pays ?? ""} placeholder="Chine" className={inp} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Notes internes</label>
            <textarea name="notes" rows={3} defaultValue={fo.notes ?? ""}
              placeholder="Conditions de paiement, délais habituels, fiabilité…"
              className={`${inp} resize-none`} />
          </div>
          <div className="col-span-2 flex gap-3">
            <button type="submit" disabled={nav.state === "submitting"}
              className="bg-primary text-on-primary px-5 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
              {nav.state === "submitting" ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </Form>
      </div>

      {/* Produits liés */}
      <div className="bg-surface border border-outline-variant/30 p-6 mb-6">
        <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-primary">inventory_2</span>
          Produits liés ({(produits as any[]).length})
        </h2>
        {(produits as any[]).length === 0 ? (
          <p className="text-sm text-on-surface-variant">Aucun produit lié à ce fournisseur.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/30">
                {["Produit", "Réf. fournisseur", "Délai", "Stock", "Prix", ""].map((h, i) => (
                  <th key={i} className="text-left px-3 py-2 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {(produits as any[]).map(p => (
                <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-3 py-2.5 font-medium text-on-surface">{p.name}</td>
                  <td className="px-3 py-2.5 text-on-surface-variant font-mono text-xs">{p.ref_fournisseur ?? "—"}</td>
                  <td className="px-3 py-2.5 text-on-surface-variant text-xs">
                    {p.delai_livraison_jours ? `${p.delai_livraison_jours}j` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-on-surface-variant">{p.stock}</td>
                  <td className="px-3 py-2.5 font-semibold">{Number(p.price_cad).toFixed(2)} $</td>
                  <td className="px-3 py-2.5">
                    <Link to={`/admin/produits/${p.id}`}
                      className="text-xs text-primary hover:underline">
                      Modifier
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Zone danger */}
      <div className="bg-surface border border-error/20 p-6">
        <h2 className="font-semibold text-error mb-2">Zone de danger</h2>
        <p className="text-sm text-on-surface-variant mb-4">
          Supprimer ce fournisseur le dissocie de tous ses produits. Les produits ne sont pas supprimés.
        </p>
        <Form method="post" onSubmit={e => { if (!confirm("Supprimer ce fournisseur ?")) e.preventDefault(); }}>
          <input type="hidden" name="intent" value="delete" />
          <button type="submit"
            className="text-sm border border-error text-error px-4 py-2 hover:bg-error hover:text-on-error transition-colors">
            Supprimer ce fournisseur
          </button>
        </Form>
      </div>
    </div>
  );
}
