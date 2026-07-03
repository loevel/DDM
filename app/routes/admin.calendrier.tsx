import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Calendrier commercial — Admin DDM" }];

type CalEvent = {
  id: number; name: string; emoji: string; type: string;
  description: string | null; start_date: string; end_date: string | null;
  status: string; action_type: string | null; action_value: string | null;
  notes: string | null; created_at: string;
};

function promoCode(event: CalEvent) {
  return event.name.toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]/g, "").slice(0, 12);
}

function annBgColor(type: string) {
  if (type === "flash") return "#b7451a";
  if (type === "collection") return "#553c9a";
  if (type === "newsletter" || type === "content") return "#1b4332";
  return "#8B6F47"; // promo / défaut (beige-brun DDM)
}

function buildAnnouncementText(event: CalEvent) {
  const code = promoCode(event);
  if (event.type === "promo" || event.type === "flash") {
    return `${event.emoji} ${event.name} — -15% avec le code ${code}`;
  }
  const suffix = event.description ? ` — ${event.description.slice(0, 70)}` : "";
  return `${event.emoji} ${event.name}${suffix}`;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const today = new Date().toISOString().slice(0, 10);

  // Désactiver les annonces liées aux événements terminés
  await db.prepare(
    `UPDATE announcements SET active = 0
     WHERE calendar_event_id IN (
       SELECT id FROM sales_calendar WHERE end_date IS NOT NULL AND end_date < ?
     ) AND active = 1`
  ).bind(today).run();

  // Auto-compléter les événements passés
  await db.prepare(
    "UPDATE sales_calendar SET status = 'completed' WHERE status = 'active' AND end_date IS NOT NULL AND end_date < ?"
  ).bind(today).run();

  const events = await db.prepare(
    "SELECT * FROM sales_calendar ORDER BY start_date ASC"
  ).all<CalEvent>();

  // Événements dus (début passé, pas encore actifs)
  const due = (events.results ?? []).filter(
    (e: CalEvent) => e.status === "scheduled" && e.start_date <= today
  );

  return json({ events: events.results ?? [], today, due });
}

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const intent = g("intent");

  if (intent === "create" || intent === "update") {
    const id = g("id");
    const fields = {
      name: g("name"), emoji: g("emoji") || "📅", type: g("type"),
      description: g("description") || null, start_date: g("start_date"),
      end_date: g("end_date") || null, status: g("status"),
      action_type: g("action_type") || null, notes: g("notes") || null,
    };

    if (intent === "create") {
      await db.prepare(
        "INSERT INTO sales_calendar (name, emoji, type, description, start_date, end_date, status, action_type, notes) VALUES (?,?,?,?,?,?,?,?,?)"
      ).bind(fields.name, fields.emoji, fields.type, fields.description, fields.start_date, fields.end_date, fields.status, fields.action_type, fields.notes).run();
    } else {
      await db.prepare(
        "UPDATE sales_calendar SET name=?, emoji=?, type=?, description=?, start_date=?, end_date=?, status=?, action_type=?, notes=?, updated_at=datetime('now') WHERE id=?"
      ).bind(fields.name, fields.emoji, fields.type, fields.description, fields.start_date, fields.end_date, fields.status, fields.action_type, fields.notes, id).run();
    }
    return redirect("/admin/calendrier");
  }

  if (intent === "activate") {
    const id = g("id");
    const event = await db.prepare("SELECT * FROM sales_calendar WHERE id = ?").bind(id).first<CalEvent>();
    if (!event) return json({ error: "Événement introuvable" });

    // Activer l'événement
    await db.prepare(
      "UPDATE sales_calendar SET status = 'active', updated_at = datetime('now') WHERE id = ?"
    ).bind(id).run();

    // Créer un code promo pour les types promo/flash
    let code: string | null = null;
    if (event.type === "promo" || event.type === "flash") {
      code = promoCode(event);
      try {
        await db.prepare(
          "INSERT OR IGNORE INTO promo_codes (code, type, value, min_order, usage_limit, used_count, active, expires_at) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(code, "percent", 15, 0, 500, 0, 1, event.end_date ? event.end_date + "T23:59:59" : null).run();
      } catch { /* code existe déjà */ }
    }

    // Désactiver les annonces précédentes pour cet événement
    await db.prepare("UPDATE announcements SET active = 0 WHERE calendar_event_id = ?").bind(id).run();

    // Créer une annonce visible par les clientes (sauf types internes)
    if (event.type !== "newsletter" && event.type !== "content") {
      const annText = buildAnnouncementText(event);
      const annLink = event.type === "flash" ? "/ventes-flash" : "/boutique";
      const annLinkLabel = event.type === "flash" ? "Voir les offres" : "Découvrir";
      const bg = annBgColor(event.type);
      const countdown = (event.type === "flash" || event.type === "promo") && event.end_date
        ? event.end_date + "T23:59:59"
        : null;

      await db.prepare(
        `INSERT INTO announcements
         (text, link_label, link_to, countdown_to, highlight, active, position, bg_color, calendar_event_id)
         VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?)`
      ).bind(annText, annLinkLabel, annLink, countdown, bg, id).run();
    }

    return redirect("/admin/calendrier");
  }

  if (intent === "delete") {
    const id = g("id");
    // Désactiver les annonces liées avant de supprimer
    await db.prepare("UPDATE announcements SET active = 0 WHERE calendar_event_id = ?").bind(id).run();
    await db.prepare("DELETE FROM sales_calendar WHERE id = ?").bind(id).run();
    return redirect("/admin/calendrier");
  }

  return json({ error: "Action inconnue" });
}

