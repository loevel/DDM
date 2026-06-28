import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { useLoaderData, useSearchParams, Form } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Clients — Admin DDM" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "clients";
  const db = context.cloudflare.env.DB;

  const [customers, newsletter, messages] = await Promise.all([
    db.prepare(`
      SELECT c.id, c.email, c.name, c.phone, c.created_at,
             COUNT(o.id) as orders, COALESCE(SUM(o.total_cad),0) as spent
      FROM customers c
      LEFT JOIN orders o ON o.customer_email = c.email AND o.status != 'cancelled'
      GROUP BY c.id ORDER BY c.created_at DESC
    `).all(),
    db.prepare("SELECT * FROM newsletter ORDER BY subscribed_at DESC").all(),
    db.prepare("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 50").all(),
  ]);

  return json({ customers: customers.results, newsletter: newsletter.results, messages: messages.results, tab });
}

export default function AdminClients() {
  const { customers, newsletter, messages, tab } = useLoaderData<typeof loader>();

  const tabs = [
    { id: "clients", label: `Clients (${customers.length})` },
    { id: "newsletter", label: `Newsletter (${newsletter.length})` },
    { id: "messages", label: `Messages (${messages.length})` },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-6">Clients & Communication</h1>

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-outline-variant/30">
        {tabs.map(t => (
          <a key={t.id} href={`?tab=${t.id}`}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"}`}>
            {t.label}
          </a>
        ))}
      </div>

      {/* Clients tab */}
      {tab === "clients" && (
        <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr className="border-b border-outline-variant/30">
                {["Email", "Nom", "Téléphone", "Commandes", "Dépenses", "Inscrit le"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {customers.map((c: any) => (
                <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-3 text-primary text-sm">{c.email}</td>
                  <td className="px-4 py-3">{c.name ?? <span className="text-on-surface-variant italic text-xs">—</span>}</td>
                  <td className="px-4 py-3 text-on-surface-variant text-xs">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold text-center">{c.orders}</td>
                  <td className="px-4 py-3 font-semibold text-primary">{Number(c.spent).toFixed(0)} $</td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{new Date(c.created_at).toLocaleDateString("fr-CA")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && <p className="text-center py-12 text-on-surface-variant">Aucun client.</p>}
        </div>
      )}

      {/* Newsletter tab */}
      {tab === "newsletter" && (
        <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant/20 flex justify-between items-center">
            <span className="text-sm text-on-surface-variant">{newsletter.length} abonné{newsletter.length !== 1 ? "s" : ""}</span>
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
          {newsletter.length === 0 && <p className="text-center py-12 text-on-surface-variant">Aucun abonné.</p>}
        </div>
      )}

      {/* Messages tab */}
      {tab === "messages" && (
        <div className="space-y-3">
          {messages.length === 0 && <p className="text-on-surface-variant">Aucun message reçu.</p>}
          {(messages as any[]).map((m: any) => (
            <div key={m.id} className={`bg-surface border rounded p-5 ${m.read ? "border-outline-variant/20 opacity-70" : "border-primary/30"}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-semibold text-on-surface">{m.nom} <span className="font-normal text-on-surface-variant text-sm">— {m.email}</span></p>
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
