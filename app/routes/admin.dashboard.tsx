import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Dashboard — Admin DDM" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const today = new Date().toISOString().slice(0, 10);

  const [orderStats, todayOrders, recentOrders, lowStock, topCustomers, revenueChart] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status != 'cancelled' THEN total_cad ELSE 0 END) as revenue,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped
      FROM orders
    `).first<{ total: number; revenue: number; pending: number; confirmed: number; shipped: number }>(),

    db.prepare(`SELECT COUNT(*) as count, SUM(total_cad) as total FROM orders WHERE date(created_at) = ?`)
      .bind(today).first<{ count: number; total: number }>(),

    db.prepare(`SELECT reference, customer_name, total_cad, status, type, created_at FROM orders ORDER BY created_at DESC LIMIT 8`)
      .all<{ reference: string; customer_name: string; total_cad: number; status: string; type: string; created_at: string }>(),

    db.prepare(`SELECT id, name, stock, category FROM products WHERE stock <= 2 ORDER BY stock ASC LIMIT 5`)
      .all<{ id: number; name: string; stock: number; category: string }>(),

    db.prepare(`SELECT customer_email, customer_name, COUNT(*) as orders, SUM(total_cad) as spent FROM orders WHERE status != 'cancelled' GROUP BY customer_email ORDER BY spent DESC LIMIT 5`)
      .all<{ customer_email: string; customer_name: string; orders: number; spent: number }>(),
    db.prepare(`SELECT date(created_at) as day, SUM(CASE WHEN status != 'cancelled' THEN total_cad ELSE 0 END) as revenue, COUNT(*) as orders FROM orders WHERE created_at >= datetime('now', '-30 days') GROUP BY date(created_at) ORDER BY day ASC`)
      .all<{ day: string; revenue: number; orders: number }>(),
  ]);

  return json({ orderStats, todayOrders, recentOrders: recentOrders.results, lowStock: lowStock.results, topCustomers: topCustomers.results, revenueChart: revenueChart.results ?? [] });
}

const STATUS_COLOR: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  shipped:   "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};
const STATUS_FR: Record<string, string> = {
  pending: "Attente", confirmed: "Confirmée", shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée",
};

function RevenueChart({ data }: { data: { day: string; revenue: number; orders: number }[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-on-surface-variant text-sm">
        <span className="material-symbols-outlined mr-2 opacity-40">bar_chart</span>
        Aucune donnée sur les 30 derniers jours
      </div>
    );
  }

  // Remplir les 30 derniers jours (y compris les jours sans ventes)
  const days: { day: string; revenue: number; orders: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = data.find(r => r.day === key);
    days.push({ day: key, revenue: found?.revenue ?? 0, orders: found?.orders ?? 0 });
  }

  const maxRevenue = Math.max(...days.map(d => d.revenue), 1);
  const W = 700, H = 160, PAD_B = 28, PAD_T = 10;
  const barW = (W / days.length) * 0.6;
  const gap = W / days.length;

  return (
    <svg viewBox={`0 0 ${W} ${H + PAD_B + PAD_T}`} className="w-full" role="img" aria-label="CA 30 derniers jours">
      {/* Ligne de base */}
      <line x1={0} y1={H + PAD_T} x2={W} y2={H + PAD_T} stroke="currentColor" strokeOpacity="0.1" strokeWidth={1} />
      {/* Barres */}
      {days.map((d, i) => {
        const barH = Math.max(2, (d.revenue / maxRevenue) * H);
        const x = i * gap + gap / 2 - barW / 2;
        const y = PAD_T + H - barH;
        const label = d.day.slice(8); // jour du mois
        const showLabel = i === 0 || i === 14 || i === 29 || Number(label) % 5 === 0;
        return (
          <g key={d.day}>
            <rect x={x} y={y} width={barW} height={barH} fill="var(--color-primary)" opacity={d.revenue > 0 ? 0.8 : 0.15} rx={2}>
              <title>{d.day} — {d.revenue.toFixed(2)} $ · {d.orders} cmd</title>
            </rect>
            {showLabel && (
              <text x={x + barW / 2} y={H + PAD_T + 16} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.4}>
                {label}
              </text>
            )}
          </g>
        );
      })}
      {/* Ligne max */}
      <text x={4} y={PAD_T + 8} fontSize={9} fill="currentColor" opacity={0.4}>{maxRevenue.toFixed(0)} $</text>
    </svg>
  );
}

export default function AdminDashboard() {
  const { orderStats, todayOrders, recentOrders, lowStock, topCustomers, revenueChart } = useLoaderData<typeof loader>();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-8">Dashboard</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "CA total", value: `${(orderStats?.revenue ?? 0).toFixed(0)} $`, icon: "payments" },
          { label: "Commandes", value: orderStats?.total ?? 0, icon: "receipt_long" },
          { label: "En attente", value: orderStats?.pending ?? 0, icon: "schedule", alert: (orderStats?.pending ?? 0) > 0 },
          { label: "Aujourd'hui", value: `${(todayOrders?.total ?? 0).toFixed(0)} $`, sub: `${todayOrders?.count ?? 0} cmd`, icon: "today" },
        ].map(kpi => (
          <div key={kpi.label} className={`bg-surface rounded border p-5 ${kpi.alert ? "border-yellow-400" : "border-outline-variant/30"}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-on-surface-variant text-xs uppercase tracking-widest">{kpi.label}</span>
              <span className={`material-symbols-outlined text-xl ${kpi.alert ? "text-yellow-600" : "text-primary"}`}>{kpi.icon}</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-on-surface-variant mt-1">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* Graphique CA 30 jours */}
      <div className="bg-surface border border-outline-variant/30 rounded mb-8">
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between">
          <h2 className="font-semibold text-on-surface">Évolution du CA — 30 derniers jours</h2>
          <a href="/api/export-csv?type=commandes" className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-base">download</span>
            Exporter CSV
          </a>
        </div>
        <div className="px-5 py-4">
          <RevenueChart data={revenueChart} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2 bg-surface border border-outline-variant/30 rounded">
          <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between">
            <h2 className="font-semibold text-on-surface">Dernières commandes</h2>
            <a href="/admin/commandes" className="text-xs text-primary hover:underline">Voir tout →</a>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="text-left px-5 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Référence</th>
                <th className="text-left px-3 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Client</th>
                <th className="text-right px-3 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Total</th>
                <th className="text-right px-5 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {recentOrders.map(o => (
                <tr key={o.reference} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-primary">{o.reference}</td>
                  <td className="px-3 py-3 text-on-surface truncate max-w-[120px]">{o.customer_name}</td>
                  <td className="px-3 py-3 text-right font-semibold">{o.total_cad.toFixed(2)} $</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_FR[o.status] ?? o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Low stock */}
          <div className="bg-surface border border-outline-variant/30 rounded">
            <div className="px-5 py-4 border-b border-outline-variant/20">
              <h2 className="font-semibold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-yellow-600 text-lg">warning</span>
                Stock faible
              </h2>
            </div>
            {lowStock.length === 0 ? (
              <p className="px-5 py-4 text-sm text-on-surface-variant">Aucun stock critique.</p>
            ) : (
              <ul className="divide-y divide-outline-variant/10">
                {lowStock.map(p => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-on-surface truncate">{p.name}</span>
                    <span className={`text-sm font-bold ${p.stock === 0 ? "text-error" : "text-yellow-600"}`}>{p.stock}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Top customers */}
          <div className="bg-surface border border-outline-variant/30 rounded">
            <div className="px-5 py-4 border-b border-outline-variant/20">
              <h2 className="font-semibold text-on-surface">Meilleurs clients</h2>
            </div>
            <ul className="divide-y divide-outline-variant/10">
              {topCustomers.map((c, i) => (
                <li key={c.customer_email} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xs text-on-surface-variant w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-on-surface truncate">{c.customer_name}</p>
                    <p className="text-xs text-on-surface-variant">{c.orders} cmd</p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{c.spent.toFixed(0)} $</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
