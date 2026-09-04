import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { Link, useLoaderData, useFetcher } from "@remix-run/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requireAdmin, logAdminAction } from "~/lib/admin-session.server";
import { getPostProducts, setPostProducts, uniqueSlug } from "~/lib/blog.server";
import { CATEGORIES, seoAudit, type BlogPost } from "~/lib/blog";
import { renderMarkdown, readingMinutes, slugify, stripMarkdown } from "~/lib/markdown";
import { cfImage } from "~/lib/images";
import type { Product } from "~/lib/db.server";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const id = Number(params.id);

  const post = await db.prepare("SELECT * FROM blog_posts WHERE id = ?").bind(id).first<BlogPost>();
  if (!post) throw redirect("/admin/blog");

  const lies = await getPostProducts(db, id);
  let catalogue: Pick<Product, "id" | "name" | "image_key" | "texture">[] = [];
  try {
    catalogue = ((await db
      .prepare("SELECT id, name, image_key, texture FROM products WHERE stock > 0 ORDER BY name ASC LIMIT 200")
      .all<Pick<Product, "id" | "name" | "image_key" | "texture">>()).results ?? []);
  } catch { /* table absente */ }

  return json({ post, produitsLies: lies.map(p => p.id), catalogue });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const admin = await requireAdmin(request, context);
  const db = context.cloudflare.env.DB;
  const id = Number(params.id);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");
  const g = (k: string) => String(form.get(k) ?? "").trim();

  const existant = await db.prepare("SELECT slug, status FROM blog_posts WHERE id = ?").bind(id)
    .first<{ slug: string; status: string }>();
  if (!existant) return json({ error: "Article introuvable." }, { status: 404 });

  const titre = g("title") || "Sans titre";
  const body = String(form.get("body") ?? "");
  const slugDemande = slugify(g("slug") || titre);
  const slug = slugDemande === existant.slug ? existant.slug : await uniqueSlug(db, slugDemande, id);

  // Le statut n'est jamais modifié par un enregistrement : seuls les boutons
  // Publier / Programmer / Dépublier y touchent. Sans ça, une sauvegarde
  // automatique pourrait mettre un brouillon en ligne à l'insu de la rédactrice.
  let status = existant.status;
  let publishedAt: string | null = g("published_at") || null;
  if (intent === "publish") { status = "published"; publishedAt = publishedAt || new Date().toISOString().slice(0, 19).replace("T", " "); }
  else if (intent === "unpublish") { status = "draft"; }
  else if (intent === "schedule") {
    if (!publishedAt) return json({ error: "Choisissez une date de parution." }, { status: 400 });
    status = "scheduled";
  }

  await db
    .prepare(
      `UPDATE blog_posts SET
         slug=?, title=?, excerpt=?, body=?, cover_image_key=?, cover_alt=?,
         category=?, tags=?, status=?, published_at=?,
         seo_title=?, seo_description=?, reading_minutes=?, updated_at=datetime('now')
       WHERE id=?`
    )
    .bind(
      slug, titre, g("excerpt") || null, body, g("cover_image_key") || null, g("cover_alt") || null,
      g("category") || null, g("tags") || null, status, publishedAt,
      g("seo_title") || null, g("seo_description") || null, readingMinutes(body), id
    )
    .run();

  const ids = String(form.get("product_ids") ?? "")
    .split(",").map(Number).filter(n => Number.isFinite(n) && n > 0);
  await setPostProducts(db, id, ids);

  if (intent !== "save") {
    await logAdminAction(context, {
      admin, action: `post.${intent}`, entity: "blog_post", entityId: id,
      details: { title: titre }, request,
    });
  }

  return json({ ok: true, slug, status, published_at: publishedAt, savedAt: Date.now() });
}

/* ─── Aides d'édition ────────────────────────────────────────────────────── */

type AiState = { busy: string | null; error: string | null };

const inputCls =
  "w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary";
