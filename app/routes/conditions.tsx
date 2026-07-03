import type { MetaFunction } from "@remix-run/react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [
  { title: "Conditions Générales de Vente - DDM Wigs & More" },
  { name: "description", content: "Conditions générales de vente de DDM Wigs & More. Commandes, paiement, livraison, retours et garanties — en toute transparence." },
];

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Identification du commerçant",
    body: (
      <p>
        Le site <strong>ddmwigs.com</strong> est exploité par <strong>DDM Wigs &amp; More</strong>,
        entreprise établie à Montréal (Québec, Canada). Pour toute question relative aux présentes
        conditions, vous pouvez nous joindre via la page <Link to="/contact" className="text-primary underline">Contact</Link>.
      </p>
    ),
  },
  {
    title: "2. Champ d'application",
    body: (
      <p>
        Les présentes conditions générales de vente (CGV) s'appliquent à toute commande passée sur
        ddmwigs.com. En validant votre commande, vous confirmez en avoir pris connaissance et les
        accepter. Elles n'excluent en rien les droits que vous confère la <em>Loi sur la protection
        du consommateur</em> du Québec (LPC), qui prévaut en cas de divergence.
      </p>
    ),
  },
  {
    title: "3. Produits et prix",
    body: (
      <>
        <p className="mb-4">
          Nos perruques et accessoires sont décrits avec le plus grand soin (composition, longueur,
          texture, densité, type de dentelle). Les photos sont représentatives, mais de légères
          variations de teinte peuvent exister selon votre écran.
        </p>
        <p>
          Tous les prix sont affichés en <strong>dollars canadiens (CAD)</strong>. Les taxes de
          vente applicables, le cas échéant, sont calculées et affichées avant le paiement. Le prix
          total facturé — sous-total, remises, taxes et frais éventuels — vous est présenté avant
          la confirmation de la commande.
        </p>
      </>
    ),
  },
  {
    title: "4. Commande et paiement",
    body: (
      <>
        <p className="mb-4">
          Le paiement s'effectue en ligne de façon sécurisée via <strong>Stripe</strong> (cartes de
          crédit et de débit, Google Pay, Apple Pay). Aucune donnée bancaire n'est conservée sur nos
          serveurs.
        </p>
        <p>
          Votre commande est confirmée dès la réception du paiement : vous recevez alors un courriel
          de confirmation avec votre numéro de référence. Nous nous réservons le droit de refuser ou
          d'annuler une commande en cas d'erreur manifeste de prix, de stock épuisé ou de suspicion
          de fraude — dans ce cas, vous êtes intégralement remboursée.
        </p>
      </>
    ),
  },
  {
    title: "5. Livraison",
    body: (
      <>
        <p className="mb-4">
          La livraison est <strong>gratuite partout au Canada</strong>. Le délai de livraison
          applicable est annoncé avant le paiement, sur la page de commande. Chaque colis est
          expédié dans un emballage neutre et discret, avec un numéro de suivi transmis par
          courriel.
        </p>
        <p>
          Conformément à la LPC, si le produit n'est pas livré dans les 30 jours suivant la date
          annoncée, vous pouvez annuler votre commande et obtenir un remboursement complet.
          Consultez notre page <Link to="/livraison" className="text-primary underline">Livraison &amp; Retours</Link> pour
          plus de détails.
        </p>
      </>
    ),
  },
  {
    title: "6. Retours et échanges",
    body: (
      <>
        <p className="mb-4">
          Vous disposez de <strong>14 jours</strong> suivant la réception pour retourner un article.
          Pour être admissible à un remboursement complet, l'article doit être <strong>non porté</strong>,
          dans son état et son emballage d'origine, et la dentelle (lace) ne doit pas avoir été
          coupée. Pour des raisons d'hygiène évidentes dans notre domaine, tout article présentant
          des signes d'utilisation ou d'altération (coupe, coloration, produits coiffants) ne pourra
          être repris.
        </p>
        <p>
          Pour initier un retour, contactez-nous via la page{" "}
          <Link to="/contact" className="text-primary underline">Contact</Link> en indiquant votre
          numéro de commande. Le remboursement est effectué sur le mode de paiement d'origine dans
          les 10 jours suivant la réception et l'inspection de l'article retourné.
        </p>
      </>
    ),
  },
  {
    title: "7. Garanties légales",
    body: (
      <p>
        Tous nos produits bénéficient de la <strong>garantie légale de qualité</strong> prévue par
        la Loi sur la protection du consommateur : ils doivent être conformes à leur description et
        pouvoir servir à l'usage auquel ils sont destinés pendant une durée raisonnable. Rien dans
        les présentes CGV ne limite cette garantie. En cas de défaut de fabrication, contactez-nous
        — nous procéderons à la réparation, à l'échange ou au remboursement.
      </p>
    ),
  },
  {
    title: "8. Cartes-cadeaux et codes promotionnels",
    body: (
      <>
        <p className="mb-4">
          Conformément à la LPC, nos <strong>cartes-cadeaux n'ont aucune date d'expiration</strong>.
          Elles sont utilisables en un ou plusieurs achats et ne sont ni remboursables ni
          échangeables contre de l'argent, sauf dans les cas prévus par la loi.
        </p>
        <p>
          Les codes promotionnels sont soumis à leurs conditions propres (durée de validité, montant
          minimum d'achat, nombre d'utilisations), indiquées lors de l'offre. Un seul code
          promotionnel peut être appliqué par commande.
        </p>
      </>
    ),
  },
  {
    title: "9. Responsabilité et utilisation des produits",
    body: (
      <p>
        Nos perruques sont des produits capillaires de qualité premium nécessitant un entretien
        approprié. Consultez notre <Link to="/guide-entretien" className="text-primary underline">Guide d'entretien</Link> pour
        préserver la durée de vie de votre pièce. Nous ne saurions être tenus responsables des
        dommages résultant d'une utilisation ou d'un entretien non conforme aux recommandations
        (chaleur excessive, produits chimiques inadaptés, coloration effectuée par vos soins).
      </p>
    ),
  },
  {
    title: "10. Renseignements personnels",
    body: (
      <p>
        La collecte et l'utilisation de vos renseignements personnels sont régies par notre{" "}
        <Link to="/confidentialite" className="text-primary underline">Politique de confidentialité</Link>,
        conforme à la Loi 25 du Québec et à la LPRPDE. Nos communications commerciales respectent la
        Loi canadienne anti-pourriel : chaque courriel contient un lien de désabonnement fonctionnel.
      </p>
    ),
  },
  {
    title: "11. Droit applicable",
    body: (
      <p>
        Les présentes CGV sont régies par les lois applicables au Québec et au Canada. En cas de
        litige, nous vous invitons à nous contacter d'abord pour trouver une solution à l'amiable.
        Vous conservez en tout temps le droit de vous adresser à l'Office de la protection du
        consommateur ou aux tribunaux compétents.
      </p>
    ),
  },
  {
    title: "12. Modification des conditions",
    body: (
      <p>
        Nous pouvons mettre à jour les présentes CGV pour refléter l'évolution de nos services ou
        de la réglementation. La version applicable à votre commande est celle en vigueur au moment
        de sa validation. Dernière mise à jour : juillet 2026.
      </p>
    ),
  },
];

export default function Conditions() {
  return (
    <main className="flex-grow w-full max-w-3xl mx-auto px-4 md:px-grid-margin-desktop py-section-gap-mobile md:py-section-gap-desktop">
      {/* Header */}
      <header className="text-center mb-16">
        <h1 className="font-headline-xl text-headline-lg-mobile md:text-headline-xl text-primary mb-6">
          Conditions Générales de Vente
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
          Nous croyons en une relation de confiance, claire et transparente. Voici les conditions
          qui encadrent chaque commande passée sur ddmwigs.com — rédigées pour être comprises, pas
          pour être cachées.
        </p>
      </header>

      {/* Sections */}
      <div className="space-y-12">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-headline-md text-headline-md text-on-surface mb-4">{s.title}</h2>
            <div className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              {s.body}
            </div>
          </section>
        ))}
      </div>

      {/* Contact CTA */}
      <div className="mt-16 md:mt-24 text-center border-t border-outline-variant/40 pt-12">
        <p className="font-body-lg text-body-lg text-on-surface-variant mb-6">
          Des questions concernant nos conditions ?
        </p>
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
