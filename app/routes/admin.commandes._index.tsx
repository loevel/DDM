import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Commandes — Admin DDM" }];

const STATUSES = ["all", "pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
const STATUS_FR: Record<string, string> = {
  all: "Toutes", pending: "En attente", confirmed: "Confirmées",
  shipped: "Expédiées", delivered: "Livrées", cancelled: "Annulées",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800", confirmed: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800", delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "all";
  const search = url.searchParams.get("q") ?? "";
  const db = context.cloudflare.env.DB;

  let query = "SELECT * FROM orders";
  const params: string[] = [];
  const conditions: string[] = [];

  if (status !== "all") { conditions.push("status = ?"); params.push(status); }
  if (search) { conditions.push("(reference LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY created_at DESC LIMIT 100";

  const orders = await db.prepare(query).bind(...params).all();
  return json({ orders: orders.results, status, search });
}

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const form = await request.formData();
  const ref = String(form.get("reference"));
  const newStatus = String(form.get("status"));
  const db = context.cloudflare.env.DB;
  const resendKey = context.cloudflare.env.RESEND_API_KEY as string | undefined;

  await db.prepare("UPDATE orders SET status = ? WHERE reference = ?")
    .bind(newStatus, ref).run();

  if (resendKey) {
    const SUBJECT: Record<string, string> = {
      confirmed: `Votre commande ${ref} est confirmée ✅`,
      shipped:   `Votre commande ${ref} a été expédiée 📦`,
      delivered: `Votre commande ${ref} a été livrée 🎉`,
      cancelled: `Votre commande ${ref} a été annulée`,
    };
    const subject = SUBJECT[newStatus];
    if (subject) {
      const order = await db.prepare("SELECT customer_name, customer_email FROM orders WHERE reference = ?")
        .bind(ref).first<{ customer_name: string; customer_email: string }>();
      if (order) {
        const bodyMap: Record<string, string> = {
          confirmed: `<p>Votre commande <strong>${ref}</strong> a été confirmée et est en cours de préparation.</p>`,
          shipped:   `<p>Votre commande <strong>${ref}</strong> est en route ! Vous recevrez les informations de suivi séparément.</p>`,
          delivered: `<p>Votre commande <strong>${ref}</strong> a bien été livrée. Nous espérons que vous êtes satisfaite !</p>`,
          cancelled: `<p>Votre commande <strong>${ref}</strong> a été annulée. Contactez-nous si vous avez des questions.</p>`,
        };
        const html = `
          <div style="font-family:Manrope,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#fcf9f8">
            <p style="font-size:22px;font-weight:800;color:#7d562d;letter-spacing:0.05em;margin-bottom:4px">DDM WIGS & MORE</p>
            <hr style="border:none;border-top:1px solid #d4c4b7;margin:16px 0 32px">
            <p style="font-size:16px;color:#1b1c1c;margin-bottom:16px">Bonjour ${order.customer_name},</p>
            <div style="font-size:15px;color:#50453b;line-height:1.7">${bodyMap[newStatus]}</div>
            <p style="font-size:12px;color:#82756a;margin-top:40px">Merci de faire confiance à DDM Wigs & More.<br>— L'équipe DDM</p>
          </div>`;
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "DDM Wigs & More <noreply@ddmwigs.com>", to: [order.customer_email], subject, html }),
        }).catch(() => {});
      }
    }
  }

  return json({ ok: true });
}

export default function AdminCommandes() {
  const { orders, status, search } = useLoaderData<typeof loader>();
  const [, setParams] = useSearchParams();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Commandes <span className="text-on-surface-variant font-normal text-lg">({orders.length})</span></h1>
        <a href={`/api/export-csv?type=commandes${status !== "all" ? `&status=${status}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
          className="flex items-center gap-1.5 text-sm border border-outline-variant px-4 py-2 text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
          <span className="material-symbols-outlined text-base">download</span>
          Exporter CSV
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Form method="get" className="flex items-center gap-2">
          <input name="status" type="hidden" value={status} />
          <input
            name="q"
            defaultValue={search}
            placeholder="Référence, nom, email…"
            className="border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary w-56"
          />
          <button type="submit" className="bg-primary text-on-primary px-4 py-2 text-sm hover:opacity-90">Chercher</button>
        </Form>
        <div className="flex gap-1">
          {STATUSES.map(s => (
            <a
              key={s}
              href={`?status=${s}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
              className={`px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${s === status ? "bg-primary text-on-primary" : "bg-surface border border-outline-variant text-on-surface-variant hover:text-primary"}`}
            >
              {STATUS_FR[s]}
            </a>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr className="border-b border-outline-variant/30">
              {["Référence", "Client", "Email", "Type", "Total", "Statut", "Date", "Action"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {orders.map((o: any) => (
              <tr key={o.reference} className="hover:bg-surface-container-low transition-colors">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link to={`/admin/commandes/${o.id}`} className="text-primary hover:underline">{o.reference}</Link>
                </td>
                <td className="px-4 py-3 text-on-surface">{o.customer_name}</td>
                <td className="px-4 py-3 text-on-surface-variant text-xs">{o.customer_email}</td>
                <td className="px-4 py-3 capitalize text-xs">{"Achat"}</td>
                <td className="px-4 py-3 font-semibold">{Number(o.total_cad).toFixed(2)} $</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {STATUS_FR[o.status] ?? o.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{new Date(o.created_at).toLocaleDateString("fr-CA")}</td>
                <td className="px-4 py-3">
                  <Form method="post" className="flex gap-1 items-center">
                    <input type="hidden" name="reference" value={o.reference} />
                    <select
                      name="status"
                      defaultValue={o.status}
                      className="text-xs border border-outline-variant bg-transparent px-1 py-1 focus:outline-none focus:border-primary"
                    >
                      {STATUSES.filter(s => s !== "all").map(s => (
                        <option key={s} value={s}>{STATUS_FR[s]}</option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs bg-on-surface text-surface px-2 py-1 hover:bg-primary transition-colors">✓</button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <p className="text-center py-12 text-on-surface-variant">Aucune commande trouvée.</p>
        )}
      </div>
    </div>
  );
}
