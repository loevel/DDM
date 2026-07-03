import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getCustomer } from "~/lib/auth.server";
import { getCustomerId } from "~/lib/session.server";

export const meta: MetaFunction = () => [{ title: "Mes commandes — DDM Wigs & More" }];

interface Order {
  reference: string;
  type: string;
  total_cad: number;
  status: string;
  created_at: string;
  notes: string | null;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = (await getCustomerId(request, context))!;
  const customer = await getCustomer(customerId, context);

  const orders = await context.cloudflare.env.DB
    .prepare(
      "SELECT reference, type, total_cad, status, created_at, notes FROM orders WHERE customer_email = ? ORDER BY created_at DESC"
    )
    .bind(customer!.email)
    .all<Order>();

  return json({ orders: orders.results });
}

const STATUS_MAP: Record<string, { label: string; icon: string; color: string }> = {
  pending:   { label: "En attente",  icon: "schedule",        color: "text-tertiary bg-tertiary-container/30" },
  confirmed: { label: "Confirmée",   icon: "check_circle",    color: "text-secondary bg-secondary-container/30" },
  shipped:   { label: "Expédiée",    icon: "local_shipping",  color: "text-primary bg-primary-container/20" },
  delivered: { label: "Livrée",      icon: "inventory_2",     color: "text-secondary bg-secondary-container" },
  cancelled: { label: "Annulée",     icon: "cancel",          color: "text-error bg-error-container/30" },
};

export default function Commandes() {
  const { orders } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Mes commandes</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">{orders.length} commande{orders.length !== 1 ? "s" : ""}</p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-surface border border-outline-variant/30 rounded-sm px-6 py-16 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">shopping_bag</span>
          <p className="font-body-md text-body-md text-on-surface-variant">Aucune commande pour l'instant.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const s = STATUS_MAP[order.status] ?? { label: order.status, icon: "info", color: "text-outline" };
            const date = new Date(order.created_at).toLocaleDateString("fr-CA", {
              year: "numeric", month: "long", day: "numeric",
            });
            return (
              <div key={order.reference} className="bg-surface border border-outline-variant/30 rounded-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low">
                  <div>
                    <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Commande</span>
                    <p className="font-headline-sm text-headline-sm text-primary"># {order.reference}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-sm font-label-md text-[11px] uppercase tracking-wider ${s.color}`}>
                    <span className="material-symbols-outlined text-sm">{s.icon}</span>
                    {s.label}
                  </span>
                </div>
                <div className="px-6 py-4 grid grid-cols-3 gap-4">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs mb-1">Type</p>
                    <p className="font-body-md text-body-md capitalize">{order.type === "rental" ? "Location" : "Achat"}</p>
                  </div>
                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs mb-1">Date</p>
                    <p className="font-body-md text-body-md">{date}</p>
                  </div>
                  <div>
                    <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-xs mb-1">Total</p>
                    <p className="font-body-md text-body-md font-semibold text-primary">{order.total_cad.toFixed(2)} $ CAD</p>
                  </div>
                </div>
                {order.notes && (
                  <div className="px-6 pb-4">
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{order.notes}</p>
                  </div>
                )}
                <div className="px-6 pb-4 flex justify-end">
                  <a
                    href={`/api/commandes/${order.reference}/recu`}
                    download
                    className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Télécharger le reçu (PDF)
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
