import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useState } from "react";

export const meta: MetaFunction = () => [
  { title: "Cartes Cadeaux - DDM Wigs & More" },
  { name: "description", content: "Offrez le cadeau de la beauté avec les cartes cadeaux DDM Wigs & More. Achat en ligne, envoi instantané par courriel, valables sur toute la boutique." },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const publishableKey = (context.cloudflare.env.STRIPE_PUBLISHABLE_KEY as string | undefined) ?? "";
  return json({ publishableKey });
}

const GIFT_CARDS = [
  {
    amount: 50,
    label: "Découverte",
    description: "L'entrée parfaite dans l'univers DDM. Idéale pour les accessoires et produits d'entretien.",
  },
  {
    amount: 150,
    label: "Essentielle",
    description: "Le choix populaire pour découvrir notre collection d'extensions et de perruques synthétiques.",
  },
  {
    amount: 300,
    label: "Premium",
    description: "Accès à notre gamme complète de perruques naturelles et pièces de collection.",
  },
  {
    amount: 500,
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
    text: "Le bénéficiaire l'utilise sur notre boutique en ligne ou lors d'une visite en personne, en une ou plusieurs fois.",
  },
];

interface PurchaseForm {
  buyerName: string;
  buyerEmail: string;
  recipientName: string;
  recipientEmail: string;
  message: string;
}

export default function CartesCadeaux() {
  const { publishableKey } = useLoaderData<typeof loader>();

  const [step, setStep] = useState<"choose" | "payment" | "done">("choose");
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [form, setForm] = useState<PurchaseForm>({
    buyerName: "", buyerEmail: "", recipientName: "", recipientEmail: "", message: "",
  });
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Retour d'un paiement avec redirection (Klarna, etc.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("redirect_status") === "succeeded") setStep("done");
  }, []);

  const effectiveAmount = amount ?? (customAmount ? Number(customAmount) : null);
  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  function selectAmount(v: number) {
    setAmount(v);
    setCustomAmount("");
    document.getElementById("gift-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!effectiveAmount || effectiveAmount < 25 || effectiveAmount > 1000) {
      setError("Veuillez choisir un montant entre 25 $ et 1000 $.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/cartes-cadeaux", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCad: effectiveAmount,
          buyerName: form.buyerName,
          buyerEmail: form.buyerEmail,
          recipientName: form.recipientName || undefined,
          recipientEmail: form.recipientEmail || undefined,
          message: form.message || undefined,
        }),
      });
      const data = await res.json() as { clientSecret?: string; error?: string };
      if (!res.ok || !data.clientSecret) throw new Error(data.error ?? "Erreur serveur.");
      setClientSecret(data.clientSecret);
      setStep("payment");
    } catch (err: any) {
      setError(err.message ?? "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <main className="flex-grow flex flex-col items-center w-full max-w-container-max-width mx-auto px-4 md:px-grid-margin-desktop py-section-gap-mobile md:py-section-gap-desktop">
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
              redeem
            </span>
          </div>
          <h1 className="font-headline-xl text-headline-lg-mobile md:text-headline-xl text-primary mb-4">Merci !</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-3">
            Votre paiement est confirmé. La carte cadeau et son code unique arrivent par courriel d'ici quelques minutes
            {form.recipientEmail ? " — directement au destinataire, avec une copie pour vous." : "."}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant mb-8">
            Pensez à vérifier le dossier indésirables si rien n'arrive.
          </p>
          <Link to="/boutique"
            className="inline-flex items-center justify-center bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider px-8 py-4 rounded-DEFAULT hover:bg-surface-tint transition-colors duration-200">
            Découvrir la boutique
          </Link>
        </div>
      </main>
    );
  }

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
      <section className="w-full mb-16 md:mb-20">
        <h2 className="font-headline-md text-headline-md text-on-surface text-center mb-12">Choisissez un montant</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {GIFT_CARDS.map((card) => (
            <button
              key={card.amount}
              type="button"
              onClick={() => selectAmount(card.amount)}
              className={`flex flex-col items-center text-center bg-surface-container-lowest border rounded-DEFAULT p-8 hover:shadow-[0_20px_40px_-15px_rgba(44,22,0,0.08)] transition-all duration-300 cursor-pointer group ${
                amount === card.amount ? "border-primary shadow-[0_20px_40px_-15px_rgba(44,22,0,0.12)]" : "border-outline-variant/30 hover:border-primary/40"
              }`}
            >
              <span className="font-headline-xl text-4xl text-primary mb-1">{card.amount} $</span>
              <span className="font-label-md text-label-md text-primary uppercase tracking-widest mb-4">{card.label}</span>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{card.description}</p>
              {amount === card.amount && (
                <span className="material-symbols-outlined text-primary mt-4" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3 mt-8">
          <label className="font-body-sm text-body-sm text-on-surface-variant" htmlFor="custom-amount">
            Ou montant personnalisé (25 $ – 1000 $) :
          </label>
          <div className="relative">
            <input
              id="custom-amount"
              type="number" min={25} max={1000} step="1" placeholder="75"
              value={customAmount}
              onChange={e => { setCustomAmount(e.target.value); setAmount(null); }}
              className="h-10 w-28 pl-3 pr-7 border border-outline-variant bg-surface font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary rounded-DEFAULT"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">$</span>
          </div>
        </div>
      </section>

      {/* Formulaire d'achat / paiement */}
      <section id="gift-form" className="w-full max-w-2xl mb-20 md:mb-28 scroll-mt-24">
        <div className="bg-surface-container-lowest rounded-DEFAULT border border-outline-variant/20 p-8 md:p-12">
          {step === "choose" && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="text-center mb-2">
                <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Votre carte cadeau</h2>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {effectiveAmount
                    ? <>Montant choisi : <strong className="text-primary">{effectiveAmount.toFixed(2)} $ CAD</strong></>
                    : "Sélectionnez un montant ci-dessus pour commencer."}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <GField label="Votre nom *">
                  <input required value={form.buyerName}
                    onChange={e => setForm({ ...form, buyerName: e.target.value })}
                    placeholder="Marie Dupont" className={ginp} />
                </GField>
                <GField label="Votre courriel *">
                  <input required type="email" value={form.buyerEmail}
                    onChange={e => setForm({ ...form, buyerEmail: e.target.value })}
                    placeholder="marie@exemple.com" className={ginp} />
                </GField>
                <GField label="Prénom du destinataire">
                  <input value={form.recipientName}
                    onChange={e => setForm({ ...form, recipientName: e.target.value })}
                    placeholder="Julie" className={ginp} />
                </GField>
                <GField label="Courriel du destinataire" hint="Laissez vide pour recevoir le code vous-même">
                  <input type="email" value={form.recipientEmail}
                    onChange={e => setForm({ ...form, recipientEmail: e.target.value })}
                    placeholder="julie@exemple.com" className={ginp} />
                </GField>
                <div className="sm:col-span-2">
                  <GField label="Message personnel (optionnel)">
                    <textarea rows={3} maxLength={500} value={form.message}
                      onChange={e => setForm({ ...form, message: e.target.value })}
                      placeholder="Joyeux anniversaire ! Choisis la pièce qui te fera rayonner…"
                      className={`${ginp} h-auto py-2 resize-none`} />
                  </GField>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 p-4 bg-error/5 border border-error/30 rounded-DEFAULT">
                  <span className="material-symbols-outlined text-error text-lg shrink-0 mt-0.5">error</span>
                  <p className="font-body-sm text-body-sm text-error">{error}</p>
                </div>
              )}

              <button type="submit" disabled={submitting || !effectiveAmount}
                className="w-full h-14 bg-primary text-on-primary font-label-md text-label-md uppercase tracking-widest rounded-DEFAULT hover:bg-surface-tint disabled:opacity-50 transition-colors flex items-center justify-center gap-3">
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
                    Préparation du paiement…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-xl">lock</span>
                    {effectiveAmount ? `Payer ${effectiveAmount.toFixed(2)} $ CAD` : "Choisissez un montant"}
                  </>
                )}
              </button>

              <p className="font-body-sm text-xs text-center text-on-surface-variant flex items-center justify-center gap-1.5">
                <span className="material-symbols-outlined text-sm">shield</span>
                Paiement 100% sécurisé par Stripe · Aucune taxe à l'achat d'une carte cadeau
              </p>
            </form>
          )}

          {step === "payment" && clientSecret && stripePromise && (
            <Elements stripe={stripePromise} options={{
              clientSecret,
              appearance: {
                theme: "flat",
                variables: {
                  colorPrimary: "#1a1a1a",
                  colorBackground: "#ffffff",
                  colorText: "#1a1a1a",
                  colorDanger: "#dc2626",
                  fontFamily: "Inter, system-ui, sans-serif",
                  borderRadius: "0px",
                },
              },
              locale: "fr-CA",
            }}>
              <GiftPaymentStep
                amount={effectiveAmount ?? 0}
                onBack={() => { setStep("choose"); setClientSecret(null); }}
                onSuccess={() => setStep("done")}
              />
            </Elements>
          )}
        </div>
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

      {/* CTA boutique */}
      <div className="text-center">
        <p className="font-body-lg text-body-lg text-on-surface-variant mb-8 max-w-lg mx-auto">
          Une question ou une commande spéciale (montant sur mesure, carte physique) ? Écrivez-nous.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/contact"
            className="inline-flex items-center justify-center border border-primary text-primary font-label-md text-label-md uppercase tracking-wider px-8 py-4 rounded-DEFAULT hover:bg-primary-container/20 transition-colors duration-200"
          >
            Nous contacter
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

