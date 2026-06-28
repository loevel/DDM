import type { MetaFunction } from "@remix-run/react";
import { Link, useSearchParams } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Lien envoyé — DDM Wigs & More" }];

export default function LienEnvoye() {
  const [params] = useSearchParams();
  const email = params.get("email") ?? "votre email";

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-container/20 rounded-full mb-8">
          <span className="material-symbols-outlined text-primary text-3xl">mark_email_read</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-4">Vérifiez vos emails</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mb-2">
          Un lien de connexion a été envoyé à
        </p>
        <p className="font-headline-sm text-headline-sm text-primary mb-8">{email}</p>
        <p className="font-body-sm text-body-sm text-on-surface-variant mb-10">
          Le lien est valide pendant <strong>15 minutes</strong>. Vérifiez aussi vos courriers indésirables si vous ne le trouvez pas.
        </p>
        <Link
          to="/compte/connexion"
          className="font-label-md text-label-md text-primary border-b border-primary hover:opacity-70 transition-opacity"
        >
          Renvoyer un nouveau lien
        </Link>
      </div>
    </div>
  );
}
