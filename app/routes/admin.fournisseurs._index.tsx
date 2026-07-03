import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Fournisseurs — Admin DDM" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const { results } = await db.prepare(`
    SELECT f.*, COUNT(p.id) as nb_produits
    FROM fournisseurs f
    LEFT JOIN products p ON p.fournisseur_id = f.id
    GROUP BY f.id
    ORDER BY f.nom ASC
  `).all();
  return json({ fournisseurs: results ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const f = await request.formData();
  const nom = String(f.get("nom") ?? "").trim();
  const url = String(f.get("url") ?? "").trim() || null;
  const email = String(f.get("email") ?? "").trim() || null;
  const telephone = String(f.get("telephone") ?? "").trim() || null;
  const pays = String(f.get("pays") ?? "").trim() || null;
  const notes = String(f.get("notes") ?? "").trim() || null;

  if (!nom) return json({ error: "Le nom est requis." });

  try {
    await db.prepare(
      "INSERT INTO fournisseurs (nom, url, email, telephone, pays, notes) VALUES (?,?,?,?,?,?)"
    ).bind(nom, url, email, telephone, pays, notes).run();
  } catch (e: any) {
    return json({ error: e.message });
  }

  throw redirect("/admin/fournisseurs");
}

export default function AdminFournisseurs() {
  const { fournisseurs } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">
          Fournisseurs{" "}
          <span className="text-on-surface-variant font-normal text-lg">({fournisseurs.length})</span>
        </h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90">
          <span className="material-symbols-outlined text-base">add</span>
          Nouveau fournisseur
        </button>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <div className="bg-surface border border-outline-variant/30 p-6 mb-6">
          <h2 className="font-semibold text-on-surface mb-4">Nouveau fournisseur</h2>
          {data?.error && (
            <div className="mb-4 p-3 bg-error-container text-on-error-container text-sm">{data.error}</div>
          )}
          <Form method="post" className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Nom *
              </label>
              <input name="nom" required placeholder="ex: Alibaba Hair Co."
                className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Site web
              </label>
              <input name="url" type="url" placeholder="https://..."
                className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Email / WhatsApp / WeChat
              </label>
              <input name="email" placeholder="contact@fournisseur.com"
                className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Téléphone
              </label>
              <input name="telephone" placeholder="+86..."
                className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Pays
              </label>
              <input name="pays" placeholder="Chine"
                className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Notes internes
              </label>
              <textarea name="notes" rows={2} placeholder="Conditions de paiement, délais habituels, remarques…"
                className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
            </div>
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={nav.state === "submitting"}
                className="bg-primary text-on-primary px-5 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
                {nav.state === "submitting" ? "Création…" : "Créer"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-5 py-2 text-sm border border-outline-variant text-on-surface-variant hover:text-primary transition-colors">
                Annuler
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Liste */}
      {fournisseurs.length === 0 ? (
        <div className="bg-surface border border-outline-variant/30 p-12 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-3 block">local_shipping</span>
          <p className="text-on-surface-variant text-sm">Aucun fournisseur enregistré.</p>
        </div>
      ) : (
        <div className="bg-surface border border-outline-variant/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr className="border-b border-outline-variant/30">
                {["Nom", "Pays", "Contact", "Produits", ""].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {(fournisseurs as any[]).map(f => (
                <tr key={f.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-medium text-on-surface">
                    {f.nom}
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noopener noreferrer"
                        className="ml-2 text-primary hover:underline text-xs">
                        ↗ site
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{f.pays ?? "—"}</td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">
                    {f.email ?? f.telephone ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                      <span className="material-symbols-outlined text-[13px]">inventory_2</span>
                      {f.nb_produits}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/fournisseurs/${f.id}`}
                      className="text-xs text-primary hover:underline font-medium">
                      Voir →
                    </Link>
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
