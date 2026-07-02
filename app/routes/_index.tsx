import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { useEffect, useState } from "react";
import { cfImage } from "~/lib/images";
import { getDB, getProducts } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";

const BASE = "https://ddmwigs.com";
const SITE_DESC = "Perruques en cheveux humains 100% — Lace front, HD lace, glueless. Livraison rapide au Canada. DDM Wigs & More, Montréal.";

export const meta: MetaFunction = () => [
  { title: "DDM Wigs & More | Perruques Cheveux Humains — Montréal" },
  { name: "description", content: SITE_DESC },
  { tagName: "link", rel: "canonical", href: BASE + "/" },
  // Open Graph
  { property: "og:type",        content: "website" },
  { property: "og:title",       content: "DDM Wigs & More | Perruques Cheveux Humains — Montréal" },
  { property: "og:description", content: SITE_DESC },
  { property: "og:url",         content: BASE + "/" },
  { property: "og:site_name",   content: "DDM Wigs & More" },
  { property: "og:locale",      content: "fr_CA" },
  // Twitter
  { name: "twitter:card",        content: "summary_large_image" },
  { name: "twitter:title",       content: "DDM Wigs & More | Perruques Cheveux Humains — Montréal" },
  { name: "twitter:description", content: SITE_DESC },
];

interface FlashProduct extends Product {
  flash_price: number;
  flash_ends_at: string;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDB(context);
  const featuredProducts = await getProducts(db, { featured: true });

  let flashProducts: FlashProduct[] = [];
  try {
    const now = new Date().toISOString();
    const { results } = await db.prepare(`
      SELECT p.*, fs.flash_price_cad as flash_price, fs.ends_at as flash_ends_at
      FROM flash_sales fs
      JOIN products p ON p.id = fs.product_id
      WHERE fs.active = 1 AND fs.starts_at <= ? AND fs.ends_at > ?
      ORDER BY fs.ends_at ASC
      LIMIT 4
    `).bind(now, now).all<FlashProduct>();
    flashProducts = results ?? [];
  } catch { /* table pas encore créée */ }

  return json({ featuredProducts, flashProducts });
}

