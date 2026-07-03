import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState, useRef } from "react";
import { cfImage } from "~/lib/images";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Nouveau produit — Admin DDM" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const { results } = await db.prepare("SELECT id, nom FROM fournisseurs ORDER BY nom ASC").all<{ id: number; nom: string }>().catch(() => ({ results: [] as { id: number; nom: string }[] }));
  return json({ fournisseurs: results ?? [] });
}

// ─── Type médias ──────────────────────────────────────────────────────────────

export type MediaItem = {
  type: "image" | "video";
  url: string;
  thumbnail_url: string;
  alt_text: string;
};

type MediaItemWithKey = MediaItem & { _key: string };

// ─── Action ───────────────────────────────────────────────────────────────────

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const n = (k: string) => { const v = g(k); return v ? Number(v) : null; };
  const b = (k: string) => f.get(k) === "1" ? 1 : 0;

  const slug = g("slug") || g("name").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  if (!g("name") || !g("price_cad") || !g("famille") || !slug) {
    return { error: "Nom, prix, famille et slug sont requis." };
  }

  // Médias : on prend la 1ère image comme image_key (compat rétroactive)
  let mediaItems: MediaItem[] = [];
  try { mediaItems = JSON.parse(g("media_json") || "[]"); } catch { mediaItems = []; }
  const firstImageUrl = mediaItems.find(m => m.type === "image")?.url ?? null;

  const db = context.cloudflare.env.DB;

  let productId: number;
  try {
    await db.prepare(`
      INSERT INTO products (
        slug, name, description, price_cad, compare_at_price_cad, category, famille,
        type_lace, texture, longueur_po, densite, couleur,
        hd_lace, glueless, pret_a_porter, quantite_meches,
        stock, image_key, featured,
        prix_achat_usd, frais_expedition_usd, frais_douane_pct,
        fournisseur_id, ref_fournisseur,
        delai_livraison_jours, pays_fabrication,
        date_derniere_commande, date_prochain_reapprovisionnement,
        qualite_cheveux, origine_cheveux, cap_size, nb_combs,
        seuil_alerte_stock, stock_en_commande, sku, poids_g, localisation_entrepot,
        meta_title, meta_description, tags, notes_internes
      ) VALUES (
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
      )
    `).bind(
      slug, g("name"), g("description") || null,
      Number(g("price_cad")), n("compare_at_price_cad"),
      g("famille") === "perruque" ? "perruque" :
      g("famille") === "accessoire" || g("famille") === "soin" ? g("famille") : "perruque",
      g("famille"),
      g("type_lace") || null, g("texture") || null,
      n("longueur_po"), n("densite"),
      g("couleur") || null,
      b("hd_lace"), b("glueless"), b("pret_a_porter"),
      n("quantite_meches"),
      Number(g("stock") || 0), firstImageUrl, b("featured"),
      n("prix_achat_usd"), n("frais_expedition_usd"), n("frais_douane_pct") ?? 0,
      n("fournisseur_id"), g("ref_fournisseur") || null,
      n("delai_livraison_jours"), g("pays_fabrication") || "Chine",
      g("date_derniere_commande") || null, g("date_prochain_reapprovisionnement") || null,
      g("qualite_cheveux") || null, g("origine_cheveux") || null,
      g("cap_size") || null, n("nb_combs"),
      Number(g("seuil_alerte_stock") || 3), Number(g("stock_en_commande") || 0),
      g("sku") || null, n("poids_g"), g("localisation_entrepot") || null,
      g("meta_title") || null, g("meta_description") || null,
      g("tags") || null, g("notes_internes") || null
    ).run();

    const row = await db.prepare("SELECT last_insert_rowid() as id").first<{ id: number }>();
    productId = row!.id;
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return { error: "Ce slug existe déjà." };
    return { error: e.message };
  }

  // Insérer les médias
  for (let i = 0; i < mediaItems.length; i++) {
    const m = mediaItems[i];
    await db.prepare(
      "INSERT INTO product_media (product_id, type, url, thumbnail_url, alt_text, position) VALUES (?,?,?,?,?,?)"
    ).bind(productId, m.type, m.url, m.thumbnail_url || null, m.alt_text || null, i).run();
  }

  // Insérer les variantes et synchroniser le stock produit
  type VariantInput = { name: string; stock: number; price_adjustment_cad: number; sku?: string };
  let variants: VariantInput[] = [];
  try { variants = JSON.parse(g("variants_json") || "[]"); } catch { variants = []; }
  if (variants.length > 0) {
    let totalStock = 0;
    for (const v of variants) {
      if (!v.name) continue;
      await db.prepare(
        "INSERT INTO product_variants (product_id, name, price_adjustment_cad, stock, sku) VALUES (?,?,?,?,?)"
      ).bind(productId, v.name, v.price_adjustment_cad ?? 0, v.stock ?? 0, v.sku || null).run();
      totalStock += Number(v.stock ?? 0);
    }
    await db.prepare("UPDATE products SET stock = ? WHERE id = ?").bind(totalStock, productId).run();
  }

  throw redirect("/admin/produits");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NouveauProduit() {
  const { fournisseurs } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/produits" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">Nouveau produit</h1>
      </div>

      {data?.error && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container text-sm">{data.error}</div>
      )}

      <Form method="post" className="space-y-6">
        <ProduitFormFields fournisseurs={fournisseurs} />
        <VariantsEditor />
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={nav.state === "submitting"}
            className="bg-primary text-on-primary px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
            {nav.state === "submitting" ? "Création…" : "Créer le produit"}
          </button>
          <Link to="/admin/produits" className="px-6 py-2.5 text-sm border border-outline-variant text-on-surface-variant hover:text-primary transition-colors">
            Annuler
          </Link>
        </div>
      </Form>
    </div>
  );
}

