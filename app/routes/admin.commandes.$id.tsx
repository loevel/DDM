import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { cfImage } from "~/lib/images";
import { getAdminUser, logAdminAction } from "~/lib/admin-session.server";
import { orderStatusEmail, sendEmail } from "~/lib/email.server";

export const meta: MetaFunction = () => [{ title: "Détail commande — Admin DDM" }];

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
const STATUS_FR: Record<string, string> = {
  pending: "En attente", confirmed: "Confirmée",
  shipped: "Expédiée", delivered: "Livrée", cancelled: "Annulée",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800", confirmed: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800", delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const CARRIERS = ["Purolator", "Canada Post", "Fedex", "UPS", "DHL", "Autre"];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const order = await db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .bind(params.id).first();
  if (!order) throw new Response("Commande introuvable", { status: 404 });

  const { results: items } = await db
    .prepare("SELECT * FROM order_items WHERE order_id = ?")
    .bind(params.id).all();

  return json({ order, items: items ?? [] });
}

type OrderRow = { reference: string; customer_name: string; customer_email: string };

async function sendOrderStatusEmail(
  resendKey: string,
  order: OrderRow,
  status: string,
  extra?: { tracking?: string; carrier?: string }
) {
  const email = orderStatusEmail({
    reference: order.reference,
    customerName: order.customer_name,
    status: status as "confirmed" | "shipped" | "delivered" | "cancelled",
    tracking: extra?.tracking,
    carrier: extra?.carrier,
  });
  if (!email) return; // pending ou inconnu → pas d'email

  const ok = await sendEmail({ apiKey: resendKey, to: order.customer_email, ...email });
  if (!ok) throw new Error("Envoi Resend échoué");
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const db = context.cloudflare.env.DB;
  const resendKey = context.cloudflare.env.RESEND_API_KEY as string | undefined;
  const intent = g("_action");
  const admin = await getAdminUser(request, context);

  if (intent === "update_status") {
    const newStatus = g("status");
    const order = await db.prepare("SELECT reference, customer_name, customer_email FROM orders WHERE id = ?")
      .bind(params.id).first<OrderRow>();
    if (!order) throw new Response("Commande introuvable", { status: 404 });

    await db.prepare("UPDATE orders SET status = ? WHERE id = ?")
      .bind(newStatus, params.id).run();
    await logAdminAction(context, {
      admin, action: "order.update_status", entity: "order", entityId: order.reference,
      details: { status: newStatus }, request,
    });

    let emailMsg = "";
    if (resendKey) {
      try { await sendOrderStatusEmail(resendKey, order, newStatus); emailMsg = " Email envoyé." }
      catch { emailMsg = " (Échec envoi email)"; }
    }
    return json({ ok: true, msg: `Statut mis à jour.${emailMsg}` });
  }

  if (intent === "update_tracking") {
    const tracking = g("tracking_number");
    const carrier = g("tracking_carrier");
    const order = await db.prepare("SELECT * FROM orders WHERE id = ?")
      .bind(params.id).first<any>();
    if (!order) throw new Response("Commande introuvable", { status: 404 });

    const newStatus = tracking ? "shipped" : order.status;
    await db.prepare("UPDATE orders SET tracking_number = ?, tracking_carrier = ?, status = ? WHERE id = ?")
      .bind(tracking || null, carrier || null, newStatus, params.id).run();
    await logAdminAction(context, {
      admin, action: "order.update_tracking", entity: "order", entityId: order.reference,
      details: { tracking, carrier, status: newStatus }, request,
    });

    let emailMsg = "";
    if (tracking && resendKey) {
      try {
        await sendOrderStatusEmail(resendKey, order, "shipped", { tracking, carrier });
        emailMsg = " Email envoyé.";
      } catch { emailMsg = " (Échec envoi email)"; }
    }
    return json({ ok: true, msg: `Suivi enregistré.${emailMsg}` });
  }

  if (intent === "update_discount") {
    const discount = Number(g("discount_override_cad")) || 0;
    await db.prepare("UPDATE orders SET discount_override_cad = ?, admin_note = ? WHERE id = ?")
      .bind(discount, g("admin_note") || null, params.id).run();
    await logAdminAction(context, {
      admin, action: "order.update_discount", entity: "order", entityId: params.id,
      details: { discount }, request,
    });
    return json({ ok: true, msg: "Remise et note enregistrées." });
  }

  return json({ ok: false });
}

