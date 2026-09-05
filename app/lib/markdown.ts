/**
 * Rendu Markdown → HTML, partagé par l'aperçu de l'éditeur et la page publique.
 *
 * Le dépôt n'embarque aucune bibliothèque Markdown ni assainisseur, et l'article
 * est écrit par une personne authentifiée mais affiché à tout le monde : le
 * choix est donc d'**échapper d'abord, baliser ensuite**. Le texte de l'autrice
 * ne peut jamais produire de balise ; seules les balises que cette fonction
 * ajoute elle-même arrivent dans le HTML. C'est ce qui rend l'utilisation de
 * `dangerouslySetInnerHTML` acceptable en aval.
 *
 * Sous-ensemble volontairement réduit — c'est ce que la barre d'outils de
 * l'éditeur sait produire, rien de plus : titres, gras, italique, liens,
 * images, listes, citations, filets, code en ligne.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * N'autorise que http(s), les chemins internes et les ancres.
 * Bloque `javascript:`, `data:` et `vbscript:` — un lien Markdown est la seule
 * voie par laquelle une URL saisie atteint un attribut href/src.
 */
function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^(https?:\/\/|\/|#|mailto:)/i.test(url)) return url;
  return null;
}

/** Rendu des marques en ligne. Le texte reçu est DÉJÀ échappé. */
function renderInline(text: string): string {
  let out = text;

  // Image ![alt](url) — traitée avant les liens, sinon `[alt](url)` matcherait.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const href = safeUrl(url);
    if (!href) return alt;
    return `<img src="${href}" alt="${alt}" loading="lazy" class="w-full my-8" />`;
  });

  // Lien [texte](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const href = safeUrl(url);
    if (!href) return label;
    const external = /^https?:\/\//i.test(href);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${href}"${attrs} class="text-primary underline underline-offset-2 hover:opacity-70">${label}</a>`;
  });

  out = out.replace(/`([^`]+)`/g, '<code class="bg-surface-container px-1.5 py-0.5 text-[0.9em]">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italique : évite de casser un ** déjà consommé et les * collés à un mot.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

  return out;
}

export function renderMarkdown(md: string): string {
  if (!md) return "";

  const lines = escapeHtml(md).split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const closeParagraph = () => {
    if (paragraph.length) {
      html.push(
        `<p class="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-6">${renderInline(
          paragraph.join(" ")
        )}</p>`
      );
      paragraph = [];
    }
  };
  const flush = () => {
    closeParagraph();
    closeList();
  };

  for (const line of lines) {
    const t = line.trim();

    if (!t) {
      flush();
      continue;
    }

    // Filet horizontal
    if (/^(---+|\*\*\*+)$/.test(t)) {
      flush();
      html.push('<hr class="ddm-rule my-12" />');
      continue;
    }

    // Titres. `##` reste un h2 — c'est ce que la barre d'outils annonce comme
    // « sous-titre ». Un `#` isolé est remonté à h2 plutôt que rendu en h1 :
    // la page en a déjà un, le titre de l'article.
    const heading = t.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const level = Math.min(Math.max(heading[1].length, 2), 6);
      const size =
        level === 2
          ? "font-serif text-3xl md:text-4xl mt-16 mb-5 leading-tight"
          : level === 3
          ? "font-serif text-2xl md:text-3xl mt-12 mb-4 leading-tight"
          : "font-sans text-lg font-bold mt-10 mb-3";
      html.push(`<h${level} class="text-on-surface ${size}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    // Citation
    if (t.startsWith("&gt; ")) {
      flush();
      html.push(
        `<blockquote class="border-l-2 border-primary pl-6 my-8 font-serif text-xl md:text-2xl italic text-on-surface leading-snug">${renderInline(
          t.slice(5)
        )}</blockquote>`
      );
      continue;
    }

    // Listes
    const ul = t.match(/^[-*]\s+(.*)$/);
    const ol = t.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      closeParagraph();
      const want: "ul" | "ol" = ul ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        const cls =
          want === "ul"
            ? "list-disc pl-6 space-y-2 mb-6 text-on-surface-variant"
            : "list-decimal pl-6 space-y-2 mb-6 text-on-surface-variant";
        html.push(`<${want} class="${cls}">`);
        listType = want;
      }
      html.push(`<li>${renderInline((ul ?? ol)![1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(t);
  }

  flush();
  return html.join("\n");
}

/** Texte brut, pour le chapô automatique et le calcul du temps de lecture. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^&gt;\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ~200 mots/minute, minimum 1. */
export function readingMinutes(md: string): number {
  const words = stripMarkdown(md).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
