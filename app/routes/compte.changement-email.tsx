import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { confirmEmailChange } from "~/lib/customer-account.server";

export const meta: MetaFunction = () => [{ title: "Changement d'email — DDM Wigs & More" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return { result: null };
  const result = await confirmEmailChange(token, context);
  return { result };
}

export default function ChangementEmail() {
  const { result } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        {result ? (
          <>
            <span className="material-symbols-outlined text-5xl text-primary mb-4">mark_email_read</span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-3">Email confirmé</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              L'adresse de votre compte est maintenant <strong>{result.newEmail}</strong>.
              Utilisez cette adresse pour vos prochaines connexions.
            </p>
            <Link
              to="/compte/profil"
              className="inline-block bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider px-8 py-3 hover:bg-on-primary-container transition-colors duration-200"
            >
              Retour à mon profil
            </Link>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-5xl text-error mb-4">link_off</span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-3">Lien invalide ou expiré</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              Ce lien a déjà été utilisé, a expiré, ou l'adresse demandée est désormais associée à un autre compte.
              Refaites la demande depuis votre profil.
            </p>
            <Link
              to="/compte/profil"
              className="inline-block bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider px-8 py-3 hover:bg-on-primary-container transition-colors duration-200"
            >
              Aller à mon profil
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
