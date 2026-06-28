import type { MetaFunction } from "@remix-run/react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Conditions de Location - DDM Wigs & More" },
  { name: "description", content: "Conditions de location DDM Wigs & More. Service de location haut de gamme avec des pièces de collection soigneusement entretenues." },
];

const CONDITIONS = [
  {
    icon: "lock",
    title: "Dépôt de Garantie",
    text: "Pour garantir la préservation de nos pièces de collection, un dépôt de garantie obligatoire est requis lors de la réservation. Le montant varie selon la valeur de la perruque (généralement entre 500.00 CAD et 1500.00 CAD). Cette empreinte bancaire n'est pas débitée et sera libérée sous 48h après le retour et l'inspection conforme de l'article.",
  },
  {
    icon: "calendar_today",
    title: "Durée & Retards",
    text: "Nous proposons des durées flexibles de 7, 14 ou 30 jours pour s'adapter à vos besoins. La période de location commence à la date de réception confirmée. En cas de retour tardif, des frais journaliers équivalents à 15% du tarif de location initial seront prélevés sur votre dépôt de garantie, jusqu'au retour de la pièce.",
  },
  {
    icon: "verified",
    title: "État & Qualité",
    text: "Chaque pièce est méticuleusement inspectée avant expédition pour garantir notre standard d'excellence. À réception, vous disposez de 12 heures pour signaler toute anomalie. Au retour, l'article doit être renvoyé dans son emballage d'origine de luxe, sans altérations physiques (pas de coupe de cheveux, pas de coloration, pas de colle résiduelle excessive).",
  },
  {
    icon: "sanitizer",
    title: "Hygiène & Entretien",
    text: "L'hygiène est notre priorité absolue. Nous appliquons un protocole de désinfection de niveau hospitalier entre chaque location. Ne tentez en aucun cas de laver ou de coiffer la perruque à chaud vous-même. Le service de nettoyage professionnel au retour est inclus dans votre tarif de location.",
  },
  {
    icon: "warning",
    title: "Dommages & Pertes",
    text: "Vous êtes responsable de la pièce durant toute la période de location. En cas de dommage réparable, les frais de restauration seront déduits de votre caution. En cas de perte, de vol, ou de dommages irréversibles (ex: brûlures, découpe de la dentelle), l'intégralité du dépôt de garantie sera conservée pour couvrir le remplacement de la pièce de collection.",
  },
  {
    icon: "history",
    title: "Annulation & Rétractation",
    text: "Vous pouvez annuler sans frais jusqu'à 7 jours avant le début de votre période de location. Les annulations effectuées entre 48h et 7 jours avant l'expédition entraîneront des frais d'annulation de 50.00 CAD. Une fois la pièce expédiée, la location est considérée comme définitive et non remboursable.",
  },
];

export default function Conditions() {
  return (
    <main className="flex-grow flex flex-col items-center w-full max-w-container-max-width mx-auto px-4 md:px-grid-margin-desktop py-section-gap-mobile md:py-section-gap-desktop">
      {/* Header Section */}
      <header className="text-center max-w-3xl mb-16 md:mb-24">
        <h1 className="font-headline-xl text-headline-lg-mobile md:text-headline-xl text-primary mb-6">Conditions de Location</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
          Bienvenue dans l'univers de location haut de gamme DDM Wigs & More. Notre service est conçu pour vous offrir l'élégance sans compromis, avec des pièces de collection soigneusement entretenues. Veuillez lire attentivement les conditions suivantes régissant notre service de location.
        </p>
      </header>

      {/* Terms Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-12 gap-x-16 md:gap-x-grid-gutter w-full">
        {CONDITIONS.map((cond) => (
          <div
            key={cond.title}
            className="flex flex-col items-start bg-surface-container-lowest p-8 rounded-DEFAULT border border-outline-variant/30 hover:shadow-[0_20px_40px_-15px_rgba(44,22,0,0.05)] transition-shadow duration-300"
          >
            <div className="mb-4 text-primary bg-primary-container/20 p-3 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">{cond.icon}</span>
            </div>
            <h2 className="font-headline-md text-headline-md text-on-surface mb-3">{cond.title}</h2>
            <p className="font-body-md text-body-md text-on-surface-variant">{cond.text}</p>
          </div>
        ))}
      </div>

      {/* Contact CTA */}
      <div className="mt-16 md:mt-24 text-center">
        <p className="font-body-lg text-body-lg text-on-surface-variant mb-6">Des questions supplémentaires concernant nos politiques ?</p>
        <Link
          className="inline-flex items-center justify-center bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider px-8 py-4 rounded-DEFAULT hover:bg-surface-tint transition-colors duration-200"
          to="/contact"
        >
          Contacter l'équipe
        </Link>
      </div>
    </main>
  );
}
