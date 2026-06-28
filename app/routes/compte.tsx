import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/react";
import { Link, NavLink, Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { getCustomer } from "~/lib/auth.server";
import { getCustomerId } from "~/lib/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const publicPaths = ["/compte/connexion", "/compte/lien-envoye", "/compte/auth"];

  const customerId = await getCustomerId(request, context);

  if (!customerId) {
    if (!publicPaths.includes(url.pathname)) {
      throw redirect("/compte/connexion");
    }
    return { customer: null };
  }

  if (url.pathname === "/compte" || url.pathname === "/compte/") {
    throw redirect("/compte/tableau-de-bord");
  }

  const customer = await getCustomer(customerId, context);
  if (!customer) throw redirect("/compte/connexion");

  return { customer };
}

const NAV_LINKS = [
  { to: "/compte/tableau-de-bord", label: "Tableau de bord", icon: "space_dashboard" },
  { to: "/compte/commandes", label: "Commandes", icon: "shopping_bag" },

  { to: "/compte/profil", label: "Mon profil", icon: "person" },
];

export default function CompteLayout() {
  const { customer } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isPublicPage = ["/compte/connexion", "/compte/lien-envoye", "/compte/auth"].includes(
    location.pathname
  );

  if (isPublicPage) {
    return <Outlet />;
  }

  return (
    <div className="flex-grow flex flex-col min-h-screen bg-surface-container-low">
      <div className="max-w-container-max-width mx-auto w-full px-4 md:px-grid-margin-desktop py-12 grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
        {/* Sidebar */}
        <aside className="md:col-span-1">
          <div className="bg-surface border border-outline-variant/30 rounded-sm p-6 sticky top-24">
            <div className="mb-6 pb-6 border-b border-outline-variant/30">
              <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest mb-1">Espace client</p>
              <p className="font-headline-sm text-headline-sm text-primary truncate">
                {customer?.name ?? customer?.email}
              </p>
            </div>
            <nav className="space-y-1">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-sm font-label-md text-label-md transition-colors duration-150 ${
                      isActive
                        ? "bg-primary-container/20 text-primary"
                        : "text-on-surface-variant hover:text-primary hover:bg-surface-container"
                    }`
                  }
                >
                  <span className="material-symbols-outlined text-xl">{link.icon}</span>
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-6 pt-6 border-t border-outline-variant/30">
              <Link
                to="/compte/deconnexion"
                className="flex items-center gap-3 px-3 py-2.5 text-on-surface-variant hover:text-error font-label-md text-label-md transition-colors duration-150 w-full"
              >
                <span className="material-symbols-outlined text-xl">logout</span>
                Se déconnecter
              </Link>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="md:col-span-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
