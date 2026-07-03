import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Achats fournisseurs — Admin DDM" }];

const STATUTS: Record<string, { label: string; color: string }> = {
  brouillon:    { label: "Brouillon",     color: "bg-surface-container text-on-surface-variant" },
  confirmee:    { label: "Confirmée",     color: "bg-primary/10 text-primary" },
  en_transit:   { label: "En transit",    color: "bg-blue-100 text-blue-700" },
  dedouanement: { label: "Dédouanement",  color: "bg-yellow-100 text-yellow-700" },
  partielle:    { label: "Partielle",     color: "bg-orange-100 text-orange-700" },
  recue:        { label: "Reçue ✓",       color: "bg-green-100 text-green-700" },
  annulee:      { label: "Annulée",       color: "bg-error-container text-on-error-container" },
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const statut = new URL(request.url).searchParams.get("statut") ?? "";

  let q = `
    SELECT cf.*, COUNT(cfi.id) as nb_items,
      SUM(cfi.quantite_commandee * cfi.prix_unitaire_usd) as total_usd,
      SUM(cfi.quantite_recue) as total_recu,
      SUM(cfi.quantite_commandee) as total_commande
    FROM commandes_fournisseurs cf
    LEFT JOIN commandes_fournisseurs_items cfi ON cfi.commande_id = cf.id
  `;
  if (statut) q += ` WHERE cf.statut = '${statut}'`;
  q += ` GROUP BY cf.id ORDER BY cf.created_at DESC`;

  const { results } = await db.prepare(q).all();
  return json({ commandes: results ?? [], statut });
}

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const f = await request.formData();
  const db = context.cloudflare.env.DB;
  const intent = String(f.get("intent"));

  if (intent === "delete") {
    await db.prepare("DELETE FROM commandes_fournisseurs WHERE id = ?").bind(String(f.get("id"))).run();
  }
  if (intent === "update_statut") {
    await db.prepare("UPDATE commandes_fournisseurs SET statut = ? WHERE id = ?")
      .bind(String(f.get("statut")), String(f.get("id"))).run();
  }
  return json({ ok: true });
}

export default function AdminAchats() {
  const { commandes, statut } = useLoaderData<typeof loader>();
  const filtres = ["", "brouillon", "confirmee", "en_transit", "dedouanement", "partielle", "recue", "annulee"];

  const enAttente = (commandes as any[]).filter(c => ["confirmee", "en_transit", "dedouanement"].includes(c.statut)).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Achats fournisseurs</h1>
          {enAttente > 0 && (
            <p className="text-sm text-on-surface-variant mt-1">
              <span className="text-primary font-semibold">{enAttente}</span> commande{enAttente > 1 ? "s" : ""} en cours de livraison
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a href={`/api/export-csv?type=achats${statut ? `&statut=${statut}` : ""}`}
            className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary border border-outline-variant px-3 py-2 transition-colors">
            <span className="material-symbols-outlined text-base">download</span>
            Exporter CSV
          </a>
          <Link to="/admin/achats/nouveau"
            className="bg-primary text-on-primary px-5 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">add</span>
            Nouvelle commande
          </Link>
        </div>
      </div>

      {/* Filtres statut */}
      <Form method="get" className="flex gap-1 flex-wrap mb-5">
        {filtres.map(s => (
          <button key={s} type="submit" name="statut" value={s}
            className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border transition-colors ${
              statut === s ? "bg-primary text-on-primary border-primary" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
            }`}>
            {s ? (STATUTS[s]?.label ?? s) : "Toutes"}
          </button>
        ))}
      </Form>

      <div className="bg-surface border border-outline-variant/30 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low border-b border-outline-variant/30">
            <tr>
              {["Réf.", "Fournisseur", "Statut", "Produits", "Montant USD", "Date commande", "Livraison prévue", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {(commandes as any[]).map(c => {
              const s = STATUTS[c.statut] ?? STATUTS.brouillon;
              const progression = c.total_commande > 0
                ? Math.round((c.total_recu / c.total_commande) * 100) : 0;
              return (
                <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">{c.ref ?? `CF-${c.id}`}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-on-surface">{c.fournisseur}</p>
                    {c.num_tracking && <p className="text-[10px] text-on-surface-variant font-mono">📦 {c.num_tracking}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-sm ${s.color}`}>
                      {s.label}
                    </span>
                    {c.statut === "partielle" && (
                      <div className="mt-1 w-20 h-1 bg-outline-variant/30">
                        <div className="h-full bg-primary transition-all" style={{ width: `${progression}%` }} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">{c.nb_items ?? 0} article{c.nb_items > 1 ? "s" : ""}</td>
                  <td className="px-4 py-3 font-semibold text-on-surface">
                    {c.total_usd ? `${Number(c.total_usd).toFixed(2)} $` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{c.date_commande ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={c.date_livraison_prevue && new Date(c.date_livraison_prevue) < new Date() && !["recue"].includes(c.statut)
                      ? "text-error font-semibold" : "text-on-surface-variant"}>
                      {c.date_livraison_prevue ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link to={`/admin/achats/${c.id}`}
                        className="text-xs px-3 py-1.5 border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
                        Voir
                      </Link>
                      {c.statut === "brouillon" && (
                        <Form method="post" onSubmit={e => { if (!confirm("Supprimer ?")) e.preventDefault(); }}>
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="text-xs px-3 py-1.5 border border-error/30 text-error hover:bg-error hover:text-on-error transition-colors">
                            Supprimer
                          </button>
                        </Form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {commandes.length === 0 && (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-outline-variant block mb-3">shopping_cart</span>
            <p className="text-on-surface-variant">Aucune commande fournisseur</p>
            <Link to="/admin/achats/nouveau" className="inline-block mt-4 px-5 py-2 bg-primary text-on-primary text-sm font-semibold">
              Créer la première commande
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
