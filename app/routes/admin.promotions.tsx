import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { getDB } from "~/lib/db.server";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

interface PromoCode {
  id: number;
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_order: number;
  usage_limit: number | null;
  used_count: number;
  active: number;
  expires_at: string | null;
  created_at: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = getDB(context);
  const codes = (await db.prepare(
    "SELECT * FROM promo_codes ORDER BY created_at DESC"
  ).all<PromoCode>()).results ?? [];

  return json({ codes });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = getDB(context);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const code = (form.get("code") as string)?.trim().toUpperCase();
    const type = form.get("type") as "percent" | "fixed";
    const value = parseFloat(form.get("value") as string);
    const minOrder = parseFloat(form.get("min_order") as string) || 0;
    const usageLimit = form.get("usage_limit") ? parseInt(form.get("usage_limit") as string) : null;
    const expiresAt = (form.get("expires_at") as string) || null;

    if (!code || !type || isNaN(value) || value <= 0) {
      return json({ error: "Données invalides" }, { status: 400 });
    }

    try {
      await db.prepare(
        "INSERT INTO promo_codes (code, type, value, min_order, usage_limit, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(code, type, value, minOrder, usageLimit, expiresAt).run();
    } catch {
      return json({ error: "Ce code existe déjà" }, { status: 400 });
    }
  }

  if (intent === "toggle") {
    const id = parseInt(form.get("id") as string);
    await db.prepare(
      "UPDATE promo_codes SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?"
    ).bind(id).run();
  }

  if (intent === "delete") {
    const id = parseInt(form.get("id") as string);
    await db.prepare("DELETE FROM promo_codes WHERE id = ?").bind(id).run();
  }

  return json({ ok: true });
}

export default function AdminPromotions() {
  const { codes } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [showForm, setShowForm] = useState(false);

  const pendingId = fetcher.state !== "idle" && fetcher.formData
    ? parseInt(fetcher.formData.get("id") as string)
    : null;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl text-on-surface mb-1">Codes de réduction</h1>
          <p className="font-sans text-sm text-on-surface-variant">
            {codes.filter(c => c.active).length} actif(s) · {codes.length} au total
          </p>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined text-base">{showForm ? "close" : "add"}</span>
          {showForm ? "Annuler" : "Nouveau code"}
        </button>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <fetcher.Form method="post" onSubmit={() => setTimeout(() => setShowForm(false), 100)}
          className="bg-surface border border-outline-variant/40 p-6 mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <input type="hidden" name="intent" value="create" />

          <div className="lg:col-span-3">
            <p className="font-sans text-sm font-bold text-on-surface uppercase tracking-wider">
              Créer un nouveau code
            </p>
          </div>

          <div>
            <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">Code *</label>
            <input name="code" required placeholder="EX : SUMMER25"
              className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm font-bold uppercase tracking-widest focus:outline-none focus:border-primary transition-colors" />
            <p className="font-sans text-[11px] text-on-surface-variant mt-1">Automatiquement en majuscules</p>
          </div>

          <div>
            <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">Type *</label>
            <select name="type" required
              className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors">
              <option value="percent">Pourcentage (%)</option>
              <option value="fixed">Montant fixe ($)</option>
            </select>
          </div>

          <div>
            <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">Valeur *</label>
            <input name="value" type="number" required min="0.01" step="0.01" placeholder="10"
              className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors" />
            <p className="font-sans text-[11px] text-on-surface-variant mt-1">Ex : 10 = 10% ou 10 $</p>
          </div>

          <div>
            <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">Commande minimum ($)</label>
            <input name="min_order" type="number" min="0" step="0.01" placeholder="0 (aucun minimum)"
              className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors" />
          </div>

          <div>
            <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">Limite d'utilisations</label>
            <input name="usage_limit" type="number" min="1" placeholder="Illimité"
              className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors" />
          </div>

          <div>
            <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">Date d'expiration</label>
            <input name="expires_at" type="date"
              className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors" />
          </div>

          <div className="lg:col-span-3 flex justify-end pt-2">
            <button type="submit"
              className="px-8 py-2.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
              Créer le code
            </button>
          </div>
        </fetcher.Form>
      )}

      {/* Table */}
      {codes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">sell</span>
          <p className="font-sans text-base text-on-surface-variant">Aucun code de réduction créé</p>
          <p className="font-sans text-sm text-on-surface-variant/60 mt-1">Cliquez sur « Nouveau code » pour commencer</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-sans text-sm">
            <thead>
              <tr className="border-b border-outline-variant">
                {["Code", "Réduction", "Min. commande", "Utilisations", "Expiration", "Statut", ""].map(h => (
                  <th key={h} className="text-left py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {codes.map(c => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                const limitReached = c.usage_limit !== null && c.used_count >= c.usage_limit;
                const effectively_active = c.active && !expired && !limitReached;
                return (
                  <tr key={c.id} className={`transition-opacity ${pendingId === c.id ? "opacity-40 pointer-events-none" : ""}`}>
                    <td className="py-3.5 px-3">
                      <span className="font-bold tracking-widest text-on-surface bg-surface-container-high px-2.5 py-1 text-xs font-mono">
                        {c.code}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-bold text-primary">
                      {c.type === "percent" ? `-${c.value}%` : `-${c.value.toFixed(2)} $`}
                    </td>
                    <td className="py-3.5 px-3 text-on-surface-variant">
                      {c.min_order > 0 ? `${c.min_order.toFixed(2)} $` : "—"}
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={limitReached ? "text-error font-semibold" : "text-on-surface-variant"}>
                        {c.used_count}
                        {c.usage_limit !== null && <span className="text-outline-variant"> / {c.usage_limit}</span>}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      {c.expires_at ? (
                        <span className={expired ? "text-error font-semibold" : "text-on-surface-variant"}>
                          {new Date(c.expires_at).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" })}
                          {expired && " (expiré)"}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit"
                          className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 border transition-colors whitespace-nowrap ${
                            effectively_active
                              ? "border-secondary/40 text-secondary hover:bg-secondary/10"
                              : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                          }`}>
                          <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: effectively_active ? "'FILL' 1" : "'FILL' 0" }}>
                            {effectively_active ? "check_circle" : "radio_button_unchecked"}
                          </span>
                          {c.active ? "Actif" : "Inactif"}
                        </button>
                      </fetcher.Form>
                    </td>
                    <td className="py-3.5 px-3">
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" title="Supprimer"
                          className="text-on-surface-variant/40 hover:text-error transition-colors">
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </fetcher.Form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
