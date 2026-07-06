import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import Stripe from "stripe";
import { GIFT_CARD_MAX_CAD, GIFT_CARD_MIN_CAD } from "~/lib/gift-cards.server";

// POST /api/cartes-cadeaux  { amountCad, buyerName, buyerEmail, recipientName?, recipientEmail?, message? }
//   → { clientSecret }
// La carte n'est créée qu'au paiement confirmé (webhook Stripe) — ici on ne
// fait qu'enregistrer l'intention d'achat et créer le PaymentIntent.
// Pas de taxes : au Québec, une carte prépayée est taxée à l'utilisation,
// pas à l'achat.
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const stripeSecret = env.STRIPE_SECRET_KEY as string | undefined;
  if (!stripeSecret) {
    return json({ error: "Paiement en ligne non configuré." }, { status: 503 });
  }

  const body = await request.json() as {
    amountCad?: number;
    buyerName?: string;
    buyerEmail?: string;
    recipientName?: string;
    recipientEmail?: string;
    message?: string;
  };

  const amountCad = Math.round(Number(body.amountCad ?? 0) * 100) / 100;
  const buyerName = String(body.buyerName ?? "").trim();
  const buyerEmail = String(body.buyerEmail ?? "").trim().toLowerCase();
  const recipientName = String(body.recipientName ?? "").trim() || null;
  const recipientEmail = String(body.recipientEmail ?? "").trim().toLowerCase() || null;
  const message = String(body.message ?? "").trim().slice(0, 500) || null;

  if (!buyerName || !buyerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
    return json({ error: "Veuillez fournir votre nom et une adresse courriel valide." }, { status: 400 });
  }
  if (recipientEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
    return json({ error: "L'adresse courriel du destinataire est invalide." }, { status: 400 });
  }
  if (!Number.isFinite(amountCad) || amountCad < GIFT_CARD_MIN_CAD || amountCad > GIFT_CARD_MAX_CAD) {
    return json(
      { error: `Le montant doit être entre ${GIFT_CARD_MIN_CAD} $ et ${GIFT_CARD_MAX_CAD} $.` },
      { status: 400 }
    );
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-06-24.dahlia" });

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amountCad * 100),
    currency: "cad",
    metadata: {
      type: "gift_card",
      buyer_name: buyerName,
    },
    receipt_email: buyerEmail,
    description: `Carte cadeau ${amountCad.toFixed(2)} $ — DDM Wigs & More`,
    automatic_payment_methods: { enabled: true },
  });

  await context.cloudflare.env.DB
    .prepare(
      `INSERT INTO gift_card_purchases
        (stripe_payment_intent_id, amount_cad, buyer_name, buyer_email, recipient_name, recipient_email, message)
        VALUES (?,?,?,?,?,?,?)`
    )
    .bind(paymentIntent.id, amountCad, buyerName, buyerEmail, recipientName, recipientEmail, message)
    .run();

  return json({ clientSecret: paymentIntent.client_secret });
}
