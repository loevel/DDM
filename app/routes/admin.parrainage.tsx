import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Parrainage — Admin DDM" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = (context.cloudflare.env as any).DB;

  const [stats, referrals] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'rewarded' THEN reward_cad ELSE 0 END) as total_rewards,
        SUM(CASE WHEN status = 'rewarded' THEN discount_cad ELSE 0 END) as total_discounts
      FROM referrals
    `).first<{ total: number; completed: number; total_rewards: number; total_discounts: number }>(),
    db.prepare(`
      SELECT r.*, c.name as referrer_name
      FROM referrals r
      LEFT JOIN customers c ON c.email = r.referrer_email
      ORDER BY r.created_at DESC LIMIT 50
    `).all(),
  ]);

  // Top parrains
  const topReferrers = await db.prepare(`
    SELECT referrer_email, COUNT(*) as count, SUM(reward_cad) as earned
    FROM referrals WHERE status = 'rewarded'
    GROUP BY referrer_email ORDER BY count DESC LIMIT 10
  `).all();

  // Crédits en cours
  const credits = await db.prepare(
    "SELECT email, name, referral_credit_cad FROM customers WHERE referral_credit_cad > 0 ORDER BY referral_credit_cad DESC"
  ).all();

  return json({
    stats: stats ?? { total: 0, completed: 0, total_rewards: 0, total_discounts: 0 },
    referrals: referrals.results ?? [],
    topReferrers: topReferrers.results ?? [],
    credits: credits.results ?? [],
  });
}

const STATUS_COLOR: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-800",
  rewarded: "bg-green-100 text-green-800",
  expired:  "bg-gray-100 text-gray-500",
};
const STATUS_FR: Record<string, string> = {
  pending: "En attente", rewarded: "Récompensé", expired: "Expiré",
};

export default function AdminParrainage() {
  const { stats, referrals, topReferrers, credits } = useLoaderData<typeof loader>();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-8">Programme de parrainage</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Parrainages total",  value: stats.total,                           icon: "group_add" },
          { label: "Complétés",          value: stats.completed,                        icon: "check_circle" },
          { label: "Crédits distribués", value: `${(stats.total_rewards ?? 0).toFixed(0)} $`, icon: "savings" },
          { label: "Remises accordées",  value: `${(stats.total_discounts ?? 0).toFixed(0)} $`, icon: "sell" },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-outline-variant/30 p-5 rounded">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">{k.label}</span>
              <span className="material-symbols-outlined text-xl text-primary">{k.icon}</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Top parrains */}
        <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/20">
            <h2 className="font-semibold text-on-surface">Top ambassadrices</h2>
          </div>
          {(topReferrers as any[]).length === 0 ? (
            <p className="px-5 py-8 text-sm text-on-surface-variant text-center">Aucune donnée.</p>
          ) : (
            <ul className="divide-y divide-outline-variant/10">
              {(topReferrers as any[]).map((r, i) => (
                <li key={r.referrer_email} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xs font-bold text-on-surface-variant w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">{r.referrer_email}</p>
                    <p className="text-xs text-on-surface-variant">{r.count} parrainage{r.count > 1 ? "s" : ""}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{r.earned.toFixed(0)} $</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Crédits en cours */}
        <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden lg:col-span-2">
          <div className="px-5 py-4 border-b border-outline-variant/20">
            <h2 className="font-semibold text-on-surface">Crédits disponibles chez les clientes</h2>
          </div>
          {(credits as any[]).length === 0 ? (
            <p className="px-5 py-8 text-sm text-on-surface-variant text-center">Aucun crédit en cours.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low">
                <tr className="border-b border-outline-variant/20">
                  {["Cliente", "Email", "Crédit"].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {(credits as any[]).map((c: any) => (
                  <tr key={c.email}>
                    <td className="px-5 py-3 text-on-surface font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-on-surface-variant text-xs">{c.email}</td>
                    <td className="px-5 py-3 font-bold text-primary">{Number(c.referral_credit_cad).toFixed(2)} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Tous les parrainages */}
      <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant/20">
          <h2 className="font-semibold text-on-surface">Tous les parrainages ({(referrals as any[]).length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr className="border-b border-outline-variant/30">
              {["Parrain", "Filleule", "Commande", "Statut", "Crédit", "Date"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {(referrals as any[]).map((r: any) => (
              <tr key={r.id} className="hover:bg-surface-container-low transition-colors">
                <td className="px-4 py-3 text-on-surface text-xs">
                  <p className="font-medium">{r.referrer_name ?? r.referrer_email}</p>
                  <p className="text-on-surface-variant">{r.referrer_email}</p>
                </td>
                <td className="px-4 py-3 text-on-surface-variant text-xs">{r.referred_email ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-primary">{r.order_reference ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_FR[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-sm">
                  {r.status === "rewarded" ? `+${r.reward_cad} $` : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">
                  {new Date(r.created_at).toLocaleDateString("fr-CA")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(referrals as any[]).length === 0 && (
          <p className="text-center py-12 text-on-surface-variant text-sm">Aucun parrainage enregistré.</p>
        )}
      </div>
    </div>
  );
}
