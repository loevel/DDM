import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import Stripe from "stripe";

// POST /api/checkout  { cartId, customerInfo, promoCode? }
//   → { clientSecret, orderRef }
export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env;
  const stripeSecret = env.STRIPE_SECRET_KEY as string | undefined;

  if (!stripeSecret) {
    return json({ error: "Paiement en ligne non configuré." }, { status: 503 });
  }

  const body = await request.json<{
    cartId: string;
    customerInfo: {
      name: string;
      email: string;
      phone?: string;
      line1: string;
      city: string;
      province: string;
      postal_code: string;
    };
    promoCode?: string;
    referralCode?: string;
  }>();

  const { cartId, customerInfo, promoCode, referralCode } = body;

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
      .prepare("SELECT * FROM promo_codes WHERE code = ? AND active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))")
      .bind(promoCode.trim().toUpperCase())
      .first<{ type: string; value: number; min_order_cad: number | null }>();

    if (promo && (!promo.min_order_cad || subtotal >= promo.min_order_cad)) {
      discountCad = promo.type === "percent"
        ? Math.round((subtotal * promo.value / 100) * 100) / 100
        : Math.min(promo.value, subtotal);
      validPromo = promoCode.trim().toUpperCase();
    }
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

  const totalCad = Math.max(0, subtotal - discountCad);
  const amountCents = Math.round(totalCad * 100);

  if (amountCents < 50) return json({ error: "Montant minimum : 0.50 $." }, { status: 400 });

  // Créer la référence de commande
  const ref = "DDM-" + Date.now().toString(36).toUpperCase();

  // Créer l'order en DB (status pending_payment)
  const order = await db
    .prepare(`INSERT INTO orders
      (reference, customer_name, customer_email, customer_phone, type,
       total_cad, discount_cad, promo_code, payment_status, status,
       shipping_address)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`)
    .bind(
      ref,
      customerInfo.name.trim(),
      customerInfo.email.trim().toLowerCase(),
      customerInfo.phone?.trim() || null,
      "purchase",
      totalCad,
      discountCad,
      validPromo,
      "pending",
      "pending",
      JSON.stringify({
        line1: customerInfo.line1,
        city: customerInfo.city,
        province: customerInfo.province,
        postal_code: customerInfo.postal_code,
        country: "CA",
      }),
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

  // Créer le PaymentIntent Stripe
  const stripe = new Stripe(stripeSecret, { apiVersion: "2025-04-30.basil" });

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
    automatic_payment_methods: { enabled: true },
  });

  // Lier le PaymentIntent à la commande
  await db
    .prepare("UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?")
    .bind(paymentIntent.id, order.id)
    .run();

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

  return json({ clientSecret: paymentIntent.client_secret, orderRef: ref });
}
