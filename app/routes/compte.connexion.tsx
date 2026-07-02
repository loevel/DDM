import { redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { sendMagicLink } from "~/lib/auth.server";
import { getCustomerId } from "~/lib/session.server";

export const meta: MetaFunction = () => [
  { title: "Connexion — DDM Wigs & More" },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = await getCustomerId(request, context);
  if (customerId) throw redirect("/compte/tableau-de-bord");
  return null;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Veuillez entrer une adresse email valide." };
  }

  try {
    await sendMagicLink(email, context, request);
  } catch (e) {
    console.error(e);
    return { error: "Une erreur est survenue. Veuillez réessayer." };
  }

  throw redirect(`/compte/lien-envoye?email=${encodeURIComponent(email)}`);
}

export default function Connexion() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const loading = nav.state === "submitting";

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <p className="font-headline-md text-headline-md text-primary tracking-widest uppercase mb-1">DDM Wigs & More</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">Votre espace client</p>
        </div>

        <div className="bg-surface border border-outline-variant/30 p-8 md:p-10">
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">Connexion</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mb-8">
            Entrez votre email et nous vous enverrons un lien de connexion sécurisé.
          </p>

          {actionData?.error && (
            <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm rounded-sm">
              {actionData.error}
            </div>
          )}

          <Form method="post" className="space-y-6">
            <div className="relative">
              <input
                type="email"
                name="email"
                id="email"
                required
                placeholder=" "
                autoComplete="email"
                className="peer w-full pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary font-body-md text-body-md transition-colors pl-0"
              />
              <label
                htmlFor="email"
                className="absolute left-0 top-5 text-on-surface-variant font-label-md text-label-md transition-all duration-300 peer-focus:-top-1 peer-focus:text-xs peer-focus:text-primary peer-[&:not(:placeholder-shown)]:-top-1 peer-[&:not(:placeholder-shown)]:text-xs"
              >
                Adresse email
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider py-4 hover:bg-on-primary-container transition-colors duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? "Envoi en cours…" : (
                <>
                  Recevoir le lien de connexion
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </>
              )}
            </button>
          </Form>

          <p className="font-body-sm text-body-sm text-on-surface-variant mt-8 text-center">
            Première fois ? Votre compte sera créé automatiquement.
          </p>
        </div>
      </div>
    </div>
  );
}
