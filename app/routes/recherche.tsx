import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { getDB, getProducts } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";

export const meta: MetaFunction = ({ location }) => {
  const q = new URL(`https://x${location.search}`).searchParams.get("q") ?? "";
  return [
    { title: q ? `"${q}" — Recherche · DDM Wigs & More` : "Recherche · DDM Wigs & More" },
  ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return json({ products: [] as Product[], q });

  const db = getDB(context);
  const products = await getProducts(db, { search: q });
  return json({ products, q });
}

export default function Recherche() {
  const { products, q } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-outline-variant bg-surface">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop py-10">
          <p className="font-sans text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3">
            Recherche
          </p>
          <h1 className="font-serif text-3xl md:text-4xl text-on-surface">
            {q ? (
              <>Résultats pour <span className="text-primary italic">"{q}"</span></>
            ) : (
              "Que recherchez-vous ?"
            )}
          </h1>
          {q && (
            <p className="font-sans text-sm text-on-surface-variant mt-2">
              {products.length === 0
                ? "Aucun produit trouvé"
                : `${products.length} produit${products.length > 1 ? "s" : ""} trouvé${products.length > 1 ? "s" : ""}`}
            </p>
          )}
        </div>
      </div>

      <main className="max-w-container-max-width mx-auto px-grid-margin-desktop py-12">
        {/* Pas de requête */}
        {!q && (
          <div className="flex flex-col items-center py-20 gap-4 text-center">
            <span className="material-symbols-outlined text-6xl text-outline-variant">search</span>
            <p className="font-sans text-on-surface-variant text-sm max-w-xs">
              Utilisez la barre de recherche en haut pour trouver une perruque.
            </p>
            <Link to="/boutique"
              className="mt-4 px-6 py-3 bg-primary text-on-primary text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
              Explorer la boutique
            </Link>
          </div>
        )}

        {/* Aucun résultat */}
        {q && products.length === 0 && (
          <div className="flex flex-col items-center py-20 gap-4 text-center">
            <span className="material-symbols-outlined text-6xl text-outline-variant">search_off</span>
            <h2 className="font-serif text-2xl text-on-surface">Aucun résultat</h2>
            <p className="font-sans text-sm text-on-surface-variant max-w-sm">
              Aucun produit ne correspond à "<span className="font-semibold">{q}</span>". Essayez un autre mot-clé ou explorez la boutique.
            </p>
            <div className="flex gap-3 mt-2">
              <Link to="/boutique"
                className="px-6 py-3 bg-primary text-on-primary text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
                Voir la boutique
              </Link>
              <Link to="/quiz"
                className="px-6 py-3 border border-outline-variant text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors uppercase tracking-wider">
                Faire le quiz
              </Link>
            </div>
          </div>
        )}

        {/* Résultats */}
        {products.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
            {products.map(p => (
              <Link key={p.id} to={`/boutique/${p.slug}`} className="group block">
                <div className="aspect-[4/5] overflow-hidden bg-surface-container mb-3 relative">
                  {p.image_key ? (
                    <img alt={p.name} src={p.image_key}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl text-outline-variant">styler</span>
                    </div>
                  )}
                  {p.featured === 1 && (
                    <span className="absolute top-2 left-2 bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5">
                      Vedette
                    </span>
                  )}
                </div>
                <h3 className="font-serif text-base text-on-surface group-hover:text-primary transition-colors leading-snug mb-1">
                  {p.name}
                </h3>
                {p.texture && (
                  <p className="font-sans text-xs text-on-surface-variant mb-1 capitalize">{p.texture}</p>
                )}
                <p className="font-sans text-sm font-bold text-primary">
                  {Number(p.price_cad).toFixed(2)} $ CAD
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