const TYPE_COLOR: Record<string, string> = {
  promo:      "bg-blue-100 text-blue-800",
  flash:      "bg-orange-100 text-orange-800",
  collection: "bg-purple-100 text-purple-800",
  content:    "bg-green-100 text-green-800",
  newsletter: "bg-pink-100 text-pink-800",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  draft:     { label: "Brouillon",   color: "text-on-surface-variant", dot: "bg-gray-300" },
  scheduled: { label: "Planifié",    color: "text-blue-700",           dot: "bg-blue-400" },
  active:    { label: "En cours",    color: "text-green-700",          dot: "bg-green-500" },
  completed: { label: "Terminé",     color: "text-on-surface-variant", dot: "bg-gray-400" },
};

const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

// ── Prévisualisation avant activation ────────────────────────────────────────
function ActivationPreview({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const nav = useNavigation();
  const busy = nav.state === "submitting";

  const hasPromo = event.type === "promo" || event.type === "flash";
  const code = promoCode(event);
  const annText = buildAnnouncementText(event);
  const bg = annBgColor(event.type);
  const isInternal = event.type === "newsletter" || event.type === "content";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-lg shadow-2xl w-full max-w-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30">
          <h2 className="font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-green-600 text-lg">play_arrow</span>
            Activer — {event.emoji} {event.name}
          </h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isInternal ? (
            <div className="bg-surface-container-low rounded-lg p-4 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-base align-middle mr-1">info</span>
              Événement interne — aucune annonce ne sera affichée sur le site. Le statut passera simplement à «&nbsp;En cours&nbsp;».
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">
                  Ce que verront vos clientes en haut du site
                </p>
                {/* Mock barre d'annonce */}
                <div className="rounded overflow-hidden shadow-sm">
                  <div
                    style={{ backgroundColor: bg }}
                    className="px-4 py-3 text-white text-sm text-center flex items-center justify-center gap-4 flex-wrap"
                  >
                    <span className="font-medium">{annText}</span>
                    <span
                      className="text-white/80 text-xs border border-white/40 px-3 py-1 rounded-full"
                    >
                      {event.type === "flash" ? "Voir les offres" : "Découvrir"} →
                    </span>
                  </div>
                </div>
                {event.end_date && (event.type === "promo" || event.type === "flash") && (
                  <p className="text-xs text-on-surface-variant mt-2 text-center">
                    Un compte à rebours sera affiché jusqu'au {event.end_date}
                  </p>
                )}
              </div>

              {hasPromo && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                    Code promo qui sera créé
                  </p>
                  <p className="text-2xl font-mono font-bold text-blue-900 tracking-widest">{code}</p>
                  <p className="text-xs text-blue-600 mt-1">
                    −15% sur tout · {event.end_date ? `Expire le ${event.end_date}` : "Sans limite de date"}
                  </p>
                </div>
              )}
            </>
          )}

          <Form method="post" onSubmit={onClose}>
            <input type="hidden" name="intent" value="activate" />
            <input type="hidden" name="id" value={event.id} />
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button" onClick={onClose}
                className="px-4 py-2 text-sm border border-outline-variant text-on-surface-variant hover:text-primary transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit" disabled={busy}
                className="flex items-center gap-1.5 px-6 py-2 bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors"
              >
                <span className="material-symbols-outlined text-base">play_arrow</span>
                {busy ? "Activation…" : "Confirmer l'activation"}
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

