import type { MetaFunction } from "@remix-run/react";
import { useState, useRef } from "react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "FAQ - DDM Wigs & More" },
  { name: "description", content: "Trouvez toutes les réponses à vos questions concernant nos produits, commandes et livraisons." },
];

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  id: string;
  label: string;
  items: FaqItem[];
}

const FAQ_DATA: FaqCategory[] = [
  {
    id: "produits",
    label: "Produits",
    items: [
      {
        question: "Comment entretenir ma perruque ?",
        answer: "L'entretien dépend du type de cheveu. Pour les cheveux humains, nous recommandons un lavage doux avec nos shampoings sans sulfate tous les 10 à 15 ports. Pour les synthétiques, utilisez exclusivement des produits adaptés et lavez à l'eau froide. Consultez notre 'Care Guide' complet pour des instructions détaillées par modèle.",
      },
      {
        question: "Comment choisir la bonne taille de bonnet (Cap Size) ?",
        answer: "Prenez un mètre ruban souple et mesurez la circonférence de votre tête en passant par la racine de vos cheveux, derrière vos oreilles et la nuque. La majorité de nos bonnets sont de taille standard (Medium : 21.5\" - 22.5\") et sont ajustables grâce à des sangles intérieures.",
      },
      {
        question: "Quelle est la différence entre cheveux synthétiques et humains ?",
        answer: "Les cheveux humains offrent une polyvalence maximale (coloration, coiffage à chaud) et une longévité supérieure (1-2 ans avec soin). Les fibres synthétiques de haute qualité sont \"prêtes à porter\", gardent leur style même après lavage, mais ne peuvent généralement pas être chauffées et ont une durée de vie plus courte (4-6 mois).",
      },
    ],
  },
  {
    id: "commandes",
    label: "Commandes",
    items: [
      {
        question: "Quels sont les modes de paiement acceptés ?",
        answer: "Nous acceptons les principales cartes de crédit (Visa, Mastercard, American Express), ainsi que PayPal, Apple Pay et Google Pay. Tous les prix sont indiqués et facturés en dollars canadiens (CAD). Les transactions sont entièrement sécurisées.",
      },
      {
        question: "Puis-je modifier ou annuler ma commande ?",
        answer: "Les commandes sont traitées rapidement. Vous disposez d'un délai de 2 heures après confirmation pour nous contacter afin de modifier ou annuler votre commande. Passé ce délai, la commande est en cours de préparation et ne peut être modifiée.",
      },
    ],
  },
  {
    id: "livraison",
    label: "Livraison",
    items: [
      {
        question: "Quels sont les délais de livraison ?",
        answer: "Nous expédions sous 72 heures ouvrables. La livraison standard prend 5-7 jours ouvrables, l'expédition accélérée 2-3 jours, et l'express 1-2 jours. Toutes les commandes sont assurées et disposent d'un suivi en temps réel.",
      },
      {
        question: "Livrez-vous à l'international ?",
        answer: "Actuellement, nous livrons principalement au Canada et aux États-Unis. Pour les commandes internationales, veuillez nous contacter directement afin que nous puissions vous fournir une estimation de frais et délais personnalisée.",
      },
    ],
  },
  {
    id: "location",
    label: "Retours",
    items: [
      {
        question: "Quelles sont les conditions de retour pour un achat ?",
        answer: "Vous disposez de 14 jours pour nous retourner les articles non portés, dans leur état et emballage d'origine. La dentelle (lace) ne doit pas avoir été coupée et l'article ne doit présenter aucun signe d'usure ou d'altération. Les frais de retour sont à votre charge.",
      },
    ],
  },
];

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div key={index} className="border-b border-surface-variant">
            <button
              className="w-full py-6 flex justify-between items-center text-left hover:text-primary transition-colors duration-200 focus:outline-none"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              aria-expanded={isOpen}
            >
              <span className="font-headline-md text-headline-md text-on-surface">{item.question}</span>
              <span
                className="material-symbols-outlined text-outline transition-transform duration-300"
                style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                expand_more
              </span>
            </button>
            <div
              className="overflow-hidden transition-all duration-300"
              style={{ maxHeight: isOpen ? "500px" : "0", opacity: isOpen ? 1 : 0, paddingBottom: isOpen ? "24px" : "0" }}
            >
              <p className="text-on-surface-variant pr-12">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Faq() {
  const [activeSection, setActiveSection] = useState("produits");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function scrollToSection(id: string) {
    setActiveSection(id);
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <>
      {/* Hero Section */}
      <section className="py-section-gap-mobile md:py-section-gap-desktop px-4 md:px-grid-margin-desktop max-w-container-max-width mx-auto text-center">
        <h1 className="font-headline-xl text-headline-xl text-on-surface mb-6">Questions Fréquentes</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
          Votre tranquillité d'esprit est notre priorité. Trouvez ici toutes les réponses à vos questions concernant nos produits, vos commandes et nos livraisons pour une expérience fluide et raffinée.
        </p>
      </section>

      {/* Layout: Sidebar + Content */}
      <section className="px-4 md:px-grid-margin-desktop max-w-container-max-width mx-auto pb-section-gap-desktop grid grid-cols-1 md:grid-cols-12 gap-grid-gutter">
        {/* Sticky Sidebar */}
        <aside className="md:col-span-3">
          <div className="sticky top-32">
            <nav aria-label="FAQ Categories" className="flex overflow-x-auto md:flex-col gap-4 md:gap-2 pb-4 md:pb-0">
              {FAQ_DATA.map((cat) => (
                <button
                  key={cat.id}
                  className={`text-left whitespace-nowrap md:whitespace-normal py-3 px-4 font-label-md text-label-md border-l-2 transition-colors duration-200 ${
                    activeSection === cat.id
                      ? "text-primary bg-surface-container border-primary"
                      : "text-on-surface-variant hover:text-primary border-transparent hover:bg-surface-container-low"
                  }`}
                  onClick={() => scrollToSection(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* FAQ Content Area */}
        <div className="md:col-span-8 md:col-start-5 space-y-16">
          {FAQ_DATA.map((cat) => (
            <div
              key={cat.id}
              id={cat.id}
              className="faq-category scroll-mt-32"
              ref={(el) => { sectionRefs.current[cat.id] = el; }}
            >
              <h2 className="font-headline-lg text-headline-lg text-on-surface mb-8 border-b border-surface-variant pb-4">{cat.label}</h2>
              <FaqAccordion items={cat.items} />
            </div>
          ))}
        </div>
      </section>

      {/* Call to Action */}
      <section className="bg-surface-container-low py-16 px-4 md:px-grid-margin-desktop mt-12 border-t border-surface-variant">
        <div className="max-w-2xl mx-auto text-center">
          <h3 className="font-headline-lg text-headline-lg text-on-surface mb-4">Besoin d'aide supplémentaire ?</h3>
          <p className="font-body-md text-body-md text-on-surface-variant mb-8">
            Notre équipe d'experts est à votre disposition pour vous conseiller personnellement dans votre choix.
          </p>
          <Link
            className="inline-flex items-center justify-center px-8 py-4 bg-primary text-on-primary hover:bg-surface-tint font-label-md text-label-md rounded transition-colors duration-200"
            to="/contact"
          >
            Contacter notre équipe
          </Link>
        </div>
      </section>
    </>
  );
}
