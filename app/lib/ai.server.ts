/**
 * Assistant de rédaction du blog — Cloudflare Workers AI.
 *
 * Pas de clé API : le binding `AI` est facturé sur le compte Cloudflare. Les
 * modèles ouverts écrivent un français correct mais pas irréprochable — d'où
 * les consignes très explicites dans les invites, et le fait que TOUT ce qui
 * sort d'ici arrive dans l'éditeur comme une proposition à relire, jamais
 * directement en ligne.
 */

const MODEL_TEXT = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_VISION = "@cf/meta/llama-3.2-11b-vision-instruct";

/** Contexte boutique injecté dans chaque invite : sans lui le modèle écrit du générique. */
const MARQUE = `Tu écris pour DDM Wigs & More, une boutique de perruques en cheveux humains
à Montréal (Québec). Le lectorat est majoritairement féminin et noir. Ton registre :
chaleureux, expert, jamais condescendant, jamais racoleur. Français du Québec, vouvoiement.
Tu connais la matière : lace HD, glueless, closure, frontal, densité, textures (lisse,
body wave, bouclé, water wave, deep wave), pose, entretien, longévité.
Interdits : promesses médicales, superlatifs creux ("incroyable", "révolutionnaire"),
anglicismes évitables, et toute mention de prix ou de promotion.`;

export class AiUnavailable extends Error {}

async function ask(
  ai: Ai | undefined,
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  if (!ai) {
    throw new AiUnavailable(
      "Workers AI n'est pas activé sur cet environnement. Vérifiez le binding [ai] dans wrangler.toml."
    );
  }
  let out;
  try {
    out = await ai.run(MODEL_TEXT, {
      messages: [
        { role: "system", content: `${MARQUE}\n\n${system}` },
        { role: "user", content: user },
      ],
      max_tokens: opts.maxTokens ?? 1200,
      temperature: opts.temperature ?? 0.7,
    });
  } catch (e: any) {
    throw new AiUnavailable(`Le modèle n'a pas répondu : ${e?.message ?? "erreur inconnue"}`);
  }
  const text = (out?.response ?? "").trim();
  if (!text) throw new AiUnavailable("Le modèle a renvoyé une réponse vide. Réessayez.");
  return text;
}

/**
 * Les modèles ouverts encadrent volontiers le JSON de bavardage ou de ```json.
 * On récupère donc le premier objet/tableau équilibré plutôt que de faire
 * confiance à la réponse entière.
 */
function extractJson<T>(raw: string): T | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) as T; } catch { return null; }
      }
    }
  }
  return null;
}

/* ─── Rédaction ──────────────────────────────────────────────────────────── */

/** Brouillon complet d'article à partir d'un simple sujet. */
export async function aiDraft(ai: Ai | undefined, sujet: string, angle?: string) {
  const body = await ask(
    ai,
    `Rédige un article de blog complet en Markdown.
Structure : un chapô de deux phrases, puis 3 à 5 sections avec des titres "## ".
600 à 900 mots. Phrases courtes. Pas de titre de niveau 1 (le titre est géré à part).
Termine par une section pratique et concrète, pas par une conclusion creuse.
Réponds UNIQUEMENT avec le Markdown de l'article, sans préambule.`,
    angle ? `Sujet : ${sujet}\nAngle imposé : ${angle}` : `Sujet : ${sujet}`,
    { maxTokens: 2000 }
  );
  return body.replace(/^```(?:markdown)?\n?/i, "").replace(/```$/, "").trim();
}

export type RewriteMode = "court" | "clair" | "chaleureux" | "pro" | "continuer";

const REWRITE_RULES: Record<RewriteMode, string> = {
  court: "Raccourcis d'environ 40 % en gardant chaque information. Coupe les redites et les adverbes.",
  clair: "Simplifie. Une idée par phrase. Explique le vocabulaire technique à sa première apparition.",
  chaleureux: "Rends le ton plus chaleureux et direct, en t'adressant à la lectrice. Garde le vouvoiement.",
  pro: "Rends le ton plus expert et posé, sans jargon inutile. Appuie les affirmations sur du concret.",
  continuer: "Écris la suite naturelle de ce passage : 2 à 3 paragraphes, même ton, même sujet.",
};

export async function aiRewrite(ai: Ai | undefined, texte: string, mode: RewriteMode) {
  return ask(
    ai,
    `${REWRITE_RULES[mode]}
Conserve le Markdown existant (titres, listes, gras).
Réponds UNIQUEMENT avec le texte ${mode === "continuer" ? "à ajouter" : "réécrit"}, sans commentaire.`,
    texte,
    { maxTokens: 1400, temperature: mode === "continuer" ? 0.8 : 0.5 }
  );
}

/* ─── SEO ────────────────────────────────────────────────────────────────── */

export interface SeoSuggestion {
  seo_title: string;
  seo_description: string;
  slug: string;
  keywords: string[];
  excerpt: string;
}

