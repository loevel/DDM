import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect, useState } from "react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";
import { getDB } from "~/lib/db.server";

export const meta: MetaFunction = () => [{ title: "Paniers abandonnés — Admin DDM" }];

interface AbandonedCart {
  id: number;
  cart_id: string;
  email: string | null;
  customer_name: string | null;
  items_json: string;
  total_cad: number;
  status: string;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  reminder_3_sent_at: string | null;
  recovery_promo_code: string | null;
  order_reference: string | null;
  created_at: string;
  updated_at: string;
  minutes_inactive: number;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw new Response("Non autorisé", { status: 401 });

  const db = getDB(context);
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "abandoned";

  let whereClause = "";
  if (filter === "abandoned") {
    whereClause = "WHERE ac.status IN ('active','abandoned') AND ac.email IS NOT NULL AND ROUND((julianday('now') - julianday(ac.updated_at)) * 24 * 60) > 60";
  } else if (filter === "active") {
    whereClause = "WHERE ac.status = 'active' AND ROUND((julianday('now') - julianday(ac.updated_at)) * 24 * 60) <= 60";
  } else if (filter === "recovered") {
    whereClause = "WHERE ac.status = 'recovered'";
  } else if (filter === "all") {
    whereClause = "WHERE ac.email IS NOT NULL";
  }

  let carts: AbandonedCart[] = [];
  let stats = { total_abandoned: 0, total_value: 0, recovered: 0, recovery_rate: 0 };

  try {
    const { results } = await db.prepare(`
      SELECT ac.*,
        ROUND((julianday('now') - julianday(ac.updated_at)) * 24 * 60) as minutes_inactive
      FROM abandoned_carts ac
      ${whereClause}
      ORDER BY ac.total_cad DESC, ac.updated_at DESC
      LIMIT 100
    `).all<AbandonedCart>();
    carts = results;

    // Marquer automatiquement comme abandonnés les paniers actifs > 1h avec email
    await db.prepare(`
      UPDATE abandoned_carts
      SET status = 'abandoned'
      WHERE status = 'active'
        AND email IS NOT NULL
        AND ROUND((julianday('now') - julianday(updated_at)) * 24 * 60) > 60
    `).run();

    const statsRow = await db.prepare(`
      SELECT
        COUNT(CASE WHEN status IN ('active','abandoned') AND email IS NOT NULL AND ROUND((julianday('now') - julianday(updated_at)) * 24 * 60) > 60 THEN 1 END) as total_abandoned,
        COALESCE(SUM(CASE WHEN status IN ('active','abandoned') AND email IS NOT NULL AND ROUND((julianday('now') - julianday(updated_at)) * 24 * 60) > 60 THEN total_cad ELSE 0 END), 0) as total_value,
        COUNT(CASE WHEN status = 'recovered' THEN 1 END) as recovered,
        COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as with_email
      FROM abandoned_carts
    `).first<{ total_abandoned: number; total_value: number; recovered: number; with_email: number }>();

    if (statsRow) {
      const total = statsRow.total_abandoned + statsRow.recovered;
      stats = {
        total_abandoned: statsRow.total_abandoned,
        total_value: statsRow.total_value,
        recovered: statsRow.recovered,
        recovery_rate: total > 0 ? Math.round((statsRow.recovered / total) * 100) : 0,
      };
    }
  } catch {
    // Table pas encore créée
  }

  return json({ carts, stats, filter });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) return json({ error: "Non autorisé" }, { status: 401 });

  const db = getDB(context);
  const form = await request.formData();
  const intent = form.get("intent") as string;
  const cartDbId = Number(form.get("cartDbId"));

  if (!cartDbId) return json({ error: "ID manquant" }, { status: 400 });

  if (intent === "recover") {
    await db.prepare("UPDATE abandoned_carts SET status = 'recovered', updated_at = datetime('now') WHERE id = ?")
      .bind(cartDbId).run();
    return json({ ok: true });
  }

  if (intent === "generate_promo") {
    const existing = await db.prepare("SELECT recovery_promo_code FROM abandoned_carts WHERE id = ?")
      .bind(cartDbId).first<{ recovery_promo_code: string | null }>();

    if (existing?.recovery_promo_code) {
      return json({ ok: true, promoCode: existing.recovery_promo_code });
    }

    const code = "RETOUR" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19);

    try {
      await db.prepare("INSERT INTO promo_codes (code, type, value, active, expires_at, min_order_cad) VALUES (?, 'percent', 10, 1, ?, 0)")
        .bind(code, expiresAt).run();
    } catch { /* code déjà existant */ }

    await db.prepare("UPDATE abandoned_carts SET recovery_promo_code = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(code, cartDbId).run();

    return json({ ok: true, promoCode: code });
  }

  if (intent === "remind") {
    const reminderNum = form.get("reminderNum") as string;
    const field = reminderNum === "1" ? "reminder_1_sent_at" : reminderNum === "2" ? "reminder_2_sent_at" : "reminder_3_sent_at";
    await db.prepare(`UPDATE abandoned_carts SET ${field} = datetime('now'), status = 'abandoned', updated_at = datetime('now') WHERE id = ?`)
      .bind(cartDbId).run();
    return json({ ok: true });
  }

  return json({ error: "Action inconnue" }, { status: 400 });
}

