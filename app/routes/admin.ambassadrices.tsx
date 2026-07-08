import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { Link } from "@remix-run/react";
import { requireAdmin, logAdminAction } from "~/lib/admin-session.server";
import { ambassadorApprovedEmail, sendEmail } from "~/lib/email.server";
import { isAmbassadorProgramEnabled } from "~/lib/settings.server";

export const meta: MetaFunction = () => [{ title: "Ambassadrices — Admin DDM" }];

interface Ambassador {
  id: number;
  name: string;
  email: string;
  code: string | null;
  social_handle: string | null;
  audience: string | null;
  message: string | null;
  discount_percent: number;
  commission_rate: number;
  status: string;
  total_sales_cad: number;
  total_commission_cad: number;
  paid_commission_cad: number;
  created_at: string;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;

  const [ambassadors, sales, stats, enabled] = await Promise.all([
    db.prepare(`
      SELECT * FROM ambassadors
      ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, created_at DESC
    `).all<Ambassador>(),
    db.prepare(`
      SELECT s.*, a.name as ambassador_name, a.code as ambassador_code
      FROM ambassador_sales s JOIN ambassadors a ON a.id = s.ambassador_id
      ORDER BY s.created_at DESC LIMIT 30
    `).all(),
    db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        COALESCE(SUM(total_sales_cad), 0) as sales,
        COALESCE(SUM(total_commission_cad - paid_commission_cad), 0) as owed
      FROM ambassadors
    `).first<{ active: number; pending: number; sales: number; owed: number }>(),
    isAmbassadorProgramEnabled(db),
  ]);

  return json({
    ambassadors: ambassadors.results ?? [],
    sales: sales.results ?? [],
    stats: stats ?? { active: 0, pending: 0, sales: 0, owed: 0 },
    enabled,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = Number(form.get("id"));
  if (!id) return json({ error: "Ambassadrice introuvable." }, { status: 400 });

  const amb = await db.prepare("SELECT * FROM ambassadors WHERE id = ?").bind(id).first<Ambassador>();
  if (!amb) return json({ error: "Ambassadrice introuvable." }, { status: 404 });

  if (intent === "approve") {
    const code = String(form.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const discount = Math.max(0, Math.min(50, Number(form.get("discount_percent")) || 10));
    const commission = Math.max(0, Math.min(50, Number(form.get("commission_rate")) || 10));
    if (code.length < 3) return json({ error: "Le code doit faire au moins 3 caractères." }, { status: 400 });

    // Unicité du code parmi les autres ambassadrices
    const clash = await db.prepare("SELECT id FROM ambassadors WHERE code = ? AND id <> ?").bind(code, id).first();
    if (clash) return json({ error: `Le code ${code} est déjà utilisé par une autre ambassadrice.` }, { status: 400 });

    // Le code devient un code promo standard → remise acheteuse via le checkout existant
    await db.prepare(`
      INSERT INTO promo_codes (code, type, value, min_order, usage_limit, active, expires_at)
      VALUES (?, 'percent', ?, 0, NULL, 1, NULL)
      ON CONFLICT(code) DO UPDATE SET type = 'percent', value = excluded.value, active = 1, expires_at = NULL
    `).bind(code, discount).run();

    await db.prepare(`
      UPDATE ambassadors
      SET status = 'active', code = ?, discount_percent = ?, commission_rate = ?, approved_at = datetime('now')
      WHERE id = ?
    `).bind(code, discount, commission, id).run();

    await logAdminAction(context, { admin, action: "ambassador_approve", entity: "ambassadors", entityId: id, details: code, request });

    // Email d'approbation à l'ambassadrice
    try {
      const apiKey = context.cloudflare.env.RESEND_API_KEY as string | undefined;
      if (apiKey) {
        const { subject, html } = ambassadorApprovedEmail({ name: amb.name, code, discountPercent: discount, commissionRate: commission });
        await sendEmail({ apiKey, to: amb.email, subject, html });
      }
    } catch (e) { console.error("[Ambassadrices] Email approbation échoué:", e); }

    return json({ ok: true });
  }

  if (intent === "reject" || intent === "suspend" || intent === "reactivate") {
    const newStatus = intent === "reactivate" ? "active" : intent === "reject" ? "rejected" : "suspended";
    await db.prepare("UPDATE ambassadors SET status = ? WHERE id = ?").bind(newStatus, id).run();
    // Désactiver / réactiver le code promo associé
    if (amb.code) {
      await db.prepare("UPDATE promo_codes SET active = ? WHERE code = ?")
        .bind(newStatus === "active" ? 1 : 0, amb.code).run();
    }
    await logAdminAction(context, { admin, action: `ambassador_${intent}`, entity: "ambassadors", entityId: id, request });
    return json({ ok: true });
  }

  if (intent === "mark_paid") {
    const owed = Math.round((amb.total_commission_cad - amb.paid_commission_cad) * 100) / 100;
    if (owed <= 0) return json({ error: "Aucune commission due." }, { status: 400 });
    await db.prepare("UPDATE ambassador_sales SET status = 'paid', paid_at = datetime('now') WHERE ambassador_id = ? AND status = 'pending'").bind(id).run();
    await db.prepare("UPDATE ambassadors SET paid_commission_cad = total_commission_cad WHERE id = ?").bind(id).run();
    await logAdminAction(context, { admin, action: "ambassador_pay", entity: "ambassadors", entityId: id, details: `${owed} $`, request });
    return json({ ok: true, paid: owed });
  }

  return json({ error: "Action inconnue." }, { status: 400 });
}

const STATUS = {
  pending:   { fr: "En attente", cls: "bg-yellow-100 text-yellow-800" },
  active:    { fr: "Active",     cls: "bg-green-100 text-green-800" },
  suspended: { fr: "Suspendue",  cls: "bg-gray-100 text-gray-600" },
  rejected:  { fr: "Refusée",    cls: "bg-red-100 text-red-700" },
} as const;

export default function AdminAmbassadrices() {
  const { ambassadors, sales, stats, enabled } = useLoaderData<typeof loader>();
  const pending = (ambassadors as Ambassador[]).filter(a => a.status === "pending");
  const others = (ambassadors as Ambassador[]).filter(a => a.status !== "pending");

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-8">Programme ambassadrices</h1>

      {!enabled && (
        <div className="mb-8 flex items-start gap-3 px-4 py-3 bg-tertiary-container/30 border border-tertiary/40 text-on-surface">
          <span className="material-symbols-outlined text-base text-tertiary mt-0.5">visibility_off</span>
          <p className="font-sans text-sm">
            La page publique du programme est <strong>désactivée</strong> : le lien
            « Devenir ambassadrice » n'apparaît pas sur la boutique et le formulaire de
            candidature est fermé. Tu peux toujours gérer les ambassadrices existantes ici.{" "}
            <Link to="/admin/parametres" className="text-primary underline">Activer dans les paramètres</Link>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Ambassadrices actives", value: stats.active ?? 0, icon: "groups" },
          { label: "Candidatures en attente", value: stats.pending ?? 0, icon: "hourglass_top" },
          { label: "CA généré", value: `${Number(stats.sales ?? 0).toFixed(0)} $`, icon: "trending_up" },
          { label: "Commissions dues", value: `${Number(stats.owed ?? 0).toFixed(2)} $`, icon: "payments" },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-outline-variant/30 p-5 rounded">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-widest text-on-surface-variant">{k.label}</span>
              <span className="material-symbols-outlined text-xl text-primary">{k.icon}</span>
            </div>
            <p className="text-2xl font-bold text-on-surface">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Candidatures en attente */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold text-on-surface mb-4">Candidatures à examiner ({pending.length})</h2>
          <div className="space-y-4">
            {pending.map(a => <PendingCard key={a.id} a={a} />)}
          </div>
        </div>
      )}

      {/* Ambassadrices */}
      <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-outline-variant/20">
          <h2 className="font-semibold text-on-surface">Ambassadrices</h2>
        </div>
        {others.length === 0 ? (
          <p className="px-5 py-10 text-sm text-on-surface-variant text-center">Aucune ambassadrice active pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr className="border-b border-outline-variant/30">
                {["Ambassadrice", "Code", "Remise / Comm.", "CA généré", "Commission due", "Statut", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {others.map(a => <AmbassadorRow key={a.id} a={a} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* Dernières ventes attribuées */}
      <div className="bg-surface border border-outline-variant/30 rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant/20">
          <h2 className="font-semibold text-on-surface">Ventes attribuées (30 dernières)</h2>
        </div>
        {(sales as any[]).length === 0 ? (
          <p className="px-5 py-10 text-sm text-on-surface-variant text-center">Aucune vente attribuée pour l'instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr className="border-b border-outline-variant/30">
                {["Ambassadrice", "Commande", "Montant", "Commission", "Statut", "Date"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {(sales as any[]).map((s: any) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 text-on-surface text-xs font-medium">{s.ambassador_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-primary">{s.order_reference}</td>
                  <td className="px-4 py-3 text-xs">{Number(s.sale_amount_cad).toFixed(2)} $</td>
                  <td className="px-4 py-3 text-xs font-semibold text-primary">{Number(s.commission_cad).toFixed(2)} $</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${s.status === "paid" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {s.status === "paid" ? "Payée" : "À payer"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">{new Date(s.created_at).toLocaleDateString("fr-CA")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function suggestCode(name: string): string {
  const base = (name.split(" ")[0] || "AMBA").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return `${base}${Math.floor(10 + Math.random() * 89)}`;
}

function PendingCard({ a }: { a: Ambassador }) {
  const fetcher = useFetcher<{ error?: string }>();
  const [code] = useState(() => suggestCode(a.name));

  return (
    <div className="bg-surface border border-outline-variant/40 rounded p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <p className="font-semibold text-on-surface">{a.name}</p>
          <p className="text-xs text-on-surface-variant">{a.email}</p>
          {a.social_handle && <p className="text-xs text-primary mt-1">{a.social_handle}</p>}
          {a.audience && <p className="text-xs text-on-surface-variant mt-0.5">Audience : {a.audience}</p>}
          {a.message && <p className="text-sm text-on-surface-variant mt-2 border-l-2 border-primary/40 pl-3 whitespace-pre-wrap">{a.message}</p>}
        </div>
      </div>

      <fetcher.Form method="post" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={a.id} />
        <input type="hidden" name="intent" value="approve" />
        <label className="text-xs text-on-surface-variant">
          Code<br />
          <input name="code" defaultValue={code} className="mt-1 w-32 border border-outline-variant bg-background px-2 py-1.5 text-sm font-mono uppercase" />
        </label>
        <label className="text-xs text-on-surface-variant">
          Remise %<br />
          <input name="discount_percent" type="number" min={0} max={50} defaultValue={a.discount_percent} className="mt-1 w-20 border border-outline-variant bg-background px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-on-surface-variant">
          Commission %<br />
          <input name="commission_rate" type="number" min={0} max={50} defaultValue={a.commission_rate} className="mt-1 w-20 border border-outline-variant bg-background px-2 py-1.5 text-sm" />
        </label>
        <button type="submit" disabled={fetcher.state !== "idle"}
          className="bg-primary text-on-primary text-xs font-bold uppercase tracking-wider px-4 py-2 hover:opacity-90 disabled:opacity-60">
          Approuver
        </button>
        <button type="submit" name="intent" value="reject" disabled={fetcher.state !== "idle"}
          className="border border-outline-variant text-on-surface-variant text-xs font-semibold uppercase tracking-wider px-4 py-2 hover:text-red-600 hover:border-red-300">
          Refuser
        </button>
      </fetcher.Form>
      {fetcher.data?.error && <p className="text-xs text-red-600 mt-2">{fetcher.data.error}</p>}
    </div>
  );
}

function AmbassadorRow({ a }: { a: Ambassador }) {
  const fetcher = useFetcher<{ error?: string }>();
  const owed = Math.round((a.total_commission_cad - a.paid_commission_cad) * 100) / 100;
  const st = STATUS[a.status as keyof typeof STATUS] ?? { fr: a.status, cls: "bg-gray-100 text-gray-600" };

  return (
    <tr className="hover:bg-surface-container-low transition-colors align-top">
      <td className="px-4 py-3">
        <p className="text-on-surface font-medium text-xs">{a.name}</p>
        <p className="text-on-surface-variant text-[11px]">{a.email}</p>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-primary">{a.code ?? "—"}</td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">-{a.discount_percent}% / {a.commission_rate}%</td>
      <td className="px-4 py-3 text-xs">{Number(a.total_sales_cad).toFixed(0)} $</td>
      <td className="px-4 py-3 text-xs font-semibold text-primary">{owed.toFixed(2)} $</td>
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${st.cls}`}>{st.fr}</span>
      </td>
      <td className="px-4 py-3">
        <fetcher.Form method="post" className="flex flex-col gap-1.5">
          <input type="hidden" name="id" value={a.id} />
          {owed > 0 && (
            <button type="submit" name="intent" value="mark_paid" disabled={fetcher.state !== "idle"}
              className="bg-primary text-on-primary text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 hover:opacity-90 disabled:opacity-60 whitespace-nowrap">
              Payer {owed.toFixed(2)} $
            </button>
          )}
          {a.status === "active" ? (
            <button type="submit" name="intent" value="suspend" disabled={fetcher.state !== "idle"}
              className="border border-outline-variant text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 hover:text-red-600">
              Suspendre
            </button>
          ) : (
            <button type="submit" name="intent" value="reactivate" disabled={fetcher.state !== "idle"}
              className="border border-outline-variant text-on-surface-variant text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 hover:text-green-700">
              Réactiver
            </button>
          )}
        </fetcher.Form>
        {fetcher.data?.error && <p className="text-[10px] text-red-600 mt-1">{fetcher.data.error}</p>}
      </td>
    </tr>
  );
}
