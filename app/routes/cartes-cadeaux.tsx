import type { MetaFunction } from "@remix-run/react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Cartes Cadeaux - DDM Wigs & More" },
  { name: "description", content: "Offrez le cadeau de la beauté avec les cartes cadeaux DDM Wigs & More. Valables sur toutes nos perruques, extensions et accessoires haut de gamme." },
];

const GIFT_CARDS = [
  {
    amount: "50",
    label: "Découverte",
    description: "L'entrée parfaite dans l'univers DDM. Idéale pour les accessoires et produits d'entretien.",
  },
  {
    amount: "150",
    label: "Essentielle",
    description: "Le choix populaire pour découvrir notre collection d'extensions et de perruques synthétiques.",
  },
  {
    amount: "300",
    label: "Premium",
    description: "Accès à notre gamme complète de perruques naturelles et pièces de collection.",
  },
  {
    amount: "500",
    label: "Luxe",
    description: "Pour une expérience complète : perruques haut de gamme, location et service personnalisé.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Choisissez un montant",
    text: "Sélectionnez la valeur de la carte cadeau qui correspond à votre budget et à l'occasion.",
  },
  {
    step: "02",
    title: "Personnalisez votre message",
    text: "Ajoutez un mot personnel pour rendre votre cadeau encore plus mémorable.",
  },
  {
    step: "03",
    title: "Envoi par courriel",
    text: "La carte cadeau est transmise instantanément par courriel au destinataire avec un code unique.",
  },
  {
    step: "04",
    title: "Utilisation flexible",
    text: "Le bénéficiaire l'utilise sur notre boutique en ligne ou lors d'une visite en personne. Valable 1 an.",
  },
];

export default function CartesDeaux() {
  return (
    <main className="flex-grow flex flex-col items-center w-full max-w-container-max-width mx-auto px-4 md:px-grid-margin-desktop py-section-gap-mobile md:py-section-gap-desktop">
      {/* Header */}
      <header className="text-center max-w-3xl mb-16 md:mb-24">
        <p className="font-body-md text-body-md text-primary uppercase tracking-widest mb-3">Offrez la beauté</p>
        <h1 className="font-headline-xl text-headline-lg-mobile md:text-headline-xl text-primary mb-6">Cartes Cadeaux</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
          Un cadeau qui ne se trompe jamais. Nos cartes cadeaux DDM Wigs & More permettent à vos proches de choisir eux-mêmes la pièce qui les fera rayonner — perruques, extensions, accessoires ou service de location.
        </p>
      </header>

      {/* Gift Card Options */}
      <section className="w-full mb-20 md:mb-28">
        <h2 className="font-headline-md text-headline-md text-on-surface text-center mb-12">Choisissez un montant</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {GIFT_CARDS.map((card) => (
            <div
              key={card.amount}
              className="flex flex-col items-center text-center bg-surface-container-lowest border border-outline-variant/30 rounded-DEFAULT p-8 hover:shadow-[0_20px_40px_-15px_rgba(44,22,0,0.08)] hover:border-primary/40 transition-all duration-300 cursor-pointer group"
            >
              <span className="font-headline-xl text-4xl text-primary mb-1">{card.amount} $</span>
              <span className="font-label-md text-label-md text-primary uppercase tracking-widest mb-4">{card.label}</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{card.description}</p>
            </div>
          ))}
        </div>
        <p className="text-center font-body-sm text-body-sm text-on-surface-variant mt-6">
          Montant personnalisé disponible — contactez-nous pour toute commande spéciale.
        </p>
      </section>

      {/* How It Works */}
      <section className="w-full mb-20 md:mb-28 bg-surface-container-lowest rounded-DEFAULT border border-outline-variant/20 p-10 md:p-16">
        <h2 className="font-headline-md text-headline-md text-on-surface text-center mb-12">Comment ça fonctionne</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {HOW_IT_WORKS.map((item) => (
            <div key={item.step} className="flex gap-6">
              <span className="font-headline-xl text-3xl text-primary/20 leading-none flex-shrink-0 select-none">{item.step}</span>
              <div>
                <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">{item.title}</h3>
                <p className="font-body-md text-body-md text-on-surface-variant">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="text-center">
        <p className="font-body-lg text-body-lg text-on-surface-variant mb-8 max-w-lg mx-auto">
          Prête à offrir un cadeau inoubliable ? Contactez-nous pour commander votre carte cadeau dès aujourd'hui.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/contact"
            className="inline-flex items-center justify-center bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider px-8 py-4 rounded-DEFAULT hover:bg-surface-tint transition-colors duration-200"
          >
            Commander une carte cadeau
          </Link>
          <Link
            to="/boutique"
            className="inline-flex items-center justify-center border border-primary text-primary font-label-md text-label-md uppercase tracking-wider px-8 py-4 rounded-DEFAULT hover:bg-primary-container/20 transition-colors duration-200"
          >
            Voir notre boutique
          </Link>
        </div>
      </div>
    </main>
  );
}