const labelCls =
  "block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5";

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-outline-variant rounded-lg p-4">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-3">
        <span className="material-symbols-outlined text-base">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function EditeurArticle() {
  const { post, produitsLies, catalogue } = useLoaderData<typeof loader>();
  const save = useFetcher<{ ok?: boolean; error?: string; slug?: string; status?: string; savedAt?: number }>();

  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [body, setBody] = useState(post.body);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [cover, setCover] = useState(post.cover_image_key ?? "");
  const [coverAlt, setCoverAlt] = useState(post.cover_alt ?? "");
  const [category, setCategory] = useState(post.category ?? "");
  const [tags, setTags] = useState(post.tags ?? "");
  const [seoTitle, setSeoTitle] = useState(post.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(post.seo_description ?? "");
  const [publishedAt, setPublishedAt] = useState(post.published_at ?? "");
  const [productIds, setProductIds] = useState<number[]>(produitsLies);

  const [apercu, setApercu] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ai, setAi] = useState<AiState>({ busy: null, error: null });
  const [historique, setHistorique] = useState<string | null>(null); // corps avant la dernière action IA
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const statut = save.data?.status ?? post.status;

  /** Toute modification marque le brouillon comme non enregistré. */
  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const champs = useMemo(
    () => ({
      title, slug, body, excerpt, cover_image_key: cover, cover_alt: coverAlt,
      category, tags, seo_title: seoTitle, seo_description: seoDesc,
      published_at: publishedAt, product_ids: productIds.join(","),
    }),
    [title, slug, body, excerpt, cover, coverAlt, category, tags, seoTitle, seoDesc, publishedAt, productIds]
  );

  const submit = useCallback(
    (intent: string) => {
      save.submit({ ...champs, intent }, { method: "post" });
      setDirty(false);
    },
    [champs, save]
  );

  // Enregistrement automatique 2 s après la dernière frappe. Le statut n'est
  // jamais touché ici (voir l'action) : publier reste un geste explicite.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => submit("save"), 2000);
    return () => clearTimeout(t);
  }, [dirty, submit]);

  // Prévient la perte de travail si on ferme l'onglet pendant les 2 s d'attente.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // Le slug suit le titre tant que l'article n'est jamais parti en ligne :
  // changer l'URL d'un article publié casserait les liens existants.
  useEffect(() => {
    if (post.status === "draft" && !post.published_at) setSlug(slugify(title));
  }, [title, post.status, post.published_at]);

  /* ─── Barre de mise en forme ─────────────────────────────────────────── */

  function entoure(avant: string, apres = avant, placeholder = "texte") {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e } = ta;
    const selection = body.slice(s, e) || placeholder;
    const next = body.slice(0, s) + avant + selection + apres + body.slice(e);
    setBody(next); setDirty(true);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + avant.length, s + avant.length + selection.length);
    });
  }

  function prefixeLigne(prefixe: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const debut = body.lastIndexOf("\n", s - 1) + 1;
    const next = body.slice(0, debut) + prefixe + body.slice(debut);
    setBody(next); setDirty(true);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + prefixe.length, s + prefixe.length); });
  }

  const selection = () => {
    const ta = textareaRef.current;
    if (!ta) return "";
    return body.slice(ta.selectionStart, ta.selectionEnd);
  };

  /* ─── Assistant ──────────────────────────────────────────────────────── */

  async function appelIa(intent: string, data: Record<string, string>, cle: string) {
    setAi({ busy: cle, error: null });
    try {
      const fd = new FormData();
      fd.append("intent", intent);
      for (const [k, v] of Object.entries(data)) fd.append(k, v);
      const res = await fetch("/api/blog-ai", { method: "POST", body: fd });
      const payload = await res.json() as any;
      if (!res.ok) throw new Error(payload?.error ?? "L'assistant n'a pas répondu.");
      return payload;
    } catch (e: any) {
      setAi({ busy: null, error: e.message ?? "Erreur inconnue." });
      return null;
    } finally {
      setAi(prev => (prev.busy === cle ? { ...prev, busy: null } : prev));
    }
  }

  async function reecrire(mode: string) {
    const ta = textareaRef.current;
    const texte = selection();
    if (!ta) return;
    if (mode !== "continuer" && !texte) {
      setAi({ busy: null, error: "Sélectionnez d'abord le passage à retravailler." });
      return;
    }
    const source = mode === "continuer" ? (texte || body.slice(-1500)) : texte;
    const { selectionStart: s, selectionEnd: e } = ta;
    const out = await appelIa("rewrite", { texte: source, mode }, mode);
    if (!out?.texte) return;
    setHistorique(body);
    setBody(mode === "continuer"
      ? `${body.trimEnd()}\n\n${out.texte}`
      : body.slice(0, s) + out.texte + body.slice(e));
    setDirty(true);
  }

  async function genererSeo() {
    const out = await appelIa("seo", { title, body }, "seo");
    if (!out?.seo) return;
    setSeoTitle(out.seo.seo_title ?? "");
    setSeoDesc(out.seo.seo_description ?? "");
    if (out.seo.excerpt) setExcerpt(out.seo.excerpt);
    if (out.seo.keywords?.length) setTags(out.seo.keywords.join(", "));
    if (post.status === "draft" && out.seo.slug) setSlug(slugify(out.seo.slug));
    setDirty(true);
  }

  async function suggererProduits() {
    const out = await appelIa("link_products", { body }, "produits");
    if (!out?.ids) return;
    if (!out.ids.length) { setAi({ busy: null, error: "Aucun produit du catalogue ne correspond à cet article." }); return; }
    setProductIds(out.ids);
    setDirty(true);
  }

  async function televerser(file: File) {
    setAi({ busy: "upload", error: null });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: fd });
      const payload = await res.json() as { imageUrl?: string; error?: string };
      if (!res.ok || !payload.imageUrl) throw new Error(payload.error ?? "Échec du téléversement.");
      setCover(payload.imageUrl); setDirty(true);
      // Enchaîne sur le texte alternatif : c'est le moment où l'image est en main.
      const alt = await appelIa("alt", { contexte: title }, "alt");
      if (alt?.alt) setCoverAlt(alt.alt);
    } catch (e: any) {
      setAi({ busy: null, error: e.message });
    } finally {
      setAi(prev => (prev.busy === "upload" ? { ...prev, busy: null } : prev));
    }
  }

  const audit = seoAudit({ title, seo_title: seoTitle, seo_description: seoDesc, body, excerpt, cover, coverAlt });
  const mots = stripMarkdown(body).split(/\s+/).filter(Boolean).length;

  const etat = save.state !== "idle" ? "Enregistrement…" : dirty ? "Modifications non enregistrées" : "Enregistré";

  return (
    <div className="pb-24">
      {/* Barre supérieure */}
      <div className="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-outline-variant/40 px-8 py-3">
        <div className="flex items-center gap-4">
          <Link to="/admin/blog" className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary shrink-0">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Le Journal
          </Link>
          <span className={`text-xs flex items-center gap-1.5 shrink-0 ${dirty ? "text-on-surface-variant" : "text-secondary"}`}>
            <span className="material-symbols-outlined text-sm">
              {save.state !== "idle" ? "sync" : dirty ? "edit" : "cloud_done"}
            </span>
            {etat}
          </span>
          <span className="text-xs text-on-surface-variant/60 shrink-0 hidden md:inline">
            {mots} mots · {readingMinutes(body)} min de lecture
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setApercu(a => !a)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-outline-variant text-on-surface-variant hover:text-primary rounded shrink-0"
          >
            <span className="material-symbols-outlined text-base">{apercu ? "edit_note" : "visibility"}</span>
            {apercu ? "Écrire" : "Aperçu"}
          </button>
          {statut !== "draft" ? (
            <button
              onClick={() => submit("unpublish")}
              className="px-4 py-1.5 text-sm border border-outline-variant text-on-surface-variant hover:text-error rounded shrink-0"
            >
              Dépublier
            </button>
          ) : (
            <button
              onClick={() => submit("publish")}
              className="bg-primary text-on-primary px-5 py-1.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 rounded shrink-0"
            >
              Publier
            </button>
          )}
        </div>
      </div>

      {(save.data?.error || ai.error) && (
        <div className="mx-8 mt-4 p-3 bg-error-container text-on-error-container text-sm flex items-start gap-2">
          <span className="material-symbols-outlined text-base shrink-0">error</span>
          <span className="flex-1">{save.data?.error ?? ai.error}</span>
          <button onClick={() => setAi(a => ({ ...a, error: null }))} className="shrink-0 hover:opacity-70">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      <div className="px-8 pt-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-8 items-start">
        {/* ─── Colonne d'écriture ─── */}
        <div className="min-w-0">
          <input
            value={title}
            onChange={e => touch(setTitle)(e.target.value)}
            placeholder="Titre de l'article"
            className="w-full font-serif text-3xl md:text-4xl leading-tight bg-transparent border-0 border-b border-transparent hover:border-outline-variant/40 focus:border-primary focus:outline-none pb-2 mb-4 text-on-surface placeholder:text-outline-variant"
          />

          {!apercu && (
            <>
              <div className="flex flex-wrap items-center gap-0.5 border border-outline-variant rounded-t bg-surface-container-low px-1.5 py-1">
                {[
                  { icon: "format_bold", title: "Gras", run: () => entoure("**", "**", "texte en gras") },
                  { icon: "format_italic", title: "Italique", run: () => entoure("*", "*", "texte en italique") },
                  { icon: "title", title: "Sous-titre", run: () => prefixeLigne("## ") },
                  { icon: "text_fields", title: "Sous-sous-titre", run: () => prefixeLigne("### ") },
                  { icon: "format_list_bulleted", title: "Liste à puces", run: () => prefixeLigne("- ") },
                  { icon: "format_list_numbered", title: "Liste numérotée", run: () => prefixeLigne("1. ") },
                  { icon: "format_quote", title: "Citation", run: () => prefixeLigne("> ") },
                  { icon: "link", title: "Lien", run: () => entoure("[", "](https://)", "texte du lien") },
                  { icon: "horizontal_rule", title: "Séparateur", run: () => prefixeLigne("\n---\n") },
                ].map(b => (
                  <button
                    key={b.icon} type="button" title={b.title} onClick={b.run}
                    className="p-1.5 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">{b.icon}</span>
                  </button>
                ))}
                <div className="w-px h-5 bg-outline-variant/60 mx-1.5" />
                {historique && (
                  <button
                    type="button" title="Annuler la dernière proposition de l'assistant"
                    onClick={() => { setBody(historique); setHistorique(null); setDirty(true); }}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs text-on-surface-variant hover:text-primary rounded"
                  >
                    <span className="material-symbols-outlined text-base">undo</span>
                    Annuler l'IA
                  </button>
                )}
              </div>

              <textarea
                ref={textareaRef}
                value={body}
                onChange={e => touch(setBody)(e.target.value)}
                placeholder="Commencez à écrire… Sélectionnez un passage puis utilisez l'assistant ci-dessous pour le retravailler."
                className="w-full min-h-[28rem] border border-t-0 border-outline-variant rounded-b px-5 py-4 font-sans text-[15px] leading-[1.75] bg-surface focus:outline-none focus:border-primary resize-y"
              />

              {/* Assistant de réécriture */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  <span className="material-symbols-outlined text-base text-primary">auto_awesome</span>
                  Assistant
                </span>
                {[
                  { mode: "court", label: "Raccourcir" },
                  { mode: "clair", label: "Clarifier" },
                  { mode: "chaleureux", label: "Plus chaleureux" },
                  { mode: "pro", label: "Plus expert" },
                  { mode: "continuer", label: "Continuer le texte" },
                ].map(b => (
                  <button
                    key={b.mode} type="button" onClick={() => reecrire(b.mode)} disabled={!!ai.busy}
                    className="px-3 py-1.5 text-xs border border-outline-variant text-on-surface-variant hover:text-primary hover:border-primary disabled:opacity-40 rounded transition-colors"
                  >
                    {ai.busy === b.mode ? "…" : b.label}
                  </button>
                ))}
                <span className="text-xs text-on-surface-variant/60">
                  Sélectionnez un passage, puis choisissez.
                </span>
              </div>
            </>
          )}

          {apercu && (
            <article className="border border-outline-variant rounded bg-surface px-8 py-8 min-h-[28rem]">
              {cover && <img src={cfImage(cover, "public") ?? cover} alt={coverAlt} className="w-full aspect-[16/9] object-cover mb-8" />}
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
              {!body.trim() && <p className="text-on-surface-variant/60 italic">L'article est encore vide.</p>}
            </article>
          )}
        </div>

        {/* ─── Colonne latérale ─── */}
        <div className="space-y-4">
          <Section title="Couverture" icon="image">
            {cover ? (
              <div className="relative mb-3 group">
                <img src={cfImage(cover, "card") ?? cover} alt={coverAlt} className="w-full aspect-[16/9] object-cover rounded" />
                <button
                  onClick={() => { setCover(""); setCoverAlt(""); setDirty(true); }}
                  className="absolute top-2 right-2 bg-surface/90 p-1.5 rounded text-on-surface-variant hover:text-error"
                  title="Retirer"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            ) : (
              <div className="aspect-[16/9] bg-surface-container rounded flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-3xl text-outline-variant">add_photo_alternate</span>
              </div>
            )}
            <label className="block w-full text-center px-3 py-2 text-xs border border-outline-variant text-on-surface-variant hover:text-primary rounded cursor-pointer mb-2">
              {ai.busy === "upload" ? "Téléversement…" : "Choisir une image"}
              <input
                type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) televerser(f); e.target.value = ""; }}
              />
            </label>
            <input
              value={cover} onChange={e => touch(setCover)(e.target.value)}
              placeholder="…ou collez une URL d'image"
              className={`${inputCls} font-mono text-xs mb-2`}
            />
            <label className={labelCls}>Texte alternatif</label>
            <div className="flex gap-1.5">
              <input
                value={coverAlt} onChange={e => touch(setCoverAlt)(e.target.value)}
                placeholder="Ce que montre l'image"
                className={`${inputCls} flex-1`}
              />
              <button
                type="button" title="Décrire l'image avec l'assistant"
                onClick={async () => {
                  if (!cover) { setAi({ busy: null, error: "Ajoutez d'abord une image." }); return; }
                  try {
                    const blob = await (await fetch(cfImage(cover, "card") ?? cover)).blob();
                    const fd = new FormData();
                    fd.append("intent", "alt"); fd.append("contexte", title);
                    fd.append("file", new File([blob], "cover.jpg", { type: blob.type || "image/jpeg" }));
                    setAi({ busy: "alt", error: null });
                    const res = await fetch("/api/blog-ai", { method: "POST", body: fd });
                    const payload = await res.json() as any;
                    if (!res.ok) throw new Error(payload?.error ?? "Échec de la description.");
                    setCoverAlt(payload.alt); setDirty(true);
                    setAi({ busy: null, error: null });
                  } catch (e: any) { setAi({ busy: null, error: e.message }); }
                }}
                disabled={!!ai.busy}
                className="px-2 border border-outline-variant text-on-surface-variant hover:text-primary disabled:opacity-40 rounded"
              >
                <span className="material-symbols-outlined text-base">{ai.busy === "alt" ? "hourglass_top" : "auto_awesome"}</span>
              </button>
            </div>
          </Section>

          <Section title="Classement" icon="sell">
            <label className={labelCls}>Catégorie</label>
            <select value={category} onChange={e => touch(setCategory)(e.target.value)} className={`${inputCls} mb-3`}>
              <option value="">— Aucune —</option>
              {CATEGORIES.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
            <label className={labelCls}>Mots-clés</label>
            <input
              value={tags} onChange={e => touch(setTags)(e.target.value)}
              placeholder="perruque bouclée, entretien, hiver"
              className={inputCls}
            />
            <label className={`${labelCls} mt-3`}>Adresse de la page</label>
            <input
              value={slug} onChange={e => touch(setSlug)(slugify(e.target.value))}
              className={`${inputCls} font-mono text-xs`}
            />
            {post.status !== "draft" && (
              <p className="text-[11px] text-on-surface-variant/70 mt-1.5">
                Modifier l'adresse d'un article déjà en ligne casse les liens existants.
              </p>
            )}
          </Section>

          <Section title="Référencement" icon="travel_explore">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-1.5 bg-surface-container rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    audit.score >= 80 ? "bg-secondary" : audit.score >= 50 ? "bg-tertiary" : "bg-error"
                  }`}
                  style={{ width: `${audit.score}%` }}
                />
              </div>
              <span className="text-sm font-bold tabular-nums text-on-surface">{audit.score}%</span>
            </div>

            <ul className="space-y-1 mb-3">
              {audit.checks.map(c => (
                <li key={c.label} className="flex items-start gap-1.5 text-xs">
                  <span className={`material-symbols-outlined text-sm shrink-0 ${c.ok ? "text-secondary" : "text-on-surface-variant/40"}`}>
                    {c.ok ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  <span className={c.ok ? "text-on-surface-variant" : "text-on-surface"}>
                    {c.label}
                    {!c.ok && <span className="text-on-surface-variant/60"> — {c.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button" onClick={genererSeo} disabled={!!ai.busy}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-primary text-primary hover:bg-primary hover:text-on-primary disabled:opacity-40 rounded transition-colors mb-3"
            >
              <span className="material-symbols-outlined text-base">auto_awesome</span>
              {ai.busy === "seo" ? "Génération…" : "Générer le SEO et le chapô"}
            </button>

            <label className={labelCls}>Chapô</label>
            <textarea
              value={excerpt} onChange={e => touch(setExcerpt)(e.target.value)} rows={3}
              placeholder="Les deux phrases qui donnent envie de lire."
              className={`${inputCls} resize-none mb-3`}
            />
            <label className={labelCls}>Titre SEO</label>
            <input value={seoTitle} onChange={e => touch(setSeoTitle)(e.target.value)} className={`${inputCls} mb-1`} />
            <p className="text-[11px] text-on-surface-variant/60 mb-3">{(seoTitle || title).length} / 60 caractères</p>
            <label className={labelCls}>Méta-description</label>
            <textarea
              value={seoDesc} onChange={e => touch(setSeoDesc)(e.target.value)} rows={3}
              className={`${inputCls} resize-none mb-1`}
            />
            <p className="text-[11px] text-on-surface-variant/60">{seoDesc.length} / 155 caractères</p>
          </Section>

          <Section title="Perruques mentionnées" icon="checkroom">
            <button
              type="button" onClick={suggererProduits} disabled={!!ai.busy || !catalogue.length}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-primary text-primary hover:bg-primary hover:text-on-primary disabled:opacity-40 rounded transition-colors mb-3"
            >
              <span className="material-symbols-outlined text-base">auto_awesome</span>
              {ai.busy === "produits" ? "Analyse…" : "Suggérer d'après l'article"}
            </button>
            {catalogue.length === 0 ? (
              <p className="text-xs text-on-surface-variant/70">Aucun produit en stock dans le catalogue.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1 -mx-1 px-1">
                {catalogue.map(p => {
                  const coche = productIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                        coche ? "bg-primary/10 text-on-surface" : "hover:bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      <input
                        type="checkbox" checked={coche} className="w-3.5 h-3.5 accent-primary shrink-0"
                        onChange={() => {
                          setProductIds(ids => coche ? ids.filter(i => i !== p.id) : [...ids, p.id]);
                          setDirty(true);
                        }}
                      />
                      <span className="flex-1 truncate">{p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Parution" icon="schedule">
            <label className={labelCls}>Date de mise en ligne</label>
            <input
              type="datetime-local"
              value={publishedAt ? publishedAt.replace(" ", "T").slice(0, 16) : ""}
              onChange={e => touch(setPublishedAt)(e.target.value.replace("T", " ") + ":00")}
              className={`${inputCls} mb-2`}
            />
            <button
              type="button" onClick={() => submit("schedule")} disabled={!publishedAt}
              className="w-full px-3 py-2 text-xs border border-outline-variant text-on-surface-variant hover:text-primary disabled:opacity-40 rounded"
            >
              Programmer la parution
            </button>
            <p className="text-[11px] text-on-surface-variant/70 mt-2">
              L'article devient visible tout seul à la date choisie.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
