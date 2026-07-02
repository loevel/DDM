import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { getDB, getProducts } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";
import { cfImage } from "~/lib/images";

export const meta: MetaFunction = () => [
  { title: "Promotions — DDM Wigs & More" },
  { name: "description", content: "Offres spéciales et codes de réduction sur nos perruques en cheveux humains premium." },
];

interface PromoCode {
  id: number;
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_order: number;
  usage_limit: number | null;
  used_count: number;
  expires_at: string | null;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDB(context);

  // Produits soldés (compare_at_price_cad > price_cad)
  let saleProducts: Product[] = [];
  try {
    const all = await getProducts(db, {});
    saleProducts = all.filter(p => p.compare_at_price_cad && p.compare_at_price_cad > p.price_cad);
  } catch {
    saleProducts = [];
  }

  // Codes promo publics actifs (non expirés, non épuisés)
  let promoCodes: PromoCode[] = [];
  try {
    const rows = (await db.prepare(`
      SELECT id, code, type, value, min_order, usage_limit, used_count, expires_at
      FROM promo_codes
      WHERE active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (usage_limit IS NULL OR used_count < usage_limit)
      ORDER BY value DESC
    `).all<PromoCode>()).results ?? [];
    promoCodes = rows;
  } catch {
    promoCodes = [];
  }

  return json({ saleProducts, promoCodes });
}

const TEXTURE_LABELS: Record<string, string> = {
  "lisse": "Lisse", "body-wave": "Body Wave", "water-wave": "Water Wave",
  "deep-wave": "Deep Wave", "loose-wave": "Loose Wave", "boucle": "Bouclé",
  "kinky-curly": "Kinky Curly", "bob": "Bob",
};

