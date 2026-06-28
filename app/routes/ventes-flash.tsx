import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Link, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import { getDB } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";

export const meta: MetaFunction = () => [
  { title: "Ventes Flash — DDM Wigs & More" },
  { name: "description", content: "Offres à durée limitée sur nos perruques premium. Prix flash exclusifs, disponibles pour un temps limité seulement." },
];

interface FlashProduct extends Product {
  flash_price: number;
  flash_ends_at: string;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDB(context as any);
  const now = new Date().toISOString();

  try {
    const { results } = await db.prepare(`
      SELECT p.*, fs.flash_price_cad as flash_price, fs.ends_at as flash_ends_at
      FROM flash_sales fs
      JOIN products p ON p.id = fs.product_id
      WHERE fs.active = 1 AND fs.starts_at <= ? AND fs.ends_at > ?
      ORDER BY fs.ends_at ASC
    `).bind(now, now).all<FlashProduct>();

    return json({ products: results ?? [], now });
  } catch {
    return json({ products: [], now });
  }
}

function useCountdown(endsAt: string) {
  const [left, setLeft] = useState(() => Math.max(0, new Date(endsAt).getTime() - Date.now()));
  useEffect(() => {
    const id = setInterval(() => {
      const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    pad,
    expired: left === 0,
  };
}

function FlashCard({ product: p }: { product: FlashProduct }) {
  const { d, h, m, s, pad, expired } = useCountdown(p.flash_ends_at);
  const pct = Math.round((1 - p.flash_price / p.price_cad) * 100);

  return (
    <Link to={`/boutique/${p.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-surface-container mb-4">
        {p.image_key ? (
          <img alt={p.name} src={p.image_key}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-outline-variant">styler</span>
          </div>
        )}

        {/* Badge flash */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1 bg-error text-on-error text-[11px] font-bold px-2 py-1 rounded-sm">
            <span className="material-symbols-outlined text-xs leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            -{pct}%
          </span>
        </div>

        {/* Countdown sur l'image */}
        <div className="absolute bottom-0 inset-x-0 bg-error/90 text-on-error px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider">
            {expired ? "Terminée" : "Se termine dans"}
          </span>
          {!expired && (
            <span className="font-mono text-sm font-bold tabular-nums">
              {d > 0 ? `${d}j ` : ""}{pad(h)}:{pad(m)}:{pad(s)}
            </span>
          )}
        </div>
      </div>

      <h3 className="font-serif text-lg text-on-surface group-hover:text-primary transition-colors leading-snug mb-1">
        {p.name}
      </h3>
      <div className="flex items-baseline gap-2">
        <span className="font-sans text-base font-bold text-error">{p.flash_price.toFixed(2)} $ CAD</span>
        <span className="font-sans text-sm text-on-surface-variant line-through">{p.price_cad.toFixed(2)} $</span>
      </div>
    </Link>
  );
}

function GlobalCountdown({ endsAt }: { endsAt: string }) {
  const { d, h, m, s, pad } = useCountdown(endsAt);
  const unit = (n: number, label: string) => (
    <div className="flex flex-col items-center">
      <span className="font-mono text-4xl md:text-5xl font-bold text-white tabular-nums">{pad(n)}</span>
      <span className="text-white/60 text-xs uppercase tracking-widest mt-1">{label}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-4 md:gap-6">
      {d > 0 && <>{unit(d, "jours")}<span className="text-white/40 text-3xl font-light mb-4">:</span></>}
      {unit(h, "heures")}
      <span className="text-white/40 text-3xl font-light mb-4">:</span>
      {unit(m, "minutes")}
      <span className="text-white/40 text-3xl font-light mb-4">:</span>
      {unit(s, "secondes")}
    </div>
  );
}

export default function VentesFlash() {
  const { products } = useLoaderData<typeof loader>();

  // Prendre la vente qui expire le plus tôt pour le countdown global
  const soonest = products[0]?.flash_ends_at;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero avec countdown */}
      <div className="bg-on-surface text-surface py-16 md:py-24 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)", backgroundSize: "20px 20px" }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-error text-on-error text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-widest mb-6">
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            Offres limitées
          </div>
          <h1 className="font-serif text-4xl md:text-6xl text-white mb-4 leading-tight">Ventes Flash</h1>
          <p className="font-sans text-base text-white/60 mb-10 max-w-lg mx-auto">
            Des prix exceptionnels pour un temps limité. Ne ratez pas ces offres exclusives.
          </p>
          {soonest && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-white/50 text-xs uppercase tracking-widest">Prochaine expiration dans</p>
              <GlobalCountdown endsAt={soonest} />
            </div>
          )}
        </div>
      </div>

      {/* Grille produits */}
      <main className="max-w-site mx-auto px-6 md:px-10 lg:px-20 py-16">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
            <span className="material-symbols-outlined text-6xl text-outline-variant" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <h2 className="font-serif text-2xl text-on-surface">Aucune vente flash en ce moment</h2>
            <p className="font-sans text-sm text-on-surface-variant max-w-md">
              Revenez bientôt — des offres exclusives arrivent régulièrement. En attendant, explorez toute la boutique.
            </p>
            <Link to="/boutique"
              className="mt-4 px-6 py-3 bg-primary text-on-primary text-sm font-semibold uppercase tracking-wider hover:opacity-90 transition-opacity">
              Voir la boutique
            </Link>
          </div>
        ) : (
          <>
            <p className="font-sans text-sm text-on-surface-variant mb-8">
              <span className="font-bold text-on-surface">{products.length}</span> offre{products.length > 1 ? "s" : ""} en cours
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
              {products.map(p => <FlashCard key={p.id} product={p} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
