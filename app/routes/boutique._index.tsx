import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import { getDB, getProducts } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";
import { cfImage } from "~/lib/images";
import { DEMO_PRODUCTS } from "~/lib/demo-products";

const BASE = "https://ddmwigs.com";

export const meta: MetaFunction = () => {
  const title = "Boutique — DDM Wigs & More";
  const description = "Perruques en cheveux humains 100 % — lace front, HD lace, glueless, body wave, bouclé. Livraison rapide Montréal & Canada.";
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: `${BASE}/boutique` },
    { property: "og:type",        content: "website" },
    { property: "og:title",       content: title },
    { property: "og:description", content: description },
    { property: "og:url",         content: `${BASE}/boutique` },
    { property: "og:site_name",   content: "DDM Wigs & More" },
    { property: "og:locale",      content: "fr_CA" },
    { name: "twitter:card",       content: "summary" },
    { name: "twitter:title",      content: title },
    { name: "twitter:description",content: description },
  ];
};

// ─── Constants ─────────────────────────────────────────────────────────────

const TEXTURES: [string, string][] = [
  ["lisse", "Lisse"], ["body-wave", "Body Wave"], ["water-wave", "Water Wave"],
  ["deep-wave", "Deep Wave"], ["loose-wave", "Loose Wave"], ["boucle", "Bouclé"],
  ["kinky-curly", "Kinky Curly"], ["bob", "Bob"],
];

const LACES: [string, string][] = [
  ["13x4", "13×4 Frontal"], ["13x6", "13×6 Frontal"],
  ["5x5", "5×5 Closure"], ["4x4", "4×4 Closure"],
  ["360", "360 Lace"], ["full", "Full Lace"],
  ["glueless", "Sans colle"], ["pre-everything", "Prêt à porter"],
];

const COULEURS: [string, string, string][] = [
  ["naturel", "#1b1c1c", "Noir naturel"],
  ["brun-fonce", "#3a2218", "Brun foncé"],
  ["chatain", "#7b4f2e", "Châtain"],
  ["balayage", "#c4a06a", "Balayage"],
  ["ombre", "#8b5e3c", "Ombré"],
  ["blonde-613", "#e8d5a3", "Blonde 613"],
];

const TEXTURE_LABELS: Record<string, string> = {
  "lisse": "Lisse", "body-wave": "Body Wave", "water-wave": "Water Wave",
  "deep-wave": "Deep Wave", "loose-wave": "Loose Wave", "boucle": "Bouclé",
  "kinky-curly": "Kinky Curly", "kinky-straight": "Kinky Straight",
  "bob": "Bob", "avec-frange": "Avec frange",
};

const LACE_LABELS: Record<string, string> = {
  "13x4": "13×4", "13x6": "13×6", "5x5": "5×5", "4x4": "4×4",
  "360": "360°", "full": "Full Lace", "glueless": "Sans colle",
  "pre-everything": "Prêt à porter", "v-part": "V-Part", "u-part": "U-Part",
};

// Static demo products shown when DB is empty (imported from shared lib)
const STATIC = DEMO_PRODUCTS;

type RatingMap = Record<number, { avg: number; count: number }>;

