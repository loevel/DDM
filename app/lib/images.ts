export type ImageVariant = "public" | "card" | "thumbnail" | "zoom";

/**
 * Construit l'URL Cloudflare Images pour un imageKey et une variante donnés.
 *
 * Trois cas :
 *  1. imageKey est une URL imagedelivery.net → on remplace/ajoute la variante
 *  2. imageKey est une URL externe (legacy) → retournée telle quelle
 *  3. imageKey est null/undefined → null
 */
export function cfImage(
  imageKey: string | null | undefined,
  variant: ImageVariant = "public"
): string | null {
  if (!imageKey) return null;

  if (imageKey.includes("imagedelivery.net")) {
    // Supprime une variante éventuelle déjà présente en fin d'URL
    const base = imageKey.replace(/\/(public|card|thumbnail|zoom)$/, "");
    return `${base}/${variant}`;
  }

  // URL externe legacy (ex: lh3.googleusercontent.com) — pas de transformation
  if (imageKey.startsWith("http")) return imageKey;

  return null;
}

/** Retourne true si imageKey est une image Cloudflare Images (pas une URL legacy) */
export function isCfImage(imageKey: string | null | undefined): boolean {
  return !!imageKey && imageKey.includes("imagedelivery.net");
}
