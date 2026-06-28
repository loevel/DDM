import type { MetaFunction } from "@remix-run/react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Guide d'Entretien - DDM Wigs & More" },
  { name: "description", content: "Préservez l'éclat de votre investissement capillaire avec nos rituels d'entretien professionnels." },
];

export default function GuideEntretien() {
  return (
    <main>
      {/* Hero Section */}
      <section className="relative w-full h-[716px] flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            className="w-full h-full object-cover brightness-90"
            alt="Perruque premium sur support en bois dans une boutique lumineuse"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBZ_jijov05x1_pW_S3b9Bpd6kjsqJHPm6-GJgA_DIKUly_rfX2UfzcJNGIirKXAilKhLgSuG0DN5HczAFsFPRXPiRNdrQwlLS7aw3bmiUUjykBj0cTTH5CWF87u_rGSxIo30qxFlyhFoP_m-Dz_o5ny66FJ05pbS0dCjTya5gSo_u5ofgy2V31ArF47bcggFPuJkevSpwxemoOuVvhGCEB_6Dmx46x-3qjqUGAbOFqz82n6cUdy30xodUiLvVmgb8DoqwbEYasT0A"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-surface/40 to-transparent"></div>
        </div>
        <div className="relative z-10 max-w-container-max-width mx-auto px-grid-margin-desktop w-full">
          <div className="max-w-2xl">
            <span className="font-label-md text-label-md uppercase tracking-[0.2em] text-primary mb-4 block">L'Art de l'Entretien</span>
            <h1 className="font-headline-xl text-headline-xl text-on-surface mb-8">Préserver l'Éclat de votre Investissement</h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-lg mb-10">
              Chaque pièce DDM est une œuvre d'art. En suivant nos rituels de soin, vous prolongez la vie et la brillance de votre chevelure pour les années à venir.
            </p>
            <a
              className="inline-flex items-center px-8 py-4 bg-primary text-on-primary font-label-md text-label-md transition-all hover:bg-on-primary-container active:scale-95"
              href="#rituals"
            >
              DÉCOUVRIR LES RITUELS
            </a>
          </div>
        </div>
      </section>

      {/* Daily Rituals */}
      <section className="py-section-gap-desktop max-w-container-max-width mx-auto px-grid-margin-desktop" id="rituals">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-grid-gutter items-start">
          <div className="lg:col-span-4">
            <h2 className="font-headline-lg text-headline-lg text-primary mb-6">Rituels Quotidiens</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">La constance est la clé de la longévité. Intégrez ces gestes simples à votre routine matinale et nocturne.</p>
          </div>
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-4">
              <span className="font-headline-md text-headline-md text-outline-variant">01</span>
              <h3 className="font-label-md text-label-md uppercase tracking-wider">Le Brossage Délicat</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Commencez toujours par les pointes et remontez vers la racine pour éviter les tensions excessives sur les nœuds de la base.</p>
            </div>
            <div className="space-y-4">
              <span className="font-headline-md text-headline-md text-outline-variant">02</span>
              <h3 className="font-label-md text-label-md uppercase tracking-wider">Le Repos Nocturne</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Ne dormez jamais avec votre perruque. Placez-la sur un support adapté pour maintenir sa forme et permettre à la base de respirer.</p>
            </div>
            <div className="space-y-4">
              <span className="font-headline-md text-headline-md text-outline-variant">03</span>
              <h3 className="font-label-md text-label-md uppercase tracking-wider">L'Hydratation</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Un léger voile de spray revitalisant sans rinçage aide à prévenir les frisottis dus aux frottements sur les vêtements.</p>
            </div>
            <div className="space-y-4">
              <span className="font-headline-md text-headline-md text-outline-variant">04</span>
              <h3 className="font-label-md text-label-md uppercase tracking-wider">L'Aération</h3>
              <p className="font-body-md text-body-md text-on-surface-variant">Après une longue journée, retournez délicatement la base pour laisser l'humidité s'évaporer avant de la ranger.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The Wash Routine */}
      <section className="bg-surface-container-low py-section-gap-desktop">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop">
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-headline-lg text-primary mb-4">Le Rituel du Lavage</h2>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mx-auto">Une étape cruciale qui demande patience et douceur. Choisissez la méthode adaptée à votre fibre.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
            {/* Human Hair */}
            <div className="bg-surface p-12 border border-outline-variant/20">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-8 border-b border-outline-variant/30 pb-4">Cheveux Naturels</h3>
              <ul className="space-y-6">
                <li className="flex gap-4">
                  <span className="font-label-md text-label-md text-primary mt-1">STEP 1</span>
                  <p className="font-body-md text-body-md">Démêlage complet à sec avant l'immersion.</p>
                </li>
                <li className="flex gap-4">
                  <span className="font-label-md text-label-md text-primary mt-1">STEP 2</span>
                  <p className="font-body-md text-body-md">Eau tiède et shampooing sans sulfate. Ne jamais frotter, presser délicatement la fibre.</p>
                </li>
                <li className="flex gap-4">
                  <span className="font-label-md text-label-md text-primary mt-1">STEP 3</span>
                  <p className="font-body-md text-body-md">Application d'un masque hydratant sur les longueurs uniquement (éviter la racine).</p>
                </li>
                <li className="flex gap-4">
                  <span className="font-label-md text-label-md text-primary mt-1">STEP 4</span>
                  <p className="font-body-md text-body-md">Séchage à l'air libre à 80%, puis finition au séchoir pour sceller les cuticules.</p>
                </li>
              </ul>
            </div>
            {/* Synthetic */}
            <div className="bg-surface p-12 border border-outline-variant/20">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-8 border-b border-outline-variant/30 pb-4">Fibres Synthétiques</h3>
              <ul className="space-y-6">
                <li className="flex gap-4">
                  <span className="font-label-md text-label-md text-primary mt-1">STEP 1</span>
                  <p className="font-body-md text-body-md">Utilisation exclusive d'eau froide pour préserver la structure de la fibre.</p>
                </li>
                <li className="flex gap-4">
                  <span className="font-label-md text-label-md text-primary mt-1">STEP 2</span>
                  <p className="font-body-md text-body-md">Faire tremper 5 minutes dans une solution de shampooing spécial fibres.</p>
                </li>
                <li className="flex gap-4">
                  <span className="font-label-md text-label-md text-primary mt-1">STEP 3</span>
                  <p className="font-body-md text-body-md">Rincer abondamment et appliquer un revitalisant synthétique par vaporisation.</p>
                </li>
                <li className="flex gap-4">
                  <span className="font-label-md text-label-md text-primary mt-1">STEP 4</span>
                  <p className="font-body-md text-body-md">Séchage à l'air libre uniquement sur un support ajouré. Ne jamais brosser mouillé.</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Expert Tips */}
      <section className="py-section-gap-desktop max-w-container-max-width mx-auto px-grid-margin-desktop">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1">
            <img
              className="w-full aspect-[4/5] object-cover grayscale-[20%]"
              alt="Poste de coiffage professionnel"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBfxlxIxum7IB9LcVghC8rN_G3un24X-gbdBRHk3BQDFeoC9qDvi4LtVH_NRJl39wxf_BalCy8thKtXlgnmdOMOG9qmnJjmwnsGJhh1jwLzt0rHqec-dcddNyaLrd-kUNl5R1xoxinuyAMaTWoF7MUqzBGg1W8pgvBQ-2yHScnm9x7N6HrciHiRh6zdZ3bFruWIV_nRntXMtJHH30g2lK8QNsFevrTtxtxRUe5qLXEdqAVpposbQTHUOE287b56uLoNFn_uSzw0MTM"
            />
          </div>
          <div className="order-1 lg:order-2 space-y-12">
            <div>
              <h2 className="font-headline-lg text-headline-lg text-primary mb-6">Conseils d'Experts</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Maîtrisez les nuances du coiffage pour préserver l'intégrité de votre pièce.</p>
            </div>
            <div className="space-y-8">
              <div className="flex gap-6">
                <span className="material-symbols-outlined text-secondary shrink-0">check_circle</span>
                <div>
                  <h4 className="font-label-md text-label-md mb-2">À FAIRE (DOS)</h4>
                  <ul className="text-body-md text-on-surface-variant space-y-2 list-disc list-inside">
                    <li>Utilisez toujours un protecteur thermique</li>
                    <li>Lavez votre perruque toutes les 10-15 utilisations</li>
                    <li>Rangez-la à l'abri de la lumière directe du soleil</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-6">
                <span className="material-symbols-outlined text-error shrink-0">cancel</span>
                <div>
                  <h4 className="font-label-md text-label-md mb-2">À ÉVITER (DON'TS)</h4>
                  <ul className="text-body-md text-on-surface-variant space-y-2 list-disc list-inside">
                    <li>Ne jamais brosser une fibre synthétique encore chaude</li>
                    <li>Évitez l'exposition directe aux vapeurs de cuisine</li>
                    <li>Ne saturez pas les nœuds du "Lace" avec des huiles</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Shop Care Essentials */}
      <section className="py-section-gap-desktop bg-surface-container">
        <div className="max-w-container-max-width mx-auto px-grid-margin-desktop">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="font-headline-lg text-headline-lg text-on-surface">Essentiels d'Entretien</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Les bons outils font toute la différence.</p>
            </div>
            <Link className="font-label-md text-label-md text-primary border-b border-primary hover:opacity-70 transition-opacity" to="/accessoires">
              VOIR TOUT
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-grid-gutter">
            <div className="group cursor-pointer">
              <div className="aspect-[4/5] overflow-hidden mb-4 bg-surface-variant">
                <img
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt="Duo Shampoing & Soin"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuD_ohOIzzR2yvDFxIJPRveVs81SAtx8KInUJZi9prwY9juyXgNCxYpxxAmXozjAgmPwOeC3ciKddflZ5k1Q9EP3mdBfEZCzMvVHbgIcFy7I6_h6DpaCtU--M9qi-X-2K_XUj2oNh1J9NnuGrAEzevBp42FWDsbacS_bNoAkSJV3aR-Rr-ZAnZDwQTX4gsXedeja-tAROJ_zIN0yJcFwdWCQk9Q-TMrdNUmFlOIdsQme5_nJWsimxNSA-oUfjCGmxiCR_S_Zy9y6rDM"
                />
              </div>
              <h3 className="font-headline-md text-headline-md mb-1">Duo Shampoing & Soin</h3>
              <p className="font-body-md text-body-md text-on-surface-variant mb-2">Spécial Cheveux Naturels</p>
              <p className="font-body-md text-body-md font-bold">$65.00 CAD</p>
            </div>
            <div className="group cursor-pointer">
              <div className="aspect-[4/5] overflow-hidden mb-4 bg-surface-variant">
                <img
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt="Peigne Signature"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCPfIiYC0VLcxz1UeUz-CNhMSIWO3osAC7XR-JFUqRgkoRCH5GdQc-jdpWlxjO2sSpWpkY1fmwPc7NKlj7eE0DxPGd8_50gEuTxBu6eBYQk_2tAEw2ltAfjDPnoPpwaJWT9w0_yu3negVhfTJSKkdjKtsyIwghL6K2prfoMkpXDUvP3_jR2E26WHNjOUJkZDD_zEB1MY13-r7e9aEPpJDZwyPzj8-fUxGtKeTP5EeFwlPZ33mw3hqBCe9EiiLWOqZLdbm1_cSpcBeQ"
                />
              </div>
              <h3 className="font-headline-md text-headline-md mb-1">Peigne Signature</h3>
              <p className="font-body-md text-body-md text-on-surface-variant mb-2">Dents larges anti-statiques</p>
              <p className="font-body-md text-body-md font-bold">$24.00 CAD</p>
            </div>
            <div className="group cursor-pointer">
              <div className="aspect-[4/5] overflow-hidden mb-4 bg-surface-variant">
                <img
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  alt="Support Pliable Luxury"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuA7lA6D5hPo3Db0WC9rZaCKyTZLdhspr9LQaAv-63yRgRNYcMjAUfQqMSKH-IKcQIFZj35MVKSQrQDeYO9-xDKzX6HM13rtofr5v_UIO8aAcHtYCHRGBXAytqxNyHzzHNmwghqwdUz6MD4fuzERk-ajB2zRVNh_45-dgBCyIu7TQTgEpUGQ_onubLDvO_PVtLBEvxsWwoQNUBUqkEmjSQpQvYCCoLLw5xHoovk2hWYcYjdkw1CQTkuuMrnZOE7PtNdsLrF2n38JyAM"
                />
              </div>
              <h3 className="font-headline-md text-headline-md mb-1">Support Pliable Luxury</h3>
              <p className="font-body-md text-body-md text-on-surface-variant mb-2">Optimisation de l'air</p>
              <p className="font-body-md text-body-md font-bold">$18.00 CAD</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
