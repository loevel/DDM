import type { MetaFunction } from "@remix-run/react";
import { useEffect, useState } from "react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Politique de Confidentialité - DDM Wigs & More" },
  { name: "description", content: "Politique de confidentialité de DDM Wigs & More. Nous protégeons vos données personnelles conformément à la LPRPDE et à la Loi 25 du Québec." },
];

const SECTIONS = [
  { id: "intro", label: "1. Introduction" },
  { id: "collecte", label: "2. Collecte des Données" },
  { id: "utilisation", label: "3. Utilisation des Données" },
  { id: "cookies", label: "4. Cookies et Témoins" },
  { id: "droits", label: "5. Vos Droits" },
  { id: "securite", label: "6. Sécurité" },
  { id: "contact", label: "7. Contact DPO" },
];

export default function Confidentialite() {
  const [activeSection, setActiveSection] = useState("intro");

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("section[id]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { root: null, rootMargin: "0px 0px -60% 0px", threshold: 0.1 }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Minimalist header for this legal page */}
      <div className="sticky top-0 w-full bg-background z-50 border-b border-outline-variant py-6">
        <div className="flex justify-between items-center max-w-container-max-width mx-auto px-4 md:px-grid-margin-desktop">
          <Link
            aria-label="Retour à l'accueil"
            className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors duration-200"
            to="/"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="hidden md:inline font-label-md text-label-md uppercase tracking-wider">Retour</span>
          </Link>
          <div className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary text-center absolute left-1/2 -translate-x-1/2">
            DDM WIGS & MORE
          </div>
          <div className="w-8 md:w-20"></div>
        </div>
      </div>

      <main className="max-w-container-max-width mx-auto px-4 md:px-grid-margin-desktop py-16 md:py-section-gap-desktop grid grid-cols-1 md:grid-cols-12 gap-grid-gutter">
        {/* Page Title */}
        <div className="col-span-1 md:col-span-12 mb-12 md:mb-24 text-center">
          <span className="inline-block font-label-md text-label-md uppercase tracking-widest text-outline mb-4">Légal</span>
          <h1 className="font-headline-xl text-headline-lg-mobile md:text-headline-xl text-primary mb-6">Politique de Confidentialité</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">Dernière mise à jour : 12 Novembre 2024</p>
        </div>

        {/* Sidebar Navigation */}
        <aside className="col-span-1 md:col-span-3 hidden md:block relative">
          <nav className="sticky top-32 flex flex-col gap-4 border-l border-surface-variant py-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`pl-4 py-1 text-body-md text-on-surface-variant hover:text-primary transition-colors ${
                  activeSection === s.id
                    ? "font-bold text-primary border-l-2 border-primary pl-[calc(1rem-2px)]"
                    : ""
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content Area */}
        <div className="col-span-1 md:col-span-8 md:col-start-5 max-w-none text-on-surface-variant font-body-lg space-y-16">
          <section className="scroll-mt-32" id="intro">
            <h2 className="font-headline-md text-headline-md text-on-background mb-6">1. Introduction</h2>
            <p className="mb-6">Chez DDM Wigs & More, l'élégance et la confiance de nos clients sont au cœur de notre démarche. Nous comprenons que la discrétion et la sécurité de vos informations personnelles sont primordiales. Cette politique de confidentialité détaille notre engagement à protéger votre vie privée conformément aux normes les plus strictes.</p>
            <p>Nous nous conformons rigoureusement à la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE) du Canada, ainsi qu'à la Loi 25 du Québec concernant la protection des renseignements personnels dans le secteur privé.</p>
          </section>

          <section className="scroll-mt-32" id="collecte">
            <h2 className="font-headline-md text-headline-md text-on-background mb-6">2. Collecte des Données</h2>
            <p className="mb-6">Pour vous offrir une expérience d'achat luxueuse et personnalisée, nous recueillons certaines informations lors de votre interaction avec notre boutique. Ces renseignements incluent :</p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>Informations d'identité :</strong> Votre nom complet et vos coordonnées (adresse courriel, numéro de téléphone).</li>
              <li><strong>Détails d'expédition :</strong> Votre adresse postale complète pour garantir la livraison sécuritaire de vos articles.</li>
              <li><strong>Informations de paiement :</strong> Les détails de facturation nécessaires pour traiter vos transactions (gérés de manière sécurisée par nos partenaires de paiement ; nous ne stockons pas les numéros complets de cartes de crédit).</li>
            </ul>
          </section>

          <section className="scroll-mt-32" id="utilisation">
            <h2 className="font-headline-md text-headline-md text-on-background mb-6">3. Utilisation des Données</h2>
            <p className="mb-6">Chaque donnée collectée a un objectif précis visant à améliorer votre expérience :</p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>Exécution des commandes :</strong> Traitement de vos achats, coordination de l'expédition et gestion des retours.</li>
              <li><strong>Service à la clientèle :</strong> Répondre à vos demandes de renseignements, vous conseiller sur l'entretien de vos perruques et assurer un suivi après-vente irréprochable.</li>
              <li><strong>Marketing et communications :</strong> Avec votre consentement explicite, nous utilisons vos coordonnées pour vous informer de nos nouvelles collections, offres exclusives et guides d'entretien.</li>
            </ul>
          </section>

          <section className="scroll-mt-32" id="cookies">
            <h2 className="font-headline-md text-headline-md text-on-background mb-6">4. Cookies et Témoins</h2>
            <p>Notre site web utilise des témoins (cookies) et des technologies similaires pour assurer son bon fonctionnement et optimiser votre navigation. Ces outils nous permettent d'analyser les performances du site, de mémoriser vos préférences et de personnaliser le contenu qui vous est présenté. Vous pouvez gérer vos préférences en matière de témoins directement via les paramètres de votre navigateur.</p>
          </section>

          <section className="scroll-mt-32" id="droits">
            <h2 className="font-headline-md text-headline-md text-on-background mb-6">5. Vos Droits (LPRPDE / Loi 25)</h2>
            <p className="mb-6">En tant que résident du Canada ou du Québec, la législation vous accorde des droits spécifiques concernant vos renseignements personnels :</p>
            <div className="bg-surface-container-low p-8 rounded-lg mt-6 border border-surface-variant">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>visibility</span>
                  <div>
                    <strong className="block text-on-background">Droit d'accès</strong>
                    Vous pouvez demander à consulter les renseignements personnels que nous détenons à votre sujet.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>edit</span>
                  <div>
                    <strong className="block text-on-background">Droit de rectification</strong>
                    Si vos informations sont inexactes ou incomplètes, vous avez le droit de demander leur correction.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>delete_forever</span>
                  <div>
                    <strong className="block text-on-background">Retrait du consentement</strong>
                    Vous pouvez à tout moment retirer votre consentement à l'utilisation de vos données à des fins marketing ou demander la suppression de votre compte, sous réserve des obligations légales de conservation.
                  </div>
                </li>
              </ul>
            </div>
          </section>

          <section className="scroll-mt-32" id="securite">
            <h2 className="font-headline-md text-headline-md text-on-background mb-6">6. Sécurité</h2>
            <p>La protection de vos données est une priorité absolue. Nous employons des mesures de sécurité physiques, technologiques et administratives robustes, incluant le cryptage SSL, des pare-feu et des protocoles d'accès restreint, pour prévenir la perte, le vol, l'accès non autorisé, la divulgation ou la modification de vos renseignements personnels. Nous évaluons et mettons à jour régulièrement nos pratiques de sécurité pour maintenir un environnement numérique sûr.</p>
          </section>

          <section className="scroll-mt-32" id="contact">
            <h2 className="font-headline-md text-headline-md text-on-background mb-6">7. Contact DPO</h2>
            <p className="mb-6">Si vous avez des questions, des préoccupations ou si vous souhaitez exercer vos droits concernant vos renseignements personnels, notre Délégué à la Protection des Données (DPO) est à votre disposition.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-6 items-start sm:items-center p-8 bg-surface-container-low border border-surface-variant rounded-lg">
              <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-primary-container text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>shield_person</span>
              </div>
              <div>
                <h3 className="font-label-md text-label-md uppercase tracking-wider text-outline mb-2">Bureau de la Confidentialité</h3>
                <a className="text-primary font-headline-md text-headline-md hover:opacity-80 transition-opacity" href="mailto:privacy@ddmwigs.ca">
                  privacy@ddmwigs.ca
                </a>
                <p className="mt-2 text-body-md text-on-surface-variant">Nous nous engageons à répondre à toutes les demandes dans un délai de 30 jours.</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
