import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import Stripe from "stripe";
import { giftCardBuyerEmail, giftCardRecipientEmail, sendEmail } from "~/lib/email.server";
import { createGiftCard } from "~/lib/gift-cards.server";
import { applyPostPaymentEffects } from "~/lib/order-fulfillment.server";

// POST /api/stripe-webhook  (Stripe → confirme le paiement)
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const stripeSecret = env.STRIPE_SECRET_KEY as string | undefined;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET as string | undefined;

  if (!stripeSecret) return new Response("Not configured", { status: 503 });
  // La vérification de signature est obligatoire — configurer STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) return new Response("Webhook secret manquant", { status: 503 });

  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-06-24.dahlia" });
  const body = await request.text();

  let event: Stripe.Event;
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const db = env.DB;

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;

    // ── Achat de carte cadeau : créer la carte + envoyer les courriels ──────
    if (pi.metadata?.type === "gift_card") {
      const purchase = await db
        .prepare("SELECT * FROM gift_card_purchases WHERE stripe_payment_intent_id = ? AND status = 'pending'")
        .bind(pi.id)
        .first<{
          id: number; amount_cad: number; buyer_name: string; buyer_email: string;
          recipient_name: string | null; recipient_email: string | null; message: string | null;
        }>();

      // Déjà traité (webhook rejoué) ou intention introuvable → rien à faire
      if (!purchase) return new Response("ok", { status: 200 });

      const card = await createGiftCard(db, {
        amountCad: purchase.amount_cad,
        recipientName: purchase.recipient_name,
        recipientEmail: purchase.recipient_email,
        note: `Achat en ligne par ${purchase.buyer_name} (${purchase.buyer_email})`,
      });

      await db
        .prepare("UPDATE gift_card_purchases SET status = 'completed', gift_card_id = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(card.id, purchase.id)
        .run();

      const apiKey = env.RESEND_API_KEY as string | undefined;
      if (apiKey) {
        const sentToRecipient = Boolean(purchase.recipient_email);
        try {
          if (purchase.recipient_email) {
            const rcpt = giftCardRecipientEmail({
              recipientName: purchase.recipient_name ?? "",
              buyerName: purchase.buyer_name,
              code: card.code,
              amountCad: purchase.amount_cad,
              message: purchase.message ?? undefined,
            });
            await sendEmail({ apiKey, to: purchase.recipient_email, subject: rcpt.subject, html: rcpt.html });
          }
          const buyer = giftCardBuyerEmail({
            buyerName: purchase.buyer_name,
            recipientName: purchase.recipient_name ?? undefined,
            recipientEmail: purchase.recipient_email ?? undefined,
            code: card.code,
            amountCad: purchase.amount_cad,
            sentToRecipient,
          });
          await sendEmail({ apiKey, to: purchase.buyer_email, subject: buyer.subject, html: buyer.html });
        } catch { /* la carte est créée — l'admin peut renvoyer le code au besoin */ }
      }

      return new Response("ok", { status: 200 });
    }

    await db
      .prepare(`UPDATE orders SET
        payment_status = 'paid',
        payment_method = ?,
        status = 'confirmed',
        updated_at = datetime('now')
        WHERE stripe_payment_intent_id = ?`)
      .bind(pi.payment_method_types?.[0] ?? "card", pi.id)
      .run();

    // Effets post-paiement (stock, promo, carte cadeau, panier, adresse)
    try {
      const paidOrder = await db
        .prepare("SELECT id FROM orders WHERE stripe_payment_intent_id = ?")
        .bind(pi.id)
        .first<{ id: number }>();
      if (paidOrder) await applyPostPaymentEffects(db, paidOrder.id);
    } catch { /* ne pas bloquer le webhook */ }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    if (pi.metadata?.type === "gift_card") {
      await db
        .prepare("UPDATE gift_card_purchases SET status = 'failed', updated_at = datetime('now') WHERE stripe_payment_intent_id = ? AND status = 'pending'")
        .bind(pi.id)
        .run();
    } else {
      await db
        .prepare("UPDATE orders SET payment_status = 'failed', status = 'cancelled' WHERE stripe_payment_intent_id = ?")
        .bind(pi.id)
        .run();
    }
  }

  return new Response("ok", { status: 200 });
}
