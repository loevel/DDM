import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import Stripe from "stripe";

export const meta: MetaFunction = () => [{ title: "Commande confirmée — DDM Wigs & More" }];

// Cette page est le return_url de Stripe après un paiement 3D Secure.
// Stripe ajoute payment_intent et payment_intent_client_secret en query params.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref");
  const paymentIntentId = url.searchParams.get("payment_intent");
  const redirectStatus = url.searchParams.get("redirect_status");

  // Si Stripe a redirigé après 3DS avec un PI, on vérifie et on confirme l'ordre en DB
  if (paymentIntentId && redirectStatus === "succeeded") {
    const stripeSecret = context.cloudflare.env.STRIPE_SECRET_KEY as string | undefined;
    if (stripeSecret) {
      try {
        const stripe = new Stripe(stripeSecret, { apiVersion: "2026-06-24.dahlia" });
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (pi.status === "succeeded") {
          const db = context.cloudflare.env.DB;
          // Le webhook va aussi passer, mais on s'assure que la commande est confirmée
          // même si le webhook est lent ou manqué
          await db.prepare(`
            UPDATE orders SET
              payment_status = 'paid',
              payment_method = ?,
              status = 'confirmed',
              updated_at = datetime('now')
            WHERE stripe_payment_intent_id = ? AND payment_status != 'paid'
          `).bind(pi.payment_method_types?.[0] ?? "card", paymentIntentId).run();
        }
      } catch {
        // Ne pas bloquer l'affichage si Stripe est momentanément indisponible
      }
    }
  }

  // Nettoyer le panier côté serveur si on connaît la référence
  const orderRef = ref ?? url.searchParams.get("order_ref");

  return json({
    orderRef,
    success: redirectStatus === "succeeded" || !redirectStatus,
    failed: redirectStatus === "failed" || redirectStatus === "canceled",
  });
}

export default function CommandeConfirmee() {
  const { orderRef, success, failed } = useLoaderData<typeof loader>();

  if (failed) {
    return (
      <main className="max-w-lg mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-4xl text-error" style={{ fontVariationSettings: "'FILL' 1" }}>
            cancel
          </span>
        </div>
        <h1 className="font-serif text-3xl text-on-surface mb-3">Paiement non abouti</h1>
        <p className="font-sans text-sm text-on-surface-variant mb-8">
          Votre paiement n'a pas pu être traité. Aucun montant n'a été débité.
        </p>
        <Link to="/checkout"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90">
          Réessayer
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-lg mx-auto px-6 py-20 text-center">
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
    </main>
  );
}
