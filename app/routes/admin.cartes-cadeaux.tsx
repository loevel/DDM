import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { Link, useFetcher, useLoaderData, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

interface GiftCard {
  id: number;
  code: string;
  amount_cad: number;
  balance_cad: number;
  recipient_name: string | null;
  recipient_email: string | null;
  note: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `DDM-${seg()}-${seg()}-${seg()}`;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const filter = url.searchParams.get("filtre") ?? "toutes";
  const search = url.searchParams.get("q") ?? "";

  let where = "WHERE 1=1";
  const bindings: (string | number)[] = [];

  if (filter === "actives") {
    where += " AND balance_cad > 0";
  } else if (filter === "epuisees") {
    where += " AND balance_cad <= 0";
  }

  if (search) {
    where += " AND (code LIKE ? OR recipient_name LIKE ? OR recipient_email LIKE ?)";
    const s = `%${search}%`;
    bindings.push(s, s, s);
  }

  const { results } = await db.prepare(
    `SELECT * FROM gift_cards ${where} ORDER BY created_at DESC LIMIT 100`
  ).bind(...bindings).all<GiftCard>();

  const counts = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN balance_cad > 0 THEN 1 ELSE 0 END) as actives,
      SUM(CASE WHEN balance_cad <= 0 THEN 1 ELSE 0 END) as epuisees,
      SUM(amount_cad) as total_emis,
      SUM(amount_cad - balance_cad) as total_utilise
    FROM gift_cards
  `).first<{ total: number; actives: number; epuisees: number; total_emis: number; total_utilise: number }>();

  return json({ cards: results ?? [], filter, search, counts });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const f = await request.formData();
  const intent = String(f.get("intent") ?? "");

  if (intent === "create") {
    const amount = Number(f.get("amount_cad") ?? 0);
    if (!amount || amount <= 0) return json({ error: "Montant invalide." }, { status: 400 });

    const code = String(f.get("code") ?? "").trim() || genCode();
    const recipientName = String(f.get("recipient_name") ?? "").trim() || null;
    const recipientEmail = String(f.get("recipient_email") ?? "").trim() || null;
    const note = String(f.get("note") ?? "").trim() || null;

    const existing = await db.prepare("SELECT id FROM gift_cards WHERE code = ?").bind(code).first();
    if (existing) return json({ error: "Ce code existe déjà. Choisissez-en un autre." }, { status: 400 });

    // Pas de date d'expiration : la LPC (art. 187.3) interdit l'expiration
    // des cartes prépayées au Québec.
    await db.prepare(
      "INSERT INTO gift_cards (code, amount_cad, balance_cad, recipient_name, recipient_email, note, expires_at) VALUES (?,?,?,?,?,?,NULL)"
    ).bind(code, amount, amount, recipientName, recipientEmail, note).run();

    return json({ ok: true, code });
  }

  if (intent === "adjust") {
    const id = f.get("id");
    const newBalance = Number(f.get("balance_cad") ?? 0);
    if (newBalance < 0) return json({ error: "Le solde ne peut pas être négatif." }, { status: 400 });
    await db.prepare(
      "UPDATE gift_cards SET balance_cad = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(newBalance, id).run();
    return json({ ok: true });
  }

  if (intent === "delete") {
    await db.prepare("DELETE FROM gift_cards WHERE id = ?").bind(f.get("id")).run();
    return json({ ok: true });
  }

  return json({ error: "Action inconnue." }, { status: 400 });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCartesCadeaux() {
  const { cards, filter, search, counts } = useLoaderData<typeof loader>();
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = [
    { key: "toutes",   label: `Toutes (${counts?.total ?? 0})` },
    { key: "actives",  label: `Actives (${counts?.actives ?? 0})` },
    { key: "epuisees", label: `Épuisées (${counts?.epuisees ?? 0})` },
  ];

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">card_giftcard</span>
            Cartes cadeaux
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {(counts?.total_emis ?? 0).toFixed(2)} $ émis · {(counts?.total_utilise ?? 0).toFixed(2)} $ utilisés
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 transition-opacity">
          <span className="material-symbols-outlined text-lg">add</span>
          Créer une carte
        </button>
      </div>

      {/* Modal création */}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}

      {/* Filtres + recherche */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex gap-1 border-b border-outline-variant flex-1">
          {tabs.map(t => (
            <button key={t.key}
              onClick={() => { const p = new URLSearchParams(searchParams); p.set("filtre", t.key); setSearchParams(p); }}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                filter === t.key ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-primary"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <form method="get" className="flex gap-2">
          <input type="hidden" name="filtre" value={filter} />
          <input name="q" defaultValue={search} placeholder="Rechercher code, nom, email…"
            className="h-9 px-3 border border-outline-variant bg-surface text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary w-60" />
          <button type="submit" className="h-9 px-3 bg-surface-container border border-outline-variant text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-lg">search</span>
          </button>
        </form>
      </div>

      {/* Tableau */}
      {cards.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl mb-3 block text-primary/30">card_giftcard</span>
          <p>Aucune carte cadeau dans cette catégorie.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map(card => (
            <CardRow key={card.id} card={card} isOpen={openId === card.id}
              onToggle={() => setOpenId(openId === card.id ? null : card.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ligne de carte ───────────────────────────────────────────────────────────

function CardRow({ card, isOpen, onToggle }: { card: GiftCard; isOpen: boolean; onToggle: () => void }) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [newBalance, setNewBalance] = useState(String(card.balance_cad.toFixed(2)));

  const isEmpty = card.balance_cad <= 0;
  const pctUsed = card.amount_cad > 0 ? ((card.amount_cad - card.balance_cad) / card.amount_cad) * 100 : 0;

  const statusColor = isEmpty ? "text-on-surface-variant" : "text-secondary";
  const statusLabel = isEmpty ? "Épuisée" : "Active";

  return (
    <div className={`bg-surface border rounded-lg overflow-hidden ${isEmpty ? "border-outline-variant/20" : "border-outline-variant/40"}`}>
      {/* Ligne résumé */}
      <button onClick={onToggle} className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-surface-container-low transition-colors">
        {/* Code */}
        <span className="font-mono text-sm font-bold text-on-surface tracking-wider shrink-0">{card.code}</span>

        {/* Barre de solde */}
        <div className="flex-1 min-w-0 hidden sm:block">
          <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${100 - pctUsed}%` }} />
          </div>
        </div>

        {/* Solde */}
        <div className="text-right shrink-0">
          <p className="font-sans text-sm font-bold text-on-surface">
            {card.balance_cad.toFixed(2)} $
            <span className="text-on-surface-variant font-normal"> / {card.amount_cad.toFixed(2)} $</span>
          </p>
          <p className={`font-sans text-xs font-semibold ${statusColor}`}>{statusLabel}</p>
        </div>

        {/* Destinataire */}
        {card.recipient_name && (
          <span className="font-sans text-xs text-on-surface-variant truncate max-w-[120px] hidden md:block">
            {card.recipient_name}
          </span>
        )}

        <span className={`material-symbols-outlined text-on-surface-variant text-xl shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </button>

      {/* Détail */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-outline-variant/20 pt-3 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Detail label="Montant initial" value={`${card.amount_cad.toFixed(2)} $ CAD`} />
            <Detail label="Solde restant" value={`${card.balance_cad.toFixed(2)} $ CAD`} highlight />
            <Detail label="Destinataire" value={card.recipient_name ?? "—"} />
            <Detail label="Email" value={card.recipient_email ?? "—"} />
            <Detail label="Créée le" value={new Date(card.created_at).toLocaleDateString("fr-CA")} />
            {card.note && <div className="col-span-2 md:col-span-4"><Detail label="Note" value={card.note} /></div>}
          </div>

          {/* Ajuster le solde */}
          <div className="flex items-end gap-3 pt-2 border-t border-outline-variant/20">
            <div className="flex-1">
              <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                Ajuster le solde ($ CAD)
              </label>
              <input type="number" min="0" step="0.01"
                value={newBalance} onChange={e => setNewBalance(e.target.value)}
                className="h-9 px-3 border border-outline-variant bg-surface text-sm text-on-surface focus:outline-none focus:border-primary w-36" />
            </div>
            <fetcher.Form method="post" className="flex gap-2">
              <input type="hidden" name="intent" value="adjust" />
              <input type="hidden" name="id" value={card.id} />
              <input type="hidden" name="balance_cad" value={newBalance} />
              <button type="submit" disabled={fetcher.state === "submitting"}
                className="h-9 px-4 bg-primary text-on-primary text-xs font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-50">
                {fetcher.state === "submitting" ? "…" : "Enregistrer"}
              </button>
            </fetcher.Form>

            {/* Copier le code */}
            <CopyButton code={card.code} />

            {/* Supprimer */}
            <fetcher.Form method="post" onSubmit={e => { if (!confirm("Supprimer cette carte cadeau ?")) e.preventDefault(); }}>
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={card.id} />
              <button type="submit"
                className="h-9 px-3 border border-error/40 text-error text-xs font-semibold hover:bg-error/10 transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            </fetcher.Form>
          </div>

          {fetcher.data?.ok && fetcher.state === "idle" && (
            <p className="text-xs text-secondary font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">check_circle</span> Mis à jour
            </p>
          )}
          {fetcher.data?.error && (
            <p className="text-xs text-error">{fetcher.data.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-0.5">{label}</p>
      <p className={`font-sans text-sm font-semibold ${highlight ? "text-primary" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="h-9 px-3 border border-outline-variant text-on-surface-variant text-xs font-semibold hover:text-primary hover:border-primary transition-colors flex items-center gap-1">
      <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
      {copied ? "Copié !" : "Copier"}
    </button>
  );
}