function useFlashCountdown(endsAt: string) {
  const [left, setLeft] = useState(0); // 0 on SSR, real value set by useEffect on client
  useEffect(() => {
    setLeft(Math.max(0, new Date(endsAt).getTime() - Date.now()));
    const id = setInterval(() => {
      const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, pad };
}

function FlashTimer({ endsAt }: { endsAt: string }) {
  const { d, h, m, s, pad } = useFlashCountdown(endsAt);
  const unit = (n: number, label: string) => (
    <div className="flex flex-col items-center w-10">
      <span className="font-mono text-lg font-bold text-white tabular-nums">{pad(n)}</span>
      <span className="text-white/40 text-[9px] uppercase tracking-wider">{label}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-1">
      {d > 0 && <>{unit(d, "j")}<span className="text-white/30 font-light mb-3">:</span></>}
      {unit(h, "h")}
      <span className="text-white/30 font-light mb-3">:</span>
      {unit(m, "min")}
      <span className="text-white/30 font-light mb-3">:</span>
      {unit(s, "sec")}
    </div>
  );
}

export default function Index() {
  const { featuredProducts, flashProducts } = useLoaderData<typeof loader>();

  useEffect(() => {
    const nav = document.querySelector("nav");
    if (!nav) return;
    const handleScroll = () => {
      if (window.scrollY > 50) {
        nav.classList.add("h-16");
        nav.classList.remove("h-20");
      } else {
        nav.classList.add("h-20");
        nav.classList.remove("h-16");
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "DDM Wigs & More",
    url: BASE,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${BASE}/boutique?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };

  const orgLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "DDM Wigs & More",
    url: BASE,
    description: SITE_DESC,
    address: { "@type": "PostalAddress", addressLocality: "Montréal", addressRegion: "QC", addressCountry: "CA" },
    contactPoint: { "@type": "ContactPoint", contactType: "customer service", availableLanguage: ["French", "English"] },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <HeroCarousel />

      {/* Garantie Pour Vous */}
      <section className="bg-surface-container-low border-b border-outline-variant/30">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-primary text-3xl">assignment_return</span>
              <div>
                <h4 className="font-label-md text-sm text-on-surface">30 Jours Retour</h4>
                <p className="text-[12px] text-on-surface-variant">Satisfaction garantie</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-primary text-3xl">local_shipping</span>
              <div>
                <h4 className="font-label-md text-sm text-on-surface">Livraison Gratuite</h4>
                <p className="text-[12px] text-on-surface-variant">Sur toutes les commandes</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-primary text-3xl">schedule</span>
              <div>
                <h4 className="font-label-md text-sm text-on-surface">Expédition en 72 Hrs</h4>
                <p className="text-[12px] text-on-surface-variant">Rapide et sécurisée</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-primary text-3xl">verified</span>
              <div>
                <h4 className="font-label-md text-sm text-on-surface">100% Vrais Cheveux</h4>
                <p className="text-[12px] text-on-surface-variant">Qualité premium certifiée</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quiz CTA */}
      <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
        <div className="relative overflow-hidden bg-on-surface px-8 md:px-14 py-12 flex flex-col md:flex-row items-center gap-8">
          <div className="relative flex-1 text-center md:text-left">
            <p className="font-sans text-[11px] font-bold text-primary-container uppercase tracking-[0.2em] mb-3">
              Personnalisé pour toi
            </p>
            <h2 className="font-serif text-2xl md:text-3xl text-white mb-3 leading-tight">
              Tu ne sais pas quelle perruque choisir ?
            </h2>
            <p className="font-sans text-sm text-white/60 max-w-md">
              Réponds à 5 questions et on te recommande les perruques parfaites pour ton style, ton budget et ton niveau.
            </p>
          </div>
          <div className="relative flex-shrink-0 text-center">
            <Link to="/quiz"
              className="flex items-center gap-2 bg-primary text-on-primary px-8 py-4 text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              Trouver ma perruque
            </Link>
            <p className="text-white/30 text-[11px] mt-2">2 minutes · Gratuit · Sans compte</p>
          </div>
        </div>
      </section>

      {/* Boutique Shortcut */}
      <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-grid-gutter h-auto md:h-[500px]">
          <div className="relative group overflow-hidden rounded-sm cursor-pointer">
            <img
              alt="Nouveautés"
              className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-700"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCCbcyZDFlEUORFmblZANwAMfCUCqOkctvG5QFcBrCOQV-nphWsF7tS20ffky6c3CvWhH-MwY9lAhxG4Mx9WFX8sDrVXcRxEy99UbwX4cq2ZfAwB3nqFjDFd76bjPOIfVDVeb8jfNtg7SwYuyT7fGR0ZgYEnAAas-huxvkHdytFje67w2b8064LnqZJ1ymKw6DSATRGodGcXyxaSGqk1BkAxekXOFYgdtoVUSvdEGBMvuN8NHYVJJsLrvxsE9M66QripwgSxnmpoKs"
            />
            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
            <div className="absolute bottom-10 left-10 text-white">
              <h3 className="font-headline-lg text-headline-lg mb-2">Les Nouveautés</h3>
              <p className="font-body-md opacity-80 mb-4">Découvrez nos dernières créations automnales.</p>
              <Link to="/boutique" className="font-label-md text-label-md border-b border-white pb-1">Explorer →</Link>
            </div>
          </div>
          <div className="grid grid-rows-2 gap-grid-gutter">
            <Link to="/boutique" className="bg-surface-container p-10 flex items-center justify-between group cursor-pointer hover:bg-primary-container/10 transition-colors">
              <div className="space-y-2">
                <span className="text-primary font-label-md text-xs uppercase">Populaire</span>
                <h3 className="font-headline-md text-headline-md">Best Sellers</h3>
                <p className="text-on-surface-variant text-sm">Les préférés de nos clientes.</p>
              </div>
              <div className="material-symbols-outlined text-4xl text-outline-variant group-hover:text-primary group-hover:translate-x-2 transition-all">trending_up</div>
            </Link>
            <div className="bg-secondary-container/20 p-10 flex items-center justify-between group cursor-pointer hover:bg-secondary-container/40 transition-colors">
              <div className="space-y-2">
                <span className="text-secondary font-label-md text-xs uppercase">Promotion</span>
                <h3 className="font-headline-md text-headline-md">Flash Vente</h3>
                <p className="text-on-surface-variant text-sm">Offres limitées dans le temps.</p>
              </div>
              <div className="material-symbols-outlined text-4xl text-outline-variant group-hover:text-secondary group-hover:translate-x-2 transition-all">bolt</div>
            </div>
          </div>
        </div>
      </section>

      {/* Ventes Flash */}
      {flashProducts.length > 0 && (
        <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
          <div className="bg-on-surface overflow-hidden">
            {/* En-tête */}
            <div className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-error text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                <div>
                  <h2 className="font-serif text-xl text-white">Ventes Flash</h2>
                  <p className="font-sans text-xs text-white/50">Offres limitées dans le temps</p>
                </div>
              </div>
              {flashProducts[0] && <FlashTimer endsAt={flashProducts[0].flash_ends_at} />}
              <Link to="/ventes-flash"
                className="hidden md:flex items-center gap-1 font-sans text-xs font-bold text-error uppercase tracking-wider hover:text-error/80 transition-colors">
                Voir tout
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
            {/* Grille */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5">
              {flashProducts.map(p => {
                const pct = Math.round((1 - p.flash_price / p.price_cad) * 100);
                return (
                  <Link key={p.id} to={`/boutique/${p.slug}`} className="group bg-on-surface p-4 hover:bg-white/5 transition-colors">
                    <div className="relative aspect-[4/5] overflow-hidden mb-3">
                      {p.image_key ? (
                        <img alt={p.name} src={cfImage(p.image_key, "card") ?? p.image_key}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center">
                          <span className="material-symbols-outlined text-white/20 text-3xl">styler</span>
                        </div>
                      )}
                      <span className="absolute top-2 left-2 bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 rounded-sm">-{pct}%</span>
                    </div>
                    <p className="font-sans text-xs text-white/60 truncate mb-0.5">{p.name}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="font-sans text-sm font-bold text-error">{p.flash_price.toFixed(2)} $</span>
                      <span className="font-sans text-xs text-white/40 line-through">{p.price_cad.toFixed(2)} $</span>
                    </div>
                  </Link>
                );
              })}
            </div>
            {/* Footer mobile */}
            <div className="md:hidden px-6 py-3 border-t border-white/10">
              <Link to="/ventes-flash" className="flex items-center justify-center gap-1 font-sans text-xs font-bold text-error uppercase tracking-wider">
                Voir toutes les ventes flash
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Featured Products (dynamic) */}
      {featuredProducts.length > 0 && (
        <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
          <div className="text-center mb-12">
            <h2 className="font-headline-lg text-headline-lg text-on-surface">Produits Vedettes</h2>
            <p className="text-on-surface-variant font-body-md mt-2">Nos pièces les plus prisées, sélectionnées pour vous.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-grid-gutter">
            {featuredProducts.map((product: Product) => (
              <Link to={`/boutique`} key={product.id} className="group cursor-pointer">
                <div className="aspect-[4/5] overflow-hidden bg-surface-container relative mb-4">
                  {product.image_key && (
                    <img
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      src={cfImage(product.image_key, "card") ?? product.image_key}
                    />
                  )}
                  <div className="absolute top-4 left-4">
                    <span className="bg-primary text-on-primary px-3 py-1 font-label-md text-[10px] uppercase tracking-widest">Vedette</span>
                  </div>
                </div>
                <h2 className="font-headline-md text-headline-md mb-1">{product.name}</h2>
                <p className="font-body-md text-body-md text-on-surface-variant mb-2">{product.description}</p>
                <p className="font-body-md text-body-md font-semibold text-primary">${product.price_cad.toFixed(2)} CAD</p>
              </Link>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link to="/boutique" className="px-10 py-4 border border-on-surface text-on-surface font-label-md text-label-md hover:bg-on-surface hover:text-white transition-all duration-300 inline-block">
              Voir toute la collection
            </Link>
          </div>
        </section>
      )}

      {/* Featured Categories (Texture & Style) */}
      <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
        <div className="text-center mb-12">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Choisir par Texture</h2>
          <p className="text-on-surface-variant font-body-md mt-2">Trouvez le style qui correspond à votre nature.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-grid-gutter">
          {[
            { name: "Lisse", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBxubQU5RhI8bRCD25p6r_P5QJNuq_tzQhOf2rXOsSUHA0YQPZyw3g75A0k3D_TxdPc912kjItpmb11y438cb2YognsZBqILevEzQvH_2svSgC0rDOIBLqICODzydhQ7urdVYNAQsnr2mAEZkx7FwwyMFXKX6tUyuxN_4KFjAiCCMcH0VtHs8Qv0oJWwz5epfbVUt1-CXOCYxPovgAfAJdy_rZIlcHLEREFsiwKEGn8JbKrX1v16uZ4nklM_xOsPeO3cGn6syU-XaE" },
            { name: "Body Wave", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCCbcyZDFlEUORFmblZANwAMfCUCqOkctvG5QFcBrCOQV-nphWsF7tS20ffky6c3CvWhH-MwY9lAhxG4Mx9WFX8sDrVXcRxEy99UbwX4cq2ZfAwB3nqFjDFd76bjPOIfVDVeb8jfNtg7SwYuyT7fGR0ZgYEnAAas-huxvkHdytFje67w2b8064LnqZJ1ymKw6DSATRGodGcXyxaSGqk1BkAxekXOFYgdtoVUSvdEGBMvuN8NHYVJJsLrvxsE9M66QripwgSxnmpoKs" },
            { name: "Bouclé", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuD60WEnVX-_yLSvBntPn9HrU1nMVF-gv9xPTRec1w6rXpr4rqxeI66WP2DFiBaYoulS2wO6R1uIRVXSB1rN_Pj5mbPzb303zLNDW2PMgXnyrLTWDMKLMvhBx22vlId7Jw9fQbhcsxLH7jR3S1tDLkN-zul8kq20lL6nk1BFRFurGFVrK-hXpavqiXVgAlhe7fVFC3PbQwTq9v59NgUOuZ3JIP-wvjMwOaXo_uciqMIP9hB2rhSlCzIgco_KjJbOZGb9ivAfYQEmlXA" },
            { name: "Water Wave", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAY7uaxRnoYo0XebGu4c2gFUG9vOhW_gtOeGGYTeUpOfskjs-B0bR3vtiQf9KBBNjn_ASYUVyTGI2Ao61G6L2jM3vBOaWTymc8op5GMptCg-nRmIbq4-VmbBRwtKPL2g0fuHcjGW7nt9WQ610pDNHrLb0sY4df0OO7x1GESVzyXfwat1I2zRGfcEvWjs6-yVxhH6sfVViLUsBrr1JSOq2vaMtE3wW2RLMhBPIpJMIQJtxdy6TtGM5Xf-VrcJfnq_-K5WcNA4NymnxU" },
          ].map((cat) => (
            <Link to={`/boutique?category=${cat.name.toLowerCase().replace(" ", "-")}`} key={cat.name} className="text-center group cursor-pointer">
              <div className="aspect-square rounded-full overflow-hidden mb-4 border-2 border-transparent group-hover:border-primary transition-all p-1">
                <img alt={cat.name} className="w-full h-full object-cover rounded-full" src={cat.img} />
              </div>
              <h4 className="font-label-md text-label-md">{cat.name}</h4>
            </Link>
          ))}
        </div>
      </section>

      {/* VIP Insider Reward */}
      <section className="mt-section-gap-desktop bg-surface-container-high py-section-gap-desktop relative overflow-hidden">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop text-center relative z-10">
          <div className="flex justify-center mb-8">
            <img
              alt="VIP Reward Card"
              className="h-40 w-auto rotate-[-5deg] hover:rotate-0 transition-transform"
              src="https://lh3.googleusercontent.com/aida/AP1WRLv-7RTtUbNUUxYx6LApItv_U9grg389-1NuF0m9cyIKf12v43ciK8F3D3rC9hOUxoBhvmK1bKUlE0wAT52Hv7-u2Bdcc7rcUK68gbGUC0rkkmHFv6zchuvog3LGba8qTezf5KKE5X5Y0ksrt5_s6Y0LRsHSMLDTUINaKLW8yCTCYvbns74luDroQNTQAcj__KgXeo2kpwQqfJ61xGc5gP4zPoUDWeuQvHrvrm1k4NzrB0QyhauvpjvIUUw"
            />
          </div>
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-6 italic">Rejoignez le Cercle Privé VIP</h2>
          <p className="font-body-lg text-on-surface-variant max-w-2xl mx-auto mb-10">
            Inscrivez-vous pour recevoir des guides de style exclusifs, des alertes de nouveaux arrivages et recevez <span className="font-bold text-primary">10% de réduction</span> sur votre première commande premium.
          </p>
          <form className="max-w-md mx-auto flex flex-col md:flex-row gap-4">
            <input
              className="flex-grow bg-transparent border-0 border-b border-outline focus:ring-0 focus:border-primary font-body-md placeholder:text-on-surface-variant/50 px-0 py-3 text-on-surface"
              placeholder="Votre adresse e-mail"
              type="email"
            />
            <button className="px-10 py-3 bg-on-surface text-white font-label-md text-label-md rounded-sm hover:bg-primary transition-colors">S'inscrire</button>
          </form>
          <p className="mt-6 text-[11px] text-on-surface-variant/60 font-label-md">En vous inscrivant, vous acceptez notre <Link to="/confidentialite" className="underline">politique de confidentialité</Link>.</p>
        </div>
      </section>

    </>
  );
}

// ─── Hero Carousel ──────────────────────────────────────────────────────────

const SLIDES = [
  {
    tag: "Nouvelle Collection",
    title: ["L'Élégance", "Redéfinie"],
    subtitle: "Perruques en cheveux humains 100% — sélectionnées pour la femme moderne, livrées à Montréal.",
    cta: { label: "Découvrir la boutique", to: "/boutique" },
    cta2: { label: "Nous contacter", to: "/contact" },
    img: "https://lh3.googleusercontent.com/aida/AP1WRLvgOP7GaYVKdb8rCQb9YTruiab11rrps-I_BpwRBuPJ0WmDOm6aXcAzsPkEdc3Y_iEylSp3ZhwRrzSAz0RZXCx_TS9g5y0SyW1xruxzOuH_zxvKZkqyObh0wQnCpZUBLOoHBv5PhFUuMgN-Gt3itdtP6Jr0RVz92GKuzKy6UmiVrascDDNHQHGZs2MLEdopMCXF7MmFlJalhMC5CNLP7HnKvqbof6uzcBEDkFJ1Gf6ASM-Z08JzxBlu-3Y",
    gradient: "to right",
  },
  {
    tag: "Offres Exclusives",
    title: ["Jusqu'à -30%", "sur les HD Lace"],
    subtitle: "Profitez de nos promotions limitées — dentelle invisible, rendu naturel exceptionnel.",
    cta: { label: "Voir les promotions", to: "/promotions" },
    cta2: { label: "Toute la collection", to: "/boutique" },
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCCbcyZDFlEUORFmblZANwAMfCUCqOkctvG5QFcBrCOQV-nphWsF7tS20ffky6c3CvWhH-MwY9lAhxG4Mx9WFX8sDrVXcRxEy99UbwX4cq2ZfAwB3nqFjDFd76bjPOIfVDVeb8jfNtg7SwYuyT7fGR0ZgYEnAAas-huxvkHdytFje67w2b8064LnqZJ1ymKw6DSATRGodGcXyxaSGqk1BkAxekXOFYgdtoVUSvdEGBMvuN8NHYVJJsLrvxsE9M66QripwgSxnmpoKs",
    gradient: "to right",
  },
  {
    tag: "Texture Signature",
    title: ["Bouclé naturel,", "Volume maximal"],
    subtitle: "Des textures authentiques qui respirent et bougent comme vos propres cheveux.",
    cta: { label: "Explorer les textures", to: "/boutique?texture=boucle" },
    cta2: { label: "Guide d'entretien", to: "/guide-entretien" },
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuD60WEnVX-_yLSvBntPn9HrU1nMVF-gv9xPTRec1w6rXpr4rqxeI66WP2DFiBaYoulS2wO6R1uIRVXSB1rN_Pj5mbPzb303zLNDW2PMgXnyrLTWDMKLMvhBx22vlId7Jw9fQbhcsxLH7jR3S1tDLkN-zul8kq20lL6nk1BFRFurGFVrK-hXpavqiXVgAlhe7fVFC3PbQwTq9v59NgUOuZ3JIP-wvjMwOaXo_uciqMIP9hB2rhSlCzIgco_KjJbOZGb9ivAfYQEmlXA",
    gradient: "to right",
  },
  {
    tag: "Prêt à Porter",
    title: ["Posée en 5 min,", "Belle pour toujours"],
    subtitle: "Nos perruques glueless prêtes à porter — sans colle, sans effort, sans compromis sur le style.",
    cta: { label: "Voir les glueless", to: "/boutique?glueless=1" },
    cta2: { label: "Body Wave", to: "/boutique?texture=body-wave" },
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBxubQU5RhI8bRCD25p6r_P5QJNuq_tzQhOf2rXOsSUHA0YQPZyw3g75A0k3D_TxdPc912kjItpmb11y438cb2YognsZBqILevEzQvH_2svSgC0rDOIBLqICODzydhQ7urdVYNAQsnr2mAEZkx7FwwyMFXKX6tUyuxN_4KFjAiCCMcH0VtHs8Qv0oJWwz5epfbVUt1-CXOCYxPovgAfAJdy_rZIlcHLEREFsiwKEGn8JbKrX1v16uZ4nklM_xOsPeO3cGn6syU-XaE",
    gradient: "to right",
  },
];

const SLIDE_DURATION = 6000;
const PROGRESS_TICK = 60;

function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  function goTo(idx: number) {
    if (idx === current) return;
    setCurrent(idx);
    setAnimKey(k => k + 1);
  }

  function goPrev() { goTo((current - 1 + SLIDES.length) % SLIDES.length); }
  function goNext() { goTo((current + 1) % SLIDES.length); }

  // Chain-timer: each slide change resets progress + schedules next advance
  useEffect(() => {
    setProgress(0);
    if (paused) return;

    const progressTimer = setInterval(() => {
      setProgress(p => Math.min(p + (PROGRESS_TICK / SLIDE_DURATION) * 100, 100));
    }, PROGRESS_TICK);

    const slideTimer = setTimeout(() => {
      setCurrent(c => (c + 1) % SLIDES.length);
      setAnimKey(k => k + 1);
    }, SLIDE_DURATION);

    return () => { clearInterval(progressTimer); clearTimeout(slideTimer); };
  }, [paused, current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const slide = SLIDES[current];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ddm-kenburns {
          from { transform: scale(1) translateX(0); }
          to   { transform: scale(1.08) translateX(-1%); }
        }
        @keyframes ddm-fade-up {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes ddm-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .ddm-kenburns { animation: ddm-kenburns 7s ease-out both; }
        .ddm-fade-up  { animation: ddm-fade-up 0.75s cubic-bezier(.22,1,.36,1) both; }
        .ddm-fade-in  { animation: ddm-fade-in 1s ease both; }
      ` }} />

      <section
        className="relative w-full h-[90vh] min-h-[560px] overflow-hidden select-none"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        aria-label="Carrousel hero"
      >
        {/* ── Slides images ── */}
        {SLIDES.map((s, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-1000"
            style={{ opacity: i === current ? 1 : 0, zIndex: i === current ? 2 : 0 }}>
            <img
              key={i === current ? `active-${animKey}` : i}
              src={s.img} alt=""
              className={`absolute inset-0 w-full h-full object-cover ${i === current ? "ddm-kenburns" : ""}`}
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to right, rgba(10,8,6,0.72) 0%, rgba(10,8,6,0.35) 55%, rgba(10,8,6,0.10) 100%)" }} />
            {/* Bottom vignette */}
            <div className="absolute inset-x-0 bottom-0 h-40"
              style={{ background: "linear-gradient(to top, rgba(10,8,6,0.5) 0%, transparent 100%)" }} />
          </div>
        ))}

        {/* ── Contenu texte ── */}
        <div className="absolute inset-0 z-10 flex items-center pointer-events-none">
          <div className="px-8 md:px-16 lg:px-24 xl:px-32 w-full max-w-[90rem] mx-auto">
            <div className="max-w-2xl pointer-events-auto" key={animKey}>

              {/* Tag */}
              <div className="ddm-fade-up mb-5" style={{ animationDelay: "0ms" }}>
                <span className="inline-flex items-center gap-2 bg-primary/90 backdrop-blur-sm text-on-primary px-4 py-1.5 font-sans text-[11px] font-bold uppercase tracking-[0.25em]">
                  <span className="w-1.5 h-1.5 rounded-full bg-on-primary/80 inline-block" />
                  {slide.tag}
                </span>
              </div>

              {/* Titre */}
              <h1 className="font-serif text-white leading-[1.05] mb-6">
                <span className="block text-5xl md:text-6xl lg:text-7xl ddm-fade-up" style={{ animationDelay: "80ms" }}>
                  {slide.title[0]}
                </span>
                <span className="block text-5xl md:text-6xl lg:text-7xl italic text-primary-fixed ddm-fade-up" style={{ animationDelay: "160ms" }}>
                  {slide.title[1]}
                </span>
              </h1>

              {/* Sous-titre */}
              <p className="font-sans text-base md:text-lg text-white/80 max-w-lg leading-relaxed mb-8 ddm-fade-up" style={{ animationDelay: "240ms" }}>
                {slide.subtitle}
              </p>

              {/* CTA */}
              <div className="flex flex-wrap gap-3 ddm-fade-up" style={{ animationDelay: "320ms" }}>
                <Link to={slide.cta.to}
                  className="px-8 py-4 bg-white text-on-surface font-sans text-sm font-bold uppercase tracking-widest hover:bg-primary hover:text-on-primary transition-all duration-300">
                  {slide.cta.label}
                </Link>
                {slide.cta2 && (
                  <Link to={slide.cta2.to}
                    className="px-8 py-4 border border-white/50 text-white font-sans text-sm font-bold uppercase tracking-widest hover:bg-white/10 backdrop-blur-sm transition-all duration-300">
                    {slide.cta2.label}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Flèches navigation ── */}
        <button onClick={goPrev} aria-label="Slide précédent"
          className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-black/25 backdrop-blur-sm text-white flex items-center justify-center hover:bg-primary transition-all duration-300 opacity-60 hover:opacity-100">
          <span className="material-symbols-outlined text-2xl">chevron_left</span>
        </button>
        <button onClick={goNext} aria-label="Slide suivant"
          className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-black/25 backdrop-blur-sm text-white flex items-center justify-center hover:bg-primary transition-all duration-300 opacity-60 hover:opacity-100">
          <span className="material-symbols-outlined text-2xl">chevron_right</span>
        </button>

        {/* ── Indicateurs bas ── */}
        <div className="absolute bottom-8 z-20 w-full flex items-center justify-center gap-1 px-8">
          <div className="flex items-center gap-3">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} aria-label={`Slide ${i + 1}`}
                className="group flex flex-col items-start gap-1.5 focus:outline-none">
                {/* Barre de progression */}
                <div className={`h-[2px] transition-all duration-500 overflow-hidden ${i === current ? "w-14 bg-white/30" : "w-6 bg-white/20 hover:bg-white/40"}`}>
                  {i === current && (
                    <div className="h-full bg-primary transition-none origin-left"
                      style={{ width: `${progress}%` }} />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Compteur */}
          <span className="ml-6 font-sans text-[11px] text-white/50 tabular-nums tracking-widest">
            {String(current + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
          </span>

          {/* Pause/play */}
          <button onClick={() => setPaused(p => !p)} aria-label={paused ? "Reprendre" : "Pause"}
            className="ml-3 text-white/40 hover:text-white/80 transition-colors">
            <span className="material-symbols-outlined text-base">{paused ? "play_arrow" : "pause"}</span>
          </button>
        </div>

        {/* ── Scroll hint ── */}
        <div className="absolute bottom-8 right-8 z-20 hidden md:flex flex-col items-center gap-2 text-white/40">
          <span className="font-sans text-[10px] uppercase tracking-[0.2em] rotate-90 origin-center translate-y-4">Scroll</span>
          <div className="w-[1px] h-10 bg-white/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1/2 bg-white/60"
              style={{ animation: "ddm-scroll-hint 1.8s ease-in-out infinite" }} />
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes ddm-scroll-hint {
            0%   { transform: translateY(-100%); }
            100% { transform: translateY(200%); }
          }
        ` }} />
      </section>
    </>
  );
}
