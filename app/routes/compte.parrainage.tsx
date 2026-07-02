import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { getCustomerId } from "~/lib/session.server";
import { getCustomer } from "~/lib/auth.server";

export const meta: MetaFunction = () => [{ title: "Parrainage — DDM Wigs & More" }];

const BASE = "https://ddmwigs.com";
const REWARD_REFERRER = 15;
const DISCOUNT_REFERRED = 10;

function genCode(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) {
    h = Math.imul(31, h) + email.charCodeAt(i) | 0;
  }
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  let n = Math.abs(h);
  for (let i = 0; i < 6; i++) { code += chars[n % chars.length]; n = Math.floor(n / chars.length) || 1; }
  return code;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = await getCustomerId(request, context);
  if (!customerId) throw new Response("Non connecté", { status: 401 });
  const customer = await getCustomer(customerId, context);
  if (!customer) throw new Response("Introuvable", { status: 404 });

  const db = context.cloudflare.env.DB;

  // Générer ou récupérer le code de parrainage
  let code: string = (customer as any).referral_code;
  if (!code) {
    code = genCode(customer.email);
    await db.prepare("UPDATE customers SET referral_code = ? WHERE id = ?").bind(code, customerId).run();
  }

  // Historique des parrainages
  const referrals = await db.prepare(
    "SELECT referred_email, status, reward_cad, discount_cad, order_reference, created_at, rewarded_at FROM referrals WHERE referrer_email = ? ORDER BY created_at DESC LIMIT 20"
  ).bind(customer.email).all<{
    referred_email: string | null; status: string; reward_cad: number;
    discount_cad: number; order_reference: string | null;
    created_at: string; rewarded_at: string | null;
  }>();

  const credit = (customer as any).referral_credit_cad ?? 0;
  const stats = {
    total: referrals.results?.length ?? 0,
    completed: referrals.results?.filter((r: any) => r.status === "rewarded").length ?? 0,
    earned: referrals.results?.filter((r: any) => r.status === "rewarded")
      .reduce((s: number, r: any) => s + r.reward_cad, 0) ?? 0,
  };

  return json({ customer, code, credit, referrals: referrals.results ?? [], stats });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const customerId = await getCustomerId(request, context);
  if (!customerId) return json({ error: "Non connecté" });
  const customer = await getCustomer(customerId, context);
  if (!customer) return json({ error: "Introuvable" });

  const db = context.cloudflare.env.DB;
  const f = await request.formData();
  const intent = String(f.get("intent") ?? "");

  if (intent === "use_credit") {
    const amount = Number(f.get("amount") ?? 0);
    const credit = (customer as any).referral_credit_cad ?? 0;
    if (amount <= 0 || amount > credit) return json({ error: "Montant invalide" });
    // Crée un code promo unique lié à ce client
    const promoCode = `CREDIT-${(customer as any).referral_code}-${Date.now().toString(36).toUpperCase()}`;
    await db.prepare(
      "INSERT INTO promo_codes (code, type, value, min_order, usage_limit, used_count, active, expires_at) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(promoCode, "fixed", amount, 0, 1, 0, 1,
      new Date(Date.now() + 30 * 86400000).toISOString()
    ).run();
    await db.prepare("UPDATE customers SET referral_credit_cad = referral_credit_cad - ? WHERE id = ?")
      .bind(amount, customerId).run();
    return json({ ok: true, promoCode, amount });
  }

  return json({ error: "Action inconnue" });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:  { label: "En attente",  color: "bg-yellow-100 text-yellow-800" },
  rewarded: { label: "Récompensé",  color: "bg-green-100 text-green-800" },
  expired:  { label: "Expiré",      color: "bg-gray-100 text-gray-500" },
};