function timeAgo(minutes: number): { label: string; urgency: "hot" | "warm" | "cold" | "frozen" } {
  if (minutes < 120) return { label: `${Math.round(minutes)}min`, urgency: "hot" };
  if (minutes < 1440) return { label: `${Math.round(minutes / 60)}h`, urgency: "warm" };
  if (minutes < 4320) return { label: `${Math.round(minutes / 1440)}j`, urgency: "cold" };
  return { label: `${Math.round(minutes / 1440)}j`, urgency: "frozen" };
}

const URGENCY_STYLE = {
  hot:    "bg-red-100 text-red-700 border-red-200",
  warm:   "bg-orange-100 text-orange-700 border-orange-200",
  cold:   "bg-blue-100 text-blue-700 border-blue-200",
  frozen: "bg-slate-100 text-slate-500 border-slate-200",
};

const URGENCY_ICON = {
  hot:    "local_fire_department",
  warm:   "schedule",
  cold:   "ac_unit",
  frozen: "snowing",
};

const URGENCY_LABEL = {
  hot:    "Chaud (< 2h)",
  warm:   "Tiède (2–24h)",
  cold:   "Froid (1–3j)",
  frozen: "Inactif (> 3j)",
};

function WhatsAppMessage({ cart, promoCode }: {
  cart: AbandonedCart;
  promoCode?: string | null;
}) {
  const items = JSON.parse(cart.items_json) as Array<{ name: string; quantity: number; price_cad: number }>;
  const lines = items.map(i => `• ${i.name} × ${i.quantity} = ${(i.price_cad * i.quantity).toFixed(2)} $`).join("\n");
  const firstName = cart.customer_name?.split(" ")[0] ?? "";
  const promo = promoCode || cart.recovery_promo_code;

  const msg = `Bonjour${firstName ? " " + firstName : ""} 👋

Vous avez laissé des articles dans votre panier DDM Wigs !

${lines}

💰 Total : ${cart.total_cad.toFixed(2)} $ CAD
${promo ? `\n🎁 Code promo exclusif : *${promo}* (-10%)\n` : ""}
Votre panier vous attend ici : https://ddmwigs.com/panier

Besoin d'aide ? Répondez à ce message 😊`;

  return msg;
}

