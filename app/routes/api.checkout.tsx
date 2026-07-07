import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import Stripe from "stripe";
import { getActiveGiftCard } from "~/lib/gift-cards.server";
import { applyPostPaymentEffects } from "~/lib/order-fulfillment.server";
import { computeTaxes, getTaxSettings } from "~/lib/taxes.server";
import { getCustomerId } from "~/lib/session.server";
import { redeemableCad, pointsCostFor } from "~/lib/loyalty.server";

// POST /api/checkout  { cartId, customerInfo, promoCode?, giftCardCode? }
//   → { clientSecret, orderRef } | { paidInFull: true, orderRef }
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const stripeSecret = env.STRIPE_SECRET_KEY as string | undefined;

  if (!stripeSecret) {
    return json({ error: "Paiement en ligne non configuré." }, { status: 503 });
  }

  const body = await request.json();

  const { cartId, customerInfo, promoCode, referralCode, giftCardCode, newsletterOptin, redeemPoints } = body;

  if (!cartId || !customerInfo?.name || !customerInfo?.email) {
    return json({ error: "Données incomplètes." }, { status: 400 });
  }

  const db = env.DB;
  const cache = env.CACHE;

  // Récupérer le panier depuis KV
  const cartRaw = await cache.get(`cart:${cartId}`);
  if (!cartRaw) return json({ error: "Panier introuvable ou expiré." }, { status: 404 });

  const cart = JSON.parse(cartRaw) as { items: { productId: number; name: string; price_cad: number; slug: string; quantity: number; variantId?: number; variantName?: string }[]; total: number };

  if (!cart.items.length) return json({ error: "Panier vide." }, { status: 400 });

  // Vérifier les prix en DB (sécurité : ne pas faire confiance au client)
  let subtotal = 0;
  const verifiedItems: { productId: number; name: string; price_cad: number; slug: string; quantity: number; image_key: string | null; variantId?: number; variantName?: string }[] = [];

  for (const item of cart.items) {
    const product = await db
      .prepare("SELECT id, name, price_cad, slug, image_key, stock FROM products WHERE id = ?")
      .bind(item.productId)
      .first<{ id: number; name: string; price_cad: number; slug: string; image_key: string | null; stock: number }>();

    if (!product) return json({ error: `Produit introuvable : ${item.name}` }, { status: 400 });

    let effectivePrice = product.price_cad;

    if (item.variantId) {
      const variant = await db
        .prepare("SELECT id, stock, price_adjustment_cad FROM product_variants WHERE id = ? AND product_id = ?")
        .bind(item.variantId, item.productId)
        .first<{ id: number; stock: number; price_adjustment_cad: number }>();
      if (!variant) return json({ error: `Déclinaison introuvable : ${item.variantName}` }, { status: 400 });
      if (variant.stock < item.quantity) return json({ error: `Stock insuffisant pour : ${product.name} — ${item.variantName}` }, { status: 400 });
      effectivePrice = product.price_cad + variant.price_adjustment_cad;
    } else {
      if (product.stock < item.quantity) return json({ error: `Stock insuffisant pour : ${product.name}` }, { status: 400 });
    }

    subtotal += effectivePrice * item.quantity;
    verifiedItems.push({
      ...item,
      name: product.name,
      price_cad: effectivePrice,
      slug: product.slug,
      image_key: product.image_key,
      variantId: item.variantId,
      variantName: item.variantName,
    });
  }

  // Appliquer le code promo si fourni
  let discountCad = 0;
  let validPromo: string | null = null;
  if (promoCode) {
    const promo = await db
      .prepare(`SELECT type, value, min_order FROM promo_codes
        WHERE code = ? AND active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (usage_limit IS NULL OR used_count < usage_limit)`)
      .bind(promoCode.trim().toUpperCase())
      .first<{ type: string; value: number; min_order: number }>();

    if (!promo) {
      return json({ error: "Code promo invalide, expiré ou épuisé." }, { status: 400 });
    }
    if (promo.min_order > 0 && subtotal < promo.min_order) {
      return json(
        { error: `Ce code exige un minimum de ${promo.min_order.toFixed(2)} $ d'achat.` },
        { status: 400 }
      );
    }

    discountCad = promo.type === "percent"
      ? Math.round((subtotal * promo.value / 100) * 100) / 100
      : Math.min(promo.value, subtotal);
    validPromo = promoCode.trim().toUpperCase();
  }

  // Vérifier le code de parrainage (nouvelle cliente uniquement)
  let referrerEmail: string | null = null;
  if (referralCode && !promoCode) {
    try {
      const referrer = await db
        .prepare("SELECT email FROM customers WHERE referral_code = ?")
        .bind(referralCode.toUpperCase()).first<{ email: string }>();
      if (referrer && referrer.email !== customerInfo.email.trim().toLowerCase()) {
        // Appliquer remise filleule
        const REFERRAL_DISCOUNT = 10;
        discountCad = Math.min(discountCad + REFERRAL_DISCOUNT, subtotal);
        referrerEmail = referrer.email;
      }
    } catch { /* table pas encore dispo */ }
  }

  // Attribution ambassadrice. Le code peut arriver via le champ promo (déjà
  // validé plus haut → validPromo, remise appliquée par le code promo standard)
  // ou via le lien /r/CODE (cookie → referralCode). On mémorise le code pour
  // créditer la commission au paiement confirmé ; si le code vient du lien sans
  // code promo saisi, on applique aussi la remise ambassadrice.
  let ambassadorCode: string | null = null;
  try {
    const candidate = (validPromo ?? (referralCode ? String(referralCode) : "")).toUpperCase().trim();
    if (candidate) {
      const amb = await db
        .prepare("SELECT code, discount_percent FROM ambassadors WHERE code = ? AND status = 'active'")
        .bind(candidate)
        .first<{ code: string; discount_percent: number }>();
      if (amb) {
        ambassadorCode = amb.code;
        if (!validPromo && discountCad === 0 && amb.discount_percent > 0) {
          discountCad = Math.round((subtotal * amb.discount_percent / 100) * 100) / 100;
          validPromo = amb.code;
        }
      }
    }
  } catch { /* table ambassadors absente → ignorer */ }

  // Points fidélité : la cliente connectée peut échanger ses points contre une
  // remise (20 pts = 1 $). Validé côté serveur à partir du solde réel et lié au
  // compte authentifié (jamais via l'email seul). Débit effectif au paiement.
  let loyaltyCad = 0;
  let loyaltyPointsRedeemed = 0;
  if (redeemPoints) {
    try {
      const cid = await getCustomerId(request, context);
      if (cid) {
        const cust = await db
          .prepare("SELECT email, loyalty_points FROM customers WHERE id = ?")
          .bind(cid)
          .first<{ email: string; loyalty_points: number }>();
        if (cust && cust.email.toLowerCase() === String(customerInfo.email).trim().toLowerCase()) {
          const cap = Math.max(0, Math.round((subtotal - discountCad) * 100) / 100);
          loyaltyCad = redeemableCad(cust.loyalty_points ?? 0, cap);
          loyaltyPointsRedeemed = pointsCostFor(loyaltyCad);
        }
      }
    } catch { /* échange ignoré si erreur */ }
  }

  // Taxes de vente — actives seulement si l'entreprise est inscrite (Admin → Paramètres)
  const taxableCad = Math.max(0, subtotal - discountCad - loyaltyCad);
  const taxSettings = await getTaxSettings(db);
  const taxes = taxSettings.enabled
    ? computeTaxes(taxableCad, customerInfo.province ?? "QC")
    : { tps: 0, tvq: 0, tpsLabel: "", tvqLabel: null };

  const totalCad = Math.round((taxableCad + taxes.tps + taxes.tvq) * 100) / 100;

  // Carte cadeau : appliquée après taxes (c'est un mode de paiement, pas une
  // remise). Le solde n'est débité qu'au paiement confirmé.
  let giftCad = 0;
  let validGiftCode: string | null = null;
  if (giftCardCode) {
    const card = await getActiveGiftCard(db, String(giftCardCode));
    if (!card) {
      return json({ error: "Code de carte cadeau invalide ou solde épuisé." }, { status: 400 });
    }
    giftCad = Math.min(card.balance_cad, totalCad);
    // Stripe exige un minimum de 0,50 $ : si la carte couvre presque tout,
    // on laisse 0,50 $ à payer et le reste demeure sur la carte
    const remainder = Math.round((totalCad - giftCad) * 100) / 100;
    if (remainder > 0 && remainder < 0.5) {
      giftCad = Math.round((totalCad - 0.5) * 100) / 100;
    }
    giftCad = Math.round(giftCad * 100) / 100;
    validGiftCode = card.code;
  }

  const chargeCad = Math.round((totalCad - giftCad) * 100) / 100;
  const amountCents = Math.round(chargeCad * 100);

  if (!validGiftCode && amountCents < 50) return json({ error: "Montant minimum : 0.50 $." }, { status: 400 });

  // Créer la référence de commande
  const ref = "DDM-" + Date.now().toString(36).toUpperCase();

  // Créer l'order en DB (status pending_payment)
  const order = await db
    .prepare(`INSERT INTO orders
      (reference, customer_name, customer_email, customer_phone, type,
       total_cad, discount_cad, tps_cad, tvq_cad, promo_code, gift_card_code, gift_card_cad,
       payment_status, status, shipping_address, ambassador_code,
       loyalty_points_redeemed, loyalty_discount_cad)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(
      ref,
      customerInfo.name.trim(),
      customerInfo.email.trim().toLowerCase(),
      customerInfo.phone?.trim() || null,
      "purchase",
      totalCad,
      discountCad,
      taxes.tps,
      taxes.tvq,
      validPromo,
      validGiftCode,
      giftCad,
      "pending",
      "pending",
      JSON.stringify({
        line1: customerInfo.line1,
        city: customerInfo.city,
        province: customerInfo.province,
        postal_code: customerInfo.postal_code,
        country: "CA",
      }),
      ambassadorCode,
      loyaltyPointsRedeemed,
      loyaltyCad,
    )
    .first<{ id: number }>();

  if (!order) return json({ error: "Erreur création commande." }, { status: 500 });

  for (const item of verifiedItems) {
    await db
      .prepare(`INSERT INTO order_items
        (order_id, product_id, product_name, product_slug, image_key, quantity, unit_price_cad, variant_id, variant_name)
        VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(order.id, item.productId, item.name, item.slug, item.image_key, item.quantity, item.price_cad, item.variantId ?? null, item.variantName ?? null)
      .run();
  }

  // Opt-in newsletter coché au checkout : preuve de consentement LCAP (date + IP)
  if (newsletterOptin === true) {
    const email = customerInfo.email.trim().toLowerCase();
    const ip = request.headers.get("CF-Connecting-IP") ?? null;
    try {
      await db.prepare(
        "INSERT INTO newsletter (email, consent_ip, unsub_token) VALUES (?, ?, ?)"
      ).bind(email, ip, crypto.randomUUID().replace(/-/g, "")).run();
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) {
        try {
          await db.prepare(`
            UPDATE newsletter
            SET unsubscribed_at = NULL, consent_ip = ?, subscribed_at = datetime('now')
            WHERE email = ? AND unsubscribed_at IS NOT NULL
          `).bind(ip, email).run();
        } catch { /* non bloquant */ }
      }
    }
    try {
      await db.prepare("UPDATE customers SET newsletter_optin = 1 WHERE email = ?")
        .bind(email).run();
    } catch { /* non bloquant */ }
  }

  // Enregistrer le parrainage et créditer le parrain
  if (referrerEmail) {
    try {
      await db.prepare(
        "INSERT INTO referrals (referrer_email, referred_email, code, status, reward_cad, discount_cad, order_reference, rewarded_at) VALUES (?,?,?,?,?,?,?,datetime('now'))"
      ).bind(referrerEmail, customerInfo.email.trim().toLowerCase(), referralCode!.toUpperCase(), "rewarded", 15, 10, ref).run();
      await db.prepare(
        "UPDATE customers SET referral_credit_cad = referral_credit_cad + 15 WHERE email = ?"
      ).bind(referrerEmail).run();
    } catch { /* ignorer silencieusement */ }
  }

  const breakdown = {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: discountCad,
    loyalty: loyaltyCad,
    taxes: [
      ...(taxes.tps > 0 ? [{ label: taxes.tpsLabel, amount: taxes.tps }] : []),
      ...(taxes.tvq > 0 && taxes.tvqLabel ? [{ label: taxes.tvqLabel, amount: taxes.tvq }] : []),
    ],
    giftCard: giftCad,
    total: totalCad,
    toPay: chargeCad,
  };

  // Commande entièrement couverte par la carte cadeau : aucun paiement Stripe
  if (chargeCad === 0) {
    await db
      .prepare("UPDATE orders SET payment_status = 'paid', payment_method = 'gift_card', status = 'confirmed', updated_at = datetime('now') WHERE id = ?")
      .bind(order.id)
      .run();
    await applyPostPaymentEffects(db, order.id);
    return json({ paidInFull: true, orderRef: ref, breakdown });
  }

  // Créer le PaymentIntent Stripe
  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-06-24.dahlia" });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "cad",
    metadata: {
      order_ref: ref,
      order_id: String(order.id),
      customer_name: customerInfo.name,
    },
    receipt_email: customerInfo.email,
    description: `Commande ${ref} — DDM Wigs & More`,
    // Adresse d'expédition : requise par les paiements différés (Affirm,
    // Afterpay) pour être proposés, et utile à la prévention de fraude.
    shipping: {
      name: customerInfo.name.trim(),
      ...(customerInfo.phone?.trim() ? { phone: customerInfo.phone.trim() } : {}),
      address: {
        line1: customerInfo.line1 ?? "",
        city: customerInfo.city ?? "",
        state: customerInfo.province ?? "",
        postal_code: customerInfo.postal_code ?? "",
        country: "CA",
      },
    },
    automatic_payment_methods: { enabled: true },
  });

  // Lier le PaymentIntent à la commande
  await db
    .prepare("UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?")
    .bind(paymentIntent.id, order.id)
    .run();

  return json({
    clientSecret: paymentIntent.client_secret,
    orderRef: ref,
    breakdown,
  });
}
