import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Link, useLoaderData } from "@remix-run/react";
import { getDB } from "~/lib/db.server";
import { cfImage } from "~/lib/images";

export const meta: MetaFunction = () => [
  { title: "Collections — DDM Wigs & More" },
  { name: "description", content: "Explorez nos collections de perruques par thème et par saison." },
];

interface Collection {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_key: string | null;
  product_count: number;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDB(context as any);
  const { results } = await db.prepare(`
    SELECT c.id, c.name, c.slug, c.description, c.image_key,
           COUNT(pc.product_id) as product_count
    FROM collections c
    LEFT JOIN product_collections pc ON pc.collection_id = c.id
    WHERE c.active = 1
    GROUP BY c.id
    ORDER BY c.position ASC, c.id ASC
  `).all<Collection>();
  return json({ collections: results ?? [] });
}

export default function CollectionsIndex() {
  const { collections } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">
      {/* En-tête */}
      <header className="max-w-site mx-auto px-6 md:px-10 lg:px-20 py-14 md:py-20">
        <p className="font-sans text-xs font-bold tracking-[0.2em] uppercase text-primary mb-3">DDM Wigs & More</p>
        <h1 className="font-serif text-4xl md:text-5xl text-on-surface mb-4 leading-tight">Collections</h1>
        <p className="font-sans text-base text-on-surface-variant max-w-2xl leading-relaxed">
          Des sélections soigneusement constituées pour chaque style, chaque saison.
        </p>
      </header>

      {/* Grille */}
      <main className="max-w-site mx-auto px-6 md:px-10 lg:px-20 pb-24">
        {collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <span className="material-symbols-outlined text-5xl text-outline-variant">collections_bookmark</span>
            <p className="font-sans text-lg font-semibold text-on-surface">Aucune collection disponible</p>
            <Link to="/boutique"
              className="mt-2 px-6 py-3 border border-primary text-primary text-sm font-semibold hover:bg-primary hover:text-on-primary transition-colors">
              Voir toute la boutique
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {collections.map(col => (
              <Link
                key={col.id}
                to={`/collections/${col.slug}`}
                className="group relative overflow-hidden bg-on-surface aspect-[4/3] flex items-end"
              >
                {col.image_key ? (
                  <img
                    src={cfImage(col.image_key, "card") ?? col.image_key ?? ""}
                    alt={col.name}
                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-50 group-hover:scale-105 transition-all duration-500"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-on-surface to-on-surface-variant opacity-80" />
                )}

                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Contenu */}
                <div className="relative px-6 pb-6 w-full">
                  <h2 className="font-serif text-2xl text-white leading-tight mb-1 group-hover:text-primary-container transition-colors">
                    {col.name}
                  </h2>
                  {col.description && (
                    <p className="font-sans text-sm text-white/70 leading-snug mb-2 line-clamp-2">{col.description}</p>
                  )}
                  <span className="font-sans text-xs text-white/50 uppercase tracking-wider">
                    {col.product_count} produit{col.product_count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Flèche */}
                <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0">
                  <span className="material-symbols-outlined text-white text-sm">arrow_forward</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
