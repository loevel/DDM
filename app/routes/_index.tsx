import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { useEffect, useState } from "react";
import { cfImage } from "~/lib/images";
import { getDB, getProducts, getSecondaryImages } from "~/lib/db.server";
import { ProductTile } from "~/components/ProductTile";
import type { Product } from "~/lib/db.server";

const BASE = "https://ddmwigs.com";
const SITE_DESC = "Perruques en cheveux humains 100% — Lace front, HD lace, glueless. Livraison rapide au Canada. DDM Wigs & More, Montréal.";
// Image du hero — utilisée pour les partages sociaux (og:image)
const OG_IMAGE = "https://lh3.googleusercontent.com/aida-public/AB6AXuAY7uaxRnoYo0XebGu4c2gFUG9vOhW_gtOeGGYTeUpOfskjs-B0bR3vtiQf9KBBNjn_ASYUVyTGI2Ao61G6L2jM3vBOaWTymc8op5GMptCg-nRmIbq4-VmbBRwtKPL2g0fuHcjGW7nt9WQ610pDNHrLb0sY4df0OO7x1GESVzyXfwat1I2zRGfcEvWjs6-yVxhH6sfVViLUsBrr1JSOq2vaMtE3wW2RLMhBPIpJMIQJtxdy6TtGM5Xf-VrcJfnq_-K5WcNA4NymnxU";

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
  { property: "og:image",       content: OG_IMAGE },
  // Twitter
  { name: "twitter:card",        content: "summary_large_image" },
  { name: "twitter:title",       content: "DDM Wigs & More | Perruques Cheveux Humains — Montréal" },
  { name: "twitter:description", content: SITE_DESC },
  { name: "twitter:image",       content: OG_IMAGE },
];

