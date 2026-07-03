import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Commande fournisseur — Admin DDM" }];

const STATUTS = ["brouillon", "confirmee", "en_transit", "dedouanement", "partielle", "recue", "annulee"];
const STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon", confirmee: "Confirmée", en_transit: "En transit",
  dedouanement: "Dédouanement", partielle: "Partiellement reçue",
  recue: "Reçue complète", annulee: "Annulée",
};

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const commande = await db
    .prepare("SELECT * FROM commandes_fournisseurs WHERE id = ?")
    .bind(params.id).first();
  if (!commande) throw new Response("Commande introuvable", { status: 404 });

  const { results: items } = await db
    .prepare(`
      SELECT cfi.*, p.stock as stock_actuel, p.prix_achat_usd as cout_actuel
      FROM commandes_fournisseurs_items cfi
      LEFT JOIN products p ON p.id = cfi.product_id
      WHERE cfi.commande_id = ?
    `).bind(params.id).all();

  const { results: mouvements } = await db
    .prepare(`
      SELECT sm.*, p.name as product_name
      FROM stock_mouvements sm
      LEFT JOIN products p ON p.id = sm.product_id
      WHERE sm.reference_type = 'commande_fournisseur' AND sm.reference_id = ?
      ORDER BY sm.created_at DESC
    `).bind(params.id).all();

  return json({ commande, items: items ?? [], mouvements: mouvements ?? [] });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const n = (k: string) => { const v = g(k); return v ? Number(v) : null; };
  const db = context.cloudflare.env.DB;
  const intent = g("intent");

  if (intent === "update_infos") {
    await db.prepare(`
      UPDATE commandes_fournisseurs SET
        statut=?, date_livraison_prevue=?, date_livraison_reelle=?,
        num_tracking=?, frais_expedition_usd=?, frais_douane_cad=?, taux_change=?, notes=?
      WHERE id=?
    `).bind(
      g("statut"), g("date_livraison_prevue") || null, g("date_livraison_reelle") || null,
      g("num_tracking") || null,
      n("frais_expedition_usd") ?? 0, n("frais_douane_cad") ?? 0, n("taux_change") ?? 1.38,
      g("notes") || null, params.id
    ).run();
    return json({ ok: true, msg: "Informations mises à jour." });
  }

  if (intent === "recevoir") {
    const commande = await db
      .prepare("SELECT * FROM commandes_fournisseurs WHERE id = ?")
      .bind(params.id).first() as any;
    const taux = commande?.taux_change ?? 1.38;
    const fraisDouane = commande?.frais_douane_cad ?? 0;

    const itemIds = f.getAll("item_id[]");
    let totalRecu = 0, totalCommande = 0;

    for (let i = 0; i < itemIds.length; i++) {
      const itemId = String(itemIds[i]);
      const qteRecue = Number(f.getAll("qte_recue[]")[i] ?? 0);

      const item = await db
        .prepare("SELECT * FROM commandes_fournisseurs_items WHERE id = ?")
        .bind(itemId).first() as any;
      if (!item || !qteRecue) continue;

      const delta = qteRecue - (item.quantite_recue ?? 0);
      if (delta <= 0) { totalCommande += item.quantite_commandee; totalRecu += qteRecue; continue; }

      // Mettre à jour item
      await db.prepare("UPDATE commandes_fournisseurs_items SET quantite_recue = ? WHERE id = ?")
        .bind(qteRecue, itemId).run();

      if (item.product_id) {
        // Calculer le coût unitaire réel
        const fraisExpParItem = (commande?.frais_expedition_usd ?? 0) / itemIds.length * taux;
        const fraisDouaneParItem = fraisDouane / itemIds.length;
        const coutUnitaireCAD = item.prix_unitaire_usd * taux + fraisExpParItem + fraisDouaneParItem;

        // Récupérer stock actuel
        const produit = await db
          .prepare("SELECT stock, prix_achat_usd FROM products WHERE id = ?")
          .bind(item.product_id).first() as any;
        const stockAvant = produit?.stock ?? 0;
        const stockApres = stockAvant + delta;

        // CMUP: nouveau coût moyen
        const ancienCout = (produit?.prix_achat_usd ?? item.prix_unitaire_usd) * taux;
        const nouveauCout = stockApres > 0
          ? (stockAvant * ancienCout + delta * coutUnitaireCAD) / stockApres
          : coutUnitaireCAD;

        // Mettre à jour stock + prix_achat
        await db.prepare(`
          UPDATE products SET stock = ?, prix_achat_usd = ?, updated_at = datetime('now') WHERE id = ?
        `).bind(stockApres, nouveauCout / taux, item.product_id).run();

        // Enregistrer le mouvement
        await db.prepare(`
          INSERT INTO stock_mouvements (product_id, type, quantite, stock_avant, stock_apres, cout_unitaire_cad, reference_type, reference_id, notes)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).bind(
          item.product_id, "reception", delta, stockAvant, stockApres,
          coutUnitaireCAD, "commande_fournisseur", params.id,
          `Réception commande ${commande?.ref ?? params.id}`
        ).run();
      }

      totalRecu += qteRecue;
      totalCommande += item.quantite_commandee;
    }

    // Mettre à jour statut commande
    const newStatut = totalRecu >= totalCommande ? "recue"
      : totalRecu > 0 ? "partielle"
      : commande?.statut;
    await db.prepare("UPDATE commandes_fournisseurs SET statut = ?, date_livraison_reelle = COALESCE(date_livraison_reelle, date('now')) WHERE id = ?")
      .bind(newStatut, params.id).run();

    return json({ ok: true, msg: `Réception enregistrée. Statut : ${STATUT_LABELS[newStatut] ?? newStatut}` });
  }

  return json({ ok: false });
}

export default function AchatDetail() {
  const { commande: c, items, mouvements } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const co = c as any;

  const totalUSD = (items as any[]).reduce((s, i) => s + i.quantite_commandee * i.prix_unitaire_usd, 0);
  const totalRecuPct = (items as any[]).length > 0
    ? Math.round(((items as any[]).reduce((s, i) => s + (i.quantite_recue ?? 0), 0) /
        (items as any[]).reduce((s, i) => s + i.quantite_commandee, 0)) * 100)
    : 0;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin/achats" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">
            {co.ref ?? `CF-${co.id}`} — {co.fournisseur}
          </h1>
          <p className="text-sm text-on-surface-variant">Créée le {co.created_at?.split("T")[0]}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Infos & statut */}
        <Form method="post" className="bg-surface border border-outline-variant/30 p-5 space-y-4">
          <input type="hidden" name="intent" value="update_infos" />
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-base text-primary">info</span>
            <h2 className="font-semibold text-on-surface">Statut & informations</h2>
          </div>
          <div>
            <Label>Statut</Label>
            <select name="statut" defaultValue={co.statut} className={inp}>
              {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <Label>Numéro de tracking</Label>
            <input name="num_tracking" defaultValue={co.num_tracking ?? ""} placeholder="Ex: DHL-123456789" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Livraison prévue</Label>
              <input name="date_livraison_prevue" type="date" defaultValue={co.date_livraison_prevue ?? ""} className={inp} />
            </div>
            <div>
              <Label>Reçue le</Label>
              <input name="date_livraison_reelle" type="date" defaultValue={co.date_livraison_reelle ?? ""} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Expéd. USD</Label>
              <input name="frais_expedition_usd" type="number" step="0.01" defaultValue={co.frais_expedition_usd ?? 0} className={inp} />
            </div>
            <div>
              <Label>Douane CAD</Label>
              <input name="frais_douane_cad" type="number" step="0.01" defaultValue={co.frais_douane_cad ?? 0} className={inp} />
            </div>
            <div>
              <Label>Taux USD/CAD</Label>
              <input name="taux_change" type="number" step="0.001" defaultValue={co.taux_change ?? 1.38} className={inp} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <textarea name="notes" defaultValue={co.notes ?? ""} rows={2} className={`${inp} resize-none`} />
          </div>
          <button type="submit" disabled={nav.state === "submitting"}
            className="w-full bg-primary text-on-primary py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90">
            {nav.state === "submitting" ? "Enregistrement…" : "Mettre à jour"}
          </button>
        </Form>

        {/* Résumé financier */}
        <div className="bg-surface border border-outline-variant/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-base text-primary">payments</span>
            <h2 className="font-semibold text-on-surface">Résumé financier</h2>
          </div>
          <div className="space-y-3">
            <Row label="Articles (USD)" value={`${totalUSD.toFixed(2)} $`} />
            <Row label="Frais d'expédition" value={`${(co.frais_expedition_usd ?? 0).toFixed(2)} $ USD`} />
            <Row label="Total USD" value={`${(totalUSD + (co.frais_expedition_usd ?? 0)).toFixed(2)} $`} bold />
            <div className="border-t border-outline-variant pt-3">
              <Row label={`Taux (${co.taux_change ?? 1.38} CAD/USD)`} value="" />
              <Row label="Sous-total CAD" value={`${((totalUSD + (co.frais_expedition_usd ?? 0)) * (co.taux_change ?? 1.38)).toFixed(2)} $`} />
              <Row label="Douanes CAD" value={`${(co.frais_douane_cad ?? 0).toFixed(2)} $`} />
              <Row label="Coût total CAD" value={`${((totalUSD + (co.frais_expedition_usd ?? 0)) * (co.taux_change ?? 1.38) + (co.frais_douane_cad ?? 0)).toFixed(2)} $`} bold accent />
            </div>
            <div className="border-t border-outline-variant pt-3">
              <p className="text-xs text-on-surface-variant mb-1">Réception globale</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-outline-variant/30">
                  <div className="h-full bg-primary" style={{ width: `${totalRecuPct}%` }} />
                </div>
                <span className="text-sm font-bold text-primary">{totalRecuPct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Articles + Réception */}
      <div className="bg-surface border border-outline-variant/30 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-base text-primary">inventory_2</span>
          <h2 className="font-semibold text-on-surface">Articles commandés</h2>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="recevoir" />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/30">
                {["Produit", "Réf. fourn.", "Prix unit. USD", "Commandé", "Reçu", "À recevoir", "Stock actuel"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {(items as any[]).map(item => {
                const reste = item.quantite_commandee - (item.quantite_recue ?? 0);
                return (
                  <tr key={item.id} className={reste > 0 ? "" : "opacity-50"}>
                    <td className="px-3 py-3">
                      <input type="hidden" name="item_id[]" value={item.id} />
                      <p className="font-medium text-on-surface text-xs">{item.nom_produit}</p>
                    </td>
                    <td className="px-3 py-3 text-xs text-on-surface-variant font-mono">{item.ref_fournisseur ?? "—"}</td>
                    <td className="px-3 py-3 text-xs font-semibold">{Number(item.prix_unitaire_usd).toFixed(2)} $</td>
                    <td className="px-3 py-3 text-xs text-center">{item.quantite_commandee}</td>
                    <td className="px-3 py-3 text-xs text-center text-secondary font-semibold">{item.quantite_recue ?? 0}</td>
                    <td className="px-3 py-3">
                      <input type="number" name="qte_recue[]" min={item.quantite_recue ?? 0}
                        max={item.quantite_commandee} defaultValue={item.quantite_recue ?? 0}
                        className="w-16 border border-outline-variant bg-surface px-2 py-1 text-xs text-center focus:outline-none focus:border-primary" />
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {item.stock_actuel !== null ? (
                        <span className={item.stock_actuel === 0 ? "text-error font-bold" : "text-secondary"}>
                          {item.stock_actuel}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {co.statut !== "recue" && co.statut !== "annulee" && (
            <div className="mt-4">
              <button type="submit" disabled={nav.state === "submitting"}
                className="bg-secondary text-on-secondary px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">move_to_inbox</span>
                {nav.state === "submitting" ? "Réception en cours…" : "Valider la réception"}
              </button>
            </div>
          )}
        </Form>
      </div>

      {/* Historique mouvements */}
      {(mouvements as any[]).length > 0 && (
        <div className="bg-surface border border-outline-variant/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-base text-primary">history</span>
            <h2 className="font-semibold text-on-surface">Mouvements de stock générés</h2>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-outline-variant/30">
                {["Date", "Produit", "Qté reçue", "Stock avant", "Stock après", "Coût unit. CAD"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {(mouvements as any[]).map(m => (
                <tr key={m.id}>
                  <td className="px-3 py-2 text-on-surface-variant">{m.created_at?.split("T")[0]}</td>
                  <td className="px-3 py-2 font-medium text-on-surface">{m.product_name}</td>
                  <td className="px-3 py-2 text-secondary font-semibold">+{m.quantite}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{m.stock_avant}</td>
                  <td className="px-3 py-2 text-on-surface">{m.stock_apres}</td>
                  <td className="px-3 py-2">{m.cout_unitaire_cad ? `${Number(m.cout_unitaire_cad).toFixed(2)} $` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inp = "w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">{children}</label>;
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-on-surface-variant">{label}</span>
      <span className={`text-sm ${bold ? "font-bold" : ""} ${accent ? "text-primary" : "text-on-surface"}`}>{value}</span>
    </div>
  );
}