// ─── Loader ────────────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const p = (k: string) => url.searchParams.get(k) ?? "";

  let products: Product[] = [];
  let ratingMap: RatingMap = {};
  let collections: { id: number; name: string; slug: string }[] = [];
  let flashMap: Record<number, { price: number; ends_at: string }> = {};
  let filterCounts: {
    famille: Record<string, number>;
    texture: Record<string, number>;
    lace: Record<string, number>;
  } = { famille: {}, texture: {}, lace: {} };

  try {
    const db = getDB(context);
    products = await getProducts(db, {
      famille: p("famille") || undefined,
      texture: p("texture") || undefined,
      type_lace: p("lace") || undefined,
      couleur: p("couleur") || undefined,
      longueur_min: p("lmin") ? Number(p("lmin")) : undefined,
      longueur_max: p("lmax") ? Number(p("lmax")) : undefined,
      hd_lace: p("hd") === "1" ? true : undefined,
      glueless: p("glueless") === "1" ? true : undefined,
      sort: p("tri") || undefined,
    });

    // Notes moyennes groupées par produit
    const ids = products.map(pr => pr.id).filter(id => id > 0);
    if (ids.length > 0) {
      try {
        const placeholders = ids.map(() => "?").join(",");
        const rows = (await db.prepare(
          `SELECT product_id, COUNT(*) as cnt, AVG(rating) as avg FROM reviews WHERE product_id IN (${placeholders}) AND approved = 1 GROUP BY product_id`
        ).bind(...ids).all<{ product_id: number; cnt: number; avg: number }>()).results ?? [];
        rows.forEach(r => { ratingMap[r.product_id] = { avg: r.avg, count: r.cnt }; });
      } catch {
        // table reviews pas encore créée
      }
    }

    try {
      const { results } = await db.prepare(
        "SELECT id, name, slug FROM collections WHERE active = 1 ORDER BY position ASC, id ASC"
      ).all<{ id: number; name: string; slug: string }>();
      collections = results ?? [];
    } catch {
      // table collections pas encore créée
    }

    try {
      const { results: familleCounts } = await db.prepare(
        "SELECT famille, COUNT(*) as cnt FROM products WHERE stock > 0 AND famille IS NOT NULL GROUP BY famille"
      ).all<{ famille: string; cnt: number }>();
      (familleCounts ?? []).forEach(r => { filterCounts.famille[r.famille] = r.cnt; });

      const { results: textureCounts } = await db.prepare(
        "SELECT texture, COUNT(*) as cnt FROM products WHERE stock > 0 AND texture IS NOT NULL GROUP BY texture"
      ).all<{ texture: string; cnt: number }>();
      (textureCounts ?? []).forEach(r => { filterCounts.texture[r.texture] = r.cnt; });

      const { results: laceCounts } = await db.prepare(
        "SELECT type_lace, COUNT(*) as cnt FROM products WHERE stock > 0 AND type_lace IS NOT NULL GROUP BY type_lace"
      ).all<{ type_lace: string; cnt: number }>();
      (laceCounts ?? []).forEach(r => { filterCounts.lace[r.type_lace] = r.cnt; });
    } catch {
      // table pas encore prête
    }

    try {
      const now = new Date().toISOString();
      const { results: flashes } = await db.prepare(
        "SELECT product_id, flash_price_cad, ends_at FROM flash_sales WHERE active = 1 AND starts_at <= ? AND ends_at > ? ORDER BY flash_price_cad ASC"
      ).bind(now, now).all<{ product_id: number; flash_price_cad: number; ends_at: string }>();
      (flashes ?? []).forEach(f => {
        if (!flashMap[f.product_id]) flashMap[f.product_id] = { price: f.flash_price_cad, ends_at: f.ends_at };
      });
    } catch {
      // table flash_sales pas encore créée
    }
  } catch {
    products = [];
  }

  return json({
    products,
    ratingMap,
    collections,
    flashMap,
    filterCounts,
    filters: {
      famille: p("famille"), texture: p("texture"), lace: p("lace"),
      couleur: p("couleur"), lmin: p("lmin"), lmax: p("lmax"),
      hd: p("hd"), glueless: p("glueless"), tri: p("tri"),
    },
  });
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Boutique() {
  const { products: dbProducts, ratingMap, filters, collections, flashMap, filterCounts } = useLoaderData<typeof loader>();
  const products = dbProducts.length > 0 ? dbProducts : STATIC;
  const activeCount = Object.values(filters).filter(v => v !== "" && v !== "popularite").length;
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  return (
    <>
      <main className="max-w-[90rem] mx-auto px-6 md:px-10 lg:px-20 py-12">

        {/* Hero */}
        <header className="mb-10 md:mb-14">
          <p className="font-sans text-xs font-bold tracking-[0.2em] uppercase text-primary mb-3">DDM Wigs & More</p>
          <h1 className="font-serif text-4xl md:text-5xl text-on-surface mb-4 leading-tight">La Collection</h1>
          <p className="font-sans text-base text-on-surface-variant max-w-2xl leading-relaxed">
            Perruques en cheveux humains 100 % — sélectionnées pour leur qualité, leur naturel et leur durabilité.
            Disponibles à Montréal avec livraison rapide.
          </p>
          <Link to="/quiz"
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline underline-offset-4 font-semibold">
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            Tu ne sais pas quoi choisir ? Fais le quiz →
          </Link>

          {/* Chips collections */}
          {collections.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {collections.map(col => (
                <Link
                  key={col.id}
                  to={`/collections/${col.slug}`}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 border border-outline-variant text-sm font-semibold text-on-surface-variant hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors rounded-full"
                >
                  <span className="material-symbols-outlined text-sm leading-none">collections_bookmark</span>
                  {col.name}
                </Link>
              ))}
            </div>
          )}
        </header>

        <div className="flex flex-col lg:flex-row gap-10">

          {/* ── Filtres sidebar ── */}
          <aside className="w-full lg:w-60 shrink-0">
            <Form method="get" id="ff">
              <div className="flex items-center justify-between mb-5">
                <p className="font-sans text-sm font-bold text-on-surface uppercase tracking-widest">Filtres</p>
                {activeCount > 0 && (
                  <a href="/boutique" className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[14px]">close</span>Effacer ({activeCount})
                  </a>
                )}
              </div>

              <FSection title="Type de produit">
                {([["", "Tous"], ["perruque", "Perruques"], ["meche", "Mèches"], ["closure", "Closures"], ["frontal", "Frontals"]] as [string, string][]).map(([v, l]) => (
                  <FRadio key={v} name="famille" value={v} label={l} current={filters.famille} count={v ? filterCounts.famille[v] : undefined} />
                ))}
              </FSection>

              <FSection title="Texture">
                {TEXTURES.map(([v, l]) => <FCheck key={v} name="texture" value={v} label={l} current={filters.texture} count={filterCounts.texture[v]} />)}
              </FSection>

              <FSection title="Type de lace">
                {LACES.map(([v, l]) => <FCheck key={v} name="lace" value={v} label={l} current={filters.lace} count={filterCounts.lace[v]} />)}
              </FSection>

              <FSection title="Longueur">
                <div className="grid grid-cols-2 gap-1.5">
                  {([["8","16","Court"], ["18","24","Moyen"], ["26","32","Long"], ["34","40","Très long"]] as [string,string,string][]).map(([min, max, label]) => {
                    const active = filters.lmin === min;
                    const nextParams = new URLSearchParams(
                      Object.entries(filters).filter(([k, v]) => v && k !== "lmin" && k !== "lmax").map(([k, v]) => [k, v]) as [string, string][]
                    );
                    if (!active) { nextParams.set("lmin", min); nextParams.set("lmax", max); }
                    return (
                      <a key={min} href={`/boutique?${nextParams}`}
                        className={`px-2 py-1.5 text-xs border transition-colors text-center ${active ? "border-primary bg-primary text-on-primary" : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"}`}>
                        {label}
                      </a>
                    );
                  })}
                </div>
              </FSection>

              <FSection title="Couleur">
                <div className="flex flex-wrap gap-2 pt-1">
                  {COULEURS.map(([v, color, label]) => {
                    const active = filters.couleur === v;
                    const nextParams = new URLSearchParams(
                      Object.entries(filters).filter(([k, val]) => val && k !== "couleur").map(([k, val]) => [k, val]) as [string, string][]
                    );
                    if (!active) nextParams.set("couleur", v);
                    return (
                      <a key={v} href={`/boutique?${nextParams}`} title={label}
                        className={`w-8 h-8 rounded-full border-2 block transition-all ${active ? "border-primary ring-2 ring-primary ring-offset-2" : "border-outline-variant hover:border-primary"}`}
                        style={{ backgroundColor: color }} />
                    );
                  })}
                </div>
              </FSection>

              <FSection title="Options">
                <label className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface cursor-pointer py-0.5">
                  <input type="checkbox" name="hd" value="1" defaultChecked={filters.hd === "1"}
                    className="accent-primary w-4 h-4" onChange={e => (e.target.form as HTMLFormElement).requestSubmit()} />
                  HD Lace (invisible)
                </label>
                <label className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface cursor-pointer py-0.5">
                  <input type="checkbox" name="glueless" value="1" defaultChecked={filters.glueless === "1"}
                    className="accent-primary w-4 h-4" onChange={e => (e.target.form as HTMLFormElement).requestSubmit()} />
                  Sans colle
                </label>
              </FSection>

              {filters.famille && <input type="hidden" name="famille" value={filters.famille} />}
              {filters.texture && <input type="hidden" name="texture" value={filters.texture} />}
              {filters.lace && <input type="hidden" name="lace" value={filters.lace} />}
              {filters.lmin && <input type="hidden" name="lmin" value={filters.lmin} />}
              {filters.lmax && <input type="hidden" name="lmax" value={filters.lmax} />}
              {filters.couleur && <input type="hidden" name="couleur" value={filters.couleur} />}
              {filters.tri && <input type="hidden" name="tri" value={filters.tri} />}
            </Form>
          </aside>

          {/* ── Grille produits ── */}
          <section className="flex-1 min-w-0">

            <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
              <p className="font-sans text-sm text-on-surface-variant">
                <span className="font-semibold text-on-surface">{products.length}</span>&nbsp;
                style{products.length !== 1 ? "s" : ""}
                {activeCount > 0 ? " trouvé" + (products.length !== 1 ? "s" : "") : " premium"}
              </p>
              <Form method="get" className="flex items-center gap-2">
                {Object.entries(filters).filter(([k, v]) => v && k !== "tri").map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
                <label className="font-sans text-xs text-on-surface-variant uppercase tracking-wider">Trier</label>
                <select name="tri" defaultValue={filters.tri || "popularite"}
                  onChange={e => (e.target.form as HTMLFormElement).requestSubmit()}
                  className="border border-outline-variant bg-surface px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-primary">
                  <option value="popularite">Popularité</option>
                  <option value="nouveautes">Nouveautés</option>
                  <option value="prix-asc">Prix croissant</option>
                  <option value="prix-desc">Prix décroissant</option>
                </select>
              </Form>
            </div>

            {activeCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {filters.famille && <ActiveChip label={filters.famille} remove="famille" all={filters} />}
                {filters.texture && <ActiveChip label={TEXTURE_LABELS[filters.texture] ?? filters.texture} remove="texture" all={filters} />}
                {filters.lace && <ActiveChip label={LACE_LABELS[filters.lace] ?? filters.lace} remove="lace" all={filters} />}
                {filters.lmin && <ActiveChip label={`${filters.lmin}–${filters.lmax} po`} remove="lmin" extra="lmax" all={filters} />}
                {filters.couleur && <ActiveChip label={filters.couleur} remove="couleur" all={filters} />}
                {filters.hd === "1" && <ActiveChip label="HD Lace" remove="hd" all={filters} />}
                {filters.glueless === "1" && <ActiveChip label="Sans colle" remove="glueless" all={filters} />}
              </div>
            )}

            {products.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-12">
                {products.map((p, i) => (
                  <ProductCard
                    key={p.id || i}
                    product={p}
                    rating={ratingMap[p.id]}
                    flash={flashMap[p.id]}
                    onQuickView={() => setModalProduct(p)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                <span className="material-symbols-outlined text-5xl text-outline-variant">search_off</span>
                <p className="font-sans text-lg font-semibold text-on-surface">Aucun produit trouvé</p>
                <p className="font-sans text-sm text-on-surface-variant">Essayez d&apos;élargir vos critères.</p>
                <a href="/boutique" className="mt-2 px-6 py-3 border border-primary text-primary text-sm font-semibold hover:bg-primary hover:text-on-primary transition-colors">
                  Voir toute la collection
                </a>
              </div>
            )}
          </section>
        </div>

        {/* CTA entretien */}
        <section className="mt-24 bg-surface-container-low py-16 px-8 md:px-16 -mx-6 md:-mx-10 lg:-mx-20">
          <div className="max-w-[90rem] mx-auto flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1 space-y-5">
              <h2 className="font-serif text-3xl text-on-surface">Préserver votre investissement</h2>
              <p className="font-sans text-base text-on-surface-variant leading-relaxed">
                Une perruque de qualité dure des années avec les bons soins. Découvrez nos conseils professionnels pour en préserver l&apos;éclat.
              </p>
              <Link to="/guide-entretien"
                className="inline-block px-7 py-3 border border-on-surface text-on-surface text-sm font-semibold uppercase tracking-wider hover:bg-on-surface hover:text-surface transition-all duration-300">
                Lire le guide d&apos;entretien
              </Link>
            </div>
            <div className="flex-1 aspect-video w-full overflow-hidden">
              <img alt="Entretien perruque" className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJmaN6XSo60HjaEDBEe2d-Upy1tEFbjQyY0fVADNQr8ll4ONjXhE7woXgGVWqFyNDFKSqH74X_gs9YbvsMrLcc2CBSHBqPepdSN-GFU-4tQhm-g5y8n0XJqcFemk_yQIAwMNS8KIBIC3ZD-l9prK6i0x0P1ngfPG8WknfdYbgOIm8-Tv2GRNb5VjzGnZYCIImt4Sdn8pRodGe4u6wcrmyB8woacBfzUgbEJ7LVmjQWa6vhz4FMfkPKpdv6eleY1Fz7BbINOL8ZZho" />
            </div>
          </div>
        </section>
      </main>

      {/* Modal aperçu rapide */}
      {modalProduct && (
        <QuickViewModal
          product={modalProduct}
          onClose={() => setModalProduct(null)}
        />
      )}
    </>
  );
}

// ─── QuickViewModal ─────────────────────────────────────────────────────────

function QuickViewModal({ product: p, onClose }: { product: Product; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const [selectedDensity, setSelectedDensity] = useState(p.densite ?? 150);
  const [cartState, setCartState] = useState<"idle" | "loading" | "added" | "error">("idle");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const discount = p.compare_at_price_cad && p.compare_at_price_cad > p.price_cad
    ? Math.round((1 - p.price_cad / p.compare_at_price_cad) * 100)
    : null;

  const showDensity = p.famille === "perruque" || p.famille === "closure" || p.famille === "frontal";

  async function addToCart() {
    if (cartState === "loading" || p.stock === 0) return;
    setCartState("loading");
    try {
      let cartId = localStorage.getItem("ddm_cart_id");
      if (!cartId) { cartId = crypto.randomUUID(); localStorage.setItem("ddm_cart_id", cartId); }
      const res = await fetch(`/api/cart?cartId=${cartId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id, quantity: qty }),
      });
      if (!res.ok) throw new Error();
      const cart = await res.json() as { items: { quantity: number }[] };
      const total = cart.items.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0);
      const badge = document.getElementById("cart-badge");
      if (badge) { badge.textContent = String(total); badge.classList.remove("hidden"); badge.classList.add("flex"); }
      setCartState("added");
      setTimeout(() => { setCartState("idle"); }, 2500);
    } catch {
      setCartState("error");
      setTimeout(() => setCartState("idle"), 3000);
    }
  }

  const densiteNote = selectedDensity !== (p.densite ?? 150)
    ? ` — densité ${selectedDensity}% demandée`
    : "";
  const whatsappMsg = encodeURIComponent(
    `Bonjour, je suis intéressée par : ${p.name}${p.longueur_po ? ` — ${p.longueur_po} po` : ""}${densiteNote}. Prix: ${p.price_cad.toFixed(2)} $ CAD.`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panneau */}
      <div className="relative bg-surface w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[88vh] overflow-y-auto shadow-2xl animate-slide-up">

        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center bg-surface-container hover:bg-surface-container-high transition-colors"
          aria-label="Fermer">
          <span className="material-symbols-outlined text-on-surface-variant text-xl">close</span>
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2">

          {/* ── Image ── */}
          <div className="aspect-[3/4] md:aspect-auto bg-surface-container relative md:min-h-[500px]">
            {p.image_key ? (
              <img src={cfImage(p.image_key, "card") ?? p.image_key} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="material-symbols-outlined text-6xl text-outline-variant">styler</span>
              </div>
            )}
            {/* Badges */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5">
              {discount && (
                <span className="bg-error text-on-error px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                  -{discount}%
                </span>
              )}
              {p.hd_lace === 1 && (
                <span className="bg-surface/90 backdrop-blur border border-outline-variant/40 text-on-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                  HD Lace
                </span>
              )}
            </div>
          </div>

          {/* ── Infos ── */}
          <div className="p-6 flex flex-col gap-4 overflow-y-auto">

            {/* Nom */}
            <div>
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-1">
                {p.famille === "perruque" ? "Perruque" : p.famille ?? "DDM Wigs"}
              </p>
              <h2 className="font-serif text-2xl text-on-surface leading-tight">{p.name}</h2>
            </div>

            {/* Prix */}
            <div className="flex items-end gap-3">
              <p className="font-serif text-3xl text-primary font-bold">{p.price_cad.toFixed(2)} $</p>
              {p.compare_at_price_cad && p.compare_at_price_cad > p.price_cad && (
                <p className="font-sans text-lg text-on-surface-variant line-through mb-0.5">
                  {p.compare_at_price_cad.toFixed(2)} $
                </p>
              )}
              <span className="font-sans text-xs text-on-surface-variant mb-1">CAD</span>
            </div>

            {/* Specs clés */}
            <div className="grid grid-cols-2 gap-2 py-3 border-y border-outline-variant/40">
              {p.texture && (
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Texture</p>
                  <p className="font-sans text-sm font-semibold text-on-surface">{TEXTURE_LABELS[p.texture] ?? p.texture}</p>
                </div>
              )}
              {p.type_lace && (
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Lace</p>
                  <p className="font-sans text-sm font-semibold text-on-surface">{LACE_LABELS[p.type_lace] ?? p.type_lace}</p>
                </div>
              )}
              {p.longueur_po && (
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Longueur</p>
                  <p className="font-sans text-sm font-semibold text-on-surface">{p.longueur_po} pouces</p>
                </div>
              )}
              {p.couleur && (
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Couleur</p>
                  <p className="font-sans text-sm font-semibold text-on-surface">{p.couleur}</p>
                </div>
              )}
            </div>

            {/* Description courte */}
            {p.description && (
              <p className="font-sans text-sm text-on-surface-variant leading-relaxed line-clamp-3">
                {p.description}
              </p>
            )}

            {/* Densité */}
            {showDensity && (
              <div>
                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                  Densité — <span className="normal-case text-on-surface font-semibold">{selectedDensity}%</span>
                </p>
                <div className="flex gap-2">
                  {[130, 150, 180].map(d => (
                    <button key={d} onClick={() => setSelectedDensity(d)}
                      className={`flex-1 h-9 font-sans text-xs font-bold border transition-all ${
                        selectedDensity === d
                          ? "border-primary bg-primary text-on-primary"
                          : "border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                      }`}>
                      {d}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Options */}
            {(p.hd_lace || p.glueless || p.pret_a_porter) && (
              <div className="flex flex-wrap gap-1.5">
                {p.hd_lace === 1 && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-primary/8 border border-primary/20 text-primary font-sans text-[11px] font-semibold">
                    <span className="material-symbols-outlined text-xs">visibility_off</span>HD Lace
                  </span>
                )}
                {p.glueless === 1 && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-primary/8 border border-primary/20 text-primary font-sans text-[11px] font-semibold">
                    <span className="material-symbols-outlined text-xs">block</span>Sans colle
                  </span>
                )}
                {p.pret_a_porter === 1 && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-primary/8 border border-primary/20 text-primary font-sans text-[11px] font-semibold">
                    <span className="material-symbols-outlined text-xs">timer</span>5 min
                  </span>
                )}
              </div>
            )}

            {/* Stock faible */}
            {p.stock > 0 && p.stock <= 5 && (
              <p className="font-sans text-xs text-error font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">warning</span>
                Plus que {p.stock} en stock
              </p>
            )}

            {/* Quantité + panier */}
            <div className="flex gap-3 items-center">
              <div className="flex items-center border border-outline-variant shrink-0">
                <button onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-9 h-11 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-base">remove</span>
                </button>
                <span className="w-9 text-center font-sans text-sm font-semibold text-on-surface">{qty}</span>
                <button onClick={() => setQty(q => Math.min(p.stock || 10, q + 1))}
                  className="w-9 h-11 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
                  <span className="material-symbols-outlined text-base">add</span>
                </button>
              </div>

              <button
                onClick={addToCart}
                disabled={p.stock === 0 || cartState === "loading"}
                className={`flex-1 h-11 flex items-center justify-center gap-2 font-sans text-xs font-bold uppercase tracking-widest transition-all duration-300 ${
                  cartState === "added" ? "bg-secondary text-on-secondary"
                    : cartState === "error" ? "bg-error text-on-error"
                    : cartState === "loading" ? "bg-primary/70 text-on-primary cursor-wait"
                    : p.stock === 0 ? "bg-surface-container text-on-surface-variant cursor-not-allowed"
                    : "bg-primary text-on-primary hover:opacity-90 active:scale-[0.98]"
                }`}>
                <span className="material-symbols-outlined text-base">
                  {cartState === "added" ? "check_circle" : cartState === "error" ? "error" : "shopping_bag"}
                </span>
                {cartState === "added" ? "Ajouté !"
                  : cartState === "error" ? "Erreur"
                  : cartState === "loading" ? "Ajout…"
                  : p.stock === 0 ? "Rupture de stock"
                  : "Ajouter au panier"}
              </button>
            </div>

            {/* WhatsApp */}
            <a href={`https://wa.me/23797193723?text=${whatsappMsg}`}
              target="_blank" rel="noopener noreferrer"
              className="w-full h-10 flex items-center justify-center gap-2 border border-outline-variant text-on-surface-variant font-sans text-xs font-semibold hover:border-primary hover:text-primary transition-colors">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.374 0 0 5.373 0 12c0 2.114.55 4.097 1.508 5.819L.057 23.172a.75.75 0 0 0 .92.92l5.353-1.451A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.655-.502-5.184-1.381l-.372-.218-3.856 1.046 1.046-3.856-.218-.372A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
              Commander via WhatsApp
            </a>

            {/* Méthodes de paiement */}
            <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/40 flex-wrap">
              <span className="font-sans text-[10px] text-on-surface-variant uppercase tracking-wider">Paiements acceptés</span>
              {["VISA", "MC", "AMEX", "PayPal", "Interac"].map(m => (
                <span key={m} className="px-2 py-0.5 border border-outline-variant/60 font-sans text-[10px] font-bold text-on-surface-variant rounded-sm">
                  {m}
                </span>
              ))}
            </div>

            {/* Lien vers la fiche complète */}
            {p.slug && (
              <Link
                to={`/boutique/${p.slug}`}
                onClick={onClose}
                className="flex items-center gap-1.5 font-sans text-sm text-primary font-semibold hover:underline">
                <span className="material-symbols-outlined text-base">open_in_new</span>
                Voir tous les détails du produit
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Product Card ───────────────────────────────────────────────────────────

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
  return (
    <span className="font-mono text-[11px] tabular-nums">
      {d > 0 ? `${d}j ` : ""}{pad(h)}:{pad(m)}:{pad(sec)}
    </span>
  );
}

function ProductCard({
  product: p,
  rating,
  flash,
  onQuickView,
}: {
  product: Product;
  rating?: { avg: number; count: number };
  flash?: { price: number; ends_at: string };
  onQuickView: () => void;
}) {
  const displayPrice = flash ? flash.price : p.price_cad;
  const originalPrice = flash ? p.price_cad : (p.compare_at_price_cad ?? null);
  const discount = originalPrice && originalPrice > displayPrice
    ? Math.round((1 - displayPrice / originalPrice) * 100)
    : null;

  const cardInner = (
    <>
      {/* Image */}
      <div className="aspect-[4/5] overflow-hidden bg-surface-container relative mb-4">
        {p.image_key ? (
          <img alt={p.name} src={cfImage(p.image_key, "card") ?? p.image_key}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full bg-surface-container-high flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-outline-variant">styler</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {flash && (
            <span className="inline-flex items-center gap-1 bg-error text-on-error text-[11px] font-bold px-2 py-0.5 rounded-sm">
              <span className="material-symbols-outlined text-xs leading-none" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
              Vente Flash -{discount}%
            </span>
          )}
          {!flash && discount && <PBadge sale>-{discount}%</PBadge>}
          {p.featured === 1 && !discount && !flash && <PBadge>Vedette</PBadge>}
          {p.hd_lace === 1 && <PBadge subtle>HD Lace</PBadge>}
          {p.pret_a_porter === 1 && <PBadge subtle>Prêt à porter</PBadge>}
          {p.glueless === 1 && p.pret_a_porter !== 1 && <PBadge subtle>Sans colle</PBadge>}
        </div>

        {/* Bouton Aperçu rapide — visible au hover */}
        <div className="absolute inset-x-3 bottom-3 flex gap-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
          <div className="flex-1 bg-on-surface text-surface py-2.5 text-center font-sans text-[11px] font-bold uppercase tracking-widest">
            {p.slug ? "Voir le produit" : "Bientôt disponible"}
          </div>
          {p.slug && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); onQuickView(); }}
              title="Aperçu rapide"
              className="w-10 bg-surface text-on-surface flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors shrink-0">
              <span className="material-symbols-outlined text-base">visibility</span>
            </button>
          )}
        </div>
      </div>

      {/* Infos */}
      <div>
        <h2 className="font-serif text-lg text-on-surface mb-1 leading-snug">{p.name}</h2>

        {/* Étoiles */}
        <div className="flex items-center gap-1.5 mb-2">
          <div className="flex">
            {[1,2,3,4,5].map(s => (
              <span key={s} className="material-symbols-outlined text-sm"
                style={{
                  color: rating && s <= Math.round(rating.avg) ? "var(--color-primary)" : "var(--color-outline-variant)",
                  fontVariationSettings: rating && s <= Math.round(rating.avg) ? "'FILL' 1" : "'FILL' 0",
                }}>
                star
              </span>
            ))}
          </div>
          {rating ? (
            <span className="font-sans text-[11px] text-on-surface-variant">({rating.count})</span>
          ) : (
            <span className="font-sans text-[11px] text-on-surface-variant/50">Nouveau</span>
          )}
        </div>

        {/* Chips */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {p.texture && <Chip>{TEXTURE_LABELS[p.texture] ?? p.texture}</Chip>}
          {p.type_lace && <Chip>{LACE_LABELS[p.type_lace] ?? p.type_lace}</Chip>}
          {p.longueur_po && <Chip>{p.longueur_po} po</Chip>}
          {p.densite && <Chip>{p.densite}%</Chip>}
        </div>

        <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <p className={`font-sans text-base font-bold ${flash ? "text-error" : "text-primary"}`}>
              {displayPrice.toFixed(2)} $ CAD
            </p>
            {originalPrice && originalPrice > displayPrice && (
              <p className="font-sans text-sm text-on-surface-variant line-through">{originalPrice.toFixed(2)} $</p>
            )}
          </div>
          {p.stock > 0 && p.stock <= 2 && (
            <p className="font-sans text-xs text-error font-semibold">Plus que {p.stock} !</p>
          )}
        </div>
        {flash && (
          <div className="flex items-center gap-1 mt-1.5 text-error">
            <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>timer</span>
            <FlashCountdown endsAt={flash.ends_at} />
          </div>
        )}
      </div>
    </>
  );

  return p.slug
    ? <Link to={`/boutique/${p.slug}`} className="group block">{cardInner}</Link>
    : <div className="group">{cardInner}</div>;
}

// ─── UI atoms ───────────────────────────────────────────────────────────────

function PBadge({ children, subtle, sale }: { children: React.ReactNode; subtle?: boolean; sale?: boolean }) {
  const cls = sale
    ? "bg-error text-on-error"
    : subtle
    ? "bg-surface/90 backdrop-blur text-on-surface border border-outline-variant/40"
    : "bg-primary text-on-primary";
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${cls}`}>
      {children}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 text-[11px] font-medium bg-surface-container-high text-on-surface-variant rounded-sm">
      {children}
    </span>
  );
}

function FSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h3 className="font-sans text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface border-b border-outline-variant pb-2 mb-3">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function FRadio({ name, value, label, current, count }: { name: string; value: string; label: string; current: string; count?: number }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group py-0.5">
      <input type="radio" name={name} value={value} defaultChecked={current === value}
        className="accent-primary w-4 h-4"
        onChange={e => (e.target.form as HTMLFormElement).requestSubmit()} />
      <span className={`font-sans text-sm flex-1 ${current === value ? "text-primary font-semibold" : "text-on-surface-variant group-hover:text-on-surface"}`}>{label}</span>
      {count !== undefined && <span className="font-sans text-[11px] text-on-surface-variant/60">{count}</span>}
    </label>
  );
}

function FCheck({ name, value, label, current, count }: { name: string; value: string; label: string; current: string; count?: number }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group py-0.5">
      <input type="checkbox" name={name} value={value} defaultChecked={current === value}
        className="accent-primary w-4 h-4"
        onChange={e => (e.target.form as HTMLFormElement).requestSubmit()} />
      <span className={`font-sans text-sm flex-1 ${current === value ? "text-primary font-semibold" : "text-on-surface-variant group-hover:text-on-surface"}`}>{label}</span>
      {count !== undefined && <span className="font-sans text-[11px] text-on-surface-variant/60">{count}</span>}
    </label>
  );
}

function ActiveChip({ label, remove, extra, all }: {
  label: string; remove: string; extra?: string;
  all: Record<string, string>;
}) {
  const remaining = Object.entries(all)
    .filter(([k, v]) => v && k !== remove && k !== extra)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return (
    <a href={remaining ? `/boutique?${remaining}` : "/boutique"}
      className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full hover:bg-primary/20 transition-colors">
      {label}
      <span className="material-symbols-outlined text-[14px]">close</span>
    </a>
  );
}
