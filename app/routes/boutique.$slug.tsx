import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { getDB, getProducts } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";
import { cfImage } from "~/lib/images";
import { DEMO_MAP } from "~/lib/demo-products";
import { getCustomerId } from "~/lib/session.server";
import { getCustomer } from "~/lib/auth.server";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ProductMedia {
  type: "image" | "video";
  url: string;
  thumbnail_url: string | null;
  alt_text: string | null;
}

interface Review {
  id: number;
  customer_name: string;
  rating: number;
  body: string | null;
  photos: string | null; // JSON array of CF Images URLs
  created_at: string;
}

interface ReviewStats {
  count: number;
  avg: number;
  dist: number[]; // index 0 = 1★ … index 4 = 5★
}

interface QAItem {
  id: number;
  customer_name: string;
  question: string;
  answer: string;
  answered_at: string;
}

interface LongueurVariant { slug: string; longueur_po: number; }
interface CouleurVariant { slug: string; couleur: string; }
interface ProductVariant { id: number; name: string; price_adjustment_cad: number; stock: number; }

// ─── Loader ────────────────────────────────────────────────────────────────

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDB(context);
  const product = await db
    .prepare("SELECT * FROM products WHERE slug = ?")
    .bind(params.slug)
    .first<Product>();

  // Fallback: demo product when DB is empty
  const demoProduct = !product ? DEMO_MAP[params.slug ?? ""] ?? null : null;
  if (!product && !demoProduct) throw new Response("Produit introuvable", { status: 404 });
  if (!product && demoProduct) {
    return json({
      product: demoProduct as Product,
      media: demoProduct.image_key ? [{ type: "image" as const, url: demoProduct.image_key, thumbnail_url: null, alt_text: null }] : [],
      related: [],
      longueurVars: [],
      couleurVars: [],
      productVariants: [] as ProductVariant[],
      reviews: [],
      reviewStats: { count: 0, avg: 0, dist: [0, 0, 0, 0, 0] },
      flash: null,
      qa: [],
      currentCustomer: null,
      hasPurchased: false,
      alreadyReviewed: false,
    });
  }
  // After the two guards above, product is guaranteed non-null.
  // TypeScript's narrowing doesn't always detect this through complex control flow,
  // so we add an explicit assertion here.
  if (!product) throw new Response("Produit introuvable", { status: 404 });

  // Variantes de longueur : même famille + texture, tous stocks
  const longueurVars = product.famille && product.texture
    ? (await db.prepare(
        "SELECT slug, longueur_po FROM products WHERE famille = ? AND texture = ? AND longueur_po IS NOT NULL ORDER BY longueur_po ASC"
      ).bind(product.famille, product.texture).all<LongueurVariant>()).results ?? []
    : [];

  // Variantes de couleur : même famille + longueur
  const couleurVars = product.famille && product.longueur_po
    ? (await db.prepare(
        "SELECT slug, couleur FROM products WHERE famille = ? AND longueur_po = ? AND couleur IS NOT NULL ORDER BY couleur ASC"
      ).bind(product.famille, product.longueur_po).all<CouleurVariant>()).results ?? []
    : [];

  // Session cliente
  const customerId = await getCustomerId(request, context as any).catch(() => null);
  const currentCustomer = customerId ? await getCustomer(customerId, context as any).catch(() => null) : null;

  // Avis approuvés (table may not exist yet → graceful fallback)
  let reviews: Review[] = [];
  let reviewStats: ReviewStats = { count: 0, avg: 0, dist: [0, 0, 0, 0, 0] };
  let hasPurchased = false;
  let alreadyReviewed = false;
  try {
    const rows = (await db.prepare(
      "SELECT id, customer_name, rating, body, photos, verified_purchase, created_at FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT 20"
    ).bind(product.id).all<Review>()).results ?? [];
    reviews = rows;
    if (rows.length > 0) {
      const dist: number[] = [0, 0, 0, 0, 0];
      let sum = 0;
      rows.forEach(r => { sum += r.rating; dist[r.rating - 1]++; });
      reviewStats = { count: rows.length, avg: sum / rows.length, dist };
    }
    if (currentCustomer) {
      const purchase = await db.prepare(`
        SELECT oi.id FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.customer_email = ? AND oi.product_id = ?
          AND (o.payment_status = 'paid' OR o.status IN ('confirmed', 'shipped', 'delivered'))
        LIMIT 1
      `).bind(currentCustomer.email, product.id).first();
      hasPurchased = !!purchase;
      const existing = await db.prepare("SELECT id FROM reviews WHERE product_id = ? AND customer_email = ?")
        .bind(product.id, currentCustomer.email).first();
      alreadyReviewed = !!existing;
    }
  } catch {
    // table reviews pas encore créée
  }

  // Médias du produit (images + vidéos)
  let media: ProductMedia[] = [];
  try {
    const rows = await db.prepare(
      "SELECT type, url, thumbnail_url, alt_text FROM product_media WHERE product_id = ? ORDER BY position ASC"
    ).bind(product.id).all<ProductMedia>();
    media = rows.results ?? [];
  } catch { /* table pas encore créée → fallback sur image_key */ }

  // Fallback : si pas de médias, on reconstruit depuis image_key
  if (media.length === 0 && product.image_key) {
    media = [{ type: "image", url: product.image_key, thumbnail_url: null, alt_text: null }];
  }

  // Déclinaisons du produit (product_variants)
  let productVariants: ProductVariant[] = [];
  try {
    const vRows = await db.prepare(
      "SELECT id, name, price_adjustment_cad, stock FROM product_variants WHERE product_id = ? ORDER BY id ASC"
    ).bind(product.id).all<ProductVariant>();
    productVariants = vRows.results ?? [];
  } catch { /* table pas encore créée */ }

  // Produits similaires (même famille, exclu l'actuel, max 4)
  const similaires = await getProducts(db, { famille: product.famille ?? undefined });
  const related = similaires.filter(p => p.id !== product.id).slice(0, 4);

  // Q&A du produit (questions avec réponse publiée)
  let qa: QAItem[] = [];
  try {
    const rows = await db.prepare(
      "SELECT id, customer_name, question, answer, answered_at FROM product_questions WHERE product_id = ? AND answered_at IS NOT NULL ORDER BY answered_at DESC LIMIT 20"
    ).bind(product.id).all<QAItem>();
    qa = rows.results ?? [];
  } catch { /* table pas encore créée */ }

  // Vente flash active sur ce produit
  let flash: { price: number; ends_at: string } | null = null;
  try {
    const now = new Date().toISOString();
    const row = await db.prepare(
      "SELECT flash_price_cad, ends_at FROM flash_sales WHERE product_id = ? AND active = 1 AND starts_at <= ? AND ends_at > ? ORDER BY flash_price_cad ASC LIMIT 1"
    ).bind(product.id, now, now).first<{ flash_price_cad: number; ends_at: string }>();
    if (row) flash = { price: row.flash_price_cad, ends_at: row.ends_at };
  } catch { /* table pas encore créée */ }

  return json({ product, media, related, longueurVars, couleurVars, productVariants, reviews, reviewStats, flash, qa, currentCustomer, hasPurchased, alreadyReviewed });
}

