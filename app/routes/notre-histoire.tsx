import type { MetaFunction } from "@remix-run/react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Notre Histoire - DDM Wigs & More" },
  { name: "description", content: "Redéfinir l'élégance à travers une approche artisanale. Découvrez l'histoire de DDM Wigs & More." },
];

export default function NotreHistoire() {
  return (
    <main>
      {/* Hero Section */}
      <section className="relative w-full h-[870px] overflow-hidden">
        <img
          alt="The Art of Confidence"
          className="w-full h-full object-cover"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuD_hcUtSYn3ncRa7_DCqlfZGBBat_m3Pywe2ehB1M2MSO1hjyBcfKkdL4ZR1pUXYqSKiVdwwWPNfso0yWEHbs-AkKN182fW99oWzd9L4u1vL1-MhvyamVC7MIe_a-Dqr6PLN7aV4mMj6_hn4KUUn9aEzGwc-CpBQ7-hDYpA3eFv7TqXt0bxh9mYRm4gKJz0Jy8_3x4OgkGeu3wEgx38QaPe8O--iWzxwLgh0AM3QIIPG_36uj_35CNLnZM-ywL5RljE0bcalrE6nco"
        />
        <div className="absolute inset-0 flex flex-col justify-end pb-section-gap-desktop px-grid-margin-desktop" style={{ background: "linear-gradient(to bottom, rgba(252, 249, 248, 0) 0%, rgba(252, 249, 248, 0.8) 100%)" }}>
          <div className="max-w-container-max-width mx-auto w-full">
            <h1 className="font-headline-xl text-headline-xl text-on-surface mb-6 max-w-2xl">
              The Art of Confidence
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl leading-relaxed">
              Redéfinir l'élégance à travers une approche artisanale. Chez DDM Wigs & More, nous croyons que chaque chevelure raconte une histoire de force et de grâce.
            </p>
          </div>
        </div>
      </section>

      {/* Our Mission Section */}
      <section className="py-section-gap-desktop px-grid-margin-desktop bg-surface">
        <div className="max-w-container-max-width mx-auto grid grid-cols-1 md:grid-cols-2 gap-grid-gutter items-center">
          <div className="space-y-8">
            <span className="font-label-md text-label-md text-primary tracking-widest uppercase">Notre Mission</span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">Un engagement envers l'excellence et l'authenticité.</h2>
            <div className="space-y-6 font-body-md text-body-md text-on-surface-variant leading-relaxed">
              <p>
                Le parcours de notre fondatrice a commencé par une quête personnelle : trouver une solution capillaire qui ne soit pas seulement naturelle, mais qui redonne aussi le sentiment de soi. Cette recherche de perfection est devenue le fondement de DDM Wigs & More.
              </p>
              <p>
                Aujourd'hui, nous nous engageons à n'utiliser que des sources éthiques et les matériaux les plus fins. Chaque pièce est sélectionnée pour sa durabilité, sa brillance naturelle et son confort absolu, garantissant une expérience de luxe sans compromis.
              </p>
            </div>
          </div>
          <div className="relative pl-0 md:pl-24">
            <div className="aspect-[3/4] overflow-hidden bg-surface-container-low">
              <img
                alt="Mission de Qualité"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBOVz3qDTZQ4BbIQmSayKz51w4NIg_U4nx5dNzg1J1V3DMKR8Lem6Uj6ALP8Qvk4n1nCkL4PAZ5MNRwgV7_-FTstmeWWYYy7e2P0X3aoyILag27tC7BddzG9tqQCcIUv0MuitBPi7bfZG8CUrpytCco5ao7Cylzb3G7nWPKsQGamqrsMUm8ni1FdBHMdsrsLgQhTSxCTycmKJ3GHVaawZk7XlRJzrGLlM_22xrbaqJTVlCdCxfbtVvXV_f-ejUlSPFVyP28Qf6lZVY"
              />
            </div>
          </div>
        </div>
      </section>

      {/* The DDM Difference */}
      <section className="py-section-gap-desktop px-grid-margin-desktop bg-surface-container-low">
        <div className="max-w-container-max-width mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-4">La Différence DDM</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">Pourquoi nous choisissons l'exceptionnel chaque jour.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-10 bg-surface border border-outline-variant/20 flex flex-col items-start gap-6 hover:border-primary transition-colors duration-300">
              <span className="material-symbols-outlined text-primary text-4xl">diamond</span>
              <h3 className="font-headline-md text-headline-md">Qualité de Luxe</h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Nous ne sélectionnons que les cheveux de la plus haute qualité, conservant la cuticule intacte pour une brillance et une longévité inégalées.
              </p>
            </div>
            <div className="p-10 bg-surface border border-outline-variant/20 flex flex-col items-start gap-6 hover:border-primary transition-colors duration-300">
              <span className="material-symbols-outlined text-primary text-4xl">content_cut</span>
              <h3 className="font-headline-md text-headline-md">Service Personnalisé</h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Chaque cliente est unique. Nous offrons des consultations privées pour adapter chaque pièce à votre style et à vos besoins spécifiques.
              </p>
            </div>
            <div className="p-10 bg-surface border border-outline-variant/20 flex flex-col items-start gap-6 hover:border-primary transition-colors duration-300">
              <span className="material-symbols-outlined text-primary text-4xl">eco</span>
              <h3 className="font-headline-md text-headline-md">Sourcing Éthique</h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                La transparence est au cœur de notre métier. Nous garantissons que chaque mèche provient de sources responsables et équitables.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Craftsmanship Section */}
      <section className="py-section-gap-desktop px-grid-margin-desktop bg-surface">
        <div className="max-w-container-max-width mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="order-2 md:order-1 grid grid-cols-2 gap-4">
              <img
                alt="Détail noué à la main"
                className="w-full aspect-square object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCevynVFt1W2H7lj6qVNLogRxKAhIC2wPdqEmz4aSOEOIJcm537X14Blr-8W-Uhg4NkE_kTPDKOZrzptXo3TSYKwHpxJCLAfPOs5uNXhKg-Xl0Q7dXPtI8Kxk3AMt9tVbnNkEGTk5pi_bRS6DO7OSsVplY7VlKtdqUTgdzhXFzAEMQnlphUqg1lYDSB_TkD7Q10kLeH92F-NlD3YEly_UAQV3uWYdIXMimGg5vv7Xuz_F6KVLJ4Zd6Z3n3PWr_f8TECf0Bz2M2jF8Q"
              />
              <img
                alt="Texture base en soie"
                className="w-full aspect-square object-cover mt-12"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC-8KgV_W8uMA9QcXIaa8gA7f1KOrxu95NoZX-Ifs6y2HCzuBEOssSARGDVXuYHMaDVhI5CoEwmrIhbqn5aCb3zjNAAQnJHXkh_F6_ZBLpNswLm0Pq-MCsFO2wgOSSbmDk4gYxvFcoDGlRhB7tsZ8yjKjcHDSo-j4hLeJnZysJ1d7STO12EJd1l0KFJ4uM_T-GgLIOPcmStjDOGDNQlOIap1Wza8XzDvlfLCdfHZmWcXTKmwZaJsgJzX_md56srPCf9q4dbVPnIs_o"
              />
            </div>
            <div className="order-1 md:order-2 space-y-8">
              <span className="font-label-md text-label-md text-primary tracking-widest uppercase">L'Artisanat</span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface">Le détail qui change tout.</h2>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Nos perruques nouées à la main et nos bases en soie sont conçues pour imiter parfaitement la croissance naturelle des cheveux. Chaque nœud est placé avec précision pour offrir une polyvalence de coiffage totale et un confort qui dure toute la journée.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">check_circle</span>
                  <span className="font-body-md text-on-surface">Bases en soie ultra-réalistes</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">check_circle</span>
                  <span className="font-body-md text-on-surface">Ventilation naturelle des cheveux</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">check_circle</span>
                  <span className="font-body-md text-on-surface">Ajustement sur mesure pour un confort optimal</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-section-gap-desktop px-grid-margin-desktop bg-primary-container/10">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <h2 className="font-headline-lg text-headline-lg text-on-surface">Prête à découvrir votre nouvelle allure ?</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Parcourez notre collection exclusive et trouvez la pièce qui vous correspond.</p>
          <div className="flex justify-center gap-4 pt-4">
            <Link
              to="/boutique"
              className="px-12 py-4 bg-primary text-white font-label-md text-label-md hover:bg-on-primary-container transition-all duration-300"
            >
              VOIR LA BOUTIQUE
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
