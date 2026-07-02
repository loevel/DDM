import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

interface Announcement {
  id: number;
  text: string;
  link_label: string | null;
  link_to: string | null;
  countdown_to: string | null;
  highlight: number;
  bg_color: string | null;
  height_px: number;
  active: number;
  position: number;
  created_at: string;
}

const COLORS = [
  { hex: "#1b1c1c", label: "Noir" },
  { hex: "#7d562d", label: "Brun" },
  { hex: "#ba1a1a", label: "Rouge" },
  { hex: "#2d6a4f", label: "Vert" },
  { hex: "#1d4e89", label: "Bleu" },
  { hex: "#5c3d8f", label: "Violet" },
  { hex: "#b5541b", label: "Orange" },
  { hex: "#4a4a4a", label: "Gris" },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const { results } = await context.cloudflare.env.DB
    .prepare("SELECT * FROM announcements ORDER BY position ASC, id ASC")
    .all<Announcement>();

  return json({ announcements: results ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const text         = (form.get("text") as string)?.trim();
    const link_label   = (form.get("link_label") as string)?.trim() || null;
    const link_to      = (form.get("link_to") as string)?.trim() || null;
    const countdown_to = (form.get("countdown_to") as string)?.trim() || null;
    const bg_color     = (form.get("bg_color") as string) || "#1b1c1c";
    if (!text) return json({ error: "Le texte est requis." }, { status: 400 });
    const { results: ex } = await db.prepare("SELECT MAX(position) as max_pos FROM announcements").all();
    const maxPos = (ex?.[0] as any)?.max_pos ?? -1;
    const height_px = parseInt((form.get("height_px") as string) || "40") || 40;
    await db.prepare(
      "INSERT INTO announcements (text, link_label, link_to, countdown_to, bg_color, height_px, highlight, active, position) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)"
    ).bind(text, link_label, link_to, countdown_to, bg_color, height_px, maxPos + 1).run();
  }

  if (intent === "update") {
    const id           = parseInt(form.get("id") as string);
    const text         = (form.get("text") as string)?.trim();
    const link_label   = (form.get("link_label") as string)?.trim() || null;
    const link_to      = (form.get("link_to") as string)?.trim() || null;
    const countdown_to = (form.get("countdown_to") as string)?.trim() || null;
    const bg_color     = (form.get("bg_color") as string) || "#1b1c1c";
    const height_px = parseInt((form.get("height_px") as string) || "40") || 40;
    if (!text) return json({ error: "Le texte est requis." }, { status: 400 });
    await db.prepare(
      "UPDATE announcements SET text = ?, link_label = ?, link_to = ?, countdown_to = ?, bg_color = ?, height_px = ? WHERE id = ?"
    ).bind(text, link_label, link_to, countdown_to, bg_color, height_px, id).run();
  }

  if (intent === "toggle") {
    const id = parseInt(form.get("id") as string);
    await db.prepare("UPDATE announcements SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?").bind(id).run();
  }

  if (intent === "move_up") {
    const id  = parseInt(form.get("id") as string);
    const pos = parseInt(form.get("position") as string);
    if (pos > 0) {
      await db.prepare("UPDATE announcements SET position = position + 1 WHERE position = ?").bind(pos - 1).run();
      await db.prepare("UPDATE announcements SET position = ? WHERE id = ?").bind(pos - 1, id).run();
    }
  }

  if (intent === "move_down") {
    const id  = parseInt(form.get("id") as string);
    const pos = parseInt(form.get("position") as string);
    await db.prepare("UPDATE announcements SET position = position - 1 WHERE position = ?").bind(pos + 1).run();
    await db.prepare("UPDATE announcements SET position = ? WHERE id = ?").bind(pos + 1, id).run();
  }

  if (intent === "delete") {
    const id = parseInt(form.get("id") as string);
    await db.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
  }

  return json({ ok: true });
}

// ── Sélecteur de couleur ──────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-2">
        Couleur de fond
      </label>
      <div className="flex flex-wrap gap-2">
        {COLORS.map(c => (
          <button
            key={c.hex}
            type="button"
            title={c.label}
            onClick={() => onChange(c.hex)}
            className="relative w-8 h-8 rounded-full border-2 transition-all"
            style={{
              backgroundColor: c.hex,
              borderColor: value === c.hex ? "#fff" : "transparent",
              boxShadow: value === c.hex ? `0 0 0 2px ${c.hex}` : "none",
            }}
          >
            {value === c.hex && (
              <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">✓</span>
            )}
          </button>
        ))}
        {/* Couleur personnalisée */}
        <div className="relative w-8 h-8">
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full rounded-full cursor-pointer opacity-0"
            title="Couleur personnalisée"
          />
          <div
            className="w-8 h-8 rounded-full border-2 border-dashed border-outline-variant flex items-center justify-center text-[10px] text-on-surface-variant"
            style={{ backgroundColor: COLORS.some(c => c.hex === value) ? "transparent" : value }}
            title="Couleur personnalisée"
          >
            {!COLORS.some(c => c.hex === value) ? (
              <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">✓</span>
            ) : (
              <span className="material-symbols-outlined text-sm text-outline-variant">colorize</span>
            )}
          </div>
        </div>
      </div>
      <p className="font-sans text-[11px] text-on-surface-variant mt-1.5">
        Couleur sélectionnée : <code className="font-mono">{value}</code>
      </p>
    </div>
  );
}

