import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Link, useLoaderData } from "@remix-run/react";
import { getCustomer } from "~/lib/auth.server";
import { getCustomerId } from "~/lib/session.server";

export const meta: MetaFunction = () => [{ title: "Mon espace — DDM Wigs & More" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = (await getCustomerId(request, context))!;
  const customer = await getCustomer(customerId, context);

  const db = context.cloudflare.env.DB;
  const [recentOrders, stats] = await Promise.all([
    db
      .prepare(
        "SELECT reference, type, total_cad, status, created_at FROM orders WHERE customer_email = ? ORDER BY created_at DESC LIMIT 3"
      )
      .bind(customer!.email)
      .all<{ reference: string; type: string; total_cad: number; status: string; created_at: string }>(),
    db
      .prepare(
        "SELECT COUNT(*) as total, SUM(total_cad) as spent FROM orders WHERE customer_email = ? AND status != 'cancelled'"
      )
      .bind(customer!.email)
      .first<{ total: number; spent: number | null }>(),
  ]);

  return json({ customer, recentOrders: recentOrders.results, stats });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "text-tertiary bg-tertiary-container/30" },
  confirmed: { label: "Confirmée", color: "text-secondary bg-secondary-container/30" },
  shipped: { label: "Expédiée", color: "text-primary bg-primary-container/20" },
  delivered: { label: "Livrée", color: "text-secondary bg-secondary-container" },
  cancelled: { label: "Annulée", color: "text-error bg-error-container/30" },
};

export default function TableauDeBord() {
  const { customer, recentOrders, stats } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">
          Bonjour{customer?.name ? `, ${customer.name.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Bienvenue dans votre espace DDM Wigs & More.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-outline-variant/30 p-6 rounded-sm">
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-2">Commandes</p>
          <p className="font-headline-lg text-headline-lg text-primary">{stats?.total ?? 0}</p>
        </div>
        <div className="bg-surface border border-outline-variant/30 p-6 rounded-sm">
          <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-2">Total dépensé</p>
          <p className="font-headline-lg text-headline-lg text-primary">
            {stats?.spent ? `${stats.spent.toFixed(0)} $` : "0 $"}
          </p>
        </div>
      </div>

      {/* Recent orders */}
      <div className="bg-surface border border-outline-variant/30 rounded-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Commandes récentes</h2>
          <Link to="/compte/commandes" className="font-label-md text-label-md text-primary hover:opacity-70 transition-opacity">
            Voir tout →
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="material-symbols-outlined text-4xl text-outline-variant mb-3 block">shopping_bag</span>
            <p className="font-body-md text-body-md text-on-surface-variant mb-4">Aucune commande pour l'instant.</p>
            <Link to="/boutique" className="font-label-md text-label-md text-primary border-b border-primary hover:opacity-70 transition-opacity">
              Explorer la boutique
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {recentOrders.map((order) => {
              const s = STATUS_LABELS[order.status] ?? { label: order.status, color: "text-outline" };
              return (
                <li key={order.reference} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="font-label-md text-label-md text-on-surface"># {order.reference}</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant capitalize">{order.type === "rental" ? "Location" : "Achat"}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-0.5 rounded-sm font-label-md text-[11px] uppercase tracking-wider ${s.color}`}>
                      {s.label}
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{order.total_cad.toFixed(2)} $</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/compte/profil" className="flex items-center gap-4 bg-surface border border-outline-variant/30 rounded-sm px-6 py-4 hover:border-primary/40 transition-colors group">
          <span className="material-symbols-outlined text-primary text-2xl">person</span>
          <div>
            <p className="font-label-md text-label-md text-on-surface">Compléter mon profil</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Nom, téléphone, adresse</p>
          </div>
        </Link>
        <Link to="/boutique" className="flex items-center gap-4 bg-surface border border-outline-variant/30 rounded-sm px-6 py-4 hover:border-primary/40 transition-colors group">
          <span className="material-symbols-outlined text-primary text-2xl">storefront</span>
          <div>
            <p className="font-label-md text-label-md text-on-surface">Visiter la boutique</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Nouvelles collections</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