// ─── Étape paiement Stripe ────────────────────────────────────────────────────

function GiftPaymentStep({ amount, onBack, onSuccess }: {
  amount: number;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setPaying(true);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/cartes-cadeaux`,
      },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message ?? "Paiement refusé. Veuillez réessayer.");
      setPaying(false);
    } else {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack}
          className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="font-headline-md text-headline-md text-on-surface">Paiement sécurisé</h2>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        Carte cadeau de <strong className="text-primary">{amount.toFixed(2)} $ CAD</strong> — envoyée par courriel dès la confirmation du paiement.
      </p>

      <div className="border border-outline-variant p-5 bg-surface">
        <PaymentElement options={{
          layout: "tabs",
          wallets: { googlePay: "auto", applePay: "auto" },
        }} />
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-error/5 border border-error/30 rounded-DEFAULT">
          <span className="material-symbols-outlined text-error text-lg shrink-0 mt-0.5">error</span>
          <p className="font-body-sm text-body-sm text-error">{error}</p>
        </div>
      )}

      <button type="submit" disabled={paying || !stripe}
        className="w-full h-14 bg-primary text-on-primary font-label-md text-label-md uppercase tracking-widest rounded-DEFAULT hover:bg-surface-tint disabled:opacity-50 transition-colors flex items-center justify-center gap-3">
        {paying ? (
          <>
            <span className="w-4 h-4 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
            Traitement en cours…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-xl">lock</span>
            Payer {amount.toFixed(2)} $ CAD
          </>
        )}
      </button>
    </form>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ginp = "w-full h-10 px-3 border border-outline-variant bg-surface font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors rounded-DEFAULT";

function GField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-label-md text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="font-body-sm text-[11px] text-on-surface-variant/70 mt-1">{hint}</p>}
    </div>
  );
}
