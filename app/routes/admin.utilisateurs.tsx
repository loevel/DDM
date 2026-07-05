import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation, useSearchParams } from "@remix-run/react";
import {
  getAdminUser,
  getAdminSessionId,
  hashPassword,
  destroyUserSessions,
  logAdminAction,
} from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Utilisateurs — Admin DDM" }];

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: "owner" | "staff";
  active: number;
  last_login_at: string | null;
  created_at: string;
};

type AuditRow = {
  id: number;
  admin_email: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: string | null;
  ip: string | null;
  created_at: string;
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const me = await getAdminUser(request, context);
  if (!me) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const auditFilter = url.searchParams.get("audit") ?? "";

  const { results: users } = await db
    .prepare("SELECT id, email, name, role, active, last_login_at, created_at FROM admin_users ORDER BY created_at ASC")
    .all<UserRow>();

  const auditQuery = auditFilter
    ? db.prepare("SELECT * FROM admin_audit_log WHERE admin_email = ? ORDER BY created_at DESC LIMIT 100").bind(auditFilter)
    : db.prepare("SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 100");
  const { results: audit } = await auditQuery.all<AuditRow>();

  return json({ me, users: users ?? [], audit: audit ?? [], auditFilter });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const me = await getAdminUser(request, context);
  if (!me) throw redirect("/admin/connexion");
  if (me.role !== "owner") {
    return json({ error: "Seul un compte propriétaire peut gérer les utilisateurs." }, { status: 403 });
  }

  const db = context.cloudflare.env.DB;
  const form = await request.formData();
  const intent = String(form.get("_action") ?? "");

  if (intent === "create") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const role = form.get("role") === "owner" ? "owner" : "staff";

    if (!email || !name) return json({ error: "Email et nom requis." }, { status: 400 });
    if (password.length < 12) return json({ error: "Mot de passe : 12 caractères minimum." }, { status: 400 });

    const existing = await db.prepare("SELECT id FROM admin_users WHERE email = ?").bind(email).first();
    if (existing) return json({ error: "Un compte existe déjà avec cet email." }, { status: 400 });

    const hash = await hashPassword(password);
    const inserted = await db
      .prepare("INSERT INTO admin_users (email, name, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id")
      .bind(email, name, hash, role)
      .first<{ id: number }>();

    await logAdminAction(context, {
      admin: me, action: "user.create", entity: "admin_user", entityId: inserted?.id,
      details: { email, name, role }, request,
    });
    return json({ ok: `Compte ${email} créé.` });
  }

  const targetId = Number(form.get("user_id") ?? 0);
  const target = await db
    .prepare("SELECT id, email, role, active FROM admin_users WHERE id = ?")
    .bind(targetId)
    .first<UserRow>();
  if (!target) return json({ error: "Compte introuvable." }, { status: 404 });

  if (intent === "toggle_active") {
    if (target.id === me.id) return json({ error: "Vous ne pouvez pas désactiver votre propre compte." }, { status: 400 });
    const newActive = target.active === 1 ? 0 : 1;
    await db.prepare("UPDATE admin_users SET active = ?, updated_at = datetime('now') WHERE id = ?").bind(newActive, target.id).run();
    // Un compte désactivé perd immédiatement ses sessions actives
    if (!newActive) await destroyUserSessions(context, target.id);
    await logAdminAction(context, {
      admin: me, action: newActive ? "user.reactivate" : "user.deactivate",
      entity: "admin_user", entityId: target.id, details: { email: target.email }, request,
    });
    return json({ ok: `Compte ${target.email} ${newActive ? "réactivé" : "désactivé"}.` });
  }

  if (intent === "reset_password") {
    const password = String(form.get("password") ?? "");
    if (password.length < 12) return json({ error: "Mot de passe : 12 caractères minimum." }, { status: 400 });
    const hash = await hashPassword(password);
    await db.prepare("UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(hash, target.id).run();
    // Invalide les sessions du compte ; si l'owner se reset lui-même, sa session courante survit
    await destroyUserSessions(context, target.id, target.id === me.id ? getAdminSessionId(request) : null);
    await logAdminAction(context, {
      admin: me, action: "user.reset_password", entity: "admin_user", entityId: target.id,
      details: { email: target.email }, request,
    });
    return json({ ok: `Mot de passe de ${target.email} réinitialisé.` });
  }

  return json({ error: "Action inconnue." }, { status: 400 });
}

const ACTION_FR: Record<string, string> = {
  login: "Connexion",
  login_failed: "Échec connexion",
  logout: "Déconnexion",
  "user.bootstrap": "Premier compte créé",
  "user.create": "Compte créé",
  "user.deactivate": "Compte désactivé",
  "user.reactivate": "Compte réactivé",
  "user.reset_password": "Mot de passe réinitialisé",
  "user.change_password": "Mot de passe modifié (par soi-même)",
  "user.change_password_failed": "Échec changement mot de passe",
  "order.update_status": "Statut commande modifié",
  "product.create": "Produit créé",
  "product.update": "Produit modifié",
  "product.delete": "Produit supprimé",
};