// ── Formulaire création / édition ────────────────────────────────────────────
function EventForm({ event, onClose }: { event?: CalEvent | null; onClose: () => void }) {
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface rounded-lg shadow-2xl w-full max-w-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30">
          <h2 className="font-semibold text-on-surface">{event ? "Modifier l'événement" : "Nouvel événement"}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <Form method="post" className="p-6 space-y-4" onSubmit={onClose}>
          <input type="hidden" name="intent" value={event ? "update" : "create"} />
          {event && <input type="hidden" name="id" value={event.id} />}

          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Emoji</label>
              <input name="emoji" defaultValue={event?.emoji ?? "📅"} className="w-full border border-outline-variant bg-surface px-3 py-2 text-xl text-center focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Nom *</label>
              <input name="name" required defaultValue={event?.name} placeholder="ex: Black Friday" className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Type</label>
              <select name="type" defaultValue={event?.type ?? "promo"} className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary">
                <option value="promo">Promotion (code promo + annonce)</option>
                <option value="flash">Vente flash (annonce orange)</option>
                <option value="collection">Collection thématique (annonce violette)</option>
                <option value="newsletter">Email / Newsletter (interne)</option>
                <option value="content">Contenu / Réseaux (interne)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Statut</label>
              <select name="status" defaultValue={event?.status ?? "scheduled"} className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary">
                <option value="draft">Brouillon</option>
                <option value="scheduled">Planifié</option>
                <option value="active">En cours</option>
                <option value="completed">Terminé</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Date de début *</label>
              <input type="date" name="start_date" required defaultValue={event?.start_date} className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Date de fin</label>
              <input type="date" name="end_date" defaultValue={event?.end_date ?? ""} className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Description / Actions prévues</label>
            <textarea name="description" rows={3} defaultValue={event?.description ?? ""}
              placeholder="Que faut-il faire pour cet événement ?" className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Notes internes</label>
            <input name="notes" defaultValue={event?.notes ?? ""} placeholder="Stock à préparer, influenceuses contactées…" className="w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-outline-variant text-on-surface-variant hover:text-primary transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={busy} className="px-6 py-2 bg-primary text-on-primary text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {busy ? "Enregistrement…" : event ? "Mettre à jour" : "Créer"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────
export default function AdminCalendrier() {
  const { events, today, due } = useLoaderData<typeof loader>();
  const [editing, setEditing] = useState<CalEvent | null | undefined>(undefined);
  const [activating, setActivating] = useState<CalEvent | null>(null);
  const nav = useNavigation();

  const byMonth: Record<number, CalEvent[]> = {};
  (events as CalEvent[]).forEach(e => {
    const m = new Date(e.start_date).getMonth();
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(e);
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Calendrier commercial</h1>
          <p className="text-sm text-on-surface-variant mt-1">Planifiez et gérez vos événements commerciaux de l'année.</p>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 text-sm font-semibold hover:opacity-90"
        >
          <span className="material-symbols-outlined text-base">add</span>
          Nouvel événement
        </button>
      </div>

      {/* Alertes événements à activer */}
      {(due as CalEvent[]).length > 0 && (
        <div className="mb-6 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-yellow-600">notifications_active</span>
            <p className="font-semibold text-yellow-800 text-sm">
              {due.length} événement{due.length > 1 ? "s" : ""} à activer maintenant
            </p>
          </div>
          <div className="space-y-2">
            {(due as CalEvent[]).map(e => (
              <div key={e.id} className="flex items-center justify-between bg-white border border-yellow-200 rounded px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{e.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{e.name}</p>
                    <p className="text-xs text-on-surface-variant">Début : {e.start_date}{e.end_date ? ` → ${e.end_date}` : ""}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button" onClick={() => setEditing(e)}
                    className="text-xs border border-outline-variant px-3 py-1.5 text-on-surface-variant hover:text-primary transition-colors"
                  >
                    Modifier
                  </button>
                  <button
                    type="button" onClick={() => setActivating(e)}
                    disabled={nav.state === "submitting"}
                    className="flex items-center gap-1 text-xs bg-green-600 text-white px-4 py-1.5 font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors"
                  >
                    <span className="material-symbols-outlined text-xs">play_arrow</span>
                    Activer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vue par mois */}
      <div className="space-y-6">
        {Array.from({ length: 12 }, (_, m) => {
          const monthEvents = byMonth[m] ?? [];
          if (monthEvents.length === 0) return null;
          return (
            <div key={m} className="bg-surface border border-outline-variant/30 rounded-lg overflow-hidden">
              <div className="px-5 py-3 bg-surface-container-low border-b border-outline-variant/20 flex items-center gap-2">
                <span className="text-sm font-bold text-on-surface uppercase tracking-widest">{MONTHS[m]}</span>
                <span className="text-xs text-on-surface-variant">{monthEvents.length} événement{monthEvents.length > 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-outline-variant/10">
                {monthEvents.map(e => {
                  const sc = STATUS_CONFIG[e.status] ?? STATUS_CONFIG.draft;
                  const isPast = e.status === "completed" || (e.end_date && e.end_date < today);
                  return (
                    <div key={e.id} className={`flex items-start gap-4 px-5 py-4 hover:bg-surface-container-low transition-colors ${isPast ? "opacity-50" : ""}`}>
                      <span className="text-2xl mt-0.5 shrink-0">{e.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-sm text-on-surface">{e.name}</p>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${sc.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${TYPE_COLOR[e.type] ?? "bg-gray-100 text-gray-600"}`}>
                            {e.type}
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant mb-1">
                          {e.start_date}{e.end_date && e.end_date !== e.start_date ? ` → ${e.end_date}` : ""}
                        </p>
                        {e.description && <p className="text-xs text-on-surface-variant/80 line-clamp-2">{e.description}</p>}
                        {e.notes && <p className="text-xs text-primary/70 mt-1 italic">📝 {e.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {e.status === "scheduled" && e.start_date <= today && (
                          <button
                            type="button"
                            onClick={() => setActivating(e)}
                            title="Activer"
                            className="p-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">play_arrow</span>
                          </button>
                        )}
                        <button
                          onClick={() => setEditing(e)}
                          className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded hover:bg-surface-container"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
                        <Form method="post" onSubmit={ev => { if (!confirm("Supprimer cet événement ?")) ev.preventDefault(); }}>
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={e.id} />
                          <button
                            type="submit"
                            className="p-2 text-on-surface-variant hover:text-error transition-colors rounded hover:bg-error-container/30"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </Form>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {(events as CalEvent[]).length === 0 && (
        <div className="flex flex-col items-center py-20 text-center text-on-surface-variant">
          <span className="text-6xl mb-4">📅</span>
          <p className="font-semibold text-on-surface mb-2">Aucun événement planifié</p>
          <p className="text-sm mb-6">Créez votre premier événement ou utilisez les templates saisonniers.</p>
          <button onClick={() => setEditing(null)} className="bg-primary text-on-primary px-6 py-2.5 text-sm font-semibold hover:opacity-90">
            Créer un événement
          </button>
        </div>
      )}

      {editing !== undefined && <EventForm event={editing} onClose={() => setEditing(undefined)} />}
      {activating && <ActivationPreview event={activating} onClose={() => setActivating(null)} />}
    </div>
  );
}