const BASE = "https://ddmwigs.com";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) return [{ title: "Produit — DDM Wigs" }];
  const p = data.product;
  if (!p) return [{ title: "Produit — DDM Wigs" }];
  const url = `${BASE}/boutique/${p.slug}`;
  const description = p.description
    ?? `${p.name} — Perruque cheveux humains premium. ${p.texture ?? ""} ${p.longueur_po ? p.longueur_po + " po" : ""}. Prix: ${p.price_cad.toFixed(2)} $ CAD.`;
  const imageUrl = p.image_key ?? undefined;

  return [
    { title: `${p.name} — DDM Wigs & More` },
    { name: "description", content: description },
    // Canonical
    { tagName: "link", rel: "canonical", href: url },
    // Open Graph
    { property: "og:type",        content: "product" },
    { property: "og:title",       content: `${p.name} — DDM Wigs & More` },
    { property: "og:description", content: description },
    { property: "og:url",         content: url },
    { property: "og:site_name",   content: "DDM Wigs & More" },
    { property: "og:locale",      content: "fr_CA" },
    ...(imageUrl ? [{ property: "og:image", content: imageUrl }] : []),
    // Twitter Card
    { name: "twitter:card",        content: "summary_large_image" },
    { name: "twitter:title",       content: `${p.name} — DDM Wigs & More` },
    { name: "twitter:description", content: description },
    ...(imageUrl ? [{ name: "twitter:image", content: imageUrl }] : []),
    // Prix produit (Facebook)
    { property: "product:price:amount",   content: String(p.price_cad) },
    { property: "product:price:currency", content: "CAD" },
    { property: "product:availability",   content: (p.stock ?? 0) > 0 ? "in stock" : "out of stock" },
  ];
};

// ─── Labels ────────────────────────────────────────────────────────────────

const TEXTURE_LABELS: Record<string, string> = {
  "lisse": "Lisse (Straight)", "body-wave": "Body Wave", "water-wave": "Water Wave",
  "deep-wave": "Deep Wave", "loose-wave": "Loose Wave", "boucle": "Bouclé (Curly)",
  "kinky-curly": "Kinky Curly", "kinky-straight": "Kinky Straight",
  "bob": "Bob", "avec-frange": "Avec frange",
};

const LACE_LABELS: Record<string, string> = {
  "13x4": "13×4 Lace Front", "13x6": "13×6 Lace Front",
  "5x5": "5×5 Lace Closure", "4x4": "4×4 Lace Closure",
  "360": "360 Lace", "full": "Full Lace",
  "glueless": "Sans colle (Glueless)", "pre-everything": "Prêt à porter",
  "v-part": "V-Part", "u-part": "U-Part",
};

const FAMILLE_LABELS: Record<string, string> = {
  perruque: "Perruques", meche: "Mèches", closure: "Closures",
  frontal: "Frontals", accessoire: "Accessoires", soin: "Soins",
};

// ─── Page ──────────────────────────────────────────────────────────────────

function FlashCountdown({ endsAt }: { endsAt: string }) {
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
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return <span className="font-mono tabular-nums">{d > 0 ? `${d}j ` : ""}{pad(h)}:{pad(m)}:{pad(sec)}</span>;
}

