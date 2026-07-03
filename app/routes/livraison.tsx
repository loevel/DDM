import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Livraison & Retours - DDM Wigs & More" },
  { name: "description", content: "Livraison gratuite partout au Canada. Découvrez notre politique de retour. Service discret, rapide et sécurisé reflétant l'excellence de notre maison." },
];

export async function loader({ context }: LoaderFunctionArgs) {
  let deliveryDelay = "3 à 7 jours ouvrables";
  try {
    const row = await context.cloudflare.env.DB
      .prepare("SELECT value FROM site_settings WHERE key = 'delivery_delay'")
      .first<{ value: string }>();
    if (row?.value) deliveryDelay = row.value;
  } catch { /* valeur par défaut */ }
  return json({ deliveryDelay });
}

export default function Livraison() {
  const { deliveryDelay } = useLoaderData<typeof loader>();

  return (
    <main className="pt-32 pb-section-gap-mobile md:pb-section-gap-desktop w-full max-w-container-max-width mx-auto px-4 md:px-grid-margin-desktop">
      {/* Hero Section */}
      <section className="mb-24 md:mb-32 text-center max-w-3xl mx-auto">
        <h1 className="font-headline-xl text-headline-xl text-primary mb-6">Expédition & Sérénité</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          Votre tranquillité d'esprit est notre priorité. Chaque commande est expédiée avec soin,
          discrétion et un suivi complet — sans frais supplémentaires.
        </p>
      </section>

      {/* Shipping Section */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-grid-gutter mb-section-gap-mobile md:mb-section-gap-desktop">
        <div className="md:col-span-5 flex flex-col justify-center">
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-6">Livraison au Canada</h2>
          <p className="text-on-surface-variant mb-8">
            Nous avons sélectionné les meilleurs partenaires logistiques pour garantir que votre
            commande arrive en parfait état. Chaque expédition est assurée et bénéficie d'un suivi
            en temps réel.
          </p>
        </div>
        <div className="md:col-span-7">
          <div className="bg-surface-container-low rounded-xl p-8 border border-outline-variant">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-6 border-b border-outline-variant">
              <div>
                <h3 className="font-headline-md text-headline-md text-primary mb-1">Livraison standard</h3>
                <p className="font-label-md text-label-md text-on-surface-variant uppercase tracking-widest">{deliveryDelay}</p>
              </div>
              <div className="text-left sm:text-right">
                <span className="font-headline-md text-headline-md text-secondary font-bold">Gratuite</span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Sur toutes les commandes</p>
              </div>
            </div>
            <ul className="pt-6 space-y-3">
              {[
                ["package_2", "Colis discret et anonyme — rien n'indique le contenu"],
                ["pin_drop", "Numéro de suivi envoyé par courriel dès l'expédition"],
                ["verified_user", "Expédition assurée jusqu'à la livraison"],
              ].map(([icon, text]) => (
                <li key={icon} className="flex items-center gap-3 text-on-surface-variant font-body-md text-body-md">
                  <span className="material-symbols-outlined text-primary text-xl">{icon}</span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Return Policy Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-grid-gutter mb-section-gap-mobile md:mb-section-gap-desktop items-center">
        <div className="order-2 md:order-1 h-[500px] w-full rounded-xl overflow-hidden bg-surface-container-low">
          <img
            className="w-full h-full object-cover"
            alt="Emballage luxueux de retour"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAIpLaTR38BRGS3HtcwK10cVsEGmRq211KffpkcZj_sgsENJLZVfVbCvEcj22n-dbqWRbEe64Yh-h8KgavOquQLZxEOYUEJKGDO5tZJelkMaIJKWetJbJ-1O-ujFeNlzftKyorrhaCDsigDBGrVjfvanO9DhMXM_7MRXzGeWXqVXgnYQ-ZaUTiVCGra9Cn2uT4p8FUBjmUcYezv3u4s-hj74uUQIjit-Bowznep5M3b0MrjAAUBX7lVsuAh4EYFmqjpTPaDfbJK4m8"
          />
        </div>
        <div className="order-1 md:order-2 md:pl-12">
          <span className="font-label-md text-label-md text-primary uppercase tracking-widest mb-4 block">Garantie Qualité</span>
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-6">Politique de Retour</h2>
          <div className="bg-surface-bright border-l-2 border-primary-container p-6 mb-8">
            <p className="font-body-lg text-body-lg text-on-surface italic">
              "Vous disposez de 14 jours pour nous retourner les articles non portés, dans leur état et emballage d'origine."
            </p>
          </div>
          <p className="text-on-surface-variant mb-6">
            L'hygiène et la qualité étant primordiales dans notre domaine, nous appliquons une politique stricte mais équitable. Pour être éligible à un remboursement complet, la dentelle (lace) ne doit pas avoir été coupée, et l'article ne doit présenter aucun signe d'usure ou d'altération.
          </p>
          <Link
            to="/contact"
            className="inline-block border border-outline text-on-surface px-8 py-3 rounded-DEFAULT font-label-md text-label-md uppercase tracking-widest hover:bg-surface-container transition-colors duration-200"
          >
            Initier un retour
          </Link>
        </div>
      </section>

      {/* The Art of Packaging Feature Section */}
      <section className="relative py-24 bg-surface-container-low rounded-2xl overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center w-full h-full opacity-20"
          style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuA6XFsSw5cxzeVc0AMwk-0wekdOqg5IDBX_1rPS36nMDeClOy7blyCh8sHb_59b2oqW_5MOxoe3-1RGNc9ZRz6WeHP30Hnd5-ru0TWYoacAnS4XxT7iP7qfY_Gyh_WjXBJ-zNWuhyZuAAbPjAqcbEl-7Phn_qiie1IhiP4Eb-zmsvFmTJkbzSS9KS1LKISA0VU0Ig_IPpGe8PZX99MnlKy9Uah4YT9GGbQQPQZBg5887u4GvYAbkE3VqEQ7w3AfkKS7pRyFFK6P_f8')" }}
        ></div>
        <div className="relative z-10 max-w-4xl mx-auto text-center px-4">
          <h2 className="font-headline-xl text-headline-xl text-primary mb-6">L'Art de l'Emballage</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto mb-10">
            Parce que le luxe réside dans les détails et la discrétion. Chaque commande est préparée avec le plus grand soin, enveloppée dans des matériaux nobles et expédiée dans une boîte anonyme pour protéger votre intimité jusqu'au moment de l'ouverture.
          </p>
          <div className="flex justify-center gap-12 text-primary">
            <div className="flex flex-col items-center">
              <span className="material-symbols-outlined text-[40px] mb-4" style={{ fontVariationSettings: "'wght' 200" }}>package_2</span>
              <span className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">Boîte Neutre</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="material-symbols-outlined text-[40px] mb-4" style={{ fontVariationSettings: "'wght' 200" }}>local_shipping</span>
              <span className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">Suivi Sécurisé</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="material-symbols-outlined text-[40px] mb-4" style={{ fontVariationSettings: "'wght' 200" }}>grid_on</span>
              <span className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">Finition Luxe</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
