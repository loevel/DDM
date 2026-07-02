import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Clients — Admin DDM" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "clients";
  const search = url.searchParams.get("q") ?? "";
  const segment = url.searchParams.get("segment") ?? "";
  const db = context.cloudflare.env.DB;

  const [customersResult, newsletter, messages] = await Promise.all([
    db.prepare(`
      SELECT c.id, c.email, c.name, c.phone, c.created_at, c.statut,
             COUNT(o.id) as nb_commandes,
             COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_cad ELSE 0 END), 0) as spent,
             MAX(CASE WHEN o.payment_status = 'paid' THEN o.created_at END) as derniere_commande
      FROM customers c
      LEFT JOIN orders o ON o.customer_email = c.email AND o.status != 'cancelled'
      GROUP BY c.id ORDER BY spent DESC, c.created_at DESC
    `).all(),
    db.prepare("SELECT * FROM newsletter ORDER BY subscribed_at DESC").all(),
    db.prepare("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100").all(),
  ]);

  const allCustomers = (customersResult.results ?? []) as any[];

  // Calculs segment dynamique
  const withSegment = allCustomers.map(c => {
    const manualStatut = c.statut ?? "actif";
    let segment = manualStatut === "bloque" ? "bloque"
      : manualStatut === "vip" ? "vip"
      : c.spent >= 300 || c.nb_commandes >= 3 ? "vip"
      : c.nb_commandes >= 2 ? "fidele"
      : c.nb_commandes === 1 ? "nouveau"
      : "inactif";
    return { ...c, segment };
  });

  // Filtrage
  let filtered = withSegment;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(c =>
      c.email?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
    );
  }
  if (segment) {
    filtered = filtered.filter(c => c.segment === segment);
  }

  // KPIs globaux (sur tous les clients, pas les filtrés)
  const totalClients = withSegment.length;
  const ltv = totalClients > 0 ? withSegment.reduce((s, c) => s + c.spent, 0) / totalClients : 0;
  const vipCount = withSegment.filter(c => c.segment === "vip").length;
  const unread = (messages.results ?? []).filter((m: any) => !m.read_at).length;

  return json({
    customers: filtered,
    newsletter: newsletter.results ?? [],
    messages: messages.results ?? [],
    tab, search, segment,
    kpis: { totalClients, ltv, vipCount, unread },
  });
}