// ─── Constantes caractéristiques ──────────────────────────────────────────────

const TEXTURES = [
  ["lisse", "Lisse (Straight)"], ["body-wave", "Body Wave"], ["water-wave", "Water Wave"],
  ["deep-wave", "Deep Wave"], ["loose-wave", "Loose Wave"], ["boucle", "Bouclé (Curly)"],
  ["kinky-curly", "Kinky Curly"], ["kinky-straight", "Kinky Straight"],
  ["bob", "Bob"], ["avec-frange", "Avec frange"], ["autre", "Autre"],
];

const COULEURS = [
  ["naturel", "Noir naturel"], ["brun-fonce", "Brun foncé"], ["chatain", "Châtain"],
  ["balayage", "Balayage / Highlights"], ["ombre", "Ombré"], ["blonde-613", "Blonde 613"],
  ["colore", "Coloré (rouge, bordeaux…)"], ["autre", "Autre"],
];

const TYPES_LACE = [
  ["13x4", "13×4 Lace Front"], ["13x6", "13×6 Lace Front"], ["4x4", "4×4 Lace Closure"],
  ["5x5", "5×5 Lace Closure"], ["6x6", "6×6 Lace Closure"], ["360", "360 Lace"],
  ["full", "Full Lace"], ["v-part", "V-Part"], ["u-part", "U-Part"],
  ["glueless", "Glueless (sans colle)"], ["pre-everything", "Pré-Everything™"],
];

const LONGUEURS = [8,10,12,14,16,18,20,22,24,26,28,30,32,36,40];

// ─── Éditeur description Markdown ────────────────────────────────────────────

function DescriptionEditor({ defaultValue }: { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [preview, setPreview] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after: string) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    const next = ta.value.slice(0, start) + before + (sel || "texte") + after + ta.value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, end + before.length + (sel ? 0 : 5));
    });
  }

  function insertLine(prefix: string) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", start - 1) + 1;
    const next = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
    setValue(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(start + prefix.length, start + prefix.length); });
  }

  function renderPreview(md: string) {
    return md
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/^- (.+)/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul class="list-disc pl-4">${m}</ul>`)
      .replace(/\n/g, "<br>");
  }

  return (
    <div className="border border-outline-variant focus-within:border-primary transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-surface-container-low border-b border-outline-variant/40">
        {[
          { icon: "format_bold",          title: "Gras",       action: () => wrap("**", "**") },
          { icon: "format_italic",        title: "Italique",   action: () => wrap("*", "*") },
          { icon: "format_list_bulleted", title: "Liste",      action: () => insertLine("- ") },
        ].map(btn => (
          <button key={btn.icon} type="button" onClick={btn.action} title={btn.title}
            className="p-1 rounded text-on-surface-variant hover:text-primary hover:bg-primary/8 transition-colors">
            <span className="material-symbols-outlined text-[18px] leading-none">{btn.icon}</span>
          </button>
        ))}
        <div className="flex-1" />
        <button type="button" onClick={() => setPreview(v => !v)}
          className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded transition-colors ${preview ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-primary"}`}>
          <span className="material-symbols-outlined text-sm leading-none">{preview ? "edit" : "visibility"}</span>
          {preview ? "Éditer" : "Aperçu"}
        </button>
      </div>
      {/* Zone de texte ou aperçu */}
      {preview ? (
        <div
          className="px-3 py-2 text-sm text-on-surface min-h-[96px] leading-relaxed prose-sm"
          dangerouslySetInnerHTML={{ __html: renderPreview(value) || "<span class='text-on-surface-variant italic'>Aucun contenu</span>" }}
        />
      ) : (
        <textarea
          ref={taRef}
          name="description"
          value={value}
          onChange={e => setValue(e.target.value)}
          rows={5}
          placeholder="Décrivez le produit… Utilisez la barre d'outils pour formater."
          className="w-full px-3 py-2 text-sm bg-surface focus:outline-none resize-y"
        />
      )}
      <div className="px-3 py-1 border-t border-outline-variant/20 flex items-center justify-between">
        <span className="text-[10px] text-on-surface-variant">Markdown supporté : **gras**, *italique*, - liste</span>
        <span className="text-[10px] text-on-surface-variant">{value.length} car.</span>
      </div>
    </div>
  );
}