function CartRow({ cart }: { cart: AbandonedCart }) {
  const fetcher = useFetcher<{ ok?: boolean; promoCode?: string }>();
  const revalidator = useRevalidator();
  const [showMsg, setShowMsg] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(cart.recovery_promo_code);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (fetcher.data?.promoCode) setPromoCode(fetcher.data.promoCode);
    if (fetcher.data?.ok && fetcher.state === "idle") revalidator.revalidate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, fetcher.state]);

  const items = JSON.parse(cart.items_json) as Array<{ name: string; quantity: number; price_cad: number; slug: string }>;
  const { label, urgency } = timeAgo(cart.minutes_inactive);

  const whatsappMsg = WhatsAppMessage({ cart, promoCode });
  const waPhone = "23797193723";
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(whatsappMsg)}`;

  function copyMsg() {
    navigator.clipboard.writeText(whatsappMsg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const remindersCount = [cart.reminder_1_sent_at, cart.reminder_2_sent_at, cart.reminder_3_sent_at].filter(Boolean).length;

  return (
    <div className={`bg-surface border rounded-lg overflow-hidden transition-shadow hover:shadow-md ${
      cart.status === "recovered" ? "border-green-200 opacity-75" : "border-outline-variant"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-4 border-b border-outline-variant/30">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-sans text-sm font-bold text-on-surface truncate">
              {cart.customer_name || "Client inconnu"}
            </p>
            {cart.status === "recovered" && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wider rounded-full">
                Récupéré ✓
              </span>
            )}
            {remindersCount > 0 && cart.status !== "recovered" && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                {remindersCount} relance{remindersCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {cart.email && (
            <p className="font-sans text-xs text-on-surface-variant mt-0.5">{cart.email}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className={`flex items-center gap-1 px-2.5 py-1 border text-xs font-bold rounded-full ${URGENCY_STYLE[urgency]}`}
            title={URGENCY_LABEL[urgency]}>
            <span className="material-symbols-outlined text-sm">{URGENCY_ICON[urgency]}</span>
            {label}
          </div>
          <p className="font-serif text-lg font-bold text-primary">{cart.total_cad.toFixed(2)} $</p>
        </div>
      </div>

      {/* Produits */}
      <div className="p-4 space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-on-surface-variant truncate pr-4 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-outline-variant">styler</span>
              {item.name} <span className="text-outline-variant">×{item.quantity}</span>
            </span>
            <span className="text-on-surface font-medium shrink-0">{(item.price_cad * item.quantity).toFixed(2)} $</span>
          </div>
        ))}
        {promoCode && (
          <div className="flex items-center gap-1.5 pt-1">
            <span className="material-symbols-outlined text-sm text-secondary">sell</span>
            <span className="font-sans text-xs text-secondary font-bold">{promoCode}</span>
            <span className="font-sans text-xs text-on-surface-variant">(-10%, 72h)</span>
          </div>
        )}
      </div>

      {/* Rappels envoyés */}
      {(cart.reminder_1_sent_at || cart.reminder_2_sent_at || cart.reminder_3_sent_at) && (
        <div className="px-4 pb-2 flex items-center gap-3">
          {[1, 2, 3].map(n => {
            const sentAt = n === 1 ? cart.reminder_1_sent_at : n === 2 ? cart.reminder_2_sent_at : cart.reminder_3_sent_at;
            return sentAt ? (
              <span key={n} className="flex items-center gap-1 text-[10px] text-on-surface-variant">
                <span className="material-symbols-outlined text-xs text-green-600">check_circle</span>
                R{n} envoyé
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Actions */}
      {cart.status !== "recovered" && (
        <div className="px-4 pb-4 flex items-center gap-2 flex-wrap border-t border-outline-variant/20 pt-3">
          {/* WhatsApp direct */}
          <a href={waUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] text-white text-xs font-bold rounded hover:opacity-90 transition-opacity">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.374 0 0 5.373 0 12c0 2.114.55 4.097 1.508 5.819L.057 23.172a.75.75 0 0 0 .92.92l5.353-1.451A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.655-.502-5.184-1.381l-.372-.218-3.856 1.046 1.046-3.856-.218-.372A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            WhatsApp
          </a>

          {/* Copier le message */}
          <button onClick={copyMsg}
            className="flex items-center gap-1 px-3 py-1.5 border border-outline-variant text-xs text-on-surface-variant hover:text-on-surface rounded transition-colors">
            <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
            {copied ? "Copié !" : "Copier msg"}
          </button>

          {/* Voir le message */}
          <button onClick={() => setShowMsg(!showMsg)}
            className="flex items-center gap-1 px-3 py-1.5 border border-outline-variant text-xs text-on-surface-variant hover:text-on-surface rounded transition-colors">
            <span className="material-symbols-outlined text-sm">visibility</span>
            Aperçu
          </button>

          {/* Générer un code promo */}
          {!promoCode && (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="generate_promo" />
              <input type="hidden" name="cartDbId" value={cart.id} />
              <button type="submit"
                className="flex items-center gap-1 px-3 py-1.5 border border-secondary/50 text-xs text-secondary hover:bg-secondary/5 rounded transition-colors"
                disabled={fetcher.state !== "idle"}>
                <span className="material-symbols-outlined text-sm">sell</span>
                Code -10%
              </button>
            </fetcher.Form>
          )}

          {/* Marquer les rappels */}
          {[1, 2, 3].map(n => {
            const sentAt = n === 1 ? cart.reminder_1_sent_at : n === 2 ? cart.reminder_2_sent_at : cart.reminder_3_sent_at;
            if (sentAt) return null;
            if (n === 2 && !cart.reminder_1_sent_at) return null;
            if (n === 3 && !cart.reminder_2_sent_at) return null;
            return (
              <fetcher.Form key={n} method="post">
                <input type="hidden" name="intent" value="remind" />
                <input type="hidden" name="cartDbId" value={cart.id} />
                <input type="hidden" name="reminderNum" value={n} />
                <button type="submit"
                  className="flex items-center gap-1 px-3 py-1.5 border border-outline-variant text-xs text-on-surface-variant hover:text-primary hover:border-primary rounded transition-colors"
                  disabled={fetcher.state !== "idle"}>
                  <span className="material-symbols-outlined text-sm">mark_email_read</span>
                  R{n} fait
                </button>
              </fetcher.Form>
            );
          })}

          {/* Marquer comme récupéré */}
          <fetcher.Form method="post" className="ml-auto">
            <input type="hidden" name="intent" value="recover" />
            <input type="hidden" name="cartDbId" value={cart.id} />
            <button type="submit"
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 transition-colors"
              disabled={fetcher.state !== "idle"}>
              <span className="material-symbols-outlined text-sm">check_circle</span>
              Récupéré
            </button>
          </fetcher.Form>
        </div>
      )}

      {/* Aperçu du message */}
      {showMsg && (
        <div className="mx-4 mb-4 p-3 bg-[#e5ddd5] rounded-lg text-sm font-mono whitespace-pre-wrap text-on-surface text-xs leading-relaxed border border-outline-variant/20">
          {whatsappMsg}
        </div>
      )}
    </div>
  );
}

const FILTERS = [
  { id: "abandoned", label: "Abandonnés", icon: "shopping_cart_off" },
  { id: "active", label: "Actifs (< 1h)", icon: "shopping_cart" },
  { id: "recovered", label: "Récupérés", icon: "check_circle" },
  { id: "all", label: "Tous", icon: "list" },
];

export default function AdminPaniersAbandonnes() {
  const { carts, stats, filter } = useLoaderData<typeof loader>();

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-sans text-2xl font-bold text-on-surface mb-1">Paniers abandonnés</h1>
        <p className="font-sans text-sm text-on-surface-variant">
          Identifiez et relancez les clients qui n'ont pas finalisé leur achat.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-surface border border-outline-variant rounded-lg p-4">
          <p className="font-sans text-xs text-on-surface-variant uppercase tracking-wider mb-1">Abandonnés</p>
          <p className="font-serif text-3xl font-bold text-error">{stats.total_abandoned}</p>
        </div>
        <div className="bg-surface border border-outline-variant rounded-lg p-4">
          <p className="font-sans text-xs text-on-surface-variant uppercase tracking-wider mb-1">Valeur perdue</p>
          <p className="font-serif text-3xl font-bold text-on-surface">{stats.total_value.toFixed(0)} $</p>
        </div>
        <div className="bg-surface border border-outline-variant rounded-lg p-4">
          <p className="font-sans text-xs text-on-surface-variant uppercase tracking-wider mb-1">Récupérés</p>
          <p className="font-serif text-3xl font-bold text-green-600">{stats.recovered}</p>
        </div>
        <div className="bg-surface border border-outline-variant rounded-lg p-4">
          <p className="font-sans text-xs text-on-surface-variant uppercase tracking-wider mb-1">Taux de récupération</p>
          <p className="font-serif text-3xl font-bold text-primary">{stats.recovery_rate}%</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap mb-6">
        {FILTERS.map(f => (
          <a key={f.id} href={`?filter=${f.id}`}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full border transition-colors ${
              filter === f.id
                ? "bg-primary text-on-primary border-primary"
                : "border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline"
            }`}>
            <span className="material-symbols-outlined text-base">{f.icon}</span>
            {f.label}
          </a>
        ))}
      </div>

      {/* Légende urgence */}
      <div className="flex items-center gap-4 flex-wrap mb-6 pb-4 border-b border-outline-variant">
        {(["hot", "warm", "cold", "frozen"] as const).map(u => (
          <div key={u} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-full ${URGENCY_STYLE[u]}`}>
            <span className="material-symbols-outlined text-sm">{URGENCY_ICON[u]}</span>
            {URGENCY_LABEL[u]}
          </div>
        ))}
      </div>

      {/* Liste des paniers */}
      {carts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant">shopping_cart_off</span>
          <p className="font-sans text-base text-on-surface-variant">
            {filter === "abandoned"
              ? "Aucun panier abandonné avec email capturé."
              : filter === "recovered"
              ? "Aucun panier récupéré pour l'instant."
              : "Aucun panier trouvé."}
          </p>
          {filter === "abandoned" && (
            <p className="font-sans text-sm text-on-surface-variant max-w-sm">
              Les paniers apparaissent ici lorsque des clients saisissent leur email au checkout mais n'finalisent pas leur achat.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {carts.map(cart => (
            <CartRow key={cart.id} cart={cart} />
          ))}
        </div>
      )}
    </div>
  );
}
