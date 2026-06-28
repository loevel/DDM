import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/react";
import { Link, useLoaderData } from "@remix-run/react";
import { validateToken } from "~/lib/auth.server";
import { createSession, setSessionCookie } from "~/lib/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return { valid: false };

  const customerId = await validateToken(token, context);
  if (!customerId) return { valid: false };

  const sessionId = await createSession(customerId, context);

  throw redirect("/compte/tableau-de-bord", {
    headers: { "Set-Cookie": setSessionCookie(sessionId) },
  });
}

export default function Auth() {
  const { valid } = useLoaderData<typeof loader>();
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-error-container rounded-full mb-8">
          <span className="material-symbols-outlined text-on-error-container text-3xl">
            {valid ? "check_circle" : "error"}
          </span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-4">
          Lien invalide ou expiré
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-8">
          Ce lien a déjà été utilisé ou a expiré. Demandez-en un nouveau.
        </p>
        <Link
          to="/compte/connexion"
          className="inline-flex items-center gap-2 bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider px-8 py-4 hover:bg-on-primary-container transition-colors"
        >
          Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