// ── Formulaire partagé ────────────────────────────────────────────────────────
function AnnounceForm({
  intent,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  intent: "create" | "update";
  defaultValues?: Partial<Announcement>;
  onSubmit?: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const fetcher = useFetcher();
  const [bgColor, setBgColor] = useState(defaultValues?.bg_color || "#1b1c1c");

  const defaultCountdown = defaultValues?.countdown_to
    ? defaultValues.countdown_to.slice(0, 16)
    : "";

  return (
    <fetcher.Form
      method="post"
      onSubmit={() => setTimeout(() => onSubmit?.(), 150)}
      className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-surface-container-low border-t border-outline-variant/40"
    >
      <input type="hidden" name="intent" value={intent} />
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}
      <input type="hidden" name="bg_color" value={bgColor} />

      {/* Texte */}
      <div className="sm:col-span-2">
        <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
          Texte de l'annonce *
        </label>
        <input
          name="text" required
          defaultValue={defaultValues?.text ?? ""}
          placeholder="Ex : 🚚 Livraison gratuite sur toutes les commandes"
          className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Lien */}
      <div>
        <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">Texte du lien</label>
        <input
          name="link_label"
          defaultValue={defaultValues?.link_label ?? ""}
          placeholder="Ex : Boutique →"
          className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      <div>
        <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">URL du lien</label>
        <input
          name="link_to"
          defaultValue={defaultValues?.link_to ?? ""}
          placeholder="Ex : /boutique"
          className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Compte à rebours */}
      <div>
        <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
          Compte à rebours (date limite)
        </label>
        <input
          name="countdown_to"
          type="datetime-local"
          defaultValue={defaultCountdown}
          className="w-full h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Hauteur de la barre */}
      <div>
        <label className="font-sans text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
          Hauteur (px)
        </label>
        <div className="flex items-center gap-2">
          <input
            name="height_px"
            type="number"
            min="28" max="120" step="4"
            defaultValue={defaultValues?.height_px ?? 40}
            className="w-24 h-10 px-3 border border-outline-variant bg-surface font-sans text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <span className="font-sans text-xs text-on-surface-variant">px · défaut : 40</span>
        </div>
      </div>

      {/* Aperçu mini */}
      <div className="flex items-end">
        <div className="w-full flex items-center justify-center text-white text-xs font-semibold font-sans rounded-sm"
          style={{ backgroundColor: bgColor, height: `${defaultValues?.height_px ?? 40}px` }}>
          {defaultValues?.text ? defaultValues.text.slice(0, 40) + (defaultValues.text.length > 40 ? "…" : "") : "Aperçu de la couleur"}
        </div>
      </div>

      {/* Sélecteur de couleur */}
      <div className="sm:col-span-2">
        <ColorPicker value={bgColor} onChange={setBgColor} />
      </div>

      {/* Boutons */}
      <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 border border-outline-variant text-on-surface-variant font-sans text-sm hover:border-primary hover:text-primary transition-colors">
          Annuler
        </button>
        <button type="submit"
          className="px-8 py-2.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
          {fetcher.state !== "idle" ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </fetcher.Form>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function AdminAnnonces() {
  const { announcements } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const pendingId = fetcher.state !== "idle" && fetcher.formData
    ? parseInt(fetcher.formData.get("id") as string)
    : null;

  const firstActive = announcements.find(a => a.active);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif text-2xl text-on-surface mb-1">Barre d'annonces</h1>
          <p className="font-sans text-sm text-on-surface-variant">
            {announcements.filter(a => a.active).length} active(s) · {announcements.length} au total
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(s => !s); setEditingId(null); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-base">{showCreate ? "close" : "add"}</span>
          {showCreate ? "Annuler" : "Nouvelle annonce"}
        </button>
      </div>

      {/* Formulaire création */}
      {showCreate && (
        <div className="bg-surface border border-outline-variant/40 mb-8">
          <div className="px-5 py-3 border-b border-outline-variant/40 bg-surface-container-low">
            <p className="font-sans text-sm font-bold text-on-surface">Créer une nouvelle annonce</p>
          </div>
          <AnnounceForm
            intent="create"
            submitLabel="Créer l'annonce"
            onSubmit={() => setShowCreate(false)}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {/* Aperçu */}
      {firstActive && (
        <div className="mb-6 p-4 bg-surface-container border border-outline-variant/40">
          <p className="font-sans text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Aperçu — première annonce active</p>
          <div
            className="h-10 flex items-center justify-center text-white text-xs font-semibold font-sans gap-2"
            style={{ backgroundColor: firstActive.bg_color || "#1b1c1c" }}
          >
            <span>{firstActive.text}</span>
            {firstActive.link_label && <span className="underline opacity-80">{firstActive.link_label}</span>}
          </div>
        </div>
      )}

      {/* Liste */}
      {announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-3">campaign</span>
          <p className="font-sans text-base text-on-surface-variant">Aucune annonce créée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map((ann, idx) => (
            <div
              key={ann.id}
              className={`border border-outline-variant/40 bg-surface transition-opacity ${pendingId === ann.id && editingId !== ann.id ? "opacity-40 pointer-events-none" : ""}`}
            >
              <div className="flex items-center gap-4 px-5 py-4">

                {/* Flèches */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="move_up" />
                    <input type="hidden" name="id" value={ann.id} />
                    <input type="hidden" name="position" value={ann.position} />
                    <button type="submit" disabled={idx === 0}
                      className="block p-0.5 text-outline-variant hover:text-on-surface disabled:opacity-20 transition-colors">
                      <span className="material-symbols-outlined text-base leading-none">keyboard_arrow_up</span>
                    </button>
                  </fetcher.Form>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="move_down" />
                    <input type="hidden" name="id" value={ann.id} />
                    <input type="hidden" name="position" value={ann.position} />
                    <button type="submit" disabled={idx === announcements.length - 1}
                      className="block p-0.5 text-outline-variant hover:text-on-surface disabled:opacity-20 transition-colors">
                      <span className="material-symbols-outlined text-base leading-none">keyboard_arrow_down</span>
                    </button>
                  </fetcher.Form>
                </div>

                {/* Bande couleur */}
                <div className="w-2 h-10 shrink-0 rounded-sm" style={{ backgroundColor: ann.bg_color || "#1b1c1c" }} />

                {/* Texte */}
                <div className="flex-1 min-w-0">
                  <p className="font-sans text-sm text-on-surface font-medium truncate">{ann.text}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {ann.link_to && (
                      <span className="font-sans text-xs text-on-surface-variant">{ann.link_label} → {ann.link_to}</span>
                    )}
                    {ann.countdown_to && (
                      <span className="font-sans text-xs text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">timer</span>
                        {new Date(ann.countdown_to).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditingId(editingId === ann.id ? null : ann.id)}
                    title="Modifier"
                    className={`p-1.5 transition-colors ${editingId === ann.id ? "text-primary" : "text-outline-variant hover:text-primary"}`}
                  >
                    <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: editingId === ann.id ? "'FILL' 1" : "'FILL' 0" }}>edit</span>
                  </button>

                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={ann.id} />
                    <button type="submit"
                      className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 border transition-colors ml-1 ${
                        ann.active
                          ? "border-secondary/40 text-secondary hover:bg-secondary/10"
                          : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                      }`}>
                      <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: ann.active ? "'FILL' 1" : "'FILL' 0" }}>
                        {ann.active ? "visibility" : "visibility_off"}
                      </span>
                      {ann.active ? "Active" : "Inactive"}
                    </button>
                  </fetcher.Form>

                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={ann.id} />
                    <button type="submit" title="Supprimer"
                      className="p-1.5 text-outline-variant hover:text-error transition-colors ml-1">
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  </fetcher.Form>
                </div>
              </div>

              {/* Formulaire d'édition inline */}
              {editingId === ann.id && (
                <AnnounceForm
                  intent="update"
                  defaultValues={ann}
                  submitLabel="Enregistrer"
                  onSubmit={() => setEditingId(null)}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
