import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";

async function sendStockAlertEmail(apiKey: string, to: string, prenom: string, productName: string, slug: string): Promise<void> {
  const name = prenom ? ` ${prenom}` : "";
  const url = `https://ddmwigs.com/produits/${slug}`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f2ed;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2ed;padding:40px 20px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;max-width:560px;width:100%;">
  <tr><td style="background:#1a1a1a;padding:28px 40px;text-align:center;">
    <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#c9a87c;letter-spacing:3px;">DDM WIGS</p>
    <p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:10px;color:#ffffff80;letter-spacing:4px;text-transform:uppercase;">&amp; More</p>
  </td></tr>
  <tr><td style="padding:36px 40px 24px;text-align:center;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#c9a87c;letter-spacing:3px;text-transform:uppercase;">Alerte stock</p>
    <h1 style="margin:10px 0 16px;font-family:Georgia,serif;font-size:24px;color:#1a1a1a;font-weight:normal;">De retour en boutique !</h1>
    <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#6b5e52;line-height:1.7;">
      Bonjour${name} 🎉<br><br>
      Bonne nouvelle — le produit que vous avez ajouté à vos favoris est de nouveau disponible :
    </p>
  </td></tr>
  <tr><td style="padding:0 40px 28px;">
    <div style="border:2px solid #c9a87c;padding:20px;text-align:center;">
      <p style="margin:0;font-family:Georgia,serif;font-size:18px;color:#1a1a1a;font-weight:bold;">${productName}</p>
    </div>
  </td></tr>
  <tr><td style="padding:0 40px 36px;text-align:center;">
    <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;padding:16px 36px;">
      Voir le produit →
    </a>
    <p style="margin:16px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#9b8b7a;">
      Les stocks sont limités — commandez vite !
    </p>
  </td></tr>
  <tr><td style="background:#f7f2ed;padding:24px 40px;text-align:center;border-top:1px solid #e8ddd4;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#b5a89a;">
      DDM Wigs &amp; More · Vous recevez cet email car vous avez activé les alertes de stock.<br>
      <a href="https://ddmwigs.com/compte/profil" style="color:#c9a87c;text-decoration:none;">Gérer mes préférences</a>
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "DDM Wigs <noreply@ddmwigs.com>",
        to: [to],
        subject: `${productName} est de retour en stock ! 🎉`,
        html,
      }),
    });
  } catch { /* ne pas bloquer le traitement du retour */ }
}

export const meta: MetaFunction = () => [{ title: "Retours clients — Admin DDM" }];

const RAISONS: Record<string, string> = {
  defaut_produit: "Défaut produit", mauvaise_taille: "Mauvaise taille",
  changement_avis: "Changement d'avis", non_conforme: "Non conforme à la description",
  autre: "Autre",
};
const ETATS: Record<string, { label: string; color: string }> = {
  revendable:     { label: "Revendable",     color: "bg-green-100 text-green-700" },
  non_revendable: { label: "Non revendable", color: "bg-error-container text-on-error-container" },
  a_inspecter:    { label: "À inspecter",    color: "bg-yellow-100 text-yellow-700" },
};
const STATUTS: Record<string, { label: string; color: string }> = {
  en_attente: { label: "En attente",   color: "bg-yellow-100 text-yellow-700" },
  approuve:   { label: "Approuvé",     color: "bg-blue-100 text-blue-700" },
  refuse:     { label: "Refusé",       color: "bg-error-container text-on-error-container" },
  traite:     { label: "Traité ✓",     color: "bg-green-100 text-green-700" },
};