export async function aiSeo(ai: Ai | undefined, titre: string, corps: string) {
  const raw = await ask(
    ai,
    `Produis les métadonnées SEO de cet article.
Contraintes strictes :
- seo_title : 50 à 60 caractères, contient le mot-clé principal.
- seo_description : 140 à 155 caractères, une promesse concrète, se termine sans point de suspension.
- slug : minuscules, mots séparés par des tirets, 3 à 6 mots, sans accent.
- keywords : 5 expressions de recherche réellement tapées par une cliente.
- excerpt : chapô de 2 phrases pour la liste d'articles.
Réponds UNIQUEMENT avec un objet JSON à ces cinq clés.`,
    `Titre : ${titre}\n\nArticle :\n${corps.slice(0, 6000)}`,
    { maxTokens: 700, temperature: 0.4 }
  );
  const parsed = extractJson<SeoSuggestion>(raw);
  if (!parsed?.seo_title) throw new AiUnavailable("Réponse SEO illisible. Réessayez.");
  return {
    ...parsed,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
  };
}

/* ─── Idées ──────────────────────────────────────────────────────────────── */

export interface IdeaSuggestion { title: string; angle: string; keywords: string; }

export async function aiIdeas(
  ai: Ai | undefined,
  contexte: { produits: string[]; questions: string[]; dejaTraites: string[] }
) {
  const raw = await ask(
    ai,
    `Propose 6 sujets d'articles pour ce blog.
Chaque sujet doit répondre à une question que se pose réellement une cliente avant
ou après l'achat d'une perruque. Évite les sujets déjà traités.
Réponds UNIQUEMENT avec un tableau JSON d'objets {title, angle, keywords}.
- title : titre d'article, accrocheur mais honnête, 6 à 12 mots.
- angle : une phrase disant ce que l'article apporte concrètement.
- keywords : 3 expressions de recherche séparées par des virgules.`,
    `Catalogue : ${contexte.produits.slice(0, 30).join(", ") || "(vide)"}

Questions déjà posées par des clientes :
${contexte.questions.slice(0, 20).map(q => `- ${q}`).join("\n") || "(aucune)"}

Sujets déjà traités : ${contexte.dejaTraites.join(", ") || "(aucun)"}`,
    { maxTokens: 1400, temperature: 0.9 }
  );
  const parsed = extractJson<IdeaSuggestion[]>(raw);
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new AiUnavailable("Aucune idée exploitable n'a été renvoyée. Réessayez.");
  }
  return parsed
    .filter(i => i?.title)
    .map(i => ({
      title: String(i.title).slice(0, 200),
      angle: String(i.angle ?? "").slice(0, 500),
      keywords: String(i.keywords ?? "").slice(0, 300),
    }));
}

/* ─── Images ─────────────────────────────────────────────────────────────── */

/** Texte alternatif à partir de l'image elle-même (modèle de vision). */
export async function aiAltText(ai: Ai | undefined, image: ArrayBuffer, contexte: string) {
  if (!ai) throw new AiUnavailable("Workers AI n'est pas activé sur cet environnement.");
  let out;
  try {
    out = await ai.run(MODEL_VISION, {
      image: [...new Uint8Array(image)],
      prompt: `Décris cette image en français, en une seule phrase de 8 à 16 mots, pour servir
de texte alternatif sur un site de perruques. Décris ce qui est visible (coiffure, texture,
couleur, cadrage), pas l'ambiance. Ne commence pas par "Image de" ni "Photo de".
Contexte de l'article : ${contexte}`,
      max_tokens: 120,
    });
  } catch (e: any) {
    throw new AiUnavailable(`Description d'image indisponible : ${e?.message ?? "erreur inconnue"}`);
  }
  const alt = (out?.description ?? out?.response ?? "").trim().replace(/^["']|["']$/g, "");
  if (!alt) throw new AiUnavailable("Le modèle n'a pas su décrire cette image.");
  return alt;
}

/** Produits du catalogue à citer dans l'article, choisis par le modèle. */
export async function aiLinkProducts(
  ai: Ai | undefined,
  corps: string,
  produits: { id: number; name: string; texture: string | null }[]
) {
  const raw = await ask(
    ai,
    `Parmi ce catalogue, choisis les 3 produits les plus pertinents à mettre en avant
au bas de cet article. Ne choisis que ce qui a un vrai rapport avec le contenu ;
s'il n'y a rien de pertinent, renvoie un tableau vide.
Réponds UNIQUEMENT avec un tableau JSON d'identifiants numériques.`,
    `Article :\n${corps.slice(0, 4000)}\n\nCatalogue :\n${produits
      .map(p => `${p.id} — ${p.name}${p.texture ? ` (${p.texture})` : ""}`)
      .join("\n")}`,
    { maxTokens: 200, temperature: 0.3 }
  );
  const ids = extractJson<number[]>(raw);
  if (!Array.isArray(ids)) return [];
  const valid = new Set(produits.map(p => p.id));
  return ids.map(Number).filter(id => valid.has(id)).slice(0, 3);
}
