import { json, redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Link, NavLink, Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.pathname === "/admin/connexion") {
    return json({ pendingOrders: 0, unreadMessages: 0, abandonedCarts: 0 });
  }

  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    throw redirect("/admin/dashboard");
  }

  const db = context.cloudflare.env.DB;

  let pendingOrders = 0;
  try {
    const row = await db
      .prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'")
      .first<{ count: number }>();
    pendingOrders = row?.count ?? 0;
  } catch {
    pendingOrders = 0;
  }

  let unreadMessages = 0;
  try {
    const row = await db
      .prepare("SELECT COUNT(*) as count FROM contact_messages WHERE read_at IS NULL")
      .first<{ count: number }>();
    unreadMessages = row?.count ?? 0;
  } catch {
    unreadMessages = 0;
  }

  let abandonedCarts = 0;
  try {
    const row = await db
      .prepare(`SELECT COUNT(*) as count FROM abandoned_carts
        WHERE status IN ('active','abandoned') AND email IS NOT NULL
        AND ROUND((julianday('now') - julianday(updated_at)) * 24 * 60) > 60`)
      .first<{ count: number }>();
    abandonedCarts = row?.count ?? 0;
  } catch {
    abandonedCarts = 0;
  }

  return json({ pendingOrders, unreadMessages, abandonedCarts });
}

const NAV = [
  { section: "Tableau de bord" },
  { to: "/admin/dashboard",    label: "Dashboard",      icon: "bar_chart" },
  { to: "/admin/analytique",   label: "Analytique",     icon: "analytics" },

  { section: "Ventes" },
  { to: "/admin/commandes",    label: "Commandes",      icon: "receipt_long" },
  { to: "/admin/clients",      label: "Clients",        icon: "group" },
  { to: "/admin/retours",      label: "Retours",        icon: "assignment_return" },
  { to: "/admin/avis",         label: "Avis clients",   icon: "rate_review" },
  { to: "/admin/qa",           label: "Q&A",            icon: "help" },

  { section: "Catalogue" },
  { to: "/admin/produits",     label: "Produits",       icon: "inventory_2" },
  { to: "/admin/collections",  label: "Collections",    icon: "collections_bookmark" },
  { to: "/admin/ventes-flash", label: "Ventes Flash",   icon: "bolt" },
  { to: "/admin/promotions",   label: "Promotions",     icon: "sell" },

  { section: "Opérations" },
  { to: "/admin/achats",         label: "Achats",         icon: "shopping_cart" },
  { to: "/admin/stock",          label: "Stock",          icon: "warehouse" },
  { to: "/admin/fournisseurs",   label: "Fournisseurs",   icon: "local_shipping" },

  { to: "/admin/cartes-cadeaux", label: "Cartes cadeaux", icon: "card_giftcard" },

  { section: "Contenu" },
  { to: "/admin/annonces",     label: "Annonces",       icon: "campaign" },

  { section: "Marketing" },
  { to: "/admin/calendrier",          label: "Calendrier",          icon: "calendar_month" },
  { to: "/admin/parrainage",          label: "Parrainage",          icon: "group_add" },
  { to: "/admin/paniers-abandonnes",  label: "Paniers abandonnés",  icon: "shopping_cart_off" },

  { section: "Outils" },
  { to: "/admin/recherche",    label: "Recherche",      icon: "search" },
  { to: "/admin/parametres",   label: "Paramètres",     icon: "settings" },
] as const;

export default function AdminLayout() {
  const { pendingOrders, unreadMessages, abandonedCarts } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  if (pathname === "/admin/connexion") return <Outlet />;

  return (
    <div className="min-h-screen flex bg-on-surface text-surface">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-[#1b1c1c] border-r border-white/10 flex flex-col">
        <div className="px-5 py-6 border-b border-white/10">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-primary-container mb-0.5">DDM Wigs</p>
          <p className="text-[10px] text-white/40 uppercase tracking-widest">Administration</p>
        </div>
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {(NAV as unknown as any[]).map((item, i) =>
            item.section ? (
              <p key={i} className="text-[9px] font-bold text-white/25 uppercase tracking-[0.15em] px-3 pt-4 pb-1.5">
                {item.section}
              </p>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-on-primary"
                      : "text-white/60 hover:text-white hover:bg-white/8"
                  }`
                }
              >
                <span className="material-symbols-outlined text-lg">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.to === "/admin/commandes" && pendingOrders > 0 && (
                  <span className="bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                    {pendingOrders}
                  </span>
                )}
                {item.to === "/admin/clients" && unreadMessages > 0 && (
                  <span className="bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                    {unreadMessages}
                  </span>
                )}
                {item.to === "/admin/paniers-abandonnes" && abandonedCarts > 0 && (
                  <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                    {abandonedCarts}
                  </span>
                )}
              </NavLink>
            )
          )}
        </nav>
        <div className="px-2 pb-4 border-t border-white/10 pt-4">
          <Link
            to="/admin/deconnexion"
            className="flex items-center gap-3 px-3 py-2.5 rounded text-sm text-white/40 hover:text-white transition-colors w-full"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Déconnexion
          </Link>
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2 rounded text-sm text-white/40 hover:text-white transition-colors w-full mt-1"
          >
            <span className="material-symbols-outlined text-lg">open_in_new</span>
            Voir le site
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-surface-container-low text-on-surface min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
