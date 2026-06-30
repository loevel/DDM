import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Link, useLoaderData } from "@remix-run/react";
import { getDB } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";
import { cfImage } from "~/lib/images";

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = getDB(context as any);
  const slug = params.slug;

  const collection = await db
    .prepare("SELECT * FROM collections WHERE slug = ? AND active = 1")
    .bind(slug).first<{ id: number; name: string; slug: string; description: string | null; image_key: string | null }>();

  if (!collection) throw new Response("Collection introuvable", { status: 404 });

  const { results: products } = await db.prepare(`
    SELECT p.* FROM products p
    INNER JOIN product_collections pc ON pc.product_id = p.id
    WHERE pc.collection_id = ? AND p.stock > 0
    ORDER BY p.featured DESC, p.created_at DESC
  `).bind(collection.id).all<Product>();

  const ids = (products ?? []).map(p => p.id);
  let ratingMap: Record<number, { avg: number; count: number }> = {};
  if (ids.length > 0) {
    try {
      const placeholders = ids.map(() => "?").join(",");
      const { results: rows } = await db.prepare(
        `SELECT product_id, COUNT(*) as cnt, AVG(rating) as avg FROM reviews WHERE product_id IN (${placeholders}) AND approved = 1 GROUP BY product_id`
      ).bind(...ids).all<{ product_id: number; cnt: number; avg: number }>();
      (rows ?? []).forEach(r => { ratingMap[r.product_id] = { avg: r.avg, count: r.cnt }; });
    } catch { /* reviews table not ready */ }
  }

  return json({ collection, products: products ?? [], ratingMap });
}

const BASE = "https://ddmwigs.com";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const name = data?.collection.name ?? "Collection";
  const slug = data?.collection.slug ?? "";
  const title = `${name} — DDM Wigs & More`;
  const description = data?.collection.description ?? `Découvrez la collection ${name} — perruques cheveux humains premium.`;
  const url = `https://ddmwigs.com/collections/${slug}`;
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:type",        content: "website" },
    { property: "og:title",       content: title },
    { property: "og:description", content: description },
    { property: "og:url",         content: url },
    { property: "og:site_name",   content: "DDM Wigs & More" },
    { property: "og:locale",      content: "fr_CA" },
    { name: "twitter:card",       content: "summary" },
    { name: "twitter:title",      content: title },
    { name: "twitter:description",content: description },
  ];
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`material-symbols-outlined text-xs ${i <= Math.round(rating) ? "text-primary" : "text-outline-variant"}`}
          style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
      ))}
    </span>
  );
}

function ProductCard({ product, rating }: { product: Product; rating?: { avg: number; count: number } }) {
  const price = typeof product.price_cad === "number" ? product.price_cad : Number(product.price_cad);
  const compareAt = product.compare_at_price_cad ? Number(product.compare_at_price_cad) : null;
  const hasDiscount = compareAt && compareAt > price;
  const pct = hasDiscount ? Math.round((1 - price / compareAt!) * 100) : 0;

  return (
    <Link to={`/boutique/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] bg-surface-container overflow-hidden mb-3">
        {product.image_key ? (
          <img
            src={cfImage(product.image_key, "card") ?? product.image_key ?? ""}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-outline-variant">image</span>
          </div>
        )}
        {hasDiscount && (
          <span className="absolute top-3 left-3 bg-error text-on-error text-[11px] font-bold px-2 py-0.5 rounded-sm">
            -{pct}%
          </span>
        )}
        {product.featured ? (
          <span className="absolute top-3 right-3 bg-primary text-on-primary text-[11px] font-bold px-2 py-0.5 rounded-sm">
            Vedette
          </span>
        ) : null}
      </div>
      <h3 className="font-sans text-sm font-semibold text-on-surface group-hover:text-primary transition-colors leading-snug mb-1">
        {product.name}
      </h3>
      {rating ? (
        <div className="flex items-center gap-1.5 mb-1">
          <Stars rating={rating.avg} />
          <span className="font-sans text-[11px] text-on-surface-variant">({rating.count})</span>
        </div>
      ) : null}
      <div className="flex items-baseline gap-2">
        <span className="font-sans text-sm font-bold text-on-surface">{price.toFixed(2)} $</span>
        {hasDiscount && (
          <span className="font-sans text-xs text-on-surface-variant line-through">{compareAt!.toFixed(2)} $</span>
        )}
      </div>
    </Link>
  );
}

export default function CollectionPage() {
  const { collection, products, ratingMap } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">
      {/* Bannière */}
      <div className="relative bg-on-surface text-surface overflow-hidden">
        {collection.image_key && (
          <img
            src={cfImage(collection.image_key, "card") ?? collection.image_key ?? ""}
            alt={collection.name}
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        <div className="relative max-w-site mx-auto px-6 md:px-10 lg:px-20 py-20 md:py-28">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-primary-container mb-3">Collection</p>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-white mb-4">{collection.name}</h1>
          {collection.description && (
            <p className="font-sans text-base text-white/70 max-w-xl">{collection.description}</p>
          )}
        </div>
      </div>

      {/* Produits */}
      <main className="max-w-site mx-auto px-6 md:px-10 lg:px-20 py-16">
        <div className="flex items-center justify-between mb-8">
          <p className="font-sans text-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">{products.length}</span> produit{products.length !== 1 ? "s" : ""}
          </p>
          <Link to="/boutique" className="text-sm text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Toute la boutique
          </Link>
        </div>

        {products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
            {products.map(p => (
              <ProductCard key={p.id} product={p} rating={ratingMap[p.id]} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <span className="material-symbols-outlined text-5xl text-outline-variant">inventory_2</span>
            <p className="font-sans text-lg font-semibold text-on-surface">Aucun produit dans cette collection</p>
            <p className="font-sans text-sm text-on-surface-variant">Revenez bientôt ou explorez toute la boutique.</p>
            <Link to="/boutique"
              className="mt-2 px-6 py-3 border border-primary text-primary text-sm font-semibold hover:bg-primary hover:text-on-primary transition-colors">
              Voir toute la boutique
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
