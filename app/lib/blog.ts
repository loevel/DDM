/**
 * Partie isomorphe du blog : types, taxonomie et audit SEO.
 *
 * Séparée de `blog.server.ts` parce que l'éditeur et les pages publiques en ont
 * besoin dans le navigateur — Remix retire du bundle client tout module
 * suffixé `.server`, et un import de constante depuis un tel module casse la
 * compilation.
 */

export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  cover_image_key: string | null;
  cover_alt: string | null;
  category: string | null;
  tags: string | null;
  author: string | null;
  status: "draft" | "scheduled" | "published";
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
  reading_minutes: number;
  views: number;
  created_at: string;
  updated_at: string;
}

export interface BlogIdea {
  id: number;
  title: string;
  angle: string | null;
  keywords: string | null;
  source: string;
  status: "idee" | "planifiee" | "ecrite" | "abandonnee";
  planned_date: string | null;
  post_id: number | null;
  created_at: string;
}

export const CATEGORIES = [
  { slug: "entretien", label: "Entretien" },
  { slug: "conseils", label: "Conseils" },
  { slug: "tendances", label: "Tendances" },
  { slug: "coulisses", label: "Coulisses" },
] as const;

export function categoryLabel(slug: string | null): string | null {
  return CATEGORIES.find(c => c.slug === slug)?.label ?? slug;
}

export interface SeoCheck { label: string; ok: boolean; hint: string; }

/**
 * Note SEO calculée dans le navigateur, sans appel modèle : la barre doit
 * réagir à chaque frappe dans l'éditeur, ce qu'un aller-retour réseau ne
 * permettrait pas.
 */
export function seoAudit(p: {
  title: string; seo_title: string; seo_description: string;
  body: string; excerpt: string; cover: string; coverAlt: string;
}): { score: number; checks: SeoCheck[] } {
  const words = p.body.split(/\s+/).filter(Boolean).length;
  const st = p.seo_title || p.title;
  const checks: SeoCheck[] = [
    { label: "Titre SEO (50–60 car.)", ok: st.length >= 45 && st.length <= 62,
      hint: `${st.length} caractères` },
    { label: "Méta-description (140–155 car.)", ok: p.seo_description.length >= 130 && p.seo_description.length <= 160,
      hint: `${p.seo_description.length} caractères` },
    { label: "Chapô renseigné", ok: p.excerpt.trim().length >= 60, hint: "au moins 60 caractères" },
    { label: "Longueur de l'article (600 mots +)", ok: words >= 600, hint: `${words} mots` },
    { label: "Au moins deux sous-titres", ok: (p.body.match(/^##\s+/gm) ?? []).length >= 2,
      hint: "structure la lecture et le référencement" },
    { label: "Image de couverture", ok: !!p.cover, hint: "obligatoire pour le partage social" },
    { label: "Texte alternatif de la couverture", ok: !!p.coverAlt.trim(), hint: "accessibilité et référencement image" },
    { label: "Au moins un lien", ok: /\[[^\]]+\]\([^)]+\)/.test(p.body), hint: "vers une fiche produit ou un guide" },
  ];
  const ok = checks.filter(c => c.ok).length;
  return { score: Math.round((ok / checks.length) * 100), checks };
}
