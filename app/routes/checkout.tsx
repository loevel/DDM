import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";
import { cfImage } from "~/lib/images";

export const meta: MetaFunction = () => [
  { title: "Paiement sécurisé — DDM Wigs & More" },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const env = (context as any).cloudflare.env;
  const publishableKey = (env.STRIPE_PUBLISHABLE_KEY as string | undefined) ?? "";
  return json({ publishableKey });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  productId: number;
  name: string;
  price_cad: number;
  slug: string;
  quantity: number;
  image_key?: string | null;
}

interface Cart {
  items: CartItem[];
  total: number;
}

interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  line1: string;
  city: string;
  province: string;
  postal_code: string;
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Checkout() {
  const { publishableKey } = useLoaderData<typeof loader>();

  const [cart, setCart] = useState<Cart>({ items: [], total: 0 });
  const [cartId, setCartId] = useState<string | null>(null);
  const [cartLoaded, setCartLoaded] = useState(false);

  const [step, setStep] = useState<"info" | "payment" | "done">("info");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    name: "", email: "", phone: "", line1: "", city: "", province: "QC", postal_code: "",
  });
  const [promoCode, setPromoCode] = useState("");
  const [referralCode] = useState(() => {
    if (typeof document === "undefined") return null;
    const m = document.cookie.match(/(?:^|;\s*)ddm_ref=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  });
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Charger le panier depuis localStorage
  useEffect(() => {
    const id = localStorage.getItem("ddm_cart_id");
    if (!id) { setCartLoaded(true); return; }
    setCartId(id);
    fetch(`/api/cart?cartId=${id}`)
      .then(r => r.json())
      .then((d: Cart) => { setCart(d); setCartLoaded(true); })
      .catch(() => setCartLoaded(true));
  }, []);

  // Pré-remplir depuis compte si connecté (profil + adresse par défaut)
  useEffect(() => {
    fetch("/api/me").then(r => r.ok ? r.json() : null)
      .then((me: any) => {
        if (!me) return;
        setCustomerInfo(prev => ({
          ...prev,
          name:        me.name        || prev.name,
          email:       me.email       || prev.email,
          phone:       me.phone       || prev.phone,
          line1:       me.address?.street      || prev.line1,
          city:        me.address?.city        || prev.city,
          province:    me.address?.province    || prev.province,
          postal_code: me.address?.postal_code || prev.postal_code,
        }));
      }).catch(() => {});
  }, []);

  const finalTotal = cart.total;
  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  // Passer à l'étape paiement : créer le PaymentIntent
  async function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartId, customerInfo, promoCode: promoCode || undefined, referralCode: referralCode || undefined }),
      });
      const data = await res.json() as { clientSecret?: string; orderRef?: string; error?: string };
      if (!res.ok || !data.clientSecret) throw new Error(data.error ?? "Erreur serveur.");
      setClientSecret(data.clientSecret);
      setOrderRef(data.orderRef ?? null);
      setStep("payment");
    } catch (err: any) {
      setError(err.message ?? "Une erreur est survenue.");
    } finally {
      setSubmitting(false);
    }
  }

  // Vider le panier après succès
  function handlePaymentSuccess() {
    if (cartId) fetch(`/api/cart?cartId=${cartId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: -1, quantity: 0 }), // signal de vidage
    }).catch(() => {});
    localStorage.removeItem("ddm_cart_id");
    setStep("done");
  }

  if (!cartLoaded) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
      </main>
    );
  }

  if (cart.items.length === 0 && step !== "done") {
    return (
      <main className="max-w-3xl mx-auto px-6 py-20 text-center">
        <span className="material-symbols-outlined text-6xl text-outline-variant mb-4 block">shopping_bag</span>
        <h1 className="font-serif text-2xl text-on-surface mb-4">Votre panier est vide</h1>
        <Link to="/boutique" className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90">
          Continuer mes achats
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-10 py-10">
      {/* Breadcrumb / étapes */}
      <div className="flex items-center gap-2 mb-10">
        <Link to="/" className="font-sans text-xs text-on-surface-variant hover:text-primary transition-colors">Accueil</Link>
        <span className="material-symbols-outlined text-xs text-on-surface-variant">chevron_right</span>
        <Link to="/panier" className="font-sans text-xs text-on-surface-variant hover:text-primary transition-colors">Panier</Link>
        <span className="material-symbols-outlined text-xs text-on-surface-variant">chevron_right</span>
        <span className="font-sans text-xs text-on-surface font-semibold">
          {step === "info" ? "Coordonnées" : step === "payment" ? "Paiement" : "Confirmation"}
        </span>
      </div>

      {step === "done" ? (
        <ConfirmationStep orderRef={orderRef} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12">

          {/* Colonne principale */}
          <div>
            {step === "info" && (
              <InfoStep
                customerInfo={customerInfo}
                onChange={setCustomerInfo}
                promoCode={promoCode}
                onPromoChange={setPromoCode}
                onSubmit={handleInfoSubmit}
                submitting={submitting}
                error={error}
              />
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
                <PaymentStep
                  orderRef={orderRef}
                  total={finalTotal}
                  onBack={() => setStep("info")}
                  onSuccess={handlePaymentSuccess}
                />
              </Elements>
            )}
          </div>

          {/* Récap commande */}
          <OrderSummary cart={cart} />
        </div>
      )}
    </main>
  );
}

// ─── Étape 1 : Coordonnées ────────────────────────────────────────────────────

function InfoStep({
  customerInfo, onChange, promoCode, onPromoChange, onSubmit, submitting, error,
}: {
  customerInfo: CustomerInfo;
  onChange: (v: CustomerInfo) => void;
  promoCode: string;
  onPromoChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string | null;
}) {
  const f = (k: keyof CustomerInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...customerInfo, [k]: e.target.value });

  const provinces = [
    ["QC", "Québec"], ["ON", "Ontario"], ["BC", "Colombie-Britannique"],
    ["AB", "Alberta"], ["MB", "Manitoba"], ["SK", "Saskatchewan"],
    ["NS", "Nouvelle-Écosse"], ["NB", "Nouveau-Brunswick"],
    ["NL", "Terre-Neuve"], ["PE", "Île-du-Prince-Édouard"],
    ["NT", "Territoires du Nord-Ouest"], ["YT", "Yukon"], ["NU", "Nunavut"],
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl text-on-surface mb-6">Vos coordonnées</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nom complet *" className="sm:col-span-2">
            <input required value={customerInfo.name} onChange={f("name")}
              placeholder="Marie Dupont" className={inp} />
          </Field>
          <Field label="Adresse courriel *">
            <input required type="email" value={customerInfo.email} onChange={f("email")}
              placeholder="marie@exemple.com" className={inp} />
          </Field>
          <Field label="Téléphone">
            <input type="tel" value={customerInfo.phone} onChange={f("phone")}
              placeholder="514 555-0000" className={inp} />
          </Field>
        </div>
      </div>

      <div>
        <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-on-surface mb-4">Adresse de livraison</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Adresse *" className="sm:col-span-2">
            <input required value={customerInfo.line1} onChange={f("line1")}
              placeholder="123 rue Sainte-Catherine" className={inp} />
          </Field>
          <Field label="Ville *">
            <input required value={customerInfo.city} onChange={f("city")}
              placeholder="Montréal" className={inp} />
          </Field>
          <Field label="Province *">
            <select required value={customerInfo.province} onChange={f("province")} className={inp}>
              {provinces.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Code postal *">
            <input required value={customerInfo.postal_code} onChange={f("postal_code")}
              placeholder="H2X 1Y4" className={inp}
              pattern="[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d" title="Format : A1B 2C3" />
          </Field>
        </div>
      </div>

      {/* Code promo */}
      <div>
        <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-on-surface mb-4">Code promo (optionnel)</h2>
        <input value={promoCode} onChange={e => onPromoChange(e.target.value.toUpperCase())}
          placeholder="DDM-XXXXX"
          className={`${inp} w-full sm:w-64 font-mono uppercase`} />
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-error/5 border border-error/30">
          <span className="material-symbols-outlined text-error text-lg shrink-0 mt-0.5">error</span>
          <p className="font-sans text-sm text-error">{error}</p>
        </div>
      )}

      <button type="submit" disabled={submitting}
        className="w-full h-14 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-3">
        {submitting ? (
          <>
            <span className="w-4 h-4 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
            Préparation du paiement…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-xl">lock</span>
            Continuer vers le paiement
          </>
        )}
      </button>

      <p className="font-sans text-xs text-center text-on-surface-variant flex items-center justify-center gap-1.5">
        <span className="material-symbols-outlined text-sm">shield</span>
        Paiement 100% sécurisé par Stripe · Chiffrement SSL
      </p>
    </form>
  );
}

// ─── Étape 2 : Paiement ───────────────────────────────────────────────────────

function PaymentStep({
  orderRef, total, onBack, onSuccess,
}: {
  orderRef: string | null;
  total: number;
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
        return_url: `${window.location.origin}/commande-confirmee?ref=${orderRef}`,
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
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={onBack}
          className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-serif text-2xl text-on-surface">Paiement sécurisé</h1>
      </div>

      {orderRef && (
        <p className="font-sans text-xs text-on-surface-variant">Référence commande : <span className="font-mono font-semibold">{orderRef}</span></p>
      )}

      <div className="border border-outline-variant p-5">
        <PaymentElement options={{
          layout: "tabs",
          wallets: { googlePay: "auto", applePay: "auto" },
        }} />
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-error/5 border border-error/30">
          <span className="material-symbols-outlined text-error text-lg shrink-0 mt-0.5">error</span>
          <p className="font-sans text-sm text-error">{error}</p>
        </div>
      )}

      <button type="submit" disabled={paying || !stripe}
        className="w-full h-14 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-3">
        {paying ? (
          <>
            <span className="w-4 h-4 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin" />
            Traitement en cours…
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-xl">lock</span>
            Payer {total.toFixed(2)} $ CAD
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-4 pt-2">
        <img src="https://cdn.jsdelivr.net/npm/@stripe/stripe-js/assets/powered_by_stripe.svg" alt="Powered by Stripe" className="h-6 opacity-60" />
      </div>
    </form>
  );
}

// ─── Étape 3 : Confirmation ───────────────────────────────────────────────────

function ConfirmationStep({ orderRef }: { orderRef: string | null }) {
  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-6">
        <span className="material-symbols-outlined text-4xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
          check_circle
        </span>
      </div>
      <h1 className="font-serif text-3xl text-on-surface mb-3">Commande confirmée !</h1>
      {orderRef && (
        <p className="font-sans text-sm text-on-surface-variant mb-1">
          Référence : <span className="font-mono font-semibold text-on-surface">{orderRef}</span>
        </p>
      )}
      <p className="font-sans text-sm text-on-surface-variant mb-8">
        Un reçu a été envoyé à votre adresse courriel. Notre équipe vous contactera pour confirmer la livraison.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/boutique"
          className="px-6 py-3 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90">
          Continuer mes achats
        </Link>
        <Link to="/compte/commandes"
          className="px-6 py-3 border border-outline-variant text-on-surface font-sans text-sm font-semibold hover:border-primary hover:text-primary transition-colors">
          Mes commandes
        </Link>
      </div>
    </div>
  );
}

// ─── Récap commande ───────────────────────────────────────────────────────────

function OrderSummary({ cart }: { cart: Cart }) {
  return (
    <div className="bg-surface-container-low border border-outline-variant/40 p-6 h-fit lg:sticky lg:top-24">
      <h2 className="font-sans text-sm font-bold uppercase tracking-wider text-on-surface mb-5">
        Récapitulatif ({cart.items.length} article{cart.items.length > 1 ? "s" : ""})
      </h2>

      <div className="space-y-4 mb-6">
        {cart.items.map(item => (
          <div key={item.productId} className="flex gap-3">
            <div className="w-16 h-16 bg-surface-container shrink-0 overflow-hidden">
              {item.image_key ? (
                <img src={cfImage(item.image_key, "thumbnail") ?? item.image_key}
                  alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl text-outline-variant">styler</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-sans text-sm font-semibold text-on-surface leading-tight">{item.name}</p>
              <p className="font-sans text-xs text-on-surface-variant mt-0.5">Qté : {item.quantity}</p>
            </div>
            <p className="font-sans text-sm font-bold text-on-surface shrink-0">
              {(item.price_cad * item.quantity).toFixed(2)} $
            </p>
          </div>
        ))}
      </div>

      <div className="border-t border-outline-variant pt-4 space-y-2">
        <div className="flex justify-between font-sans text-sm text-on-surface-variant">
          <span>Sous-total</span>
          <span>{cart.total.toFixed(2)} $ CAD</span>
        </div>
        <div className="flex justify-between font-sans text-sm text-on-surface-variant">
          <span>Livraison</span>
          <span className="text-secondary font-semibold">Gratuite</span>
        </div>
        <div className="flex justify-between font-sans text-base font-bold text-on-surface pt-2 border-t border-outline-variant">
          <span>Total</span>
          <span>{cart.total.toFixed(2)} $ CAD</span>
        </div>
        <p className="font-sans text-[10px] text-on-surface-variant">Taxes incluses · CAD</p>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inp = "w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