export default function FicheProduit() {
  const { product: p, media, related, longueurVars, couleurVars, productVariants, reviews, reviewStats, flash, qa, currentCustomer, hasPurchased, alreadyReviewed } = useLoaderData<typeof loader>();

  const [qty, setQty] = useState(1);
  const [cartState, setCartState] = useState<"idle" | "loading" | "added" | "error">("idle");
  const [openSection, setOpenSection] = useState<string | null>("description");
  const [selectedDensity, setSelectedDensity] = useState<number>(p.densite ?? 150);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    productVariants.length > 0 ? productVariants[0].id : null
  );
  const [wishlist, setWishlist] = useState(false);
  const [wishlistLoaded, setWishlistLoaded] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showSticky, setShowSticky] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const ctaRef = useRef<HTMLDivElement>(null);

  const selectedVariant = productVariants.find(v => v.id === selectedVariantId) ?? null;
  const variantPriceAdj = selectedVariant?.price_adjustment_cad ?? 0;
  const effectiveStock = selectedVariant ? selectedVariant.stock : p.stock;

  const basePrice = flash ? flash.price : p.price_cad;
  const displayPrice = basePrice + variantPriceAdj;
  const originalPrice = flash ? p.price_cad : (p.compare_at_price_cad ?? null);
  const discount = originalPrice && originalPrice > displayPrice
    ? Math.round((1 - displayPrice / originalPrice) * 100)
    : null;

  const showLongueurVariants = longueurVars.length > 1;
  const showCouleurVariants = couleurVars.length > 1;
  const showDensityPicker = p.famille === "perruque" || p.famille === "closure" || p.famille === "frontal";

  useEffect(() => {
    fetch(`/api/wishlist?productId=${p.id}`)
      .then(r => r.json())
      .then((d: any) => { setWishlist(d.inWishlist); setWishlistLoaded(true); })
      .catch(() => setWishlistLoaded(true));
  }, [p.id]);

  // Sticky footer : apparaît quand les boutons CTA sortent du viewport
  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  async function handleShare() {
    const url = window.location.href;
    const title = p.name;
    const text = `${p.name} — ${displayPrice.toFixed(2)} $ CAD`;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); } catch { /* annulé */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    }
  }

  async function toggleWishlist() {
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id }),
    });
    if (res.status === 401) { window.location.href = "/compte/connexion"; return; }
    const d = await res.json() as { inWishlist: boolean };
    setWishlist(d.inWishlist);
  }

  async function addToCart() {
    if (cartState === "loading") return;
    if (productVariants.length > 0 && !selectedVariantId) return;
    setCartState("loading");
    try {
      let cartId = localStorage.getItem("ddm_cart_id");
      if (!cartId) { cartId = crypto.randomUUID(); localStorage.setItem("ddm_cart_id", cartId); }
      const body: Record<string, unknown> = { productId: p.id, quantity: qty };
      if (selectedVariantId && selectedVariant) {
        body.variantId = selectedVariantId;
        body.variantName = selectedVariant.name;
      }
      const res = await fetch(`/api/cart?cartId=${cartId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const cart = await res.json() as { items: { quantity: number }[] };
      const total = cart.items.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0);
      const badge = document.getElementById("cart-badge");
      if (badge) { badge.textContent = String(total); badge.classList.remove("hidden"); badge.classList.add("flex"); }
      setCartState("added");
      setTimeout(() => setCartState("idle"), 2500);
    } catch (err) {
      console.error("Erreur panier:", err);
      setCartState("error");
      setTimeout(() => setCartState("idle"), 3000);
    }
  }

  const densiteLabel = selectedDensity !== p.densite ? ` · Densité ${selectedDensity}%` : "";
  const whatsappMsg = encodeURIComponent(
    `Bonjour, je suis intéressée par : ${p.name}${p.longueur_po ? ` — ${p.longueur_po} po` : ""}${densiteLabel}. Prix: ${p.price_cad.toFixed(2)} $ CAD.`
  );

  const activeItem = media[activeIdx] ?? null;

  // URL d'embed pour les vidéos
  function videoEmbedUrl(url: string): string {
    const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/\s]+)/);
    if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`;
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
    return url;
  }

  // JSON-LD Product schema
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description ?? undefined,
    image: p.image_key ? [p.image_key] : undefined,
    brand: { "@type": "Brand", name: "DDM Wigs & More" },
    sku: p.sku ?? p.slug,
    offers: {
      "@type": "Offer",
      url: `${BASE}/boutique/${p.slug}`,
      priceCurrency: "CAD",
      price: String(flash ? flash.price : p.price_cad),
      availability: (p.stock ?? 0) > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "DDM Wigs & More" },
    },
    ...(reviewStats.count > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: reviewStats.avg.toFixed(1),
        reviewCount: reviewStats.count,
        bestRating: "5",
        worstRating: "1",
      },
    } : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil",  item: BASE },
      { "@type": "ListItem", position: 2, name: "Boutique", item: `${BASE}/boutique` },
      { "@type": "ListItem", position: 3, name: p.name,     item: `${BASE}/boutique/${p.slug}` },
    ],
  };

  return (
    <main className="max-w-[90rem] mx-auto px-6 md:px-10 lg:px-20 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 font-sans text-xs text-on-surface-variant mb-8 flex-wrap">
        <Link to="/" className="hover:text-primary transition-colors">Accueil</Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <Link to="/boutique" className="hover:text-primary transition-colors">Boutique</Link>
        {p.famille && (
          <>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <Link to={`/boutique?famille=${p.famille}`} className="hover:text-primary transition-colors">
              {FAMILLE_LABELS[p.famille] ?? p.famille}
            </Link>
          </>
        )}
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-on-surface font-medium truncate max-w-[200px]">{p.name}</span>
      </nav>

      {/* Layout principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-20 mb-20">

        {/* ── Galerie ── */}
        <div className="space-y-4">
          {/* Média principal */}
          <div className="aspect-[3/4] bg-surface-container overflow-hidden relative group">
            {activeItem ? (
              activeItem.type === "video" ? (
                /* Lecteur vidéo intégré */
                <iframe
                  src={videoEmbedUrl(activeItem.url)}
                  className="w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  title={p.name}
                />
              ) : (
                <img
                  src={cfImage(activeItem.url, "zoom") ?? activeItem.url}
                  alt={activeItem.alt_text ?? p.name}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                />
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-outline-variant">
                <span className="material-symbols-outlined text-6xl">styler</span>
                <p className="font-sans text-sm">Photo à venir</p>
              </div>
            )}

            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
              {discount && (
                <span className="bg-error text-on-error px-3 py-1 text-xs font-bold uppercase tracking-widest">
                  -{discount}%
                </span>
              )}
              {p.hd_lace === 1 && (
                <span className="bg-surface/90 backdrop-blur text-on-surface border border-outline-variant/40 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                  HD Lace
                </span>
              )}
              {p.pret_a_porter === 1 && (
                <span className="bg-surface/90 backdrop-blur text-on-surface border border-outline-variant/40 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                  Prêt à porter
                </span>
              )}
            </div>

            {/* Compteur médias (quand plusieurs) */}
            {media.length > 1 && activeItem?.type !== "video" && (
              <span className="absolute bottom-4 right-4 bg-black/50 text-white text-xs font-mono px-2 py-0.5">
                {activeIdx + 1} / {media.length}
              </span>
            )}

            {/* Wishlist */}
            <button
              onClick={toggleWishlist}
              aria-label={wishlist ? "Retirer des favoris" : "Ajouter aux favoris"}
              title={wishlistLoaded ? (wishlist ? "Retirer des favoris" : "Ajouter aux favoris") : "Chargement…"}
              className="absolute top-4 right-4 w-9 h-9 bg-surface/90 backdrop-blur flex items-center justify-center hover:bg-surface transition-colors z-10">
              <span className={`material-symbols-outlined text-xl ${wishlist ? "text-error" : "text-on-surface-variant"}`}
                style={{ fontVariationSettings: wishlist ? "'FILL' 1" : "'FILL' 0" }}>
                favorite
              </span>
            </button>
          </div>

          {/* Miniatures (images + vidéos) */}
          {media.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {media.map((item, i) => {
                const thumb = item.type === "image"
                  ? (cfImage(item.url, "thumbnail") ?? item.url)
                  : item.thumbnail_url;
                return (
                  <button key={i} onClick={() => setActiveIdx(i)}
                    className={`w-20 h-20 overflow-hidden shrink-0 border-2 transition-colors relative ${activeIdx === i ? "border-primary" : "border-transparent hover:border-outline-variant"}`}>
                    {thumb ? (
                      <img src={thumb} alt={item.alt_text ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-surface-container flex items-center justify-center">
                        <span className="material-symbols-outlined text-outline-variant text-2xl">smart_display</span>
                      </div>
                    )}
                    {item.type === "video" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="material-symbols-outlined text-white text-xl">play_circle</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Infos produit ── */}
        <div className="flex flex-col">

          {/* Famille + Nom */}
          <div className="mb-4">
            <p className="font-sans text-xs font-bold uppercase tracking-[0.2em] text-primary mb-2">
              {FAMILLE_LABELS[p.famille ?? ""] ?? "DDM Wigs"}
            </p>

            {/* Tags produit */}
            {(() => {
              const autoTags: { label: string; style: string }[] = [];
              if (p.featured === 1) autoTags.push({ label: "Best-seller", style: "bg-primary/10 text-primary border-primary/20" });
              if (p.hd_lace === 1) autoTags.push({ label: "HD Lace", style: "bg-secondary/10 text-secondary border-secondary/20" });
              if (p.glueless === 1) autoTags.push({ label: "Sans colle", style: "bg-secondary/10 text-secondary border-secondary/20" });
              if (p.pret_a_porter === 1) autoTags.push({ label: "Prêt à porter", style: "bg-secondary/10 text-secondary border-secondary/20" });
              const customTags = (p.tags ?? "").split(",").map((t: string) => t.trim()).filter((t: string) => t.length > 0);
              const allTags = [...autoTags, ...customTags.map((t: string) => ({ label: t, style: "bg-surface-container text-on-surface-variant border-outline-variant/40" }))];
              if (allTags.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {allTags.map((tag, i) => (
                    <span key={i} className={`inline-flex items-center px-2.5 py-0.5 border rounded-full font-sans text-[11px] font-semibold uppercase tracking-wider ${tag.style}`}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              );
            })()}

            <div className="flex items-start justify-between gap-2">
              <h1 className="font-serif text-3xl md:text-4xl text-on-surface leading-tight mb-3">{p.name}</h1>
              {/* Bouton partager */}
              <button onClick={handleShare} title={copyDone ? "Lien copié !" : "Partager ce produit"}
                className="shrink-0 mt-1 w-9 h-9 flex items-center justify-center border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
                <span className="material-symbols-outlined text-lg">{copyDone ? "check" : "share"}</span>
              </button>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-3">
              {reviewStats.count > 0 ? (
                <>
                  <div className="flex text-primary">
                    {[1,2,3,4,5].map(s => (
                      <span key={s} className="material-symbols-outlined text-lg"
                        style={{ fontVariationSettings: s <= Math.round(reviewStats.avg) ? "'FILL' 1" : "'FILL' 0" }}>
                        star
                      </span>
                    ))}
                  </div>
                  <a href="#avis" className="font-sans text-sm text-on-surface-variant hover:text-primary transition-colors">
                    {reviewStats.avg.toFixed(1)} · {reviewStats.count} avis
                  </a>
                </>
              ) : (
                <>
                  <div className="flex text-outline-variant/60">
                    {[1,2,3,4,5].map(s => (
                      <span key={s} className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 0" }}>star</span>
                    ))}
                  </div>
                  <a href="#avis" className="font-sans text-sm text-on-surface-variant hover:text-primary transition-colors">
                    Soyez la première à laisser un avis
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Bannière vente flash */}
          {flash && (
            <div className="flex items-center gap-2 bg-error/10 border border-error/20 rounded px-3 py-2 mb-4">
              <span className="material-symbols-outlined text-error text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              <span className="font-sans text-sm font-bold text-error uppercase tracking-wider">Vente Flash</span>
              <span className="font-sans text-xs text-error/80 ml-1">— Se termine dans</span>
              <span className="font-sans text-sm font-bold text-error">
                <FlashCountdown endsAt={flash.ends_at} />
              </span>
            </div>
          )}

          {/* Prix */}
          <div className="flex items-end gap-4 mb-6 pb-6 border-b border-outline-variant">
            <p className={`font-serif text-4xl font-bold ${flash ? "text-error" : "text-primary"}`}>
              {displayPrice.toFixed(2)} $
            </p>
            {originalPrice && originalPrice > displayPrice && (
              <p className="font-sans text-xl text-on-surface-variant line-through mb-1">
                {originalPrice.toFixed(2)} $
              </p>
            )}
            {discount && (
              <span className="mb-1 px-2 py-0.5 bg-error/10 text-error font-sans text-sm font-bold">
                -{discount}%
              </span>
            )}
            <span className="font-sans text-xs text-on-surface-variant mb-1">CAD · livraison gratuite au Canada</span>
          </div>

          {/* ── Sélecteur de couleur ── */}
          {showCouleurVariants && (
            <div className="mb-5">
              <p className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2.5">
                Couleur —{" "}
                <span className="text-on-surface normal-case font-semibold tracking-normal">{p.couleur}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {couleurVars.map(v => (
                  <Link key={v.slug} to={`/boutique/${v.slug}`}
                    className={`px-3 py-1.5 font-sans text-xs font-semibold border transition-all ${
                      v.slug === p.slug
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                    }`}>
                    {v.couleur}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Sélecteur de longueur ── */}
          {showLongueurVariants && (
            <div className="mb-5">
              <p className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2.5">
                Longueur —{" "}
                <span className="text-on-surface normal-case font-semibold tracking-normal">{p.longueur_po} pouces</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {longueurVars.map(v => (
                  <Link key={v.slug} to={`/boutique/${v.slug}`}
                    className={`w-14 h-10 flex items-center justify-center font-sans text-xs font-bold border transition-all ${
                      v.slug === p.slug
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                    }`}>
                    {v.longueur_po}"
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ── Sélecteur de déclinaisons (product_variants) ── */}
          {productVariants.length > 0 && (
            <div className="mb-5">
              <p className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2.5">
                Déclinaison —{" "}
                <span className="text-on-surface normal-case font-semibold tracking-normal">
                  {selectedVariant?.name ?? "Choisir une option"}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {productVariants.map(v => (
                  <button key={v.id} onClick={() => setSelectedVariantId(v.id)}
                    disabled={v.stock === 0}
                    className={`px-3 py-1.5 font-sans text-xs font-semibold border transition-all ${
                      v.stock === 0
                        ? "border-outline-variant/30 text-on-surface-variant/40 cursor-not-allowed line-through"
                        : v.id === selectedVariantId
                          ? "border-primary bg-primary text-on-primary"
                          : "border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                    }`}>
                    {v.name}
                    {v.price_adjustment_cad !== 0 && (
                      <span className="ml-1 opacity-70">
                        ({v.price_adjustment_cad > 0 ? "+" : ""}{v.price_adjustment_cad.toFixed(0)} $)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Sélecteur de densité ── */}
          {showDensityPicker && (
            <div className="mb-5">
              <p className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2.5">
                Densité —{" "}
                <span className="text-on-surface normal-case font-semibold tracking-normal">{selectedDensity}%</span>
              </p>
              <div className="flex gap-2">
                {[130, 150, 180].map(d => (
                  <button key={d} onClick={() => setSelectedDensity(d)}
                    className={`w-16 h-10 font-sans text-xs font-bold border transition-all ${
                      selectedDensity === d
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                    }`}>
                    {d}%
                  </button>
                ))}
              </div>
              <p className="font-sans text-[11px] text-on-surface-variant mt-1.5">
                {selectedDensity === 130 && "Naturelle et légère — idéale pour l'usage quotidien"}
                {selectedDensity === 150 && "Volumineuse — notre densité la plus populaire"}
                {selectedDensity === 180 && "Extra volumineuse — rendu très plein et glamour"}
              </p>
            </div>
          )}

          {/* Caractéristiques résumées */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-5 text-sm font-sans pb-5 border-b border-outline-variant/50">
            {p.texture && <SpecRow icon="waves" label="Texture" value={TEXTURE_LABELS[p.texture] ?? p.texture} />}
            {p.type_lace && <SpecRow icon="crop_free" label="Construction" value={LACE_LABELS[p.type_lace] ?? p.type_lace} />}
            {!showLongueurVariants && (p.longueur_po ?? 0) > 0 && <SpecRow icon="straighten" label="Longueur" value={`${p.longueur_po} pouces`} />}
            {!showDensityPicker && (p.densite ?? 0) > 0 && <SpecRow icon="density_medium" label="Densité" value={`${p.densite}%`} />}
            {!showCouleurVariants && p.couleur && <SpecRow icon="palette" label="Couleur" value={p.couleur} />}
            {(p.quantite_meches ?? 0) > 0 && <SpecRow icon="layers" label="Mèches" value={`${p.quantite_meches} bundle${p.quantite_meches! > 1 ? "s" : ""}`} />}
          </div>

          {/* Options booléennes */}
          {(p.hd_lace === 1 || p.glueless === 1 || p.pret_a_porter === 1) && (
            <div className="flex flex-wrap gap-2 mb-5">
              {p.hd_lace === 1 && <OptionTag icon="visibility_off" label="HD Lace — dentelle invisible" />}
              {p.glueless === 1 && <OptionTag icon="block" label="Sans colle" />}
              {p.pret_a_porter === 1 && <OptionTag icon="timer" label="Prêt à porter en 5 min" />}
            </div>
          )}

          {/* Stock */}
          {effectiveStock > 0 && effectiveStock <= 5 && (
            <div className="flex items-center gap-2 mb-4 font-sans text-sm text-error font-semibold">
              <span className="material-symbols-outlined text-sm">warning</span>
              Plus que {effectiveStock} en stock — commandez vite !
            </div>
          )}

          {/* Quantité + panier */}
          <div ref={ctaRef} className="flex items-center gap-3 mb-4">
            <div className="flex items-center border border-outline-variant">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-10 h-12 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-lg">remove</span>
              </button>
              <span className="w-10 text-center font-sans text-sm font-semibold text-on-surface">{qty}</span>
              <button onClick={() => setQty(q => Math.min(effectiveStock || 10, q + 1))}
                className="w-10 h-12 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-lg">add</span>
              </button>
            </div>

            <button onClick={addToCart}
              disabled={effectiveStock === 0 || cartState === "loading" || (productVariants.length > 0 && !selectedVariantId)}
              className={`flex-1 h-12 flex items-center justify-center gap-2 font-sans text-sm font-bold uppercase tracking-widest transition-all duration-300 ${
                cartState === "added" ? "bg-secondary text-on-secondary"
                  : cartState === "error" ? "bg-error text-on-error"
                  : cartState === "loading" ? "bg-primary/70 text-on-primary cursor-wait"
                  : effectiveStock === 0 ? "bg-surface-container text-on-surface-variant cursor-not-allowed"
                  : "bg-primary text-on-primary hover:opacity-90 active:scale-[0.98]"
              }`}>
              <span className="material-symbols-outlined text-lg">
                {cartState === "added" ? "check_circle" : cartState === "error" ? "error" : cartState === "loading" ? "hourglass_empty" : "shopping_bag"}
              </span>
              {cartState === "added" ? "Ajouté au panier !"
                : cartState === "error" ? "Erreur — réessayez"
                : cartState === "loading" ? "Ajout en cours…"
                : effectiveStock === 0 ? "Rupture de stock"
                : "Ajouter au panier"}
            </button>
          </div>

          {/* WhatsApp */}
          <a href={`https://wa.me/23797193723?text=${whatsappMsg}`} target="_blank" rel="noopener noreferrer"
            className="w-full h-12 flex items-center justify-center gap-2 border border-on-surface text-on-surface font-sans text-sm font-bold uppercase tracking-widest hover:bg-on-surface hover:text-surface transition-all duration-300 mb-6">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.374 0 0 5.373 0 12c0 2.114.55 4.097 1.508 5.819L.057 23.172a.75.75 0 0 0 .92.92l5.353-1.451A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.655-.502-5.184-1.381l-.372-.218-3.856 1.046 1.046-3.856-.218-.372A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            Commander via WhatsApp
          </a>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-between gap-y-2 pt-4 border-t border-outline-variant">
            {[
              { icon: "assignment_return", label: "14 Jours Retour" },
              { icon: "local_shipping", label: "Livraison Gratuite" },
              { icon: "schedule", label: "Expédition 72h" },
              { icon: "verified", label: "100% Vrais Cheveux" },
            ].map(({ icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-on-surface-variant">
                <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                <span className="font-sans text-xs font-semibold text-on-surface">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Accordéons ── */}
      <div className="border-t border-outline-variant mb-20 max-w-4xl">

        <Accordion id="description" label="Description" open={openSection} onToggle={setOpenSection}>
          <div className="font-sans text-base text-on-surface-variant leading-relaxed space-y-3">
            {p.description
              ? p.description.split("\n").map((line, i) => <p key={i}>{line}</p>)
              : (
                <>
                  <p>La {p.name} est une perruque en cheveux humains 100% d&apos;une qualité exceptionnelle.
                    Chaque mèche est soigneusement sélectionnée pour garantir un rendu naturel et une longévité maximale.</p>
                  {p.hd_lace === 1 && <p>La technologie <strong>HD Lace</strong> (dentelle ultra-fine) se fond parfaitement avec toutes les carnations pour un rendu totalement invisible à la racine.</p>}
                  {p.glueless === 1 && <p>Conçue pour être portée <strong>sans colle ni adhésif</strong>, elle est idéale pour un usage quotidien confortable et sans contrainte.</p>}
                  {p.pret_a_porter === 1 && <p>Cette perruque est <strong>pré-coiffée et prête à porter</strong> : noeuds éclaircis, naissance des cheveux naturelle, mise en place en moins de 5 minutes.</p>}
                </>
              )}
          </div>
        </Accordion>

        <Accordion id="specs" label="Caractéristiques techniques" open={openSection} onToggle={setOpenSection}>
          <table className="w-full font-sans text-sm">
            <tbody className="divide-y divide-outline-variant/30">
              {([
                ["Famille", FAMILLE_LABELS[p.famille ?? ""] ?? p.famille],
                ["Type de cheveux", "100% Cheveux humains"],
                ["Origine", "Vierge, non traité"],
                p.texture ? ["Texture", TEXTURE_LABELS[p.texture] ?? p.texture] : null,
                p.type_lace ? ["Type de construction", LACE_LABELS[p.type_lace] ?? p.type_lace] : null,
                p.longueur_po ? ["Longueur", `${p.longueur_po} pouces`] : null,
                p.densite ? ["Densité disponible", `${p.densite}%`] : null,
                p.couleur ? ["Couleur", p.couleur] : null,
                p.quantite_meches ? ["Quantité de mèches", `${p.quantite_meches} bundle(s)`] : null,
                ["HD Lace", p.hd_lace === 1 ? "Oui — dentelle ultra-fine" : "Non"],
                ["Sans colle", p.glueless === 1 ? "Oui" : "Non"],
                ["Prêt à porter", p.pret_a_porter === 1 ? "Oui — 5 minutes" : "Non"],
                ["Peut être teint", "Oui (conseillé professionnel)"],
                ["Résistance chaleur", "Oui — max 180°C avec protecteur"],
              ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([label, value]) => (
                <tr key={label as string}>
                  <td className="py-2.5 pr-6 font-semibold text-on-surface w-52">{label as string}</td>
                  <td className="py-2.5 text-on-surface-variant">{value as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Accordion>

        <Accordion id="entretien" label="Guide d'entretien" open={openSection} onToggle={setOpenSection}>
          <div className="font-sans text-sm text-on-surface-variant space-y-3">
            {([
              ["wash", "Lavage", "Lavez avec un shampoing doux pour cheveux colorés ou naturels. Évitez les produits contenant du sulfate."],
              ["hot_tub", "Séchage", "Séchez à l'air libre autant que possible. Si vous utilisez un sèche-cheveux, maintenez-le à basse température."],
              ["thermostat", "Chaleur", "Vous pouvez utiliser fer plat et boucleur à basse température (max 180°C). Appliquez toujours un spray protecteur thermique."],
              ["style", "Stockage", "Rangez sur un support à perruque ou dans sa boîte d'origine pour préserver la forme et la coupe."],
              ["event_available", "Durée de vie", "Avec un entretien régulier, votre perruque peut durer 1 à 2 ans ou plus."],
            ] as [string, string, string][]).map(([icon, title, text]) => (
              <div key={icon} className="flex gap-3">
                <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">{icon}</span>
                <div>
                  <p className="font-semibold text-on-surface">{title}</p>
                  <p>{text}</p>
                </div>
              </div>
            ))}
            <Link to="/guide-entretien" className="inline-flex items-center gap-1 text-primary font-semibold hover:underline mt-2">
              Guide complet d&apos;entretien
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
        </Accordion>

        <Accordion id="livraison" label="Livraison & retours" open={openSection} onToggle={setOpenSection}>
          <div className="font-sans text-sm text-on-surface-variant space-y-4">
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">local_shipping</span>
              <div>
                <p className="font-semibold text-on-surface">Livraison à domicile</p>
                <p>Livraison disponible dans la région de Montréal. Contactez-nous via WhatsApp pour les détails et délais.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">storefront</span>
              <div>
                <p className="font-semibold text-on-surface">Retrait en boutique</p>
                <p>Retrait disponible sur rendez-vous. Contactez-nous pour fixer un horaire.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">assignment_return</span>
              <div>
                <p className="font-semibold text-on-surface">Politique de retour</p>
                <p>Pour des raisons d&apos;hygiène, les perruques ne peuvent pas être retournées une fois essayées. Contactez-nous avant tout achat si vous avez des questions.</p>
              </div>
            </div>
          </div>
        </Accordion>
      </div>

      {/* ── Avis clients ── */}
      <section id="avis" className="mb-20 max-w-4xl scroll-mt-24">
        <ReviewsSection
          productId={p.id}
          productSlug={p.slug}
          reviews={reviews as Review[]}
          stats={reviewStats as ReviewStats}
          currentCustomer={currentCustomer as any}
          hasPurchased={hasPurchased}
          alreadyReviewed={alreadyReviewed}
        />
      </section>

      {/* ── Questions & Réponses ── */}
      <section id="qa" className="mb-20 max-w-4xl scroll-mt-24">
        <QASection productId={p.id} items={qa as QAItem[]} />
      </section>

      {/* ── Sticky footer CTA ── */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-outline-variant shadow-lg transition-transform duration-300 ${showSticky ? "translate-y-0" : "translate-y-full"}`}>
        <div className="max-w-[90rem] mx-auto px-4 md:px-10 py-3 flex items-center gap-4">
          {media[0]?.type === "image" && cfImage(media[0].url, "thumbnail") && (
            <img src={cfImage(media[0].url, "thumbnail")!} alt={p.name} className="w-12 h-12 object-cover shrink-0 hidden sm:block" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-serif text-sm font-bold text-on-surface truncate">{p.name}</p>
            <p className={`font-sans text-base font-bold ${flash ? "text-error" : "text-primary"}`}>
              {displayPrice.toFixed(2)} $ CAD
            </p>
          </div>
          <button onClick={addToCart} disabled={p.stock === 0 || cartState === "loading"}
            className={`shrink-0 h-11 px-6 font-sans text-sm font-bold uppercase tracking-widest transition-all ${
              cartState === "added" ? "bg-secondary text-on-secondary"
                : p.stock === 0 ? "bg-surface-container text-on-surface-variant cursor-not-allowed"
                : "bg-primary text-on-primary hover:opacity-90"
            }`}>
            {cartState === "added" ? "Ajouté !" : p.stock === 0 ? "Rupture" : "Acheter maintenant"}
          </button>
        </div>
      </div>

      {/* ── Produits similaires ── */}
      {related.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-8">
            <h2 className="font-serif text-2xl md:text-3xl text-on-surface">Vous aimerez aussi</h2>
            <Link to={`/boutique${p.famille ? `?famille=${p.famille}` : ""}`}
              className="font-sans text-sm text-primary font-semibold hover:underline hidden md:flex items-center gap-1">
              Voir tout
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
            {related.map(r => <RelatedCard key={r.id} product={r} />)}
          </div>
        </section>
      )}
    </main>
  );
}

// ─── ReviewsSection ─────────────────────────────────────────────────────────

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(s => (
        <button key={s} type="button"
          onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)}
          onClick={() => onChange(s)}
          className="text-2xl transition-colors">
          <span className="material-symbols-outlined text-2xl"
            style={{
              color: s <= (hover || value) ? "var(--color-primary)" : "var(--color-outline-variant)",
              fontVariationSettings: s <= (hover || value) ? "'FILL' 1" : "'FILL' 0",
            }}>
            star
          </span>
        </button>
      ))}
    </div>
  );
}

function ReviewsSection({ productId, productSlug, reviews, stats, currentCustomer, hasPurchased, alreadyReviewed }: {
  productId: number;
  productSlug: string;
  reviews: Review[];
  stats: ReviewStats;
  currentCustomer: { email: string; name: string | null } | null;
  hasPurchased: boolean;
  alreadyReviewed: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error" | "pending">("idle");

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - photoUrls.length);
    if (files.length === 0) return;
    setUploadingPhotos(true);
    const urls: string[] = [];
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload-image", { method: "POST", body: fd });
        if (res.ok) {
          const d = await res.json() as { imageUrl: string };
          urls.push(d.imageUrl);
        }
      } catch { /* ignore */ }
    }
    setPhotoUrls(prev => [...prev, ...urls].slice(0, 5));
    setUploadingPhotos(false);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) return;
    setSubmitState("loading");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, reviewBody: body, photos: photoUrls }),
      });
      const data = await res.json() as any;
      if (!res.ok) { setSubmitState("error"); return; }
      setSubmitState(data.verified ? "success" : "pending");
    } catch {
      setSubmitState("error");
    }
  }

  const STAR_LABELS = ["", "Très mauvais", "Mauvais", "Correct", "Bien", "Excellent"];

  return (
    <div>
      <h2 className="font-serif text-2xl md:text-3xl text-on-surface mb-8">Avis clients</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">

        {/* Résumé global */}
        <div>
          {stats.count > 0 ? (
            <div className="flex items-start gap-6">
              <div className="text-center shrink-0">
                <p className="font-serif text-6xl text-primary font-bold leading-none">{stats.avg.toFixed(1)}</p>
                <div className="flex justify-center mt-1 mb-1">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className="material-symbols-outlined text-base"
                      style={{ color: s <= Math.round(stats.avg) ? "var(--color-primary)" : "var(--color-outline-variant)", fontVariationSettings: "'FILL' 1" }}>
                      star
                    </span>
                  ))}
                </div>
                <p className="font-sans text-xs text-on-surface-variant">{stats.count} avis vérifiés</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5,4,3,2,1].map(star => {
                  const count = stats.dist[star - 1];
                  const pct = stats.count > 0 ? (count / stats.count) * 100 : 0;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="font-sans text-xs text-on-surface-variant w-4 text-right shrink-0">{star}</span>
                      <span className="material-symbols-outlined text-xs text-primary shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      <div className="flex-1 h-2 bg-surface-container-high rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-sans text-xs text-on-surface-variant w-4 shrink-0">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex mb-3">
                {[1,2,3,4,5].map(s => (
                  <span key={s} className="material-symbols-outlined text-3xl text-outline-variant/50" style={{ fontVariationSettings: "'FILL' 0" }}>star</span>
                ))}
              </div>
              <p className="font-sans text-base text-on-surface font-semibold mb-1">Aucun avis pour le moment</p>
              <p className="font-sans text-sm text-on-surface-variant">Soyez la première à partager votre expérience</p>
            </div>
          )}
        </div>

        {/* Formulaire ou état selon la cliente */}
        <div>
          <p className="font-sans text-sm font-bold uppercase tracking-wider text-on-surface mb-4">Laisser un avis</p>

          {/* Non connectée */}
          {!currentCustomer && (
            <div className="p-4 border border-outline-variant/40 bg-surface-container-low text-center">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant mb-2 block">lock</span>
              <p className="font-sans text-sm font-semibold text-on-surface mb-1">Connexion requise</p>
              <p className="font-sans text-xs text-on-surface-variant mb-4">
                Seules les clientes ayant un compte peuvent laisser un avis.
              </p>
              <Link
                to={`/compte/connexion?next=/boutique/${productSlug}#avis`}
                className="inline-block px-5 py-2.5 bg-primary text-on-primary font-sans text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
                Se connecter
              </Link>
            </div>
          )}

          {/* Connectée mais n'a pas acheté */}
          {currentCustomer && !hasPurchased && !alreadyReviewed && (
            <div className="p-4 border border-outline-variant/40 bg-surface-container-low">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-xl text-on-surface-variant shrink-0 mt-0.5">shopping_bag</span>
                <div>
                  <p className="font-sans text-sm font-semibold text-on-surface mb-1">Achat requis</p>
                  <p className="font-sans text-xs text-on-surface-variant leading-relaxed">
                    Seules les clientes ayant acheté ce produit peuvent laisser un avis.
                    Cela garantit l'authenticité de tous les avis.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Déjà un avis */}
          {currentCustomer && alreadyReviewed && (
            <div className="flex items-start gap-3 p-4 bg-secondary/10 border border-secondary/30">
              <span className="material-symbols-outlined text-secondary text-xl shrink-0 mt-0.5">check_circle</span>
              <div>
                <p className="font-sans text-sm font-semibold text-on-surface">Votre avis a déjà été publié</p>
                <p className="font-sans text-xs text-on-surface-variant">Merci pour votre retour !</p>
              </div>
            </div>
          )}

          {/* Succès après soumission */}
          {(submitState === "success" || submitState === "pending") && (
            <div className="flex items-start gap-3 p-4 bg-secondary/10 border border-secondary/30">
              <span className="material-symbols-outlined text-secondary text-xl shrink-0 mt-0.5">check_circle</span>
              <div>
                <p className="font-sans text-sm font-semibold text-on-surface">Merci pour votre avis !</p>
                <p className="font-sans text-sm text-on-surface-variant">
                  {submitState === "success"
                    ? "Votre avis vérifié est maintenant visible. Un code -10% de remerciement vous a été envoyé par courriel 🎁"
                    : "Il sera visible après validation par notre équipe."}
                </p>
              </div>
            </div>
          )}

          {/* Formulaire (connectée + a acheté + pas encore d'avis) */}
          {currentCustomer && hasPurchased && !alreadyReviewed && submitState !== "success" && submitState !== "pending" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Badge achat vérifié */}
              <div className="flex items-center gap-1.5 text-xs text-secondary font-semibold">
                <span className="material-symbols-outlined text-sm">verified</span>
                Achat vérifié — {currentCustomer.name ?? currentCustomer.email.split("@")[0]}
              </div>

              <div>
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Votre note *
                </label>
                <StarPicker value={rating} onChange={setRating} />
                {rating > 0 && (
                  <p className="font-sans text-xs text-on-surface-variant mt-1">{STAR_LABELS[rating]}</p>
                )}
              </div>

              <div>
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Votre commentaire
                </label>
                <textarea
                  rows={3} maxLength={1000}
                  value={body} onChange={e => setBody(e.target.value)}
                  placeholder="Partagez votre expérience avec ce produit…"
                  className="w-full px-3 py-2 border border-outline-variant bg-surface font-sans text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors resize-none" />
              </div>

              {/* Photos UGC */}
              <div>
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Vos photos (facultatif · max 5)
                </label>
                {photoUrls.length > 0 && (
                  <div className="flex gap-2 flex-wrap mb-2">
                    {photoUrls.map((url, i) => (
                      <div key={i} className="relative w-16 h-16 shrink-0">
                        <img src={`${url}/thumbnail`} alt="" className="w-full h-full object-cover" />
                        <button type="button"
                          onClick={() => setPhotoUrls(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-error text-on-error rounded-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-[10px]">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photoUrls.length < 5 && (
                  <label className={`flex items-center gap-2 px-3 py-2 border border-dashed border-outline-variant cursor-pointer hover:border-primary transition-colors ${uploadingPhotos ? "opacity-50 pointer-events-none" : ""}`}>
                    <span className="material-symbols-outlined text-on-surface-variant text-lg">add_photo_alternate</span>
                    <span className="font-sans text-xs text-on-surface-variant">
                      {uploadingPhotos ? "Envoi en cours…" : "Ajouter des photos"}
                    </span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                  </label>
                )}
              </div>

              {submitState === "error" && (
                <p className="font-sans text-xs text-error">Une erreur est survenue. Veuillez réessayer.</p>
              )}

              <button type="submit"
                disabled={submitState === "loading" || rating === 0}
                className="px-6 py-2.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
                {submitState === "loading" ? "Envoi…" : "Publier mon avis"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Liste des avis */}
      {reviews.length > 0 && (
        <div className="space-y-0 divide-y divide-outline-variant/30 border-t border-outline-variant">
          {(reviews as any[]).map((r: any) => (
            <div key={r.id} className="py-6">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="font-sans text-sm font-bold text-primary">
                      {r.customer_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-sans text-sm font-semibold text-on-surface">{r.customer_name}</p>
                      {r.verified_purchase === 1 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-bold text-secondary">
                          <span className="material-symbols-outlined text-xs">verified</span>
                          Achat vérifié
                        </span>
                      )}
                    </div>
                    <div className="flex">
                      {[1,2,3,4,5].map(s => (
                        <span key={s} className="material-symbols-outlined text-xs"
                          style={{ color: s <= r.rating ? "var(--color-primary)" : "var(--color-outline-variant)", fontVariationSettings: "'FILL' 1" }}>
                          star
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="font-sans text-xs text-on-surface-variant shrink-0">
                  {new Date(r.created_at).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })}
                </p>
              </div>
              {r.body && <p className="font-sans text-sm text-on-surface-variant leading-relaxed ml-11 mb-3">{r.body}</p>}
              {r.photos && (() => {
                let photos: string[] = [];
                try { photos = JSON.parse(r.photos); } catch { /* */ }
                if (photos.length === 0) return null;
                return (
                  <div className="flex gap-2 flex-wrap ml-11">
                    {photos.map((url, i) => (
                      <a key={i} href={`${url}/public`} target="_blank" rel="noopener noreferrer"
                        className="w-20 h-20 overflow-hidden border border-outline-variant hover:border-primary transition-colors">
                        <img src={`${url}/thumbnail`} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── QASection ──────────────────────────────────────────────────────────────

function QASection({ productId, items }: { productId: number; items: QAItem[] }) {
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [openId, setOpenId] = useState<number | null>(items[0]?.id ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !question.trim()) return;
    setSubmitState("loading");
    try {
      const res = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, customerName: name, question }),
      });
      if (!res.ok) throw new Error();
      setSubmitState("success");
    } catch {
      setSubmitState("error");
    }
  }

  return (
    <div>
      <h2 className="font-serif text-2xl md:text-3xl text-on-surface mb-8">Questions & Réponses</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
        {/* Liste des Q&A */}
        <div>
          {items.length === 0 ? (
            <div className="py-8 text-center">
              <span className="material-symbols-outlined text-5xl text-primary/30 block mb-2">help_outline</span>
              <p className="font-sans text-sm text-on-surface-variant">Aucune question pour ce produit.</p>
              <p className="font-sans text-sm text-on-surface-variant">Soyez la première à poser une question !</p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-outline-variant/30 border-t border-outline-variant">
              {items.map(item => (
                <div key={item.id}>
                  <button onClick={() => setOpenId(openId === item.id ? null : item.id)}
                    className="w-full flex items-start justify-between gap-3 py-4 text-left group">
                    <p className="font-sans text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
                      Q : {item.question}
                    </p>
                    <span className={`material-symbols-outlined text-on-surface-variant text-xl shrink-0 transition-transform ${openId === item.id ? "rotate-180" : ""}`}>
                      expand_more
                    </span>
                  </button>
                  {openId === item.id && (
                    <div className="pb-4 -mt-1">
                      <p className="font-sans text-xs font-bold text-primary uppercase tracking-wider mb-1">Réponse DDM Wigs</p>
                      <p className="font-sans text-sm text-on-surface-variant leading-relaxed">{item.answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Formulaire de question */}
        <div>
          <p className="font-sans text-sm font-bold uppercase tracking-wider text-on-surface mb-4">Poser une question</p>
          {submitState === "success" ? (
            <div className="flex items-start gap-3 p-4 bg-secondary/10 border border-secondary/30">
              <span className="material-symbols-outlined text-secondary text-xl shrink-0 mt-0.5">check_circle</span>
              <div>
                <p className="font-sans text-sm font-semibold text-on-surface">Merci pour votre question !</p>
                <p className="font-sans text-sm text-on-surface-variant">Notre équipe vous répondra dès que possible.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Votre prénom *
                </label>
                <input type="text" required maxLength={100}
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex : Marie"
                  className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors" />
              </div>
              <div>
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Votre question *
                </label>
                <textarea rows={3} required maxLength={500}
                  value={question} onChange={e => setQuestion(e.target.value)}
                  placeholder="Posez votre question sur ce produit…"
                  className="w-full px-3 py-2 border border-outline-variant bg-surface font-sans text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors resize-none" />
              </div>
              {submitState === "error" && (
                <p className="font-sans text-xs text-error">Une erreur est survenue. Veuillez réessayer.</p>
              )}
              <button type="submit" disabled={submitState === "loading" || !name.trim() || !question.trim()}
                className="px-6 py-2.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity">
                {submitState === "loading" ? "Envoi…" : "Envoyer ma question"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SpecRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="material-symbols-outlined text-primary text-[18px] mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="font-sans text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p className="font-sans text-sm font-semibold text-on-surface">{value}</p>
      </div>
    </div>
  );
}

function OptionTag({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/8 border border-primary/20 text-primary font-sans text-xs font-semibold">
      <span className="material-symbols-outlined text-sm">{icon}</span>
      {label}
    </span>
  );
}

function TrustBadge({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-1.5 py-3">
      <span className="material-symbols-outlined text-primary text-2xl">{icon}</span>
      <p className="font-sans text-xs font-bold text-on-surface leading-tight">{label}</p>
      <p className="font-sans text-[10px] text-on-surface-variant">{sub}</p>
    </div>
  );
}

function Accordion({ id, label, open, onToggle, children }: {
  id: string; label: string;
  open: string | null; onToggle: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="border-b border-outline-variant">
      <button onClick={() => onToggle(isOpen ? null : id)}
        className="w-full flex items-center justify-between py-5 font-sans text-base font-semibold text-on-surface hover:text-primary transition-colors text-left">
        {label}
        <span className={`material-symbols-outlined text-xl transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </button>
      {isOpen && <div className="pb-6">{children}</div>}
    </div>
  );
}

const TEXTURE_SHORT: Record<string, string> = {
  "lisse": "Lisse", "body-wave": "Body Wave", "water-wave": "Water Wave",
  "deep-wave": "Deep Wave", "loose-wave": "Loose Wave", "boucle": "Bouclé",
  "kinky-curly": "Kinky Curly", "bob": "Bob",
};

function RelatedCard({ product: p }: { product: Product }) {
  const discount = p.compare_at_price_cad && p.compare_at_price_cad > p.price_cad
    ? Math.round((1 - p.price_cad / p.compare_at_price_cad) * 100)
    : null;
  return (
    <Link to={`/boutique/${p.slug}`} className="group block">
      <div className="aspect-[3/4] bg-surface-container overflow-hidden relative mb-3">
        {p.image_key ? (
          <img src={cfImage(p.image_key, "card") ?? p.image_key} alt={p.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl text-outline-variant">styler</span>
          </div>
        )}
        {discount && (
          <span className="absolute top-2 left-2 bg-error text-on-error text-[10px] font-bold px-2 py-0.5 uppercase">
            -{discount}%
          </span>
        )}
      </div>
      <p className="font-serif text-sm text-on-surface mb-1 leading-snug group-hover:text-primary transition-colors">{p.name}</p>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {p.texture && <span className="text-[10px] bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded-sm">{TEXTURE_SHORT[p.texture] ?? p.texture}</span>}
        {(p.longueur_po ?? 0) > 0 && <span className="text-[10px] bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded-sm">{p.longueur_po} po</span>}
      </div>
      <div className="flex items-center gap-2">
        <p className="font-sans text-sm font-bold text-primary">{p.price_cad.toFixed(2)} $ CAD</p>
        {p.compare_at_price_cad && p.compare_at_price_cad > p.price_cad && (
          <p className="font-sans text-xs text-on-surface-variant line-through">{p.compare_at_price_cad.toFixed(2)} $</p>
        )}
      </div>
    </Link>
  );
}
