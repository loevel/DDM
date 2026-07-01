import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Analytique — Admin DDM" }];

const TAUX = 1.38;

export async function loader({ context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;

  const { results: products } = await db.prepare(`
    SELECT p.*,
      f.nom as fournisseur_nom,
      COALESCE((SELECT SUM(sm.quantite) FROM stock_mouvements sm WHERE sm.product_id = p.id AND sm.type = 'vente'), 0) as total_vendu,
      COALESCE((SELECT SUM(sm.quantite * sm.cout_unitaire_cad) FROM stock_mouvements sm WHERE sm.product_id = p.id AND sm.type = 'reception'), 0) as total_cout_achats
    FROM products p
    LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
    ORDER BY p.name
  `).all();

  const { results: commandesFournisseurs } = await db.prepare(`
    SELECT cf.*,
      COALESCE((SELECT SUM(cfi.quantite_commandee * cfi.prix_unitaire_usd) FROM commandes_fournisseurs_items cfi WHERE cfi.commande_id = cf.id), 0) as montant_articles_usd
    FROM commandes_fournisseurs cf
    ORDER BY cf.created_at DESC LIMIT 20
  `).all();

  const { results: retours } = await db.prepare(`
    SELECT * FROM retours_clients ORDER BY created_at DESC
  `).all();

  const { results: mouvementsRecents } = await db.prepare(`
    SELECT sm.*, p.name as product_name
    FROM stock_mouvements sm
    LEFT JOIN products p ON p.id = sm.product_id
    ORDER BY sm.created_at DESC LIMIT 50
  `).all();

  // Ventes réelles depuis les commandes payées
  const statsCommandes = await db.prepare(`
    SELECT
      COUNT(*) as nb_commandes,
      COALESCE(SUM(total_cad), 0) as ca_total,
      COALESCE(SUM(CASE WHEN created_at >= date('now', '-30 days') THEN total_cad ELSE 0 END), 0) as ca_30j,
      COALESCE(SUM(CASE WHEN created_at >= date('now', '-7 days') THEN total_cad ELSE 0 END), 0) as ca_7j,
      COUNT(CASE WHEN created_at >= date('now', '-30 days') THEN 1 END) as commandes_30j
    FROM orders WHERE payment_status = 'paid'
  `).first();

  const { results: topProduits } = await db.prepare(`
    SELECT oi.product_name, oi.product_id,
      SUM(oi.quantity) as qte_vendue,
      SUM(oi.quantity * oi.unit_price_cad) as ca_produit
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_status = 'paid'
    GROUP BY oi.product_id, oi.product_name
    ORDER BY qte_vendue DESC LIMIT 10
  `).all();

  return json({
    products: products ?? [],
    commandesFournisseurs: commandesFournisseurs ?? [],
    retours: retours ?? [],
    mouvementsRecents: mouvementsRecents ?? [],
    statsCommandes: statsCommandes ?? { nb_commandes: 0, ca_total: 0, ca_30j: 0, ca_7j: 0, commandes_30j: 0 },
    topProduits: topProduits ?? [],
  });
}

export default function AdminAnalytique() {
  const { products, commandesFournisseurs, retours, mouvementsRecents, statsCommandes, topProduits } = useLoaderData<typeof loader>();
  const ps = products as any[];
  const cfs = commandesFournisseurs as any[];
  const rets = retours as any[];
  const mvts = mouvementsRecents as any[];

  // --- KPIs globaux ---
  const valeurStockCout = ps.reduce((s, p) => s + p.stock * (p.prix_achat_usd ?? 0) * TAUX, 0);
  const valeurStockVente = ps.reduce((s, p) => s + p.stock * p.price_cad, 0);
  const margeTheorique = valeurStockVente - valeurStockCout;
  const margePct = valeurStockVente > 0 ? (margeTheorique / valeurStockVente) * 100 : 0;

  const totalVendu = ps.reduce((s, p) => s + (p.total_vendu ?? 0), 0);
  const totalAchatsCAD = cfs
    .filter(c => c.statut !== "annulee")
    .reduce((s, c) => s + ((c.montant_articles_usd ?? 0) + (c.frais_expedition_usd ?? 0)) * (c.taux_change ?? TAUX) + (c.frais_douane_cad ?? 0), 0);

  const ruptures = ps.filter(p => p.stock === 0).length;
  const alertes = ps.filter(p => p.stock > 0 && p.stock <= (p.seuil_alerte_stock ?? 3)).length;
  const tauxRetour = totalVendu > 0 ? (rets.length / totalVendu) * 100 : 0;

  // --- Analyse ABC (basée sur valeur de vente × stock) ---
  const withValue = ps.map(p => ({
    ...p,
    valeurVente: p.stock * p.price_cad,
    totalVentes: Math.abs(p.total_vendu ?? 0),
  })).sort((a, b) => b.totalVentes - a.totalVentes);

  const totalVentesAll = withValue.reduce((s, p) => s + p.totalVentes, 0) || 1;
  let cumul = 0;
  const abc = withValue.map(p => {
    cumul += p.totalVentes;
    const pct = (cumul / totalVentesAll) * 100;
    return { ...p, abc: pct <= 70 ? "A" : pct <= 90 ? "B" : "C" };
  });

  const aCount = abc.filter(p => p.abc === "A").length;
  const bCount = abc.filter(p => p.abc === "B").length;
  const cCount = abc.filter(p => p.abc === "C").length;

  // --- Suggestions de réapprovisionnement ---
  const reappros = abc.filter(p =>
    (p.abc === "A" || p.abc === "B") &&
    p.stock <= (p.seuil_alerte_stock ?? 3)
  );

  // --- Rotation de stock ---
  const rotation = ps
    .map(p => ({
      ...p,
      rotation: p.stock > 0 && p.total_vendu > 0 ? (p.total_vendu / (p.stock + p.total_vendu)) * 100 : 0,
    }))
    .sort((a, b) => b.rotation - a.rotation)
    .slice(0, 10);

  // --- Top ventes par fournisseur ---
  const parFournisseur: Record<string, { vendu: number; valeur: number; count: number }> = {};
  ps.forEach(p => {
    const f = p.fournisseur_nom ?? p.fournisseur ?? "Inconnu";
    if (!parFournisseur[f]) parFournisseur[f] = { vendu: 0, valeur: 0, count: 0 };
    parFournisseur[f].vendu += p.total_vendu ?? 0;
    parFournisseur[f].valeur += p.stock * p.price_cad;
    parFournisseur[f].count++;
  });
  const fournisseurs = Object.entries(parFournisseur).sort((a, b) => b[1].vendu - a[1].vendu);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Analytique & prévisions</h1>
        <p className="text-xs text-on-surface-variant">Taux USD/CAD indicatif: {TAUX}</p>
      </div>

      {/* Ventes réelles (commandes Stripe payées) */}
      <div className="bg-primary/5 border border-primary/20 p-5">
        <h2 className="font-semibold text-on-surface mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">payments</span>
          Ventes réelles — commandes payées
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <KpiCard icon="storefront" label="CA total" value={`${Number((statsCommandes as any).ca_total).toFixed(0)} $`} sub="depuis le début" accent />
          <KpiCard icon="calendar_month" label="CA 30 derniers jours" value={`${Number((statsCommandes as any).ca_30j).toFixed(0)} $`} accent />
          <KpiCard icon="calendar_today" label="CA 7 derniers jours" value={`${Number((statsCommandes as any).ca_7j).toFixed(0)} $`} />
          <KpiCard icon="receipt_long" label="Commandes payées" value={String((statsCommandes as any).nb_commandes)} sub={`dont ${(statsCommandes as any).commandes_30j} ce mois`} />
        </div>
        {(topProduits as any[]).length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Top produits vendus</p>
            <div className="grid grid-cols-2 gap-2">
              {(topProduits as any[]).map((p, i) => (
                <div key={p.product_id ?? i} className="flex items-center justify-between bg-surface px-3 py-2 border border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary w-4">{i + 1}</span>
                    <p className="text-xs text-on-surface truncate max-w-[160px]">{p.product_name ?? `Produit #${p.product_id}`}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-on-surface">{Number(p.ca_produit).toFixed(0)} $</p>
                    <p className="text-[10px] text-on-surface-variant">{p.qte_vendue} unité{p.qte_vendue > 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {(topProduits as any[]).length === 0 && (
          <p className="text-xs text-on-surface-variant mt-3">Aucune commande payée pour l'instant. Les données apparaîtront ici dès la première vente confirmée par Stripe.</p>
        )}
      </div>

      {/* KPIs stock */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard icon="inventory_2" label="Valeur stock (coût)" value={`${valeurStockCout.toFixed(0)} $`} sub="CAD" />
        <KpiCard icon="sell" label="Valeur stock (vente)" value={`${valeurStockVente.toFixed(0)} $`} sub="CAD" accent />
        <KpiCard icon="trending_up" label="Marge brute potentielle" value={`${margeTheorique.toFixed(0)} $`}
          sub={`${margePct.toFixed(1)}% marge`} accent={margePct >= 40} warn={margePct < 20} />
        <KpiCard icon="receipt_long" label="Total achats fournisseurs" value={`${totalAchatsCAD.toFixed(0)} $`} sub="CAD cumulé" />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard icon="shopping_cart" label="Unités vendues (hist.)" value={totalVendu.toString()} sub="via mouvements" />
        <KpiCard icon="block" label="Ruptures de stock" value={ruptures.toString()} danger={ruptures > 0} />
        <KpiCard icon="warning" label="Alertes stock faible" value={alertes.toString()} warn={alertes > 0} />
        <KpiCard icon="assignment_return" label="Taux de retour" value={`${tauxRetour.toFixed(1)}%`}
          sub={`${rets.length} retour${rets.length > 1 ? "s" : ""}`} warn={tauxRetour > 5} />
      </div>

      {/* Réapprovisionnements urgents */}
      {reappros.length > 0 && (
        <div className="bg-surface border border-error/20 p-5">
          <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-lg">notification_important</span>
            Réapprovisionnements urgents — Produits A/B en alerte
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {reappros.map(p => (
              <div key={p.id} className="p-3 border border-outline-variant/30 bg-surface-container-low flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-on-surface">{p.name}</p>
                  <p className="text-[10px] text-on-surface-variant">
                    Classe <span className={p.abc === "A" ? "text-error font-bold" : "text-yellow-600 font-bold"}>{p.abc}</span>
                    {" · "}Stock: <span className={p.stock === 0 ? "text-error font-bold" : "text-yellow-600 font-bold"}>{p.stock}</span>
                    {(p.fournisseur_nom || p.fournisseur) && ` · ${p.fournisseur_nom ?? p.fournisseur}`}
                  </p>
                </div>
                <Link to="/admin/achats/nouveau" className="text-[10px] px-2 py-1 bg-primary text-on-primary font-semibold whitespace-nowrap hover:opacity-80">
                  Commander
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Analyse ABC */}
        <div className="bg-surface border border-outline-variant/30 p-5">
          <h2 className="font-semibold text-on-surface mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">analytics</span>
            Analyse ABC — Pareto des ventes
          </h2>
          <p className="text-xs text-on-surface-variant mb-4">A = 70% du CA · B = 20% · C = 10%</p>
          <div className="flex gap-3 mb-4">
            <AbcBadge classe="A" count={aCount} desc="Produits phares" color="bg-primary text-on-primary" />
            <AbcBadge classe="B" count={bCount} desc="Produits secondaires" color="bg-yellow-100 text-yellow-800" />
            <AbcBadge classe="C" count={cCount} desc="Produits marginaux" color="bg-surface-container text-on-surface-variant" />
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {abc.slice(0, 20).map(p => (
              <div key={p.id} className="flex items-center gap-3 py-1.5 border-b border-outline-variant/10">
                <span className={`text-[10px] font-bold w-5 text-center ${
                  p.abc === "A" ? "text-primary" : p.abc === "B" ? "text-yellow-700" : "text-on-surface-variant"
                }`}>{p.abc}</span>
                <p className="text-xs text-on-surface flex-1 truncate">{p.name}</p>
                <span className="text-xs text-on-surface-variant">{p.totalVentes} ventes</span>
                <span className="text-xs font-semibold text-primary">{p.price_cad} $</span>
                <span className={`text-xs ${p.stock === 0 ? "text-error font-bold" : "text-secondary"}`}>
                  {p.stock} en stock
                </span>
              </div>
            ))}
            {abc.length > 20 && (
              <p className="text-xs text-center text-on-surface-variant pt-2">+{abc.length - 20} autres produits</p>
            )}
          </div>
        </div>

        {/* Rotation + Top fournisseurs */}
        <div className="space-y-6">
          <div className="bg-surface border border-outline-variant/30 p-5">
            <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">sync</span>
              Top 10 — Rotation de stock
            </h2>
            <div className="space-y-1.5">
              {rotation.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <p className="text-xs text-on-surface flex-1 truncate">{p.name}</p>
                  <div className="w-24 h-1.5 bg-outline-variant/30">
                    <div className="h-full bg-secondary" style={{ width: `${Math.min(100, p.rotation)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-secondary w-12 text-right">{p.rotation.toFixed(0)}%</span>
                </div>
              ))}
              {rotation.length === 0 && <p className="text-xs text-on-surface-variant">Aucune donnée de vente disponible.</p>}
            </div>
          </div>

          <div className="bg-surface border border-outline-variant/30 p-5">
            <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">factory</span>
              Performance par fournisseur
            </h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-outline-variant/30">
                  {["Fournisseur", "Produits", "Vendu", "Val. stock"].map(h => (
                    <th key={h} className="text-left pb-2 text-[10px] font-semibold text-on-surface-variant uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {fournisseurs.slice(0, 8).map(([f, data]) => (
                  <tr key={f}>
                    <td className="py-1.5 font-medium text-on-surface">{f}</td>
                    <td className="py-1.5 text-on-surface-variant">{data.count}</td>
                    <td className="py-1.5 text-secondary font-semibold">{data.vendu}</td>
                    <td className="py-1.5 text-primary font-semibold">{data.valeur.toFixed(0)} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fournisseurs.length === 0 && <p className="text-xs text-on-surface-variant">Aucun fournisseur renseigné.</p>}
          </div>
        </div>
      </div>

      {/* Commandes fournisseurs récentes */}
      <div className="bg-surface border border-outline-variant/30 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">shopping_bag</span>
            Dernières commandes fournisseurs
          </h2>
          <Link to="/admin/achats" className="text-xs text-primary hover:underline">Gérer →</Link>
        </div>
        {cfs.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-8">Aucune commande fournisseur.</p>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {cfs.slice(0, 5).map(c => {
              const STATUT_COLORS: Record<string, string> = {
                brouillon: "bg-surface-container text-on-surface-variant",
                confirmee: "bg-blue-100 text-blue-700",
                en_transit: "bg-yellow-100 text-yellow-700",
                dedouanement: "bg-orange-100 text-orange-700",
                recue: "bg-green-100 text-green-700",
                partielle: "bg-purple-100 text-purple-700",
                annulee: "bg-error-container text-on-error-container",
              };
              return (
                <Link key={c.id} to={`/admin/achats/${c.id}`}
                  className="p-3 border border-outline-variant/30 hover:border-primary transition-colors">
                  <p className="text-xs font-semibold text-on-surface mb-1">{c.ref ?? `CF-${c.id}`}</p>
                  <p className="text-[10px] text-on-surface-variant mb-2">{c.fournisseur}</p>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 ${STATUT_COLORS[c.statut] ?? "bg-surface-container text-on-surface"}`}>
                    {c.statut}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Retours récents */}
      {rets.length > 0 && (
        <div className="bg-surface border border-outline-variant/30 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">assignment_return</span>
              Retours récents
            </h2>
            <Link to="/admin/retours" className="text-xs text-primary hover:underline">Gérer →</Link>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="p-3 border border-outline-variant/30 text-center">
              <p className="text-2xl font-bold text-on-surface">{rets.filter(r => r.statut === "en_attente").length}</p>
              <p className="text-xs text-on-surface-variant">En attente</p>
            </div>
            <div className="p-3 border border-outline-variant/30 text-center">
              <p className="text-2xl font-bold text-secondary">{rets.filter(r => r.statut === "traite").length}</p>
              <p className="text-xs text-on-surface-variant">Traités</p>
            </div>
            <div className="p-3 border border-outline-variant/30 text-center">
              <p className="text-2xl font-bold text-error">{rets.filter(r => r.etat_produit === "non_revendable").length}</p>
              <p className="text-xs text-on-surface-variant">Non revendables</p>
            </div>
            <div className="p-3 border border-outline-variant/30 text-center">
              <p className="text-2xl font-bold text-primary">
                {rets.reduce((s, r) => s + (r.remboursement_cad ?? 0), 0).toFixed(0)} $
              </p>
              <p className="text-xs text-on-surface-variant">Remboursé CAD</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent, danger, warn }: {
  icon: string; label: string; value: string; sub?: string; accent?: boolean; danger?: boolean; warn?: boolean;
}) {
  return (
    <div className={`p-4 border ${danger ? "border-error/30 bg-error-container/10" : warn ? "border-yellow-400/30 bg-yellow-50" : "border-outline-variant/30 bg-surface"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`material-symbols-outlined text-lg ${danger ? "text-error" : warn ? "text-yellow-600" : "text-primary"}`}>{icon}</span>
        <p className="text-xs text-on-surface-variant uppercase tracking-wider leading-tight">{label}</p>
      </div>
      <p className={`text-xl font-bold ${danger ? "text-error" : warn ? "text-yellow-700" : accent ? "text-primary" : "text-on-surface"}`}>{value}</p>
      {sub && <p className="text-[10px] text-on-surface-variant mt-0.5">{sub}</p>}
    </div>
  );
}

function AbcBadge({ classe, count, desc, color }: { classe: string; count: number; desc: string; color: string }) {
  return (
    <div className={`flex-1 p-3 text-center ${color}`}>
      <p className="text-xl font-bold">{classe}</p>
      <p className="text-lg font-semibold">{count}</p>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{desc}</p>
    </div>
  );
}
