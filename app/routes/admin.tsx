import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/react";
import { Link, NavLink, Outlet, useLocation } from "@remix-run/react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.pathname === "/admin/connexion") return null;

  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    throw redirect("/admin/dashboard");
  }
  return null;
}

const NAV = [
  { to: "/admin/dashboard",   label: "Dashboard",   icon: "bar_chart" },
  { to: "/admin/commandes",   label: "Commandes",   icon: "receipt_long" },
  { to: "/admin/produits",    label: "Produits",    icon: "inventory_2" },
  { to: "/admin/clients",     label: "Clients",     icon: "group" },
  { to: "/admin/promotions",  label: "Promotions",  icon: "sell" },
  { to: "/admin/avis",        label: "Avis clients", icon: "rate_review" },
  { to: "/admin/ventes-flash", label: "Ventes Flash",  icon: "bolt" },
  { to: "/admin/collections", label: "Collections",  icon: "collections_bookmark" },
  { to: "/admin/annonces",    label: "Annonces",     icon: "campaign" },
];

export default function AdminLayout() {
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
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-on-primary"
                    : "text-white/60 hover:text-white hover:bg-white/8"
                }`
              }
            >
              <span className="material-symbols-outlined text-lg">{icon}</span>
              {label}
            </NavLink>
          ))}
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
