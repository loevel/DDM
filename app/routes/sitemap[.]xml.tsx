import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";

const BASE = "https://ddm-wigs.pages.dev";

const STATIC = [
  { url: "/",               priority: "1.0", changefreq: "weekly" },
  { url: "/boutique",       priority: "0.9", changefreq: "daily" },
  { url: "/collections",    priority: "0.8", changefreq: "weekly" },
  { url: "/promotions",     priority: "0.7", changefreq: "weekly" },
  { url: "/ventes-flash",   priority: "0.7", changefreq: "daily" },
  { url: "/accessoires",    priority: "0.7", changefreq: "weekly" },
  { url: "/faq",            priority: "0.6", changefreq: "monthly" },
  { url: "/guide-entretien",priority: "0.6", changefreq: "monthly" },
  { url: "/notre-histoire", priority: "0.5", changefreq: "monthly" },
  { url: "/contact",        priority: "0.5", changefreq: "monthly" },
  { url: "/livraison",      priority: "0.5", changefreq: "monthly" },
  { url: "/quiz",           priority: "0.5", changefreq: "monthly" },
];

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: string) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDB(context as any);
  const today = new Date().toISOString().slice(0, 10);

  const [products, collections] = await Promise.all([
    db.prepare("SELECT slug, updated_at FROM products WHERE stock > 0 ORDER BY updated_at DESC").all<{ slug: string; updated_at: string }>(),
    db.prepare("SELECT slug FROM collections WHERE active = 1").all<{ slug: string }>(),
  ]);

  const entries = [
    ...STATIC.map(p => urlEntry(`${BASE}${p.url}`, today, p.changefreq, p.priority)),
    ...(products.results ?? []).map(p =>
      urlEntry(`${BASE}/boutique/${p.slug}`, p.updated_at?.slice(0, 10) ?? today, "weekly", "0.8")
    ),
    ...(collections.results ?? []).map(c =>
      urlEntry(`${BASE}/collections/${c.slug}`, today, "weekly", "0.7")
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
