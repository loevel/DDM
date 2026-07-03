import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDB } from "~/lib/db.server";

export const meta: MetaFunction = () => [
  { title: "Désabonnement — DDM Wigs & More" },
  { name: "robots", content: "noindex" },
];

// GET /desabonnement?token=xxx
// Lien présent dans chaque email commercial (exigence LCAP/CASL).
// Fonctionne sans connexion : le jeton identifie l'abonné.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token || token.length < 16) return json({ status: "invalid" as const });

  const db = getDB(context);

  // Abonné newsletter (sans compte)
  const sub = await db
    .prepare("SELECT id, unsubscribed_at FROM newsletter WHERE unsub_token = ?")
    .bind(token)
    .first<{ id: number; unsubscribed_at: string | null }>();

  if (sub) {
    if (!sub.unsubscribed_at) {
      await db
        .prepare("UPDATE newsletter SET unsubscribed_at = datetime('now') WHERE id = ?")
        .bind(sub.id)
        .run();
    }
    return json({ status: "done" as const });
  }

  // Client avec compte (préférence newsletter_optin)
  const customer = await db
    .prepare("SELECT id FROM customers WHERE unsub_token = ?")
    .bind(token)
    .first<{ id: string }>();

  if (customer) {
    await db
      .prepare("UPDATE customers SET newsletter_optin = 0 WHERE id = ?")
      .bind(customer.id)
      .run();
    return json({ status: "done" as const });
  }

  return json({ status: "invalid" as const });
}

export default function Desabonnement() {
  const { status } = useLoaderData<typeof loader>();
  const done = status === "done";

  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-8 ${done ? "bg-secondary-container" : "bg-error-container"}`}>
          <span className={`material-symbols-outlined text-3xl ${done ? "text-on-secondary-container" : "text-on-error-container"}`}>
            {done ? "mark_email_read" : "error"}
          </span>
        </div>

        {done ? (
          <>
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-4">
              Vous êtes désabonné
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              Vous ne recevrez plus nos communications marketing.
              Vous pouvez vous réinscrire à tout moment depuis la boutique.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-4">
              Lien invalide
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              Ce lien de désabonnement est invalide ou a déjà été utilisé.
              Si vous continuez à recevoir nos emails, écrivez-nous et nous
              vous retirerons manuellement de la liste.
            </p>
          </>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/boutique"
            className="px-8 py-4 bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider hover:opacity-90 transition-opacity"
          >
            Visiter la boutique
          </Link>
          {!done && (
            <Link
              to="/contact"
              className="px-8 py-4 border border-outline-variant text-on-surface font-label-md text-label-md uppercase tracking-wider hover:border-primary hover:text-primary transition-colors"
            >
              Nous contacter
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