const LOCAL_BUSINESS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "HairSalon",
  name: "DDM Wigs & More",
  description: SITE_DESC,
  url: BASE,
  image: OG_IMAGE,
  logo: `${BASE}/images/ddm-logo.svg`,
  address: {
    "@type": "PostalAddress",
    addressLocality: "Montréal",
    addressRegion: "QC",
    addressCountry: "CA",
  },
  areaServed: "CA",
  priceRange: "$$",
  currenciesAccepted: "CAD",
  paymentAccepted: "Visa, Mastercard, Amex, Apple Pay, Google Pay",
} as const;

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

  const secondImageMap = await getSecondaryImages(db, featuredProducts);

  return json({ featuredProducts, flashProducts, secondImageMap });
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
  const { featuredProducts, flashProducts, secondImageMap } = useLoaderData<typeof loader>();

  // La grille des vedettes est en 2 ou 4 colonnes selon l'écran : on s'arrête à un
  // multiple de 4 pour que la vitrine se referme sur une rangée pleine aux deux
  // paliers. Au-delà de huit, c'est le lien « toute la collection » qui prend le
  // relais — l'accueil est une sélection, pas le catalogue.
  const vedettes = featuredProducts.length >= 8
    ? featuredProducts.slice(0, 8)
    : featuredProducts.slice(0, featuredProducts.length >= 4 ? 4 : featuredProducts.length);

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <HeroCarousel />

      {/* Garanties — bandeau de réassurance */}
      <section className="bg-surface-container-low border-b border-outline-variant/40">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 md:gap-0">
            {[
              { icon: "assignment_return", label: "14 jours retour", sub: "Satisfaction garantie" },
              { icon: "local_shipping",    label: "Livraison gratuite", sub: "Partout au Canada" },
              { icon: "schedule",          label: "Expédition 72 h", sub: "Rapide et suivie" },
              { icon: "verified",          label: "100 % vrais cheveux", sub: "Qualité premium certifiée" },
            ].map(({ icon, label, sub }, i) => (
              <div key={label}
                className={`flex items-start gap-3 py-6 md:py-10 md:px-8 ${i > 0 ? "md:border-l md:border-outline-variant/40" : ""}`}>
                <span className="material-symbols-outlined text-primary text-xl leading-none mt-0.5">{icon}</span>
                <div className="min-w-0">
                  <p className="font-sans text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface">{label}</p>
                  <p className="font-sans text-xs text-on-surface-variant mt-1.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quiz — même bandeau que celui posé au milieu de la grille boutique */}
      <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
        <div className="bg-on-surface text-white px-8 py-12 md:px-14 md:py-16 flex flex-col md:flex-row md:items-end gap-8 md:gap-12">
          <div className="min-w-0 flex-1">
            <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-primary-fixed mb-4">
              Conseil personnalisé
            </p>
            <p className="font-serif text-3xl md:text-5xl leading-[1.05] tracking-[-0.01em]">
              <span className="block">Cinq questions,</span>
              <span className="block italic text-primary-fixed">et on trouve la vôtre.</span>
            </p>
          </div>
          <div className="shrink-0">
            <Link to="/quiz"
              className="inline-flex items-center gap-2 bg-white text-on-surface px-8 py-4 font-sans text-sm font-bold uppercase tracking-widest hover:bg-primary hover:text-on-primary transition-colors">
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              Faire le quiz
            </Link>
            <p className="font-sans text-[11px] text-white/40 mt-3">2 minutes · gratuit · sans compte</p>
          </div>
        </div>
      </section>

      {/* Raccourcis boutique */}
      <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-grid-gutter">

          {/* Le visuel n'est plus désaturé : sur une perruque, la couleur est
              justement l'argument de vente. */}
          <Link to="/boutique" className="group relative block overflow-hidden aspect-[4/5] md:aspect-auto md:h-[540px]">
            <img
              alt="Nouveautés"
              className="absolute inset-0 w-full h-full object-cover ddm-zoom"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCCbcyZDFlEUORFmblZANwAMfCUCqOkctvG5QFcBrCOQV-nphWsF7tS20ffky6c3CvWhH-MwY9lAhxG4Mx9WFX8sDrVXcRxEy99UbwX4cq2ZfAwB3nqFjDFd76bjPOIfVDVeb8jfNtg7SwYuyT7fGR0ZgYEnAAas-huxvkHdytFje67w2b8064LnqZJ1ymKw6DSATRGodGcXyxaSGqk1BkAxekXOFYgdtoVUSvdEGBMvuN8NHYVJJsLrvxsE9M66QripwgSxnmpoKs"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
            <div className="absolute inset-x-8 bottom-8 text-white">
              <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-primary-fixed mb-3">Arrivages</p>
              <h3 className="font-serif text-4xl md:text-5xl leading-[0.95] tracking-[-0.02em] mb-4">
                <span className="block">Les</span>
                <span className="block italic">Nouveautés</span>
              </h3>
              <span className="inline-flex items-center gap-2 font-sans text-xs font-bold uppercase tracking-widest border-b border-white pb-1">
                Explorer
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </span>
            </div>
          </Link>

          <div className="grid grid-rows-2 gap-grid-gutter md:h-[540px]">
            {[
              { to: "/boutique", folio: "01", eyebrow: "Populaire", title: "Best", accent: "Sellers",
                sub: "Les préférés de nos clientes.", icon: "trending_up", bg: "bg-surface-container" },
              { to: "/ventes-flash", folio: "02", eyebrow: "Promotion", title: "Ventes", accent: "Flash",
                sub: "Offres limitées dans le temps.", icon: "bolt", bg: "bg-secondary-container/25" },
            ].map(({ to, folio, eyebrow, title, accent, sub, icon, bg }) => (
              <Link key={to} to={to}
                className={`group flex items-end justify-between gap-6 p-8 md:p-10 ${bg} hover:bg-primary/10 transition-colors`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="ddm-folio">{folio}</span>
                    <span className="h-px w-10 bg-outline-variant/60" />
                    <span className="font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{eyebrow}</span>
                  </div>
                  <h3 className="font-serif text-3xl md:text-4xl leading-[0.95] tracking-[-0.02em] text-on-surface">
                    <span className="block">{title}</span>
                    <span className="block italic text-primary">{accent}</span>
                  </h3>
                  <p className="font-sans text-sm text-on-surface-variant mt-3">{sub}</p>
                </div>
                <span className="material-symbols-outlined text-4xl text-outline-variant group-hover:text-primary group-hover:translate-x-2 transition-all shrink-0">
                  {icon}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Ventes Flash */}
      {flashProducts.length > 0 && (
        <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
          <div className="bg-on-surface overflow-hidden">
            {/* En-tête */}
            <div className="flex items-center justify-between gap-4 px-6 md:px-10 py-6 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <span className="material-symbols-outlined text-error text-2xl shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                <div className="min-w-0">
                  <p className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-error mb-1">Offres limitées</p>
                  <h2 className="font-serif text-2xl md:text-3xl text-white leading-none">Ventes Flash</h2>
                </div>
              </div>
              {flashProducts[0] && <FlashTimer endsAt={flashProducts[0].flash_ends_at} />}
              <Link to="/ventes-flash"
                className="hidden md:flex items-center gap-1 font-sans text-xs font-bold text-error uppercase tracking-wider hover:text-error/80 transition-colors shrink-0">
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
                    <div className="relative aspect-[3/4] overflow-hidden mb-3">
                      {p.image_key ? (
                        <img alt={p.name} loading="lazy" src={cfImage(p.image_key, "card") ?? p.image_key}
                          className="w-full h-full object-cover ddm-zoom" />
                      ) : (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center">
                          <span className="material-symbols-outlined text-white/20 text-3xl">styler</span>
                        </div>
                      )}
                      <span className="absolute top-2 left-2 bg-error text-on-error text-[10px] font-bold uppercase tracking-widest px-2 py-0.5">−{pct}%</span>
                    </div>
                    <p className="font-serif text-sm text-white/90 truncate mb-1">{p.name}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-base font-bold text-error">{p.flash_price.toFixed(2)} $</span>
                      <span className="font-sans text-xs text-white/40 line-through">{p.price_cad.toFixed(2)} $</span>
                    </div>
                  </Link>
                );
              })}
            </div>
            {/* Pied mobile */}
            <div className="md:hidden px-6 py-4 border-t border-white/10">
              <Link to="/ventes-flash" className="flex items-center justify-center gap-1 font-sans text-xs font-bold text-error uppercase tracking-wider">
                Voir toutes les ventes flash
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Produits vedettes */}
      {vedettes.length > 0 && (
        <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
          <SectionHead
            eyebrow="Sélection de la maison"
            title="Produits"
            accent="Vedettes"
            link={{ to: "/boutique", label: "Toute la collection" }}
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-10 md:gap-y-14">
            {vedettes.map((product: Product, i: number) => (
              <ProductTile
                key={product.id}
                product={product}
                folio={i + 1}
                secondImage={secondImageMap[product.id]}
                eager={i < 4}
                badge="Vedette"
              />
            ))}
          </div>
        </section>
      )}

      {/* Textures */}
      <section className="max-w-container-max-width mx-auto px-grid-margin-desktop mt-section-gap-desktop">
        <SectionHead
          eyebrow="Trouver son style"
          title="Choisir par"
          accent="Texture"
        />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 md:gap-x-6 gap-y-8">
          {[
            { name: "Lisse", slug: "lisse", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBxubQU5RhI8bRCD25p6r_P5QJNuq_tzQhOf2rXOsSUHA0YQPZyw3g75A0k3D_TxdPc912kjItpmb11y438cb2YognsZBqILevEzQvH_2svSgC0rDOIBLqICODzydhQ7urdVYNAQsnr2mAEZkx7FwwyMFXKX6tUyuxN_4KFjAiCCMcH0VtHs8Qv0oJWwz5epfbVUt1-CXOCYxPovgAfAJdy_rZIlcHLEREFsiwKEGn8JbKrX1v16uZ4nklM_xOsPeO3cGn6syU-XaE" },
            { name: "Body Wave", slug: "body-wave", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCCbcyZDFlEUORFmblZANwAMfCUCqOkctvG5QFcBrCOQV-nphWsF7tS20ffky6c3CvWhH-MwY9lAhxG4Mx9WFX8sDrVXcRxEy99UbwX4cq2ZfAwB3nqFjDFd76bjPOIfVDVeb8jfNtg7SwYuyT7fGR0ZgYEnAAas-huxvkHdytFje67w2b8064LnqZJ1ymKw6DSATRGodGcXyxaSGqk1BkAxekXOFYgdtoVUSvdEGBMvuN8NHYVJJsLrvxsE9M66QripwgSxnmpoKs" },
            { name: "Bouclé", slug: "boucle", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuD60WEnVX-_yLSvBntPn9HrU1nMVF-gv9xPTRec1w6rXpr4rqxeI66WP2DFiBaYoulS2wO6R1uIRVXSB1rN_Pj5mbPzb303zLNDW2PMgXnyrLTWDMKLMvhBx22vlId7Jw9fQbhcsxLH7jR3S1tDLkN-zul8kq20lL6nk1BFRFurGFVrK-hXpavqiXVgAlhe7fVFC3PbQwTq9v59NgUOuZ3JIP-wvjMwOaXo_uciqMIP9hB2rhSlCzIgco_KjJbOZGb9ivAfYQEmlXA" },
            { name: "Water Wave", slug: "water-wave", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAY7uaxRnoYo0XebGu4c2gFUG9vOhW_gtOeGGYTeUpOfskjs-B0bR3vtiQf9KBBNjn_ASYUVyTGI2Ao61G6L2jM3vBOaWTymc8op5GMptCg-nRmIbq4-VmbBRwtKPL2g0fuHcjGW7nt9WQ610pDNHrLb0sY4df0OO7x1GESVzyXfwat1I2zRGfcEvWjs6-yVxhH6sfVViLUsBrr1JSOq2vaMtE3wW2RLMhBPIpJMIQJtxdy6TtGM5Xf-VrcJfnq_-K5WcNA4NymnxU" },
          ].map((cat, i) => (
            <Link to={`/boutique?texture=${cat.slug}`} key={cat.name} className="group relative block">
              <div className="relative aspect-[3/4] overflow-hidden bg-surface-container">
                <img alt={cat.name} loading="lazy" src={cat.img} className="absolute inset-0 w-full h-full object-cover ddm-zoom" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                <div className="absolute inset-x-5 bottom-5 text-white">
                  <span className="font-sans text-[11px] font-bold tabular-nums tracking-[0.2em] text-white/60">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-serif text-2xl md:text-3xl leading-tight mt-1">{cat.name}</h3>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Cercle privé VIP */}
      <section className="mt-section-gap-desktop bg-surface-container-high py-section-gap-desktop">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop">
          <div className="ddm-rule mb-10" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-start">
            <div>
              <p className="ddm-eyebrow mb-4">Cercle privé</p>
              <h2 className="font-serif text-on-surface text-4xl md:text-5xl xl:text-6xl leading-[0.95] tracking-[-0.02em]">
                <span className="block">Dix pour cent,</span>
                <span className="block italic text-primary">et les arrivages avant tout le monde.</span>
              </h2>
            </div>
            <div className="lg:pt-4">
              <p className="font-body-lg text-on-surface-variant mb-8">
                Guides de style exclusifs, alertes de nouveaux arrivages, et{" "}
                <span className="font-bold text-primary">10 % de réduction</span> sur votre première commande.
              </p>
              <NewsletterSignup />
              <p className="mt-5 text-[11px] text-on-surface-variant/60 font-label-md">
                En vous inscrivant, vous acceptez notre <Link to="/confidentialite" className="underline">politique de confidentialité</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>

    </>
  );
}

/**
 * En-tête de section du registre éditorial : filet, sur-titre, gros titre serif
 * dont le second mot bascule en italique coloré, lien aligné à droite.
 */
function SectionHead({ eyebrow, title, accent, link }: {
  eyebrow: string;
  title: string;
  accent: string;
  link?: { to: string; label: string };
}) {
  return (
    <>
      <div className="ddm-rule mb-8" />
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10 md:mb-12">
        <div className="min-w-0">
          <p className="ddm-eyebrow mb-4">{eyebrow}</p>
          <h2 className="font-serif text-on-surface text-4xl md:text-5xl xl:text-6xl leading-[0.95] tracking-[-0.02em]">
            <span className="block">{title}</span>
            <span className="block italic text-primary">{accent}</span>
          </h2>
        </div>
        {link && (
          <Link to={link.to}
            className="shrink-0 inline-flex items-center gap-2 font-sans text-sm font-bold uppercase tracking-wider text-on-surface border-b-2 border-primary pb-1 hover:text-primary transition-colors">
            {link.label}
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </Link>
        )}
      </div>
    </>
  );
}

// ─── Inscription newsletter (VIP) ────────────────────────────────────────────

function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@") || state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-center gap-2 text-secondary font-body-md mb-4">
          <span className="material-symbols-outlined">check_circle</span>
          Bienvenue dans le Cercle Privé !
        </div>
        <div className="bg-surface border-2 border-dashed border-primary px-6 py-4 inline-block">
          <p className="font-label-md text-[10px] uppercase tracking-[0.2em] text-on-surface-variant mb-1">Votre code de bienvenue</p>
          <p className="font-serif text-3xl font-bold text-primary tracking-[0.15em]">VIP10</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">−10 % sur votre première commande</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto flex flex-col md:flex-row gap-4">
      <input
        className="flex-grow bg-transparent border-0 border-b border-outline focus:ring-0 focus:border-primary font-body-md placeholder:text-on-surface-variant/50 px-0 py-3 text-on-surface"
        placeholder="Votre adresse e-mail"
        type="email"
        name="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="px-10 py-3 bg-on-surface text-white font-label-md text-label-md rounded-sm hover:bg-primary transition-colors disabled:opacity-60"
      >
        {state === "loading" ? "Inscription…" : "S'inscrire"}
      </button>
      {state === "error" && (
        <p className="md:absolute md:mt-14 font-body-sm text-body-sm text-error">Une erreur est survenue — réessayez.</p>
      )}
    </form>
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
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAY7uaxRnoYo0XebGu4c2gFUG9vOhW_gtOeGGYTeUpOfskjs-B0bR3vtiQf9KBBNjn_ASYUVyTGI2Ao61G6L2jM3vBOaWTymc8op5GMptCg-nRmIbq4-VmbBRwtKPL2g0fuHcjGW7nt9WQ610pDNHrLb0sY4df0OO7x1GESVzyXfwat1I2zRGfcEvWjs6-yVxhH6sfVViLUsBrr1JSOq2vaMtE3wW2RLMhBPIpJMIQJtxdy6TtGM5Xf-VrcJfnq_-K5WcNA4NymnxU",
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
              <h1 className="font-serif text-white leading-[0.92] tracking-[-0.02em] mb-7">
                <span className="block text-[3.5rem] md:text-7xl lg:text-8xl xl:text-[6.5rem] ddm-fade-up" style={{ animationDelay: "80ms" }}>
                  {slide.title[0]}
                </span>
                <span className="block text-[3.5rem] md:text-7xl lg:text-8xl xl:text-[6.5rem] italic text-primary-fixed ddm-fade-up" style={{ animationDelay: "160ms" }}>
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
