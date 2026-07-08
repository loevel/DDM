import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useRouteLoaderData,
} from "@remix-run/react";
import { useEffect } from "react";
import { Nav } from "~/components/Nav";
import { Footer } from "~/components/Footer";
import { AnnouncementBar } from "~/components/AnnouncementBar";
import tailwindHref from "~/tailwind.css?url";

export async function loader({ context }: LoaderFunctionArgs) {
  // Identifiants configurables dans /admin/parametres — aucun script injecté si absents
  const { results } = await context.cloudflare.env.DB
    .prepare("SELECT key, value FROM site_settings WHERE key IN ('ga4_id', 'meta_pixel_id', 'ambassadors_enabled')")
    .all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  for (const row of results ?? []) settings[row.key] = row.value;
  return {
    ga4Id: settings.ga4_id || null,
    metaPixelId: settings.meta_pixel_id || null,
    ambassadorsEnabled: settings.ambassadors_enabled === "1",
  };
}

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: tailwindHref },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:ital,wght@0,400;0,700;1,400&family=Manrope:wght@400;600;800&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap",
  },
];

function PublicShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  return (
    <>
      {!isAdmin && <AnnouncementBar />}
      {!isAdmin && <Nav />}
      {children}
      {!isAdmin && <Footer />}
    </>
  );
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

/** GA4 + Meta Pixel — chargés uniquement hors admin et si un ID est configuré. */
function Analytics({ ga4Id, metaPixelId }: { ga4Id: string | null; metaPixelId: string | null }) {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");

  // Remix navigue côté client : signaler chaque changement de page manuellement
  useEffect(() => {
    if (isAdmin) return;
    window.gtag?.("event", "page_view", { page_path: pathname });
    window.fbq?.("track", "PageView");
  }, [pathname, isAdmin]);

  if (isAdmin || (!ga4Id && !metaPixelId)) return null;

  return (
    <>
      {ga4Id && (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(ga4Id)},{send_page_view:false});`,
            }}
          />
        </>
      )}
      {metaPixelId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(metaPixelId)});`,
          }}
        />
      )}
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  return (
    <html lang="fr" className="light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <Analytics ga4Id={data?.ga4Id ?? null} metaPixelId={data?.metaPixelId ?? null} />
      </head>
      <body className="bg-background text-on-surface font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <PublicShell><Outlet /></PublicShell>;
}