export default function Promotions() {
  const { saleProducts, promoCodes } = useLoaderData<typeof loader>();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  const hasContent = saleProducts.length > 0 || promoCodes.length > 0;

  return (
    <main className="max-w-[90rem] mx-auto px-6 md:px-10 lg:px-20 py-12">

      {/* Hero */}
      <header className="mb-14 text-center max-w-2xl mx-auto">
        <p className="font-sans text-xs font-bold tracking-[0.25em] uppercase text-error mb-3">Offres limitées</p>
        <h1 className="font-serif text-4xl md:text-5xl text-on-surface mb-4 leading-tight">Promotions</h1>
        <p className="font-sans text-base text-on-surface-variant leading-relaxed">
          Codes de réduction exclusifs et perruques soldées — profitez-en avant qu'il ne soit trop tard.
        </p>
      </header>

      {!hasContent && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-5">
          <span className="material-symbols-outlined text-6xl text-outline-variant">sell</span>
          <h2 className="font-serif text-2xl text-on-surface">Aucune promotion en ce moment</h2>
          <p className="font-sans text-base text-on-surface-variant max-w-sm">
            Revenez bientôt — de nouvelles offres arrivent régulièrement. En attendant, découvrez toute la collection.
          </p>
          <Link to="/boutique"
            className="mt-2 px-8 py-3 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
            Voir la boutique
          </Link>
        </div>
      )}

      {/* ── Codes de réduction ── */}
      {promoCodes.length > 0 && (
        <section className="mb-20">
          <div className="flex items-end gap-3 mb-8">
            <span className="material-symbols-outlined text-error text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>sell</span>
            <h2 className="font-serif text-2xl md:text-3xl text-on-surface">Codes de réduction</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {promoCodes.map(promo => {
              const copied = copiedCode === promo.code;
              const daysLeft = promo.expires_at
                ? Math.ceil((new Date(promo.expires_at).getTime() - Date.now()) / 86400000)
                : null;

              return (
                <div key={promo.id}
                  className="border border-outline-variant bg-surface relative overflow-hidden group">
                  {/* Bande décorative gauche */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-error" />

                  <div className="pl-5 pr-5 pt-5 pb-4">
                    {/* Code + bouton copier */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-2xl font-black tracking-widest text-on-surface">
                          {promo.code}
                        </span>
                      </div>
                      <button
                        onClick={() => copyCode(promo.code)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 font-sans text-xs font-bold uppercase tracking-wider transition-all ${
                          copied
                            ? "bg-secondary text-on-secondary"
                            : "bg-surface-container-high text-on-surface-variant hover:bg-primary hover:text-on-primary"
                        }`}>
                        <span className="material-symbols-outlined text-sm">
                          {copied ? "check" : "content_copy"}
                        </span>
                        {copied ? "Copié !" : "Copier"}
                      </button>
                    </div>

                    {/* Valeur mise en avant */}
                    <p className="font-serif text-4xl font-bold text-error mb-1">
                      {promo.type === "percent" ? `-${promo.value}%` : `-${promo.value.toFixed(2)} $`}
                    </p>
                    <p className="font-sans text-sm text-on-surface-variant mb-4">
                      {promo.type === "percent"
                        ? `${promo.value}% de réduction sur votre commande`
                        : `${promo.value.toFixed(2)} $ de réduction immédiate`}
                    </p>

                    {/* Conditions */}
                    <div className="space-y-1 text-xs font-sans text-on-surface-variant border-t border-outline-variant/40 pt-3">
                      {promo.min_order > 0 && (
                        <p className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-outline-variant">shopping_cart</span>
                          Commande minimum : <strong className="text-on-surface">{promo.min_order.toFixed(2)} $</strong>
                        </p>
                      )}
                      {daysLeft !== null && (
                        <p className={`flex items-center gap-1.5 ${daysLeft <= 3 ? "text-error font-semibold" : ""}`}>
                          <span className="material-symbols-outlined text-sm" style={{ color: daysLeft <= 3 ? "var(--color-error)" : "var(--color-outline-variant)" }}>
                            schedule
                          </span>
                          {daysLeft <= 0
                            ? "Expire aujourd'hui !"
                            : daysLeft === 1
                            ? "Expire demain !"
                            : `Expire dans ${daysLeft} jours`}
                        </p>
                      )}
                      {promo.usage_limit !== null && (
                        <p className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-outline-variant">people</span>
                          {promo.usage_limit - promo.used_count} utilisation{(promo.usage_limit - promo.used_count) > 1 ? "s" : ""} restante{(promo.usage_limit - promo.used_count) > 1 ? "s" : ""}
                        </p>
                      )}
                      {!promo.min_order && daysLeft === null && promo.usage_limit === null && (
                        <p className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-outline-variant">all_inclusive</span>
                          Sans condition · illimité
                        </p>
                      )}
                    </div>
                  </div>

                  {/* CTA */}
                  <Link to="/boutique"
                    className="flex items-center justify-center gap-2 py-3 bg-surface-container-low border-t border-outline-variant/40 font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:bg-primary hover:text-on-primary hover:border-primary transition-all">
                    <span className="material-symbols-outlined text-sm">shopping_bag</span>
                    Utiliser ce code
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Comment utiliser */}
          <div className="mt-6 flex items-start gap-3 bg-surface-container-low border border-outline-variant/40 px-5 py-4 max-w-lg">
            <span className="material-symbols-outlined text-primary text-xl shrink-0 mt-0.5">info</span>
            <p className="font-sans text-sm text-on-surface-variant leading-relaxed">
              Pour utiliser un code, ajoutez vos produits au panier puis entrez le code dans le champ
              <strong className="text-on-surface"> "Code de réduction"</strong> dans le récapitulatif de votre panier.
            </p>
          </div>
        </section>
      )}

      {/* ── Produits soldés ── */}
      {saleProducts.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-8">
            <div className="flex items-end gap-3">
              <span className="material-symbols-outlined text-error text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              <h2 className="font-serif text-2xl md:text-3xl text-on-surface">Produits en solde</h2>
            </div>
            <Link to="/boutique"
              className="font-sans text-sm text-primary font-semibold hover:underline hidden md:flex items-center gap-1">
              Voir toute la collection
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
            {saleProducts.map(p => {
              const discount = Math.round((1 - p.price_cad / p.compare_at_price_cad!) * 100);
              const savings = (p.compare_at_price_cad! - p.price_cad);
              return (
                <Link key={p.id} to={`/boutique/${p.slug}`} className="group block">
                  {/* Image */}
                  <div className="aspect-[3/4] bg-surface-container overflow-hidden relative mb-4">
                    {p.image_key ? (
                      <img src={cfImage(p.image_key, "card") ?? p.image_key} alt={p.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full bg-surface-container-high flex items-center justify-center">
                        <span className="material-symbols-outlined text-4xl text-outline-variant">styler</span>
                      </div>
                    )}

                    {/* Badge réduction */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                      <span className="bg-error text-on-error px-3 py-1 text-sm font-black uppercase tracking-widest">
                        -{discount}%
                      </span>
                      <span className="bg-surface/90 backdrop-blur text-error border border-error/20 px-2 py-0.5 text-[10px] font-bold">
                        -{savings.toFixed(0)} $
                      </span>
                    </div>

                    {/* Hover */}
                    <div className="absolute inset-x-3 bottom-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                      <div className="bg-on-surface text-surface py-2.5 text-center font-sans text-xs font-bold uppercase tracking-widest">
                        Voir le produit
                      </div>
                    </div>
                  </div>

                  {/* Infos */}
                  <h3 className="font-serif text-lg text-on-surface mb-1.5 leading-snug group-hover:text-primary transition-colors">
                    {p.name}
                  </h3>

                  {/* Chips */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {p.texture && (
                      <span className="px-2 py-0.5 text-[11px] font-medium bg-surface-container-high text-on-surface-variant rounded-sm">
                        {TEXTURE_LABELS[p.texture] ?? p.texture}
                      </span>
                    )}
                    {p.longueur_po && (
                      <span className="px-2 py-0.5 text-[11px] font-medium bg-surface-container-high text-on-surface-variant rounded-sm">
                        {p.longueur_po} po
                      </span>
                    )}
                  </div>

                  {/* Prix */}
                  <div className="flex items-center gap-3">
                    <p className="font-sans text-xl font-black text-error">{p.price_cad.toFixed(2)} $</p>
                    <p className="font-sans text-base text-on-surface-variant line-through">{p.compare_at_price_cad!.toFixed(2)} $</p>
                  </div>
                  <p className="font-sans text-xs text-on-surface-variant mt-0.5">CAD · taxes incluses</p>
                </Link>
              );
            })}
          </div>

          <div className="mt-10 text-center md:hidden">
            <Link to="/boutique"
              className="inline-flex items-center gap-2 px-6 py-3 border border-primary text-primary font-sans text-sm font-semibold hover:bg-primary hover:text-on-primary transition-colors">
              Voir toute la collection
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </Link>
          </div>
        </section>
      )}

      {/* Bannière newsletter */}
      <section className="mt-20 bg-surface-container-low border border-outline-variant/40 px-8 md:px-16 py-12 text-center -mx-6 md:-mx-10 lg:-mx-20">
        <span className="material-symbols-outlined text-4xl text-primary mb-4 block" style={{ fontVariationSettings: "'FILL' 1" }}>notifications</span>
        <h2 className="font-serif text-2xl text-on-surface mb-2">Ne manquez aucune offre</h2>
        <p className="font-sans text-base text-on-surface-variant max-w-md mx-auto mb-6">
          Contactez-nous sur WhatsApp pour être informée en priorité des nouvelles promotions et arrivages.
        </p>
        <a
          href="https://wa.me/23797193723?text=Bonjour%2C%20je%20souhaite%20être%20informée%20de%20vos%20promotions%20et%20nouveautés."
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.374 0 0 5.373 0 12c0 2.114.55 4.097 1.508 5.819L.057 23.172a.75.75 0 0 0 .92.92l5.353-1.451A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.655-.502-5.184-1.381l-.372-.218-3.856 1.046 1.046-3.856-.218-.372A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          </svg>
          Nous contacter sur WhatsApp
        </a>
      </section>
    </main>
  );
}
