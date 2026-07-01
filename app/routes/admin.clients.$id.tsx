import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${(data as any)?.customer?.name ?? (data as any)?.customer?.email ?? "Client"} — Admin DDM` }
];

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const id = params.id;

  const [customer, ordersResult, addressesResult, wishlistResult] = await Promise.all([
    db.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first(),
    db.prepare(`
      SELECT id, stripe_payment_intent_id, status, payment_status, total_cad, created_at,
             shipping_address, tracking_number
      FROM orders WHERE customer_email = (SELECT email FROM customers WHERE id = ?)
      ORDER BY created_at DESC
    `).bind(id).all(),
    db.prepare("SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC").bind(id).all(),
    db.prepare(`
      SELECT w.product_id, p.name, p.price_cad, p.slug, p.image_key
      FROM wishlists w JOIN products p ON p.id = w.product_id
      WHERE w.customer_id = ?
      ORDER BY w.created_at DESC
    `).bind(id).all(),
  ]);

  if (!customer) throw new Response("Client introuvable", { status: 404 });

  const orders = (ordersResult.results ?? []) as any[];
  const paidOrders = orders.filter(o => o.payment_status === "paid");

  const stats = {
    nbCommandes: paidOrders.length,
    totalDepense: paidOrders.reduce((s, o) => s + (o.total_cad ?? 0), 0),
    panierMoyen: paidOrders.length > 0
      ? paidOrders.reduce((s, o) => s + (o.total_cad ?? 0), 0) / paidOrders.length
      : 0,
    premiereCommande: paidOrders.length > 0 ? paidOrders[paidOrders.length - 1].created_at : null,
    derniereCommande: paidOrders.length > 0 ? paidOrders[0].created_at : null,
  };

  return json({
    customer,
    orders,
    addresses: addressesResult.results ?? [],
    wishlist: wishlistResult.results ?? [],
    stats,
  });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const f = await request.formData();
  const intent = String(f.get("intent") ?? "update");

  if (intent === "update_notes") {
    await db.prepare("UPDATE customers SET notes_internes = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(String(f.get("notes_internes") ?? "").trim() || null, params.id).run();
    return json({ ok: true, section: "notes" });
  }

  if (intent === "update_statut") {
    await db.prepare("UPDATE customers SET statut = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(String(f.get("statut") ?? "actif"), params.id).run();
    return json({ ok: true, section: "statut" });
  }

  if (intent === "update_infos") {
    await db.prepare("UPDATE customers SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(
        String(f.get("name") ?? "").trim() || null,
        String(f.get("phone") ?? "").trim() || null,
        params.id
      ).run();
    return json({ ok: true, section: "infos" });
  }

  return json({ ok: false });
}

const STATUS_COLORS: Record<string, string> = {
  vip:    "bg-yellow-100 text-yellow-800 border-yellow-200",
  actif:  "bg-green-100 text-green-700 border-green-200",
  bloque: "bg-error-container text-on-error-container border-error/20",
};

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending:    { label: "En attente",   color: "text-yellow-700" },
  processing: { label: "En traitement", color: "text-blue-700" },
  shipped:    { label: "Expédiée",     color: "text-indigo-700" },
  delivered:  { label: "Livrée",       color: "text-green-700" },
  cancelled:  { label: "Annulée",      color: "text-error" },
};

const inp = "w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary";

export default function ClientDetail() {
  const { customer: c, orders, addresses, wishlist, stats } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const customer = c as any;

  // Segment calculé
  const segment = customer.statut === "bloque" ? "bloque"
    : customer.statut === "vip" ? "vip"
    : stats.totalDepense >= 300 || stats.nbCommandes >= 3 ? "vip"
    : stats.nbCommandes >= 2 ? "fidele"
    : stats.nbCommandes === 1 ? "nouveau"
    : "inactif";

  const segLabel: Record<string, string> = { vip: "VIP", fidele: "Fidèle", nouveau: "Nouveau", inactif: "Inactif", bloque: "Bloqué" };
  const segColor: Record<string, string> = {
    vip:     "bg-yellow-100 text-yellow-800",
    fidele:  "bg-blue-100 text-blue-700",
    nouveau: "bg-green-100 text-green-700",
    inactif: "bg-surface-container text-on-surface-variant",
    bloque:  "bg-error-container text-on-error-container",
  };

  // Profil capillaire (si rempli)
  const capillaire = [
    customer.cap_size && `Taille bonnet: ${customer.cap_size}`,
    customer.texture_preferee && `Texture: ${customer.texture_preferee}`,
    customer.longueur_preferee && `Longueur: ${customer.longueur_preferee}`,
    customer.couleur_naturelle && `Couleur naturelle: ${customer.couleur_naturelle}`,
    customer.style_pose && `Style pose: ${customer.style_pose}`,
    customer.budget_habituel && `Budget: ${customer.budget_habituel}`,
  ].filter(Boolean);

  const saved = (data as any)?.ok && nav.state === "idle";

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/clients?tab=clients" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-on-surface">
              {customer.name ?? customer.email}
            </h1>
            <span className={`text-xs font-bold uppercase px-2 py-0.5 ${segColor[segment]}`}>
              {segLabel[segment]}
            </span>
          </div>
          {customer.name && <p className="text-sm text-on-surface-variant mt-0.5">{customer.email}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Commandes payées" value={String(stats.nbCommandes)} icon="receipt_long" />
        <StatCard label="Total dépensé" value={`${Number(stats.totalDepense).toFixed(0)} $`} icon="payments" accent />
        <StatCard label="Panier moyen" value={`${Number(stats.panierMoyen).toFixed(0)} $`} icon="shopping_cart" />
        <StatCard label="Client depuis" value={new Date(customer.created_at).toLocaleDateString("fr-CA")} icon="calendar_month" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Colonne gauche */}
        <div className="space-y-6">

          {/* Infos de contact */}
          <Card title="Informations" icon="person">
            {(data as any)?.ok && (data as any)?.section === "infos" && (
              <div className="mb-3 p-2 bg-secondary/10 text-secondary text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span> Sauvegardé
              </div>
            )}
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="update_infos" />
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Nom</label>
                <input name="name" defaultValue={customer.name ?? ""} placeholder="Prénom Nom" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Téléphone</label>
                <input name="phone" defaultValue={customer.phone ?? ""} placeholder="+1 514…" className={inp} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Email</label>
                <p className="text-sm text-on-surface-variant">{customer.email}</p>
              </div>
              <button type="submit" disabled={nav.state === "submitting"}
                className="text-xs bg-primary text-on-primary px-4 py-1.5 font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
                {nav.state === "submitting" ? "…" : "Enregistrer"}
              </button>
            </Form>
          </Card>

          {/* Statut manuel */}
          <Card title="Statut client" icon="star">
            {(data as any)?.ok && (data as any)?.section === "statut" && (
              <div className="mb-3 p-2 bg-secondary/10 text-secondary text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span> Statut mis à jour
              </div>
            )}
            <Form method="post" className="flex gap-2">
              <input type="hidden" name="intent" value="update_statut" />
              <select name="statut" defaultValue={customer.statut ?? "actif"} className={`${inp} flex-1`}>
                <option value="actif">Actif (auto-segment)</option>
                <option value="vip">VIP (manuel)</option>
                <option value="bloque">Bloqué</option>
              </select>
              <button type="submit" disabled={nav.state === "submitting"}
                className="text-xs bg-primary text-on-primary px-4 py-1.5 font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60 whitespace-nowrap">
                OK
              </button>
            </Form>
            <p className="text-xs text-on-surface-variant mt-2">
              VIP auto si ≥ 3 commandes ou ≥ 300 $. Le statut manuel prend le dessus.
            </p>
          </Card>

          {/* Notes internes */}
          <Card title="Notes internes" icon="notes">
            {(data as any)?.ok && (data as any)?.section === "notes" && (
              <div className="mb-3 p-2 bg-secondary/10 text-secondary text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span> Notes sauvegardées
              </div>
            )}
            <Form method="post" className="space-y-3">
              <input type="hidden" name="intent" value="update_notes" />
              <textarea name="notes_internes" rows={4} defaultValue={customer.notes_internes ?? ""}
                placeholder="Préférences particulières, historique de contact, remarques…"
                className={`${inp} resize-none`} />
              <button type="submit" disabled={nav.state === "submitting"}
                className="text-xs bg-primary text-on-primary px-4 py-1.5 font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
                {nav.state === "submitting" ? "…" : "Enregistrer"}
              </button>
            </Form>
          </Card>

          {/* Profil capillaire */}
          {capillaire.length > 0 && (
            <Card title="Profil capillaire" icon="self_improvement">
              <ul className="space-y-1.5">
                {capillaire.map((item, i) => (
                  <li key={i} className="text-sm text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-primary">check_small</span>
                    {item}
                  </li>
                ))}
              </ul>
              {customer.quiz_completed_at && (
                <p className="text-xs text-on-surface-variant mt-3">
                  Quiz complété le {new Date(customer.quiz_completed_at).toLocaleDateString("fr-CA")}
                </p>
              )}
            </Card>
          )}
        </div>

        {/* Colonne droite */}
        <div className="space-y-6">

          {/* Historique commandes */}
          <Card title={`Commandes (${(orders as any[]).length})`} icon="receipt_long">
            {(orders as any[]).length === 0 ? (
              <p className="text-sm text-on-surface-variant">Aucune commande.</p>
            ) : (
              <div className="space-y-2">
                {(orders as any[]).map(o => {
                  const st = ORDER_STATUS[o.status] ?? { label: o.status, color: "text-on-surface-variant" };
                  return (
                    <Link key={o.id} to={`/admin/commandes/${o.id}`}
                      className="flex items-center justify-between p-2.5 border border-outline-variant/20 hover:border-primary transition-colors group">
                      <div>
                        <p className="text-xs font-semibold text-on-surface group-hover:text-primary transition-colors">
                          #{String(o.id).slice(0, 8)}
                        </p>
                        <p className={`text-xs ${st.color}`}>{st.label}</p>
                        {o.tracking_number && (
                          <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">{o.tracking_number}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm text-primary">{Number(o.total_cad).toFixed(0)} $</p>
                        <p className="text-[10px] text-on-surface-variant">{new Date(o.created_at).toLocaleDateString("fr-CA")}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Adresses */}
          {(addresses as any[]).length > 0 && (
            <Card title="Adresses sauvegardées" icon="home">
              <div className="space-y-2">
                {(addresses as any[]).map(a => (
                  <div key={a.id} className={`p-3 text-sm border ${a.is_default ? "border-primary/30 bg-primary/5" : "border-outline-variant/20"}`}>
                    {a.is_default && <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">Par défaut</p>}
                    <p className="text-on-surface">{a.label}</p>
                    <p className="text-on-surface-variant text-xs">{a.street}</p>
                    <p className="text-on-surface-variant text-xs">{a.city}, {a.province} {a.postal_code}</p>
                    <p className="text-on-surface-variant text-xs">{a.country}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Wishlist */}
          {(wishlist as any[]).length > 0 && (
            <Card title={`Liste de souhaits (${(wishlist as any[]).length})`} icon="favorite">
              <div className="space-y-1.5">
                {(wishlist as any[]).map(w => (
                  <Link key={w.product_id} to={`/admin/produits/${w.product_id}`}
                    className="flex items-center justify-between text-sm hover:text-primary transition-colors">
                    <span className="text-on-surface truncate">{w.name}</span>
                    <span className="text-on-surface-variant shrink-0 ml-2">{Number(w.price_cad).toFixed(0)} $</span>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {/* Infos compte */}
          <Card title="Compte" icon="manage_accounts">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Inscrit le</dt>
                <dd className="font-medium">{new Date(customer.created_at).toLocaleDateString("fr-CA")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Newsletter</dt>
                <dd className={customer.newsletter_optin ? "text-green-700 font-medium" : "text-on-surface-variant"}>
                  {customer.newsletter_optin ? "Abonné" : "Non abonné"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-on-surface-variant">Alertes stock</dt>
                <dd className={customer.alertes_stock ? "text-green-700 font-medium" : "text-on-surface-variant"}>
                  {customer.alertes_stock ? "Activées" : "Désactivées"}
                </dd>
              </div>
              {stats.premiereCommande && (
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">1ère commande</dt>
                  <dd className="font-medium">{new Date(stats.premiereCommande).toLocaleDateString("fr-CA")}</dd>
                </div>
              )}
              {stats.derniereCommande && (
                <div className="flex justify-between">
                  <dt className="text-on-surface-variant">Dernière commande</dt>
                  <dd className="font-medium">{new Date(stats.derniereCommande).toLocaleDateString("fr-CA")}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-outline-variant/30 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-base text-primary">{icon}</span>
        <h2 className="font-semibold text-on-surface">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon: string; accent?: boolean }) {
  return (
    <div className="p-4 border border-outline-variant/30 bg-surface">
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-lg ${accent ? "text-primary" : "text-on-surface-variant"}`}>{icon}</span>
        <p className="text-xs text-on-surface-variant uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-xl font-bold ${accent ? "text-primary" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}
