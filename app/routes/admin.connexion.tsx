import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  createAdminSession,
  hashPassword,
  isAdminAuthenticated,
  logAdminAction,
  recordFailedLogin,
  setAdminCookie,
  verifyPassword,
} from "~/lib/admin-session.server";
import type { AdminUserRow } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Admin — DDM Wigs" }];

async function countAdmins(db: D1Database): Promise<number> {
  try {
    const row = await db.prepare("SELECT COUNT(*) as count FROM admin_users").first<{ count: number }>();
    return row?.count ?? 0;
  } catch {
    return 0; // table absente = migration pas encore appliquée
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  if (await isAdminAuthenticated(request, context)) throw redirect("/admin/dashboard");
  const bootstrap = (await countAdmins(context.cloudflare.env.DB)) === 0;
  return json({ bootstrap });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB;

  // Rate limiting : 5 essais / 15 min par IP
  const lockedFor = await checkLoginRateLimit(request, context);
  if (lockedFor > 0) {
    return json(
      { error: `Trop de tentatives. Réessayez dans ${Math.ceil(lockedFor / 60)} min.` },
      { status: 429 }
    );
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!email || !password) {
    return json({ error: "Email et mot de passe requis." }, { status: 400 });
  }

  // ── Bootstrap : aucun compte → ADMIN_SECRET crée le premier propriétaire ──
  const adminCount = await countAdmins(db);
  if (adminCount === 0) {
    const secret = env.ADMIN_SECRET;
    if (!secret) {
      return json({ error: "Configuration manquante (ADMIN_SECRET non défini)." }, { status: 500 });
    }
    if (password !== secret) {
      await recordFailedLogin(request, context);
      await logAdminAction(context, { admin: { email }, action: "login_failed", details: { reason: "bootstrap_bad_secret" }, request });
      return json({ error: "Mot de passe incorrect." }, { status: 401 });
    }
    const name = String(form.get("name") ?? "").trim() || "Propriétaire";
    const newPassword = String(form.get("new_password") ?? "");
    if (newPassword.length < 12) {
      return json(
        { error: "Choisissez un nouveau mot de passe personnel d'au moins 12 caractères." },
        { status: 400 }
      );
    }
    const hash = await hashPassword(newPassword);
    const inserted = await db
      .prepare(
        `INSERT INTO admin_users (email, name, password_hash, role, last_login_at)
         VALUES (?, ?, ?, 'owner', datetime('now')) RETURNING id`
      )
      .bind(email, name, hash)
      .first<{ id: number }>();

    const user = { id: inserted!.id, email, name, role: "owner" as const };
    await clearLoginAttempts(request, context);
    await logAdminAction(context, { admin: user, action: "user.bootstrap", entity: "admin_user", entityId: user.id, request });
    await logAdminAction(context, { admin: user, action: "login", request });
    const sid = await createAdminSession(context, user);
    throw redirect("/admin/dashboard", { headers: { "Set-Cookie": setAdminCookie(sid) } });
  }

  // ── Connexion normale ──
  const row = await db
    .prepare("SELECT id, email, name, role, password_hash, active FROM admin_users WHERE email = ?")
    .bind(email)
    .first<AdminUserRow>();

  const valid = row && row.active === 1 && (await verifyPassword(password, row.password_hash));
  if (!valid) {
    await recordFailedLogin(request, context);
    await logAdminAction(context, { admin: { email }, action: "login_failed", request });
    return json({ error: "Email ou mot de passe incorrect." }, { status: 401 });
  }

  await clearLoginAttempts(request, context);
  await db.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?").bind(row.id).run();

  const user = { id: row.id, email: row.email, name: row.name, role: row.role };
  await logAdminAction(context, { admin: user, action: "login", request });
  const sid = await createAdminSession(context, user);
  throw redirect("/admin/dashboard", { headers: { "Set-Cookie": setAdminCookie(sid) } });
}

const inputCls =
  "w-full bg-white/5 border border-white/20 text-white px-4 py-3 focus:outline-none focus:border-primary-container text-sm";
const labelCls = "block text-white/50 text-xs uppercase tracking-widest mb-2";

export default function AdminConnexion() {
  const { bootstrap } = useLoaderData<typeof loader>();
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
          {bootstrap && (
            <div className="mb-6 p-3 bg-primary/10 border border-primary/30 text-primary-container text-xs rounded leading-relaxed">
              <strong>Première connexion.</strong> Entrez le mot de passe maître (ADMIN_SECRET) puis
              choisissez votre compte personnel — le mot de passe maître ne servira plus ensuite.
            </div>
          )}
          {data?.error && (
            <div className="mb-6 p-3 bg-error/20 border border-error/40 text-red-300 text-sm rounded">
              {data.error}
            </div>
          )}
          <Form method="post" className="space-y-5">
            {bootstrap && (
              <div>
                <label className={labelCls}>Votre nom</label>
                <input type="text" name="name" required className={inputCls} placeholder="Ex. Dave" />
              </div>
            )}
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" name="email" required autoFocus className={inputCls} autoComplete="username" />
            </div>
            <div>
              <label className={labelCls}>{bootstrap ? "Mot de passe maître (ADMIN_SECRET)" : "Mot de passe"}</label>
              <input
                type="password"
                name="password"
                required
                className={inputCls}
                autoComplete={bootstrap ? "off" : "current-password"}
              />
            </div>
            {bootstrap && (
              <div>
                <label className={labelCls}>Nouveau mot de passe personnel (12+ caractères)</label>
                <input type="password" name="new_password" required minLength={12} className={inputCls} autoComplete="new-password" />
              </div>
            )}
            <button
              type="submit"
              disabled={nav.state === "submitting"}
              className="w-full bg-primary text-on-primary py-3 text-sm font-semibold uppercase tracking-wider hover:bg-primary-container hover:text-on-primary-container transition-colors disabled:opacity-60"
            >
              {nav.state === "submitting" ? "Connexion…" : bootstrap ? "Créer mon compte" : "Accéder à l'admin"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