// ─── Modal création ───────────────────────────────────────────────────────────

function CreateModal({ onClose }: { onClose: () => void }) {
  const fetcher = useFetcher<{ ok?: boolean; code?: string; error?: string }>();
  const created = fetcher.data?.ok && fetcher.state === "idle";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-surface w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
          <h2 className="font-sans text-base font-bold text-on-surface uppercase tracking-wider">Nouvelle carte cadeau</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {created ? (
          <div className="px-6 py-8 text-center space-y-4">
            <span className="material-symbols-outlined text-5xl text-primary block">check_circle</span>
            <p className="font-sans text-sm font-semibold text-on-surface">Carte cadeau créée !</p>
            <div className="bg-surface-container px-4 py-3 border border-outline-variant">
              <p className="font-mono text-lg font-bold text-primary tracking-widest">{fetcher.data?.code}</p>
            </div>
            <div className="flex gap-2 justify-center">
              <CopyButton code={fetcher.data?.code ?? ""} />
              <button onClick={onClose}
                className="px-4 py-2 bg-primary text-on-primary text-sm font-semibold hover:opacity-90">
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <fetcher.Form method="post" className="px-6 py-6 space-y-4">
            <input type="hidden" name="intent" value="create" />

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Montant * ($CAD)
                </label>
                <div className="relative">
                  <input type="number" name="amount_cad" required min="1" step="0.01" placeholder="50.00"
                    className="w-full h-10 pl-3 pr-10 border border-outline-variant bg-surface text-sm text-on-surface focus:outline-none focus:border-primary" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sans text-xs text-on-surface-variant">$</span>
                </div>
                {/* Montants rapides */}
                <div className="flex gap-2 mt-2">
                  {[25, 50, 75, 100, 150, 200].map(v => (
                    <button key={v} type="button"
                      onClick={e => {
                        const input = (e.currentTarget.closest("form") as HTMLFormElement)?.elements.namedItem("amount_cad") as HTMLInputElement;
                        if (input) input.value = String(v);
                      }}
                      className="px-2 py-0.5 text-xs border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary transition-colors">
                      {v} $
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Code (laissez vide pour générer automatiquement)
                </label>
                <input type="text" name="code" placeholder="DDM-XXXX-XXXX-XXXX"
                  className="w-full h-10 px-3 border border-outline-variant bg-surface font-mono text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary uppercase" />
              </div>

              <div>
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Prénom destinataire
                </label>
                <input type="text" name="recipient_name" placeholder="Marie"
                  className="w-full h-10 px-3 border border-outline-variant bg-surface text-sm text-on-surface focus:outline-none focus:border-primary" />
              </div>

              <div>
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Email destinataire
                </label>
                <input type="email" name="recipient_email" placeholder="marie@exemple.com"
                  className="w-full h-10 px-3 border border-outline-variant bg-surface text-sm text-on-surface focus:outline-none focus:border-primary" />
              </div>

              <div className="col-span-2">
                <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                  Note interne
                </label>
                <textarea name="note" rows={2} placeholder="Occasion, contexte…"
                  className="w-full px-3 py-2 border border-outline-variant bg-surface text-sm text-on-surface focus:outline-none focus:border-primary resize-none" />
              </div>
            </div>

            {fetcher.data?.error && (
              <p className="font-sans text-xs text-error">{fetcher.data.error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={fetcher.state === "submitting"}
                className="flex-1 h-10 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50">
                {fetcher.state === "submitting" ? "Création…" : "Créer la carte"}
              </button>
              <button type="button" onClick={onClose}
                className="px-5 h-10 border border-outline-variant text-on-surface-variant text-sm hover:text-primary transition-colors">
                Annuler
              </button>
            </div>
          </fetcher.Form>
        )}
      </div>
    </div>
  );
}