export default function AdminUtilisateurs() {
  const { me, users, audit, auditFilter } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const [, setSearchParams] = useSearchParams();
  const isOwner = me.role === "owner";

  const inputCls = "w-full bg-surface border border-outline-variant/40 rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary";

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-2">Utilisateurs & audit</h1>
      <p className="text-sm text-on-surface-variant mb-8">
        Comptes d'accès à l'administration et journal des actions.
      </p>

      {data && "error" in data && data.error && (
        <div className="mb-6 p-3 bg-error/10 border border-error/30 text-error text-sm rounded">{data.error}</div>
      )}
      {data && "ok" in data && data.ok && (
        <div className="mb-6 p-3 bg-green-50 border border-green-300 text-green-800 text-sm rounded">{data.ok}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Liste des comptes */}
        <div className="lg:col-span-2 bg-surface border border-outline-variant/30 rounded">
          <div className="px-5 py-4 border-b border-outline-variant/20">
            <h2 className="font-semibold text-on-surface">Comptes admin</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="text-left px-5 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Nom</th>
                <th className="text-left px-3 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Rôle</th>
                <th className="text-left px-3 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Dernière connexion</th>
                <th className="text-right px-5 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {users.map(u => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="px-5 py-3">
                    <p className="text-on-surface font-medium">{u.name} {u.id === me.id && <span className="text-xs text-primary">(vous)</span>}</p>
                    <p className="text-xs text-on-surface-variant">{u.email}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${u.role === "owner" ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-600"}`}>
                      {u.role === "owner" ? "Propriétaire" : "Employé"}
                    </span>
                    {!u.active && <span className="ml-1 inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-100 text-red-700">Désactivé</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-on-surface-variant">
                    {u.last_login_at ? new Date(u.last_login_at + "Z").toLocaleString("fr-CA") : "Jamais"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {isOwner && u.id !== me.id && (
                      <Form method="post" className="inline">
                        <input type="hidden" name="_action" value="toggle_active" />
                        <input type="hidden" name="user_id" value={u.id} />
                        <button type="submit" className="text-xs text-primary hover:underline">
                          {u.active ? "Désactiver" : "Réactiver"}
                        </button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Créer un compte */}
        {isOwner && (
          <div className="bg-surface border border-outline-variant/30 rounded h-fit">
            <div className="px-5 py-4 border-b border-outline-variant/20">
              <h2 className="font-semibold text-on-surface">Nouveau compte</h2>
            </div>
            <Form method="post" className="p-5 space-y-4">
              <input type="hidden" name="_action" value="create" />
              <div>
                <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">Nom</label>
                <input type="text" name="name" required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">Email</label>
                <input type="email" name="email" required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">Mot de passe (12+ car.)</label>
                <input type="password" name="password" required minLength={12} className={inputCls} autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant uppercase tracking-wider mb-1.5">Rôle</label>
                <select name="role" className={inputCls}>
                  <option value="staff">Employé</option>
                  <option value="owner">Propriétaire</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={nav.state === "submitting"}
                className="w-full bg-primary text-on-primary py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                Créer le compte
              </button>
            </Form>
          </div>
        )}
      </div>

      {/* Journal d'audit */}
      <div className="bg-surface border border-outline-variant/30 rounded">
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between">
          <h2 className="font-semibold text-on-surface">Journal d'audit — 100 dernières actions</h2>
          <select
            value={auditFilter}
            onChange={e => setSearchParams(e.target.value ? { audit: e.target.value } : {})}
            className="bg-surface border border-outline-variant/40 rounded px-2 py-1 text-xs text-on-surface"
          >
            <option value="">Tous les comptes</option>
            {users.map(u => (
              <option key={u.id} value={u.email}>{u.email}</option>
            ))}
          </select>
        </div>
        {audit.length === 0 ? (
          <p className="px-5 py-6 text-sm text-on-surface-variant">Aucune action enregistrée pour l'instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="text-left px-5 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Date</th>
                <th className="text-left px-3 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Qui</th>
                <th className="text-left px-3 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Action</th>
                <th className="text-left px-3 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">Cible</th>
                <th className="text-left px-5 py-3 text-on-surface-variant font-medium text-xs uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {audit.map(a => (
                <tr key={a.id}>
                  <td className="px-5 py-2.5 text-xs text-on-surface-variant whitespace-nowrap">
                    {new Date(a.created_at + "Z").toLocaleString("fr-CA")}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-on-surface">{a.admin_email}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium ${a.action === "login_failed" ? "text-error" : "text-on-surface"}`}>
                      {ACTION_FR[a.action] ?? a.action}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-on-surface-variant">
                    {a.entity ? `${a.entity} #${a.entity_id ?? "?"}` : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-xs font-mono text-on-surface-variant">{a.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