export default function Parrainage() {
  const { customer, code, credit, referrals, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [copied, setCopied] = useState(false);

  const link = `${BASE}/r/${code}`;

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Programme de parrainage</h1>
        <p className="text-body-md text-on-surface-variant">
          Invitez vos amies et gagnez des crédits sur vos prochains achats.
        </p>
      </div>

      {/* Comment ça marche */}
      <div className="bg-surface border border-outline-variant/30 rounded-lg p-6">
        <h2 className="font-semibold text-on-surface mb-4">Comment ça fonctionne</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { step: "1", icon: "share", title: "Partagez votre lien", desc: `Envoyez votre lien unique à vos amies par WhatsApp, Instagram ou SMS.` },
            { step: "2", icon: "shopping_bag", title: "Votre amie achète", desc: `Elle bénéficie de ${DISCOUNT_REFERRED} $ de réduction sur sa première commande.` },
            { step: "3", icon: "redeem", title: "Vous recevez ${REWARD_REFERRER} $", desc: `${REWARD_REFERRER} $ de crédit sont ajoutés à votre compte dès que la commande est confirmée.` },
          ].map(s => (
            <div key={s.step} className="flex gap-4 items-start">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-primary text-lg">{s.icon}</span>
              </div>
              <div>
                <p className="font-semibold text-sm text-on-surface mb-1">{s.title}</p>
                <p className="text-xs text-on-surface-variant">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lien de parrainage */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-6">
        <h2 className="font-semibold text-on-surface mb-3">Votre lien personnel</h2>
        <div className="flex gap-2">
          <div className="flex-1 bg-surface border border-outline-variant px-4 py-3 text-sm font-mono text-on-surface-variant rounded select-all truncate">
            {link}
          </div>
          <button onClick={copyLink}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded transition-colors ${copied ? "bg-secondary text-on-secondary" : "bg-primary text-on-primary hover:opacity-90"}`}>
            <span className="material-symbols-outlined text-base">{copied ? "check" : "content_copy"}</span>
            {copied ? "Copié !" : "Copier"}
          </button>
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          <a href={`https://wa.me/?text=${encodeURIComponent(`Découvre DDM Wigs & More — perruques cheveux humains premium à Montréal ! Utilise mon lien pour avoir ${DISCOUNT_REFERRED} $ de réduction sur ta première commande : ${link}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-[#25D366] text-white rounded hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-sm">chat</span>
            WhatsApp
          </a>
          <a href={`https://www.instagram.com/`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-sm">photo_camera</span>
            Instagram
          </a>
          <a href={`sms:?body=${encodeURIComponent(`Salut ! Utilise mon lien DDM Wigs pour avoir ${DISCOUNT_REFERRED} $ de réduction : ${link}`)}`}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold border border-outline-variant text-on-surface rounded hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-sm">sms</span>
            SMS
          </a>
        </div>
      </div>

      {/* Stats + Crédit */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Parrainages envoyés", value: stats.total, icon: "group_add" },
          { label: "Complétés",           value: stats.completed, icon: "check_circle" },
          { label: "Total gagné",         value: `${stats.earned.toFixed(0)} $`, icon: "savings" },
          { label: "Crédit disponible",   value: `${credit.toFixed(2)} $`, icon: "account_balance_wallet", highlight: credit > 0 },
        ].map(s => (
          <div key={s.label} className={`bg-surface border rounded-lg p-4 ${s.highlight ? "border-primary" : "border-outline-variant/30"}`}>
            <span className={`material-symbols-outlined text-xl mb-2 block ${s.highlight ? "text-primary" : "text-on-surface-variant"}`}>{s.icon}</span>
            <p className={`text-xl font-bold ${s.highlight ? "text-primary" : "text-on-surface"}`}>{s.value}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Utiliser le crédit */}
      {credit > 0 && (
        <div className="bg-surface border border-primary/30 rounded-lg p-6">
          <h2 className="font-semibold text-on-surface mb-1">Utiliser votre crédit</h2>
          <p className="text-sm text-on-surface-variant mb-4">
            Convertissez votre crédit en code promo utilisable au checkout. Le code expire dans 30 jours.
          </p>
          {actionData && 'promoCode' in actionData && actionData.promoCode ? (
            <div className="flex items-center gap-3 p-4 bg-secondary-container/30 rounded">
              <span className="material-symbols-outlined text-secondary">check_circle</span>
              <div>
                <p className="font-semibold text-sm text-on-surface">Code créé : <span className="font-mono text-primary">{actionData.promoCode}</span></p>
                <p className="text-xs text-on-surface-variant">Valeur : {actionData.amount} $ — utilisable à votre prochain achat</p>
              </div>
            </div>
          ) : (
            <Form method="post" className="flex items-center gap-3">
              <input type="hidden" name="intent" value="use_credit" />
              <input type="hidden" name="amount" value={Math.floor(credit)} />
              <button type="submit"
                className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 text-sm font-semibold rounded hover:opacity-90">
                <span className="material-symbols-outlined text-base">redeem</span>
                Générer un code de {Math.floor(credit)} $
              </button>
            </Form>
          )}
          {actionData && 'error' in actionData && actionData.error && (
            <p className="text-sm text-error mt-2">{actionData.error}</p>
          )}
        </div>
      )}

      {/* Historique */}
      <div className="bg-surface border border-outline-variant/30 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/20">
          <h2 className="font-semibold text-on-surface">Historique de vos parrainages</h2>
        </div>
        {referrals.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-30">group_add</span>
            <p className="text-sm">Vous n'avez pas encore parrainé d'amie.</p>
            <p className="text-xs mt-1">Partagez votre lien pour commencer à gagner des crédits !</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr className="border-b border-outline-variant/20">
                {["Amie parrainée", "Date", "Statut", "Récompense"].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {referrals.map((r, i) => {
                const s = STATUS_LABELS[r.status] ?? STATUS_LABELS.pending;
                return (
                  <tr key={i} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-6 py-3 text-on-surface">{r.referred_email ?? "—"}</td>
                    <td className="px-6 py-3 text-on-surface-variant text-xs">{new Date(r.created_at).toLocaleDateString("fr-CA")}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${s.color}`}>{s.label}</span>
                    </td>
                    <td className="px-6 py-3 font-semibold text-on-surface">
                      {r.status === "rewarded" ? `+${r.reward_cad.toFixed(0)} $` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
