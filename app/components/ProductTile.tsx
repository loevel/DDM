import { Link } from "@remix-run/react";
import { cfImage } from "~/lib/images";
import type { Product } from "~/lib/db.server";

/**
 * Tuile produit du registre éditorial : folio numéroté, filet, cadrage portrait,
 * permutation d'image au survol. Partagée par l'accueil et les produits
 * similaires de la fiche — la grille boutique garde sa carte, plus riche
 * (aperçu rapide, ventes flash, chips de filtres).
 */
export function ProductTile({
  product: p,
  folio,
  secondImage,
  eager,
  badge,
  spec,
}: {
  product: Product;
  folio?: number;
  secondImage?: string;
  eager?: boolean;
  badge?: string;
  spec?: string;
}) {
  const discount = p.compare_at_price_cad && p.compare_at_price_cad > p.price_cad
    ? Math.round((1 - p.price_cad / p.compare_at_price_cad) * 100)
    : null;

  // Le second visuel remplace le zoom : cumuler les deux rend le survol illisible.
  const swapSrc = secondImage ? (cfImage(secondImage, "card") ?? secondImage) : null;

  return (
    <div className="group relative">
      <div className="relative overflow-hidden bg-surface-container aspect-[3/4] mb-4">
        {p.image_key ? (
          <>
            {swapSrc && (
              <img alt="" aria-hidden="true" loading="lazy" src={swapSrc}
                className="absolute inset-0 w-full h-full object-cover" />
            )}
            <img alt={p.name} loading={eager ? "eager" : "lazy"}
              src={cfImage(p.image_key, "card") ?? p.image_key}
              className={`absolute inset-0 w-full h-full object-cover ${swapSrc ? "ddm-swap-front" : "ddm-zoom"}`} />
          </>
        ) : (
          <div className="w-full h-full bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-outline-variant">styler</span>
          </div>
        )}

        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {discount && (
            <span className="bg-error text-on-error px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
              −{discount}%
            </span>
          )}
          {badge && !discount && (
            <span className="bg-primary text-on-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
              {badge}
            </span>
          )}
        </div>

        <div className="absolute inset-x-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
          <div className="bg-on-surface text-surface py-2.5 text-center font-sans text-[11px] font-bold uppercase tracking-widest">
            Voir le produit
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2">
        {folio !== undefined && <span className="ddm-folio">{String(folio).padStart(2, "0")}</span>}
        <span className="h-px flex-1 bg-outline-variant/50" />
      </div>

      {/* Deux lignes réservées : sans ça, un nom court et un nom long désalignent
          les prix de la même rangée. */}
      <h3 className="font-serif text-lg text-on-surface leading-snug mb-1.5 min-h-[2.75em]">{p.name}</h3>

      {spec && (
        <p className="font-sans text-[11px] uppercase tracking-wider text-on-surface-variant mb-2">{spec}</p>
      )}

      <div className="flex items-baseline gap-2.5 flex-wrap">
        <p className="font-serif text-xl font-bold text-primary">
          {p.price_cad.toFixed(2)}{" "}
          <span className="font-sans text-[11px] font-bold text-on-surface-variant">$ CAD</span>
        </p>
        {p.compare_at_price_cad && p.compare_at_price_cad > p.price_cad && (
          <p className="font-sans text-sm text-on-surface-variant line-through">
            {p.compare_at_price_cad.toFixed(2)} $
          </p>
        )}
      </div>

      <Link to={`/boutique/${p.slug}`} className="absolute inset-0">
        <span className="sr-only">{p.name}</span>
      </Link>
    </div>
  );
}