export async function loader({ context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const { results: retours } = await db.prepare(`
    SELECT r.*, p.name as p_name FROM retours_clients r
    LEFT JOIN products p ON p.id = r.product_id
    ORDER BY r.created_at DESC
  `).all();
  const { results: products } = await db
    .prepare("SELECT id, name FROM products ORDER BY name").all();
  return json({ retours: retours ?? [], products: products ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const n = (k: string) => { const v = g(k); return v ? Number(v) : null; };
  const db = context.cloudflare.env.DB;
  const intent = g("intent");

  if (intent === "creer") {
    const productId = g("product_id") || null;
    let nomProduit = g("nom_produit");
    if (productId && !nomProduit) {
      const p = await db.prepare("SELECT name FROM products WHERE id = ?").bind(productId).first() as any;
      nomProduit = p?.name ?? "Produit inconnu";
    }
    await db.prepare(`
      INSERT INTO retours_clients (order_ref, product_id, nom_produit, client_nom, client_email, quantite, raison, etat_produit, remboursement_cad, remboursement_methode, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      g("order_ref") || null, productId, nomProduit || "—",
      g("client_nom") || null, g("client_email") || null,
      Number(g("quantite") || 1), g("raison") || null,
      g("etat_produit") || "revendable",
      n("remboursement_cad"), g("remboursement_methode") || "original",
      g("notes") || null
    ).run();
    return json({ ok: true });
  }

  if (intent === "update_statut") {
    const id = g("id");
    const newStatut = g("statut");
    await db.prepare("UPDATE retours_clients SET statut = ? WHERE id = ?")
      .bind(newStatut, id).run();

    // Si approuvé et revendable → remettre en stock + alertes
    if (newStatut === "traite") {
      const retour = await db.prepare("SELECT * FROM retours_clients WHERE id = ?").bind(id).first() as any;
      if (retour?.etat_produit === "revendable" && retour?.product_id) {
        const qte = retour.quantite ?? 1;
        const produit = await db.prepare("SELECT id, name, slug, stock FROM products WHERE id = ?").bind(retour.product_id).first() as any;
        const stockAvant = produit?.stock ?? 0;
        const stockApres = stockAvant + qte;
        await db.prepare("UPDATE products SET stock = ?, updated_at = datetime('now') WHERE id = ?")
          .bind(stockApres, retour.product_id).run();
        await db.prepare(`
          INSERT INTO stock_mouvements (product_id, type, quantite, stock_avant, stock_apres, reference_type, reference_id, notes)
          VALUES (?,?,?,?,?,?,?,?)
        `).bind(retour.product_id, "retour_client", qte, stockAvant, stockApres, "retour", id, `Retour client traité #${id}`).run();

        // Envoyer alertes retour en stock aux clients qui ont ce produit en wishlist
        if (produit && stockAvant === 0) {
          const apiKey = (context.cloudflare.env as any).RESEND_API_KEY as string | undefined;
          if (apiKey) {
            const { results: wishers } = await db.prepare(`
              SELECT c.email, c.first_name, c.last_name
              FROM wishlists w
              JOIN customers c ON c.id = w.customer_id
              WHERE w.product_id = ? AND c.alertes_stock = 1 AND c.email IS NOT NULL
            `).bind(retour.product_id).all<{ email: string; first_name: string | null; last_name: string | null }>();

            for (const wisher of wishers ?? []) {
              const prenom = wisher.first_name ?? wisher.last_name ?? "";
              await sendStockAlertEmail(apiKey, wisher.email, prenom, produit.name, produit.slug);
            }
          }
        }
      }
    }
    return json({ ok: true });
  }

  if (intent === "delete") {
    await db.prepare("DELETE FROM retours_clients WHERE id = ?").bind(g("id")).run();
    return json({ ok: true });
  }

  return json({ ok: false });
}

export default function AdminRetours() {
  const { retours, products } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const [showForm, setShowForm] = useState(false);

  const enAttente = (retours as any[]).filter(r => r.statut === "en_attente").length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Retours clients</h1>
          {enAttente > 0 && (
            <p className="text-sm text-on-surface-variant mt-1">
              <span className="text-error font-semibold">{enAttente}</span> retour{enAttente > 1 ? "s" : ""} en attente de traitement
            </p>
          )}
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-primary text-on-primary px-5 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">{showForm ? "close" : "add"}</span>
          {showForm ? "Fermer" : "Nouveau retour"}
        </button>
      </div>

      {/* Formulaire nouveau retour */}
      {showForm && (
        <div className="bg-surface border border-outline-variant/30 p-6 mb-6">
          <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">assignment_return</span>
            Enregistrer un retour
          </h2>
          <Form method="post" className="grid grid-cols-3 gap-4">
            <input type="hidden" name="intent" value="creer" />
            <div>
              <Label>Réf. commande</Label>
              <input name="order_ref" placeholder="ORD-2024-001" className={inp} />
            </div>
            <div>
              <Label>Client — Nom</Label>
              <input name="client_nom" placeholder="Nom du client" className={inp} />
            </div>
            <div>
              <Label>Client — Email</Label>
              <input name="client_email" type="email" placeholder="email@exemple.com" className={inp} />
            </div>
            <div>
              <Label>Produit retourné</Label>
              <select name="product_id" className={inp}>
                <option value="">— Choisir —</option>
                {(products as any[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Quantité</Label>
              <input name="quantite" type="number" min="1" defaultValue={1} className={inp} />
            </div>
            <div>
              <Label>Raison</Label>
              <select name="raison" className={inp}>
                {Object.entries(RAISONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <Label>État du produit</Label>
              <select name="etat_produit" className={inp}>
                <option value="revendable">Revendable</option>
                <option value="a_inspecter">À inspecter</option>
                <option value="non_revendable">Non revendable</option>
              </select>
            </div>
            <div>
              <Label>Remboursement CAD</Label>
              <input name="remboursement_cad" type="number" step="0.01" min="0" className={inp} />
            </div>
            <div>
              <Label>Méthode remboursement</Label>
              <select name="remboursement_methode" className={inp}>
                <option value="original">Méthode originale</option>
                <option value="credit_boutique">Crédit boutique</option>
                <option value="aucun">Aucun remboursement</option>
              </select>
            </div>
            <div className="col-span-3">
              <Label>Notes internes</Label>
              <textarea name="notes" rows={2} className={`${inp} resize-none`} />
            </div>
            <div className="col-span-3 flex gap-3">
              <button type="submit" disabled={nav.state === "submitting"}
                className="bg-primary text-on-primary px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90">
                {nav.state === "submitting" ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Table retours */}
      <div className="bg-surface border border-outline-variant/30 overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-surface-container-low border-b border-outline-variant/30">
            <tr>
              {["Date", "Client", "Produit", "Qté", "Raison", "État produit", "Remboursement", "Statut", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {(retours as any[]).map(r => {
              const etat = ETATS[r.etat_produit] ?? ETATS.a_inspecter;
              const statut = STATUTS[r.statut] ?? STATUTS.en_attente;
              return (
                <tr key={r.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{r.created_at?.split("T")[0]}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-on-surface">{r.client_nom ?? "—"}</p>
                    {r.order_ref && <p className="text-[10px] text-on-surface-variant font-mono">{r.order_ref}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-on-surface">{r.p_name ?? r.nom_produit}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-center">{r.quantite}</td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{RAISONS[r.raison] ?? r.raison ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm ${etat.color}`}>{etat.label}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.remboursement_cad ? (
                      <div>
                        <p className="font-semibold text-primary">{Number(r.remboursement_cad).toFixed(2)} $</p>
                        <p className="text-[10px] text-on-surface-variant">{r.remboursement_methode}</p>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm ${statut.color}`}>{statut.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {r.statut === "en_attente" && (
                        <div className="flex gap-1">
                          <Form method="post">
                            <input type="hidden" name="intent" value="update_statut" />
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="statut" value="approuve" />
                            <button type="submit" className="text-[10px] px-2 py-1 bg-primary text-on-primary font-semibold hover:opacity-80">
                              Approuver
                            </button>
                          </Form>
                          <Form method="post">
                            <input type="hidden" name="intent" value="update_statut" />
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="statut" value="refuse" />
                            <button type="submit" className="text-[10px] px-2 py-1 border border-error/30 text-error hover:bg-error hover:text-on-error">
                              Refuser
                            </button>
                          </Form>
                        </div>
                      )}
                      {r.statut === "approuve" && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="update_statut" />
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="statut" value="traite" />
                          <button type="submit" className="text-[10px] px-2 py-1 bg-secondary text-on-secondary font-semibold hover:opacity-80 flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-xs">check</span>
                            Traiter
                          </button>
                        </Form>
                      )}
                      <Form method="post" onSubmit={e => { if (!confirm("Supprimer ?")) e.preventDefault(); }}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-[10px] text-on-surface-variant hover:text-error transition-colors">Supprimer</button>
                      </Form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {retours.length === 0 && (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-outline-variant block mb-3">assignment_return</span>
            <p className="text-on-surface-variant text-sm">Aucun retour enregistré.</p>
          </div>
        )}
      </div>
    </div>
  );
}

const inp = "w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary";
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">{children}</label>;
}