// ─── Galerie de médias (images + vidéos) ─────────────────────────────────────

function genKey() { return Math.random().toString(36).slice(2, 9); }

function extractVideoThumbnail(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/\s]+)/);
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return ""; // Vimeo API requiert un appel asynchrone, on laisse vide
  return "";
}

function MediaGalleryWidget({ defaultMedia }: { defaultMedia?: MediaItem[] }) {
  const [items, setItems] = useState<MediaItemWithKey[]>(
    () => (defaultMedia ?? []).map(m => ({ ...m, _key: genKey() }))
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [showVideoInput, setShowVideoInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const serialized = JSON.stringify(
    items.map(({ _key, ...rest }) => rest)
  );

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload-image", { method: "POST", body: fd });
        const data = await res.json() as { imageUrl?: string; error?: string };
        if (!res.ok || !data.imageUrl) throw new Error(data.error ?? "Erreur upload");
        setItems(prev => [...prev, {
          _key: genKey(),
          type: "image",
          url: data.imageUrl!,
          thumbnail_url: "",
          alt_text: "",
        }]);
      }
    } catch (err: any) {
      setUploadError(err.message ?? "Erreur upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addVideo() {
    const url = videoUrl.trim();
    if (!url) return;
    setItems(prev => [...prev, {
      _key: genKey(),
      type: "video",
      url,
      thumbnail_url: extractVideoThumbnail(url),
      alt_text: "",
    }]);
    setVideoUrl("");
    setShowVideoInput(false);
  }

  function remove(key: string) {
    setItems(prev => prev.filter(i => i._key !== key));
  }

  function move(key: string, dir: -1 | 1) {
    setItems(prev => {
      const idx = prev.findIndex(i => i._key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function updateAlt(key: string, value: string) {
    setItems(prev => prev.map(i => i._key === key ? { ...i, alt_text: value } : i));
  }

  return (
    <div className="space-y-4">
      {/* Champ caché sérialisé — soumis avec le formulaire */}
      <input type="hidden" name="media_json" value={serialized} />

      {/* Grille de prévisualisation */}
      {items.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {items.map((item, idx) => {
            const thumb = item.type === "image"
              ? (cfImage(item.url, "thumbnail") ?? item.url)
              : item.thumbnail_url;

            return (
              <div key={item._key}
                className={`relative group aspect-[3/4] bg-surface-container border overflow-hidden flex-shrink-0
                  ${idx === 0 ? "border-primary ring-1 ring-primary" : "border-outline-variant/40"}`}>

                {/* Badge couverture (1er élément image) */}
                {idx === 0 && item.type === "image" && (
                  <span className="absolute top-1 left-1 z-10 bg-primary text-on-primary text-[8px] font-bold px-1 py-0.5 uppercase tracking-wider leading-none">
                    Couverture
                  </span>
                )}

                {/* Badge vidéo */}
                {item.type === "video" && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                    <span className="material-symbols-outlined text-white text-4xl drop-shadow-lg opacity-80">play_circle</span>
                  </div>
                )}

                {/* Miniature */}
                {thumb ? (
                  <img src={thumb} alt={item.alt_text || ""} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-3xl text-outline-variant">
                      {item.type === "video" ? "smart_display" : "image"}
                    </span>
                    {item.type === "video" && (
                      <span className="text-[9px] text-outline-variant text-center px-1 break-all line-clamp-2">
                        {item.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 30)}…
                      </span>
                    )}
                  </div>
                )}

                {/* Contrôles au survol */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(item._key, -1)} disabled={idx === 0}
                      title="Monter"
                      className="bg-white/20 hover:bg-white/50 text-white p-1 disabled:opacity-25 transition-colors">
                      <span className="material-symbols-outlined text-sm">arrow_upward</span>
                    </button>
                    <button type="button" onClick={() => move(item._key, 1)} disabled={idx === items.length - 1}
                      title="Descendre"
                      className="bg-white/20 hover:bg-white/50 text-white p-1 disabled:opacity-25 transition-colors">
                      <span className="material-symbols-outlined text-sm">arrow_downward</span>
                    </button>
                    <button type="button" onClick={() => remove(item._key)}
                      title="Supprimer"
                      className="bg-error/80 hover:bg-error text-white p-1 transition-colors">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={item.alt_text}
                    onChange={e => updateAlt(item._key, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder="Texte alt…"
                    className="w-full text-[10px] bg-black/60 text-white placeholder:text-white/50 border border-white/30 px-1.5 py-0.5 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* État vide */
        <div
          className="border-2 border-dashed border-outline-variant/50 py-10 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileRef.current?.click()}>
          <span className="material-symbols-outlined text-4xl text-outline-variant">perm_media</span>
          <p className="text-sm text-on-surface-variant">Cliquez pour ajouter des images</p>
          <p className="text-[11px] text-on-surface-variant/60">ou utilisez les boutons ci-dessous</p>
        </div>
      )}

      {/* Boutons d'ajout */}
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

        <button type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-outline-variant text-on-surface hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
          <span className={`material-symbols-outlined text-sm ${uploading ? "animate-spin" : ""}`}>
            {uploading ? "progress_activity" : "add_photo_alternate"}
          </span>
          {uploading ? "Envoi en cours…" : "Ajouter des images"}
        </button>

        <button type="button"
          onClick={() => setShowVideoInput(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border transition-colors
            ${showVideoInput ? "border-primary text-primary" : "border-outline-variant text-on-surface hover:border-primary hover:text-primary"}`}>
          <span className="material-symbols-outlined text-sm">smart_display</span>
          Ajouter une vidéo
        </button>

        {items.length > 0 && (
          <span className="text-xs text-on-surface-variant ml-auto">
            {items.filter(i => i.type === "image").length} image{items.filter(i => i.type === "image").length > 1 ? "s" : ""}
            {items.filter(i => i.type === "video").length > 0 && ` · ${items.filter(i => i.type === "video").length} vidéo${items.filter(i => i.type === "video").length > 1 ? "s" : ""}`}
          </span>
        )}
      </div>

      {uploadError && (
        <p className="text-xs text-error flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">error</span>
          {uploadError}
        </p>
      )}

      {/* Champ URL vidéo */}
      {showVideoInput && (
        <div className="bg-surface-container-low border border-outline-variant/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Ajouter une vidéo par URL</p>
          <div className="flex gap-2">
            <input
              type="url"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addVideo(); } }}
              placeholder="https://www.youtube.com/watch?v=… ou https://vimeo.com/…"
              className="flex-1 border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary"
              autoFocus
            />
            <button type="button" onClick={addVideo}
              disabled={!videoUrl.trim()}
              className="px-4 py-2 text-xs font-semibold bg-primary text-on-primary hover:opacity-90 disabled:opacity-50">
              Ajouter
            </button>
            <button type="button" onClick={() => { setShowVideoInput(false); setVideoUrl(""); }}
              className="px-3 py-2 text-xs text-on-surface-variant hover:text-error transition-colors">
              Annuler
            </button>
          </div>
          <p className="text-[10px] text-on-surface-variant">
            Compatible : YouTube, Vimeo. La miniature YouTube est récupérée automatiquement.
          </p>
        </div>
      )}

      <p className="text-[10px] text-on-surface-variant">
        La 1ère image de la galerie devient l'image de couverture du produit. · Images : JPG, PNG, WebP · max 10 Mo.
        · Survolez une vignette pour réordonner, supprimer ou modifier le texte alternatif.
      </p>
    </div>
  );
}

// ─── Champs du formulaire partagé ─────────────────────────────────────────────

export function ProduitFormFields({ defaults, fournisseurs = [] }: { defaults?: Record<string, any>; fournisseurs?: { id: number; nom: string }[] }) {
  const [prixVente, setPrixVente] = useState(defaults?.price_cad ?? "");
  const [prixAchat, setPrixAchat] = useState(defaults?.prix_achat_usd ?? "");
  const [fraisExp, setFraisExp] = useState(defaults?.frais_expedition_usd ?? "");
  const [douanePct, setDouanePct] = useState(defaults?.frais_douane_pct ?? 0);
  const TAUX = 1.38;

  const coutRevientCAD = prixAchat
    ? ((Number(prixAchat) + Number(fraisExp || 0)) * TAUX) * (1 + Number(douanePct || 0) / 100)
    : null;
  const margePct = coutRevientCAD && prixVente
    ? ((Number(prixVente) - coutRevientCAD) / Number(prixVente)) * 100
    : null;
  const margeBrute = coutRevientCAD && prixVente
    ? Number(prixVente) - coutRevientCAD
    : null;
  const margeColor = margePct === null ? "" : margePct >= 40 ? "text-secondary" : margePct >= 20 ? "text-primary" : "text-error";

  // Médias existants (page d'édition)
  const defaultMedia: MediaItem[] = defaults?.media ?? [];

  return (
    <div className="space-y-6">

      {/* ── 1. Médias ── */}
      <Section title="Photos & Vidéos" icon="perm_media" subtitle="Ajoutez toutes vos images produit et vos vidéos de présentation. La première image sera utilisée comme couverture.">
        <MediaGalleryWidget defaultMedia={defaultMedia} />
      </Section>

      {/* ── 2. Informations générales ── */}
      <Section title="Informations générales" icon="inventory_2">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Nom du produit *</Label>
            <input name="name" defaultValue={defaults?.name} required className={inp} />
          </div>
          <div>
            <Label>Slug (URL)</Label>
            <input name="slug" defaultValue={defaults?.slug} placeholder="auto-généré" className={inp} />
          </div>
          <div>
            <Label>SKU interne</Label>
            <input name="sku" defaultValue={defaults?.sku} placeholder="ex: DDM-2024-001" className={inp} />
          </div>
          <div>
            <Label>Stock actuel</Label>
            <input name="stock" type="number" min="0" defaultValue={defaults?.stock ?? 0} className={inp} />
          </div>
          <div>
            <Label>Stock en commande</Label>
            <input name="stock_en_commande" type="number" min="0" defaultValue={defaults?.stock_en_commande ?? 0} className={inp} />
          </div>
          <div>
            <Label>Seuil d'alerte stock</Label>
            <input name="seuil_alerte_stock" type="number" min="0" defaultValue={defaults?.seuil_alerte_stock ?? 3}
              placeholder="Alerte sous ce niveau" className={inp} />
          </div>
          <div>
            <Label>Localisation entrepôt</Label>
            <input name="localisation_entrepot" defaultValue={defaults?.localisation_entrepot}
              placeholder="ex: Étagère A3, Bac 2" className={inp} />
          </div>
          <div className="col-span-2">
            <Label>Description publique</Label>
            <DescriptionEditor defaultValue={defaults?.description} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" name="featured" id="featured" value="1"
              defaultChecked={defaults?.featured === 1} className="accent-primary" />
            <label htmlFor="featured" className="text-sm text-on-surface">Mettre en vedette (page d'accueil)</label>
          </div>
        </div>
      </Section>

      {/* ── 3. Prix & Marges ── */}
      <Section title="Prix & Marges" icon="payments">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Prix de vente CAD *</Label>
            <input name="price_cad" type="number" step="0.01" min="0"
              defaultValue={defaults?.price_cad} required className={inp}
              onChange={e => setPrixVente(e.target.value)} />
          </div>
          <div>
            <Label>Prix barré CAD (avant réduction)</Label>
            <input name="compare_at_price_cad" type="number" step="0.01" min="0"
              defaultValue={defaults?.compare_at_price_cad ?? ""}
              placeholder="Laisser vide si prix normal" className={inp} />
          </div>
          <div>
            <Label>Prix d'achat fournisseur USD</Label>
            <input name="prix_achat_usd" type="number" step="0.01" min="0"
              defaultValue={defaults?.prix_achat_usd ?? ""}
              placeholder="0.00" className={inp}
              onChange={e => setPrixAchat(e.target.value)} />
          </div>
          <div>
            <Label>Frais d'expédition USD</Label>
            <input name="frais_expedition_usd" type="number" step="0.01" min="0"
              defaultValue={defaults?.frais_expedition_usd ?? ""}
              placeholder="0.00" className={inp}
              onChange={e => setFraisExp(e.target.value)} />
          </div>
          <div>
            <Label>Droits de douane %</Label>
            <input name="frais_douane_pct" type="number" step="0.1" min="0" max="100"
              defaultValue={defaults?.frais_douane_pct ?? 0}
              placeholder="0" className={inp}
              onChange={e => setDouanePct(Number(e.target.value))} />
          </div>
        </div>

        {coutRevientCAD !== null && (
          <div className="mt-5 p-4 bg-surface-container border border-outline-variant/50 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Coût de revient</p>
              <p className="font-mono text-lg font-bold text-on-surface">{coutRevientCAD.toFixed(2)} $</p>
              <p className="text-[10px] text-on-surface-variant">taux indicatif 1 USD = {TAUX} CAD</p>
            </div>
            <div className="text-center border-x border-outline-variant">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Marge brute</p>
              <p className={`font-mono text-lg font-bold ${margeColor}`}>{margeBrute?.toFixed(2)} $</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Marge %</p>
              <p className={`font-mono text-lg font-bold ${margeColor}`}>
                {margePct !== null ? `${margePct.toFixed(1)}%` : "—"}
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* ── 4. Fournisseur ── */}
      <Section title="Fournisseur" icon="local_shipping">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <Label>Fournisseur</Label>
              <a href="/admin/fournisseurs" target="_blank"
                className="text-xs text-primary hover:underline flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                Gérer les fournisseurs
              </a>
            </div>
            {fournisseurs.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-on-surface-variant border border-outline-variant/50 px-3 py-2">
                <span className="material-symbols-outlined text-sm">info</span>
                Aucun fournisseur enregistré —{" "}
                <a href="/admin/fournisseurs" target="_blank" className="text-primary underline">créer un fournisseur</a>
              </div>
            ) : (
              <select name="fournisseur_id" defaultValue={defaults?.fournisseur_id ?? ""} className={inp}>
                <option value="">— Sélectionner un fournisseur —</option>
                {fournisseurs.map(f => (
                  <option key={f.id} value={f.id}>{f.nom}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <Label>Référence produit chez le fournisseur</Label>
            <input name="ref_fournisseur" defaultValue={defaults?.ref_fournisseur}
              placeholder="ex: SKU-HC-2024-B" className={inp} />
          </div>
          <div>
            <Label>Délai de livraison (jours)</Label>
            <input name="delai_livraison_jours" type="number" min="0"
              defaultValue={defaults?.delai_livraison_jours ?? ""}
              placeholder="ex: 14" className={inp} />
          </div>
          <div>
            <Label>Pays de fabrication</Label>
            <input name="pays_fabrication" defaultValue={defaults?.pays_fabrication ?? "Chine"} className={inp} />
          </div>
          <div>
            <Label>Date dernière commande</Label>
            <input name="date_derniere_commande" type="date"
              defaultValue={defaults?.date_derniere_commande ?? ""} className={inp} />
          </div>
          <div>
            <Label>Prochain réapprovisionnement</Label>
            <input name="date_prochain_reapprovisionnement" type="date"
              defaultValue={defaults?.date_prochain_reapprovisionnement ?? ""} className={inp} />
          </div>
        </div>
      </Section>

      {/* ── 5. Famille de produit ── */}
      <Section title="Famille de produit" icon="category">
        <div className="grid grid-cols-3 gap-3">
          {[
            ["perruque", "Perruque", "styler"],
            ["meche", "Mèche / Tissage", "waves"],
            ["closure", "Closure", "crop_square"],
            ["frontal", "Frontal", "crop_free"],
            ["accessoire", "Accessoire", "inventory_2"],
            ["soin", "Soin", "spa"],
          ].map(([val, label, icon]) => (
            <label key={val} className="flex items-center gap-2 p-3 border border-outline-variant cursor-pointer hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-colors">
              <input type="radio" name="famille" value={val}
                defaultChecked={(defaults?.famille ?? "perruque") === val}
                className="accent-primary" />
              <span className="material-symbols-outlined text-sm text-on-surface-variant">{icon}</span>
              <span className="text-sm font-medium text-on-surface">{label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* ── 6. Caractéristiques techniques ── */}
      <Section title="Caractéristiques techniques" icon="tune" subtitle="Laissez vide si non applicable">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Type de construction (lace)</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {TYPES_LACE.map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="radio" name="type_lace" value={val}
                    defaultChecked={defaults?.type_lace === val} className="accent-primary" />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-xs cursor-pointer col-span-3 text-on-surface-variant">
                <input type="radio" name="type_lace" value="" defaultChecked={!defaults?.type_lace}
                  className="accent-primary" />
                Non applicable
              </label>
            </div>
          </div>

          <div>
            <Label>Texture</Label>
            <select name="texture" defaultValue={defaults?.texture ?? ""} className={inp}>
              <option value="">— Non applicable —</option>
              {TEXTURES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          </div>

          <div>
            <Label>Couleur</Label>
            <select name="couleur" defaultValue={defaults?.couleur ?? ""} className={inp}>
              <option value="">— Non applicable —</option>
              {COULEURS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
          </div>

          <div>
            <Label>Longueur (pouces)</Label>
            <select name="longueur_po" defaultValue={defaults?.longueur_po ?? ""} className={inp}>
              <option value="">— Non applicable —</option>
              {LONGUEURS.map(l => <option key={l} value={l}>{l} po</option>)}
            </select>
          </div>

          <div>
            <Label>Densité</Label>
            <select name="densite" defaultValue={defaults?.densite ?? ""} className={inp}>
              <option value="">— Non applicable —</option>
              {[130,150,180,200,250].map(d => <option key={d} value={d}>{d}%</option>)}
            </select>
          </div>

          <div>
            <Label>Qualité cheveux</Label>
            <select name="qualite_cheveux" defaultValue={defaults?.qualite_cheveux ?? ""} className={inp}>
              <option value="">— Non précisé —</option>
              <option value="remy">Remy Hair</option>
              <option value="virgin">Virgin Hair (non traité)</option>
              <option value="double-drawn">Double Drawn</option>
              <option value="single-drawn">Single Drawn</option>
              <option value="non-remy">Non-Remy</option>
              <option value="synthetique">Synthétique</option>
              <option value="melange">Mélange (cheveux + synthétique)</option>
            </select>
          </div>

          <div>
            <Label>Origine des cheveux</Label>
            <select name="origine_cheveux" defaultValue={defaults?.origine_cheveux ?? ""} className={inp}>
              <option value="">— Non précisé —</option>
              <option value="bresilien">Brésilien</option>
              <option value="peruvien">Péruvien</option>
              <option value="indien">Indien</option>
              <option value="malaisien">Malaisien</option>
              <option value="cambodgien">Cambodgien</option>
              <option value="vietnamien">Vietnamien</option>
              <option value="europeen">Européen</option>
              <option value="synthetique">Synthétique</option>
            </select>
          </div>

          <div>
            <Label>Taille du bonnet (cap size)</Label>
            <select name="cap_size" defaultValue={defaults?.cap_size ?? ""} className={inp}>
              <option value="">— Non précisé —</option>
              <option value="petite">Petite (55 cm et moins)</option>
              <option value="moyenne">Moyenne (55–57 cm)</option>
              <option value="grande">Grande (57 cm et plus)</option>
              <option value="universelle">Universelle / Ajustable</option>
            </select>
          </div>

          <div>
            <Label>Nombre de peignes intégrés</Label>
            <select name="nb_combs" defaultValue={defaults?.nb_combs ?? ""} className={inp}>
              <option value="">— Non précisé —</option>
              {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} peigne{n > 1 ? "s" : ""}</option>)}
            </select>
          </div>

          <div>
            <Label>Quantité de mèches (bundles)</Label>
            <select name="quantite_meches" defaultValue={defaults?.quantite_meches ?? ""} className={inp}>
              <option value="">— Non applicable —</option>
              {[1,2,3,4].map(q => <option key={q} value={q}>{q} mèche{q > 1 ? "s" : ""}</option>)}
            </select>
          </div>

          <div>
            <Label>Poids (grammes)</Label>
            <input name="poids_g" type="number" min="0"
              defaultValue={defaults?.poids_g ?? ""}
              placeholder="ex: 180" className={inp} />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 mt-5">
          {[
            ["hd_lace", "HD Lace (dentelle ultra-fine invisible)"],
            ["glueless", "Sans colle (glueless)"],
            ["pret_a_porter", "Prêt à porter (Pré-Everything™)"],
          ].map(([name, label]) => (
            <label key={name} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name={name} id={name} value="1"
                defaultChecked={defaults?.[name] === 1} className="accent-primary w-4 h-4" />
              <span className="text-sm text-on-surface">{label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* ── 7. SEO & Marketing ── */}
      <Section title="SEO & Marketing" icon="search">
        <div className="space-y-4">
          <div>
            <Label>Titre SEO (meta title)</Label>
            <input name="meta_title" defaultValue={defaults?.meta_title}
              placeholder="Laissez vide pour utiliser le nom du produit" className={inp} />
            <p className="text-[11px] text-on-surface-variant mt-1">Recommandé : 50-60 caractères</p>
          </div>
          <div>
            <Label>Description SEO (meta description)</Label>
            <textarea name="meta_description" defaultValue={defaults?.meta_description} rows={2}
              placeholder="Description courte pour les moteurs de recherche…"
              className={`${inp} resize-none`} />
            <p className="text-[11px] text-on-surface-variant mt-1">Recommandé : 150-160 caractères</p>
          </div>
          <div>
            <Label>Tags (séparés par des virgules)</Label>
            <input name="tags" defaultValue={defaults?.tags}
              placeholder="ex: hd lace, 13x4, body wave, naturel" className={inp} />
          </div>
        </div>
      </Section>

      {/* ── 8. Notes internes ── */}
      <Section title="Notes internes" icon="lock" subtitle="Visible uniquement dans l'admin — jamais sur le site public">
        <textarea name="notes_internes" defaultValue={defaults?.notes_internes} rows={4}
          placeholder="Ex: Taille petite, éviter lot B, attention emballage fragile…"
          className={`${inp} resize-none`} />
      </Section>

    </div>
  );
}

// ─── Éditeur de variantes ─────────────────────────────────────────────────────

export type VariantRow = { name: string; stock: number; price_adjustment_cad: number; sku: string };

export function VariantsEditor({ initialVariants = [] }: { initialVariants?: VariantRow[] }) {
  const [variants, setVariants] = useState<VariantRow[]>(initialVariants);

  function add() {
    setVariants(v => [...v, { name: "", stock: 0, price_adjustment_cad: 0, sku: "" }]);
  }

  function remove(i: number) {
    setVariants(v => v.filter((_, idx) => idx !== i));
  }

  function update(i: number, field: keyof VariantRow, value: string | number) {
    setVariants(v => v.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  return (
    <Section title="Déclinaisons (optionnel)" icon="tune"
      subtitle="Ajoutez des variantes si ce produit existe en plusieurs couleurs, longueurs ou options. Laissez vide si le produit n'a qu'une seule version.">
      <input type="hidden" name="variants_json" value={JSON.stringify(variants)} />

      {variants.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/30">
                <th className="text-left pb-2 pr-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Nom de la déclinaison *</th>
                <th className="text-left pb-2 pr-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-24">Stock</th>
                <th className="text-left pb-2 pr-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-32">Ajust. prix $</th>
                <th className="text-left pb-2 pr-3 text-xs font-semibold text-on-surface-variant uppercase tracking-wider w-32">SKU variante</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {variants.map((v, i) => (
                <tr key={i}>
                  <td className="py-2 pr-3">
                    <input
                      value={v.name}
                      onChange={e => update(i, "name", e.target.value)}
                      placeholder="ex: Noir / 14 po · Brun / 18 po"
                      className="w-full border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number" min="0" value={v.stock}
                      onChange={e => update(i, "stock", Number(e.target.value))}
                      className="w-full border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number" step="0.01" value={v.price_adjustment_cad}
                      onChange={e => update(i, "price_adjustment_cad", Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={v.sku}
                      onChange={e => update(i, "sku", e.target.value)}
                      placeholder="optionnel"
                      className="w-full border border-outline-variant bg-surface px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                    />
                  </td>
                  <td className="py-2">
                    <button type="button" onClick={() => remove(i)}
                      className="text-on-surface-variant hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-sm border border-outline-variant text-on-surface-variant px-3 py-2 hover:border-primary hover:text-primary transition-colors">
        <span className="material-symbols-outlined text-base">add</span>
        Ajouter une déclinaison
      </button>

      {variants.length > 0 && (
        <p className="text-xs text-on-surface-variant mt-3">
          Le stock du produit sera calculé automatiquement comme la somme des stocks de ses déclinaisons.
        </p>
      )}
    </Section>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

export const inp = "w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary";

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">{children}</label>;
}

export function Section({ title, subtitle, icon, children }: {
  title: string; subtitle?: string; icon?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-outline-variant/30 p-6">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="material-symbols-outlined text-base text-primary">{icon}</span>}
        <h2 className="font-semibold text-on-surface">{title}</h2>
      </div>
      {subtitle && <p className="text-xs text-on-surface-variant mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}
