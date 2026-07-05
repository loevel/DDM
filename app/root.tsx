import type { LinksFunction } from "@remix-run/cloudflare";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "@remix-run/react";
import { Nav } from "~/components/Nav";
import { Footer } from "~/components/Footer";
import { AnnouncementBar } from "~/components/AnnouncementBar";
import tailwindHref from "~/tailwind.css?url";

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

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
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
