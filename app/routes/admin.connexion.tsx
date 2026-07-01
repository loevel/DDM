import { redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/react";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import {
  createAdminSession,
  isAdminAuthenticated,
  setAdminCookie,
} from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Admin — DDM Wigs" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  if (await isAdminAuthenticated(request, context)) throw redirect("/admin/dashboard");
  return null;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const secret = context.cloudflare.env.ADMIN_SECRET;
  if (!secret) return { error: "Configuration manquante (ADMIN_SECRET non défini)." };

  if (password !== secret) {
    return { error: "Mot de passe incorrect." };
  }

  const sid = await createAdminSession(context);
  throw redirect("/admin/dashboard", {
    headers: { "Set-Cookie": setAdminCookie(sid) },
  });
}

export default function AdminConnexion() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <div className="min-h-screen bg-[#1b1c1c] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <p className="text-primary-container font-bold tracking-[0.2em] uppercase text-xl mb-1">DDM Wigs</p>
          <p className="text-white/40 text-xs uppercase tracking-widest">Espace administration</p>
        </div>
        <div className="bg-white/5 border border-white/10 p-8">
          {data?.error && (
            <div className="mb-6 p-3 bg-error/20 border border-error/40 text-red-300 text-sm rounded">
              {data.error}
            </div>
          )}
          <Form method="post" className="space-y-5">
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-widest mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                name="password"
                required
                autoFocus
                className="w-full bg-white/5 border border-white/20 text-white px-4 py-3 focus:outline-none focus:border-primary-container text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={nav.state === "submitting"}
              className="w-full bg-primary text-on-primary py-3 text-sm font-semibold uppercase tracking-wider hover:bg-primary-container hover:text-on-primary-container transition-colors disabled:opacity-60"
            >
              {nav.state === "submitting" ? "Connexion…" : "Accéder à l'admin"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