export default function CommandeDetail() {
  const { order, items } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const o = order as any;

  let shipping: any = null;
  try { shipping = o.shipping_address ? JSON.parse(o.shipping_address) : null; } catch { shipping = null; }

  const itemsTotal = (items as any[]).reduce(
    (s, i) => s + Number(i.unit_price_cad) * Number(i.quantity ?? 1), 0
  );
  const discount = Number(o.discount_cad ?? 0) + Number(o.discount_override_cad ?? 0);
  const netTotal = itemsTotal - discount;

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <Link to="/admin/commandes" className="inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary transition-colors mb-4">
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Retour aux commandes
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface font-mono">{o.reference}</h1>
          <p className="text-sm text-on-surface-variant">
            Créée le {new Date(o.created_at).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <span className={`inline-block px-3 py-1 rounded text-xs font-semibold uppercase ${STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-600"}`}>
          {STATUS_FR[o.status] ?? o.status}
        </span>
      </div>

      {actionData?.ok && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded px-4 py-3 mb-5 text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-base">check_circle</span>
          {(actionData as any).msg}
        </div>
      )}

      {/* Infos client */}
      <Card>
        <SectionLabel>Informations client</SectionLabel>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Nom" value={o.customer_name} />
          <Field label="Email" value={o.customer_email} />
          <Field label="Téléphone" value={o.customer_phone ?? "—"} />
        </div>
        <div className="mt-4">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Adresse de livraison</p>
          {shipping ? (
            <p className="text-sm text-on-surface leading-relaxed">
              {shipping.line1}{shipping.line2 ? `, ${shipping.line2}` : ""}<br />
              {shipping.city}{shipping.province ? `, ${shipping.province}` : ""} {shipping.postal_code}<br />
              {shipping.country}
            </p>
          ) : (
            <p className="text-sm text-on-surface-variant">Aucune adresse renseignée.</p>
          )}
        </div>
      </Card>

      {/* Articles commandés */}
      <Card>
        <SectionLabel>Articles commandés</SectionLabel>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant/30">
              {["", "Produit", "Qté", "Prix unit.", "Sous-total"].map((h, i) => (
                <th key={i} className="text-left px-3 py-2 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {(items as any[]).map((it) => {
              const img = cfImage(it.image_key, "thumbnail");
              return (
                <tr key={it.id}>
                  <td className="px-3 py-3 w-14">
                    {img ? (
                      <img src={img} alt={it.product_name ?? ""} className="w-12 h-12 object-cover rounded border border-outline-variant/30" />
                    ) : (
                      <div className="w-12 h-12 rounded bg-surface-container-low flex items-center justify-center">
                        <span className="material-symbols-outlined text-on-surface-variant text-lg">image</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-on-surface">
                    {it.product_name ?? `Produit #${it.product_id}`}
                    {it.variant_name && (
                      <span className="block text-xs text-on-surface-variant mt-0.5">{it.variant_name}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-on-surface-variant">{it.quantity ?? 1}</td>
                  <td className="px-3 py-3 text-on-surface-variant">{Number(it.unit_price_cad).toFixed(2)} $</td>
                  <td className="px-3 py-3 font-semibold text-on-surface">{(Number(it.unit_price_cad) * Number(it.quantity ?? 1)).toFixed(2)} $</td>
                </tr>
              );
            })}
            {(items as any[]).length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-on-surface-variant">Aucun article.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Paiement */}
      <Card>
        <SectionLabel>Paiement</SectionLabel>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <Field label="Méthode" value={o.payment_method === "stripe" ? "Stripe" : o.payment_method === "whatsapp" ? "WhatsApp" : (o.payment_method ?? "—")} />
          <Field label="Statut paiement" value={o.payment_status ?? "—"} />
          <Field label="Stripe Payment Intent" value={o.stripe_payment_intent_id ?? "—"} mono />
          <Field label="Code promo" value={o.promo_code ?? "—"} />
        </div>
        <div className="border-t border-outline-variant/30 pt-3 space-y-1.5">
          <SummaryRow label="Sous-total articles" value={`${itemsTotal.toFixed(2)} $`} />
          {Number(o.discount_cad ?? 0) > 0 && (
            <SummaryRow label="Remise (code promo)" value={`− ${Number(o.discount_cad).toFixed(2)} $`} />
          )}
          {Number(o.discount_override_cad ?? 0) > 0 && (
            <SummaryRow label="Remise manuelle" value={`− ${Number(o.discount_override_cad).toFixed(2)} $`} />
          )}
          <SummaryRow label="Total" value={`${netTotal.toFixed(2)} $`} bold />
          <SummaryRow label="Total enregistré" value={`${Number(o.total_cad).toFixed(2)} $`} muted />
        </div>
      </Card>

      {/* Expédition */}
      <Card>
        <SectionLabel>Expédition</SectionLabel>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="_action" value="update_tracking" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Transporteur</Label>
              <select name="tracking_carrier" defaultValue={o.tracking_carrier ?? ""} className={inp}>
                <option value="">— Sélectionner —</option>
                {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label>Numéro de suivi</Label>
              <input name="tracking_number" defaultValue={o.tracking_number ?? ""} placeholder="Ex: 1Z999AA10123456784" className={inp} />
            </div>
          </div>
          <p className="text-xs text-on-surface-variant">
            Enregistrer un numéro de suivi passe le statut à « Expédiée » et envoie un email de notification au client.
          </p>
          <button type="submit" disabled={nav.state === "submitting"}
            className="bg-primary text-on-primary px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center gap-2">
            <span className="material-symbols-outlined text-base">local_shipping</span>
            Sauvegarder &amp; envoyer email au client
          </button>
        </Form>
      </Card>

      {/* Remise manuelle + note admin */}
      <Card>
        <SectionLabel>Remise manuelle &amp; note interne</SectionLabel>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="_action" value="update_discount" />
          <div>
            <Label>Montant de la remise (CAD)</Label>
            <input name="discount_override_cad" type="number" step="0.01" min="0"
              defaultValue={o.discount_override_cad ?? 0} className={`${inp} max-w-xs`} />
          </div>
          <div>
            <Label>Note admin (non visible par le client)</Label>
            <textarea name="admin_note" rows={3} defaultValue={o.admin_note ?? ""}
              placeholder="Raison de la remise, remarques internes…" className={`${inp} resize-none`} />
          </div>
          <button type="submit" disabled={nav.state === "submitting"}
            className="bg-primary text-on-primary px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            Appliquer
          </button>
        </Form>
      </Card>

      {/* Changement de statut */}
      <Card>
        <SectionLabel>Statut de la commande</SectionLabel>
        <Form method="post" className="flex items-end gap-3">
          <input type="hidden" name="_action" value="update_status" />
          <div>
            <Label>Statut</Label>
            <select name="status" defaultValue={o.status} className={`${inp} max-w-xs`}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_FR[s]}</option>)}
            </select>
          </div>
          <button type="submit" disabled={nav.state === "submitting"}
            className="bg-primary text-on-primary px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            Mettre à jour le statut
          </button>
        </Form>
      </Card>
    </div>
  );
}

const inp = "w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface border border-outline-variant/30 rounded p-5 mb-5">{children}</div>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-3">{children}</p>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">{children}</label>;
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-on-surface ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</p>
    </div>
  );
}

function SummaryRow({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${muted ? "text-on-surface-variant" : "text-on-surface-variant"}`}>{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-on-surface" : muted ? "text-on-surface-variant" : "text-on-surface"}`}>{value}</span>
    </div>
  );
}