const SEGMENT_LABELS: Record<string, { label: string; color: string }> = {
  vip:     { label: "VIP",     color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  fidele:  { label: "Fidèle",  color: "bg-blue-100 text-blue-700 border-blue-200" },
  nouveau: { label: "Nouveau", color: "bg-green-100 text-green-700 border-green-200" },
  inactif: { label: "Inactif", color: "bg-surface-container text-on-surface-variant border-outline-variant/30" },
  bloque:  { label: "Bloqué",  color: "bg-error-container text-on-error-container border-error/20" },
};

export default function AdminClients() {
  const { customers, newsletter, messages, tab, search, segment, kpis } = useLoaderData<typeof loader>();
  const [, setParams] = useSearchParams();

  const tabs = [
    { id: "clients",    label: `Clients (${kpis.totalClients})` },
    { id: "newsletter", label: `Newsletter (${(newsletter as any[]).length})` },
    { id: "messages",   label: `Messages${kpis.unread > 0 ? ` (${kpis.unread} non lus)` : ` (${(messages as any[]).length})`}` },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Clients & Communication</h1>
        <a href="/api/export-csv?type=clients"
          className="flex items-center gap-1.5 text-sm border border-outline-variant px-4 py-2 text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
          <span className="material-symbols-outlined text-base">download</span>
          Exporter CSV
        </a>
      </div>

      {/* KPIs */}
      {tab === "clients" && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <KpiCard icon="group" label="Clients total" value={String(kpis.totalClients)} />
          <KpiCard icon="payments" label="LTV moyen" value={`${Number(kpis.ltv).toFixed(0)} $`} accent />
          <KpiCard icon="star" label="Clients VIP" value={String(kpis.vipCount)} accent />
          <KpiCard icon="mark_email_unread" label="Messages non lus" value={String(kpis.unread)} warn={kpis.unread > 0} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-outline-variant/30">
        {tabs.map(t => (
          <a key={t.id} href={`?tab=${t.id}`}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}>
            {t.label}
          </a>
        ))}
      </div>

      {/* ── Clients ── */}
      {tab === "clients" && (
        <div>
          {/* Barre recherche + filtres */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg pointer-events-none">search</span>
              <form method="get">
                <input type="hidden" name="tab" value="clients" />
                {segment && <input type="hidden" name="segment" value={segment} />}
                <input name="q" defaultValue={search} placeholder="Rechercher par email, nom…"
                  className="w-full pl-10 pr-4 py-2 text-sm border border-outline-variant bg-surface focus:outline-none focus:border-primary" />
              </form>
            </div>
            <div className="flex gap-1">
              {["", "vip", "fidele", "nouveau", "inactif", "bloque"].map(s => {
                const active = segment === s;
                const info = s ? SEGMENT_LABELS[s] : null;
                return (
                  <a key={s} href={`?tab=clients${s ? `&segment=${s}` : ""}${search ? `&q=${search}` : ""}`}
                    className={`px-3 py-2 text-xs font-semibold border transition-colors ${
                      active ? "bg-primary text-on-primary border-primary" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                    }`}>
                    {s === "" ? "Tous" : SEGMENT_LABELS[s]?.label}
                  </a>
                );
              })}
            </div>
          </div>

          <div className="bg-surface border border-outline-variant/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low">
                <tr className="border-b border-outline-variant/30">
                  {["Client", "Segment", "Commandes", "Dépenses", "Dernière commande", "Inscrit le", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {(customers as any[]).map((c: any) => {
                  const seg = SEGMENT_LABELS[c.segment] ?? SEGMENT_LABELS.inactif;
                  return (
                    <tr key={c.id} className="hover:bg-surface-container-low transition-colors group">
                      <td className="px-4 py-3">
                        <p className="font-medium text-on-surface">{c.name ?? <span className="italic text-on-surface-variant text-xs">Sans nom</span>}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{c.email}</p>
                        {c.phone && <p className="text-xs text-on-surface-variant">{c.phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 border ${seg.color}`}>{seg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{c.nb_commandes}</td>
                      <td className="px-4 py-3 font-semibold text-primary">{Number(c.spent).toFixed(0)} $</td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {c.derniere_commande ? new Date(c.derniere_commande).toLocaleDateString("fr-CA") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {new Date(c.created_at).toLocaleDateString("fr-CA")}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/clients/${c.id}`}
                          className="text-xs text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                          Voir →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(customers as any[]).length === 0 && (
              <p className="text-center py-12 text-on-surface-variant">Aucun client trouvé.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Newsletter ── */}
      {tab === "newsletter" && (
        <div className="bg-surface border border-outline-variant/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/20 flex justify-between items-center">
            <span className="text-sm text-on-surface-variant">{(newsletter as any[]).length} abonné{(newsletter as any[]).length !== 1 ? "s" : ""}</span>
            <button
              onClick={() => {
                const emails = (newsletter as any[]).map((n: any) => n.email).join("\n");
                navigator.clipboard.writeText(emails);
              }}
              className="text-xs px-3 py-1.5 border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
              Copier les emails
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr className="border-b border-outline-variant/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Inscrit le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {(newsletter as any[]).map((n: any) => (
                <tr key={n.id} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3 text-primary">{n.email}</td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{new Date(n.subscribed_at).toLocaleDateString("fr-CA")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(newsletter as any[]).length === 0 && <p className="text-center py-12 text-on-surface-variant">Aucun abonné.</p>}
        </div>
      )}

      {/* ── Messages ── */}
      {tab === "messages" && (
        <div className="space-y-3">
          {(messages as any[]).length === 0 && <p className="text-on-surface-variant">Aucun message reçu.</p>}
          {(messages as any[]).map((m: any) => (
            <div key={m.id} className={`bg-surface border rounded p-5 ${m.read_at ? "border-outline-variant/20 opacity-70" : "border-primary/30"}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-semibold text-on-surface">
                    {m.nom}
                    {!m.read_at && <span className="ml-2 text-[10px] font-bold uppercase bg-primary text-on-primary px-1.5 py-0.5">Nouveau</span>}
                    <span className="font-normal text-on-surface-variant text-sm"> — {m.email}</span>
                  </p>
                  {m.sujet && <p className="text-xs text-primary uppercase tracking-wider mt-0.5">{m.sujet}</p>}
                </div>
                <p className="text-xs text-on-surface-variant shrink-0">{new Date(m.created_at).toLocaleDateString("fr-CA")}</p>
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed">{m.message}</p>
              {m.tel && <p className="text-xs text-on-surface-variant mt-2">Tél : {m.tel}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, accent, warn }: { icon: string; label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className={`p-4 border ${warn ? "border-yellow-300/50 bg-yellow-50" : "border-outline-variant/30 bg-surface"}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`material-symbols-outlined text-lg ${warn ? "text-yellow-600" : accent ? "text-primary" : "text-on-surface-variant"}`}>{icon}</span>
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${warn ? "text-yellow-700" : accent ? "text-primary" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}
