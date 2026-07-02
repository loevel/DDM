import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getDB, getProducts } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";
import { cfImage } from "~/lib/images";

export const meta: MetaFunction = () => [
  { title: "Accessoires & Soins - DDM Wigs & More" },
  { name: "description", content: "Découvrez notre collection professionnelle d'outils et élixirs conçus pour préserver la longévité et l'éclat de votre investissement capillaire." },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDB(context);
  const [accessoires, soins] = await Promise.all([
    getProducts(db, { category: "accessoire" }),
    getProducts(db, { category: "soin" }),
  ]);
  return json({ accessoires, soins, allProducts: [...accessoires, ...soins] });
}

export default function Accessoires() {
  const { allProducts } = useLoaderData<typeof loader>();

  return (
    <main>
      {/* Hero Section */}
      <section className="relative pt-24 pb-16 px-grid-margin-desktop max-w-container-max-width mx-auto overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="z-10">
            <span className="font-label-md text-label-md text-primary uppercase tracking-[0.2em] block mb-4">Essential Curations</span>
            <h1 className="font-headline-xl text-headline-xl text-on-surface mb-6">Elevate Your Care Ritual</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant mb-8 max-w-md">
              Découvrez notre collection professionnelle d'outils et élixirs conçus pour préserver la longévité et l'éclat de votre investissement.
            </p>
            <div className="flex gap-4">
              <button className="bg-primary text-on-primary px-8 py-4 font-label-md text-label-md transition-all hover:bg-on-primary-fixed-variant">Shop Essentials</button>
            </div>
          </div>
          <div className="relative aspect-[4/5] bg-surface-container-low">
            <img
              className="w-full h-full object-cover grayscale-[20%]"
              alt="Kit d'entretien luxueux pour perruques"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuADEe86hXJvt-nGbgGjJ9CwLupcXP8Svempc1q_tAjSYL5tQZcA-CIUiVHRxQyqZMEurpn9DMrOTFwZ7yUqBl74EyKrY-X5ehYTh_GNl4pI_JvH9kQ3EjksdatVm2Zjxd0YAvGEZzJcc1jACVztB7lNUcOr3k6AWsroG__zJ4MNJ_qr0YO3RkROrKdq2vMIV4ugIosdxFwn6ECfGVgtuyOBz-TQOszKe4wKd8OwDE5xNLIW13W0M253pcEA1WqDUzSQT4fhRc8JQAU"
            />
          </div>
        </div>
      </section>

      {/* Product Grid Section */}
      <section className="py-section-gap-desktop px-grid-margin-desktop max-w-container-max-width mx-auto">
        <div className="flex justify-between items-end mb-16">
          <div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">The Care Collection</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Outils professionnels pour l'entretien quotidien et la restauration.</p>
          </div>
          <div className="flex gap-4 items-center">
            <span className="font-label-md text-label-md text-on-surface">Filtrer par :</span>
            <select className="bg-transparent border-none font-label-md text-label-md text-primary focus:ring-0 cursor-pointer">
              <option>Tous les Accessoires</option>
              <option>Outils</option>
              <option>Adhésifs</option>
              <option>Soins Liquides</option>
            </select>
          </div>
        </div>

        {allProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-grid-gutter">
            {allProducts.map((product: Product) => (
              <div key={product.id} className="group cursor-pointer">
                <div className="aspect-[4/5] bg-surface-container-low overflow-hidden mb-6 relative">
                  {product.image_key ? (
                    <img
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      alt={product.name}
                      src={cfImage(product.image_key, "card") ?? product.image_key}
                    />
                  ) : (
                    <div className="w-full h-full bg-surface-container-high" />
                  )}
                  <div className="absolute top-4 left-4 bg-surface px-3 py-1 font-label-md text-[10px] tracking-widest uppercase">
                    {product.category}
                  </div>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-1">{product.name}</h3>
                <p className="font-body-md text-body-md text-primary">${product.price_cad.toFixed(2)} CAD</p>
              </div>
            ))}
          </div>
        ) : (
          /* Fallback static grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-grid-gutter">
            {[
              { name: "Sculptural Oak Wig Stand", price: "45.00", badge: "Essentials", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAr0Cn4polkTmpo9gcitOv4qVL2kComds9moqC84s8su8umjpIqVVW25tZRTWgb7dQH8vZ_9CZQel1f6_1Cu5sF3nzCJExL0Htfl4kmPx993hojKjigmJMq-rDW__Nj0yYjiYxjgC2J4xR2XlVliPJfdkyBrASqAa4Pd75eYj5PVcwD465VPzm8YKSJ6qEi1BQAH5HdL1JPkInQ13e-kxSmm26QfQz18Tk6FVYEGIiWI8fvlOEB5V5NuCASm6Xkigac6DlWUa85s54" },
              { name: "Signature Tortoise Comb Set", price: "32.00", badge: "Tools", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCSCD6lBB2Gfd0-WWIotZmyokLXqrFHcBrSVm3tou6yMZsk_s7YcM3ymuEmPnAhZoVHHUdDuc12bbkdJZ4pBEdftTXeqLLOnf9uRKvn1wVigLbzzyIhu_j-qBCKAiZdNmTnv4Kg0gn71sZznkKj2HQO2uQ4Zw27-IpOiWHrTlaz5Zd0-GXZM7WkQloawWJNY4FDRurgwR0dhA6H1TVVY9tmGSc-KPbWb7xk7vnUvrSkl08rROULg9k5GYrweF4Owb6a93RHiEXzGWI" },
              { name: "Ultra-Hold Invisible Kit", price: "58.00", badge: "Adhesives", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuB6oiyuVot0qQUN1FZFp0RkKRe8-45UK3_iUWzzxTb9TwYT-UBCQTwg30NDEdixYZL9CeWF5j27JdHuoZG5HJSrjJ-VbIA5_BMOcJnnaXoftCkTjt4z3xvwzbiwhIza7htQLRhGvvkGJkOgHTLdsUqvFOpP9EW443Cfs9928-jjEyzi1_4nOEFydSvpGliXk5EXwEetcuB78fFiegOk8IEzi3nIUF9M5T0wttvPVuwaxgIbLrXkzNoZtZQZOLYCLy1jC2uH-kvGxQY" },
              { name: "The Restoration Trinity", price: "110.00", badge: "Kits", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuB2G1VY6X2PsJ_rzQ5le06l7ZMHBXiplpo8LBCVFSV2Kf9JMYS6DPmjvFwDgjLkIZ0i4DpQZh5yRWt_YYwHF6h6GvR4_w6ENtb6HC3QDMs2jwd_f_KdEPDTKaLFqPx7HTlWzysCw4a3WD_d8mTL5mNT2JxPAs05X8VaSmaik8PhY1KCC7r4w0m5ICLgOSHNQCNkk0Gaad2Lkk2nBPk79TFRw2Hy2jNburImFuMOZlUnetx061gIXaZupqqq1j552GmZOHnOmQ4qALc" },
            ].map((p) => (
              <div key={p.name} className="group cursor-pointer">
                <div className="aspect-[4/5] bg-surface-container-low overflow-hidden mb-6 relative">
                  <img
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    alt={p.name}
                    src={p.img}
                  />
                  <div className="absolute top-4 left-4 bg-surface px-3 py-1 font-label-md text-[10px] tracking-widest uppercase">{p.badge}</div>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-1">{p.name}</h3>
                <p className="font-body-md text-body-md text-primary">${p.price} CAD</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Educational Bento Section */}
      <section className="bg-surface-container-low py-section-gap-desktop">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop">
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-4">Maîtriser l'Art de la Longévité</h2>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mx-auto">
              Investir dans des cheveux de qualité nécessite un engagement envers un entretien approprié. Suivez nos rituels d'experts pour que vos pièces restent éblouissantes.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto md:h-[600px]">
            <div className="md:col-span-7 bg-white p-12 flex flex-col justify-between group cursor-pointer relative overflow-hidden">
              <div className="z-10">
                <span className="font-label-md text-label-md text-primary-container mb-4 block">Tutorial 01</span>
                <h3 className="font-headline-lg text-headline-lg text-on-surface mb-6">The Gentle Cleanse Ritual</h3>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-sm">
                  Apprenez la technique précise pour laver les cheveux humains et les mélanges synthétiques sans compromettre la structure du bonnet.
                </p>
              </div>
              <div className="z-10 mt-8">
                <Link className="font-label-md text-label-md text-on-surface border-b border-on-surface pb-1 hover:text-primary transition-colors" to="/guide-entretien">
                  Voir le Guide
                </Link>
              </div>
              <img
                className="absolute right-[-10%] bottom-[-10%] w-1/2 opacity-20 group-hover:opacity-40 transition-opacity duration-700"
                alt="Gouttelettes d'eau sur des mèches de cheveux"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJmaN6XSo60HjaEDBEe2d-Upy1tEFbjQyY0fVADNQr8ll4ONjXhE7woXgGVWqFyNDFKSqH74X_gs9YbvsMrLcc2CBSHBqPepdSN-GFU-4tQhm-g5y8n0XJqcFemk_yQIAwMNS8KIBIC3ZD-l9prK6i0x0P1ngfPG8WknfdYbgOIm8-Tv2GRNb5VjzGnZYCIImt4Sdn8pRodGe4u6wcrmyB8woacBfzUgbEJ7LVmjQWa6vhz4FMfkPKpdv6eleY1Fz7BbINOL8ZZho"
              />
            </div>
            <div className="md:col-span-5 grid grid-rows-2 gap-6">
              <div className="bg-primary text-on-primary p-8 flex flex-col justify-center">
                <h4 className="font-headline-md text-headline-md mb-2">Secrets de Rangement</h4>
                <p className="font-body-md text-body-md text-primary-fixed mb-4">Ne laissez jamais votre perruque exposée directement au soleil pendant de longues périodes.</p>
                <span className="material-symbols-outlined text-4xl">wb_sunny</span>
              </div>
              <div className="bg-secondary-container text-on-secondary-container p-8 flex flex-col justify-center">
                <h4 className="font-headline-md text-headline-md mb-2">Protection Thermique</h4>
                <p className="font-body-md text-body-md text-on-secondary-fixed-variant mb-4">Appliquez toujours notre sérum Silk Shield avant d'utiliser des outils thermiques.</p>
                <span className="material-symbols-outlined text-4xl">thermostat</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Care Tips Ticker */}
      <section className="py-24 border-y border-outline-variant/30">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop overflow-hidden whitespace-nowrap">
          <div className="flex gap-24" style={{ animation: "marquee 30s linear infinite" }}>
            {["Formules Sans Sulfate Uniquement", "Technique Peigne Dents Larges", "Rinçage à l'Eau Froide", "Séchage à l'Air Recommandé", "Formules Sans Sulfate Uniquement"].map((tip, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <span className="font-label-md text-label-md uppercase tracking-widest">{tip}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      ` }} />
    </main>
  );
}
