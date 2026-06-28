import type { MetaFunction } from "@remix-run/react";
import { Link } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";

export const meta: MetaFunction = () => [
  { title: "Mon panier — DDM Wigs & More" },
];

interface CartItem {
  productId: number;
  name: string;
  price_cad: number;
  slug: string;
  quantity: number;
}

interface Cart {
  items: CartItem[];
  total: number;
}

interface PromoResult {
  valid: boolean;
  code?: string;
  type?: "percent" | "fixed";
  value?: number;
  discount?: number;
  finalTotal?: number;
  label?: string;
  error?: string;
}

type PageState = "loading" | "empty" | "ready" | "error";

export default function Panier() {
  const [cart, setCart] = useState<Cart>({ items: [], total: 0 });
  const [state, setState] = useState<PageState>("loading");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Code promo
  const [promoInput, setPromoInput] = useState("");
  const [promoResult, setPromoResult] = useState<PromoResult | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const appliedCode = useRef<string | null>(null);

  async function fetchCart() {
    const cartId = localStorage.getItem("ddm_cart_id");
    if (!cartId) { setState("empty"); return; }
    try {
      const res = await fetch(`/api/cart?cartId=${cartId}`);
      if (!res.ok) throw new Error();
      const data: Cart = await res.json();
      setCart(data);
      setState(data.items.length === 0 ? "empty" : "ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => { fetchCart(); }, []);

  // Revalider le code si le total change
  useEffect(() => {
    if (appliedCode.current && cart.total > 0) {
      applyPromo(appliedCode.current, cart.total);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.total]);

  async function applyPromo(code: string, total?: number) {
    const t = total ?? cart.total;
    if (!code.trim() || t === 0) return;
    setPromoLoading(true);
    try {
      const res = await fetch(`/api/promo?code=${encodeURIComponent(code.trim())}&total=${t}`);
      const data: PromoResult = await res.json();
      setPromoResult(data);
      if (data.valid) {
        appliedCode.current = data.code ?? code.trim();
      } else {
        appliedCode.current = null;
      }
    } catch {
      setPromoResult({ valid: false, error: "Erreur lors de la vérification" });
      appliedCode.current = null;
    } finally {
      setPromoLoading(false);
    }
  }

  function removePromo() {
    setPromoResult(null);
    setPromoInput("");
    appliedCode.current = null;
  }

  async function updateQty(productId: number, quantity: number) {
    const cartId = localStorage.getItem("ddm_cart_id");
    if (!cartId) return;
    setUpdatingId(productId);
    try {
      const res = await fetch(`/api/cart?cartId=${cartId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      if (!res.ok) throw new Error();
      const data: Cart = await res.json();
      setCart(data);
      if (data.items.length === 0) setState("empty");
      const badge = document.getElementById("cart-badge");
      if (badge) {
        const total = data.items.reduce((s, i) => s + i.quantity, 0);
        if (total > 0) {
          badge.textContent = String(total);
          badge.classList.remove("hidden");
          badge.classList.add("flex");
        } else {
          badge.classList.add("hidden");
          badge.classList.remove("flex");
        }
      }
    } catch {
      // ignore
    } finally {
      setUpdatingId(null);
    }
  }

  const discount = promoResult?.valid ? (promoResult.discount ?? 0) : 0;
  const finalTotal = promoResult?.valid ? (promoResult.finalTotal ?? cart.total) : cart.total;

  const promoLine = promoResult?.valid && promoResult.code
    ? ` · Code ${promoResult.code} (${promoResult.label})`
    : "";
  const whatsappLines = cart.items
    .map(i => `• ${i.name} × ${i.quantity} = ${(i.price_cad * i.quantity).toFixed(2)} $`)
    .join("\n");
  const whatsappMsg = encodeURIComponent(
    `Bonjour, je souhaite commander :\n${whatsappLines}\n\nSous-total : ${cart.total.toFixed(2)} $${promoLine}${discount > 0 ? `\nRéduction : -${discount.toFixed(2)} $` : ""}\nTotal : ${finalTotal.toFixed(2)} $ CAD`
  );

  return (
    <main className="max-w-[90rem] mx-auto px-6 md:px-10 lg:px-20 py-12 min-h-[60vh]">

      {/* Header */}
      <div className="mb-10">
        <nav className="flex items-center gap-2 font-sans text-xs text-on-surface-variant mb-5">
          <Link to="/" className="hover:text-primary transition-colors">Accueil</Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-on-surface font-medium">Mon panier</span>
        </nav>
        <h1 className="font-serif text-4xl text-on-surface">Mon panier</h1>
      </div>

      {/* Loading */}
      {state === "loading" && (
        <div className="flex items-center justify-center py-24 gap-3 text-on-surface-variant">
          <span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span>
          <p className="font-sans text-base">Chargement du panier…</p>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <span className="material-symbols-outlined text-4xl text-error">error</span>
          <p className="font-sans text-base text-on-surface">Impossible de charger le panier.</p>
          <button onClick={fetchCart} className="px-6 py-2.5 border border-primary text-primary font-sans text-sm font-semibold hover:bg-primary hover:text-on-primary transition-colors">
            Réessayer
          </button>
        </div>
      )}

      {/* Panier vide */}
      {state === "empty" && (
        <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
          <span className="material-symbols-outlined text-6xl text-outline-variant">shopping_bag</span>
          <h2 className="font-serif text-2xl text-on-surface">Votre panier est vide</h2>
          <p className="font-sans text-base text-on-surface-variant max-w-sm">
            Découvrez notre collection de perruques en cheveux humains premium.
          </p>
          <Link to="/boutique"
            className="mt-2 px-8 py-3 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
            Voir la boutique
          </Link>
        </div>
      )}

      {/* Panier avec articles */}
      {state === "ready" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 xl:gap-16">

          {/* Liste des articles */}
          <div className="lg:col-span-2 space-y-0 divide-y divide-outline-variant/30">
            {cart.items.map(item => (
              <div key={item.productId} className="flex gap-5 py-6">
                <Link to={`/boutique/${item.slug}`}
                  className="w-24 h-28 md:w-32 md:h-36 bg-surface-container shrink-0 overflow-hidden flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl text-outline-variant">styler</span>
                </Link>

                <div className="flex-1 min-w-0">
                  <Link to={`/boutique/${item.slug}`}
                    className="font-serif text-lg text-on-surface hover:text-primary transition-colors line-clamp-2 block mb-1">
                    {item.name}
                  </Link>
                  <p className="font-sans text-base font-bold text-primary mb-4">
                    {item.price_cad.toFixed(2)} $ CAD / unité
                  </p>

                  <div className="flex items-center gap-4 flex-wrap">
                    <div className={`flex items-center border transition-opacity ${updatingId === item.productId ? "opacity-50" : "border-outline-variant"}`}>
                      <button disabled={updatingId === item.productId}
                        onClick={() => updateQty(item.productId, item.quantity - 1)}
                        className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors disabled:cursor-wait">
                        <span className="material-symbols-outlined text-base">remove</span>
                      </button>
                      <span className="w-9 text-center font-sans text-sm font-semibold text-on-surface">
                        {updatingId === item.productId ? "…" : item.quantity}
                      </span>
                      <button disabled={updatingId === item.productId}
                        onClick={() => updateQty(item.productId, item.quantity + 1)}
                        className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors disabled:cursor-wait">
                        <span className="material-symbols-outlined text-base">add</span>
                      </button>
                    </div>
                    <button disabled={updatingId === item.productId}
                      onClick={() => updateQty(item.productId, 0)}
                      className="flex items-center gap-1 font-sans text-xs text-on-surface-variant hover:text-error transition-colors disabled:opacity-50">
                      <span className="material-symbols-outlined text-sm">delete</span>
                      Retirer
                    </button>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-sans text-base font-bold text-on-surface">
                    {(item.price_cad * item.quantity).toFixed(2)} $
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Récapitulatif */}
          <div className="lg:col-span-1">
            <div className="bg-surface-container-low p-6 sticky top-24">
              <h2 className="font-sans text-sm font-bold uppercase tracking-widest text-on-surface mb-5 pb-3 border-b border-outline-variant">
                Récapitulatif
              </h2>

              {/* Lignes articles */}
              <div className="space-y-2 mb-4">
                {cart.items.map(item => (
                  <div key={item.productId} className="flex justify-between font-sans text-sm">
                    <span className="text-on-surface-variant truncate pr-4 max-w-[180px]">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="text-on-surface font-medium shrink-0">
                      {(item.price_cad * item.quantity).toFixed(2)} $
                    </span>
                  </div>
                ))}
              </div>

              {/* Code promo */}
              <div className="mb-4 pt-3 border-t border-outline-variant/50">
                <p className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                  Code de réduction
                </p>

                {promoResult?.valid ? (
                  /* Code appliqué */
                  <div className="flex items-center justify-between bg-secondary/10 border border-secondary/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary text-base">sell</span>
                      <div>
                        <p className="font-sans text-xs font-bold text-secondary tracking-widest">{promoResult.code}</p>
                        <p className="font-sans text-[11px] text-secondary/80">{promoResult.label}</p>
                      </div>
                    </div>
                    <button onClick={removePromo}
                      className="text-on-surface-variant hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ) : (
                  /* Saisie du code */
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoInput}
                      onChange={e => {
                        setPromoInput(e.target.value.toUpperCase());
                        if (promoResult && !promoResult.valid) setPromoResult(null);
                      }}
                      onKeyDown={e => { if (e.key === "Enter") applyPromo(promoInput); }}
                      placeholder="Ex : SUMMER25"
                      className="flex-1 h-9 px-3 border border-outline-variant bg-surface font-sans text-sm font-bold uppercase tracking-wider focus:outline-none focus:border-primary transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:normal-case placeholder:text-on-surface-variant/50"
                    />
                    <button
                      onClick={() => applyPromo(promoInput)}
                      disabled={promoLoading || !promoInput.trim()}
                      className="px-3 h-9 bg-primary text-on-primary font-sans text-xs font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0">
                      {promoLoading ? "…" : "Appliquer"}
                    </button>
                  </div>
                )}

                {/* Message d'erreur */}
                {promoResult && !promoResult.valid && (
                  <p className="font-sans text-xs text-error mt-1.5 flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {promoResult.error}
                  </p>
                )}
              </div>

              {/* Total */}
              <div className="border-t border-outline-variant pt-4 mb-6 space-y-2">
                <div className="flex justify-between font-sans text-sm">
                  <span className="text-on-surface-variant">Sous-total</span>
                  <span className="text-on-surface font-medium">{cart.total.toFixed(2)} $</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between font-sans text-sm">
                    <span className="text-secondary flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">sell</span>
                      Réduction ({promoResult?.label})
                    </span>
                    <span className="text-secondary font-semibold">-{discount.toFixed(2)} $</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-outline-variant/50">
                  <span className="font-sans text-base font-bold text-on-surface">Total</span>
                  <div className="text-right">
                    {discount > 0 && (
                      <p className="font-sans text-xs text-on-surface-variant line-through">{cart.total.toFixed(2)} $</p>
                    )}
                    <span className="font-serif text-2xl text-primary font-bold">{finalTotal.toFixed(2)} $ CAD</span>
                  </div>
                </div>
                <p className="font-sans text-xs text-on-surface-variant">Taxes et livraison calculées à la commande</p>
              </div>

              {/* CTA WhatsApp */}
              <a href={`https://wa.me/23797193723?text=${whatsappMsg}`}
                target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity mb-3">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 2.114.55 4.097 1.508 5.819L.057 23.172a.75.75 0 0 0 .92.92l5.353-1.451A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.655-.502-5.184-1.381l-.372-.218-3.856 1.046 1.046-3.856-.218-.372A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                Commander via WhatsApp
              </a>

              <Link to="/boutique"
                className="w-full flex items-center justify-center gap-2 py-3 border border-outline-variant text-on-surface-variant font-sans text-sm font-semibold hover:border-primary hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Continuer mes achats
              </Link>

              {/* Badges confiance */}
              <div className="flex items-center justify-center gap-4 mt-5 pt-5 border-t border-outline-variant/50">
                <div className="flex items-center gap-1 font-sans text-[11px] text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm text-primary">verified</span>
                  Paiement sécurisé
                </div>
                <div className="flex items-center gap-1 font-sans text-[11px] text-on-surface-variant">
                  <span className="material-symbols-outlined text-sm text-primary">local_shipping</span>
                  Livraison rapide
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
