import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  getAdminUser,
  getAdminSessionId,
  requireAdmin,
  hashPassword,
  verifyPassword,
  destroyUserSessions,
  logAdminAction,
} from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Mon compte — Admin DDM" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const me = await getAdminUser(request, context);
  if (!me) throw redirect("/admin/connexion");

  const row = await context.cloudflare.env.DB
    .prepare("SELECT last_login_at, created_at FROM admin_users WHERE id = ?")
    .bind(me.id)
    .first<{ last_login_at: string | null; created_at: string }>();

  return json({ me, lastLoginAt: row?.last_login_at ?? null, createdAt: row?.created_at ?? null });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const me = await requireAdmin(request, context);
  // Sessions "legacy" (avant les comptes nominatifs) : pas de mot de passe vérifiable
  if (!me.id) {
    return json({ error: "Session héritée sans compte associé. Reconnectez-vous d'abord." }, { status: 400 });
  }

  const db = context.cloudflare.env.DB;
  const form = await request.formData();
  const currentPassword = String(form.get("current_password") ?? "");
  const newPassword = String(form.get("new_password") ?? "");
  const confirmPassword = String(form.get("confirm_password") ?? "");

  if (newPassword.length < 12) {
    return json({ error: "Nouveau mot de passe : 12 caractères minimum." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return json({ error: "La confirmation ne correspond pas au nouveau mot de passe." }, { status: 400 });
  }

  const row = await db
    .prepare("SELECT password_hash FROM admin_users WHERE id = ? AND active = 1")
    .bind(me.id)
    .first<{ password_hash: string }>();
  if (!row) return json({ error: "Compte introuvable ou désactivé." }, { status: 404 });

  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) {
    await logAdminAction(context, {
      admin: me, action: "user.change_password_failed", entity: "admin_user", entityId: me.id,
      details: { reason: "mot de passe actuel invalide" }, request,
    });
    return json({ error: "Mot de passe actuel incorrect." }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return json({ error: "Le nouveau mot de passe doit être différent de l'actuel." }, { status: 400 });
  }

  const hash = await hashPassword(newPassword);
  await db
    .prepare("UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(hash, me.id)
    .run();

  // Invalide toutes les autres sessions du compte — seule la session courante survit
  await destroyUserSessions(context, me.id, getAdminSessionId(request));

  await logAdminAction(context, {
    admin: me, action: "user.change_password", entity: "admin_user", entityId: me.id,
    details: { email: me.email }, request,
  });

  return json({ ok: "Votre mot de passe a été modifié. Vos autres sessions ont été déconnectées." });
}

export default function AdminMonCompte() {
  const { me, lastLoginAt, createdAt } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const inputCls = "w-full bg-surface border border-outline-variant/40 rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary";

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-on-surface mb-2">Mon compte</h1>
      <p className="text-sm text-on-surface-variant mb-8">
        Informations de votre compte et changement de mot de passe.
      </p>

      {data && "error" in data && data.error && (
        <div className="mb-6 p-3 bg-error/10 border border-error/30 text-error text-sm rounded">{data.error}</div>
      )}
      {data && "ok" in data && data.ok && (
        <div className="mb-6 p-3 bg-green-50 border border-green-300 text-green-800 text-sm rounded">{data.ok}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Infos du compte */}
        <div className="bg-surface border border-outline-variant/30 rounded h-fit">
          <div className="px-5 py-4 border-b border-outline-variant/20">
            <h2 className="font-semibold text-on-surface">Informations</h2>
          </div>
          <dl className="p-5 space-y-4 text-sm">
            <div>
              <dt className="text-xs text-on-surface-variant uppercase tracking-wider mb-0.5">Nom</dt>
              <dd className="text-on-surface font-medium">{me.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant uppercase tracking-wider mb-0.5">Email</dt>
              <dd className="text-on-surface">{me.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant uppercase tracking-wider mb-0.5">Rôle</dt>
              <dd>
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${me.role === "owner" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-600"}`}>
                  {me.role === "owner" ? "Propriétaire" : "Employé"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant uppercase tracking-wider mb-0.5">Dernière connexion</dt>
              <dd className="text-on-surface-variant">
                {lastLoginAt ? new Date(lastLoginAt + "Z").toLocaleString("fr-CA") : "—"}
              </dd>
            </div>
            {createdAt && (
              <div>
                <dt className="text-xs text-on-surface-variant uppercase tracking-wider mb-0.5">Compte créé le</dt>
                <dd className="text-on-surface-variant">{new Date(createdAt + "Z").toLocaleDateString("fr-CA")}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Changer le mot de passe */}
        <div className="bg-surface border border-outline-variant/30 rounded h-fit">
          <div className="px-5 py-4 border-b border-outline-variant/20">
            <h2 className="font-semibold text-on-surface">Changer mon mot de passe</h2>
          </div>
          <Form method="post" className="p-5 space-y-4">
            <div>
              <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">Mot de passe actuel</label>
              <input type="password" name="current_password" required className={inputCls} autoComplete="current-password" />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">Nouveau mot de passe (12+ car.)</label>
              <input type="password" name="new_password" required minLength={12} className={inputCls} autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">Confirmer le nouveau mot de passe</label>
              <input type="password" name="confirm_password" required minLength={12} className={inputCls} autoComplete="new-password" />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-on-primary py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {submitting ? "Modification…" : "Modifier le mot de passe"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
