// Lecture des réglages du site (table clé/valeur `site_settings`, éditée dans
// /admin/parametres). Petit utilitaire partagé pour éviter de dupliquer la
// requête dans chaque loader.

/** Lit une valeur de réglage, ou `null` si absente. */
export async function getSiteSetting(db: D1Database, key: string): Promise<string | null> {
  try {
    const row = await db
      .prepare("SELECT value FROM site_settings WHERE key = ?")
      .bind(key)
      .first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Programme ambassadrices actif ? Réglage `ambassadors_enabled` = "1".
 * Désactivé par défaut : la page publique et le lien footer restent cachés
 * tant que l'admin ne l'active pas explicitement.
 */
export async function isAmbassadorProgramEnabled(db: D1Database): Promise<boolean> {
  return (await getSiteSetting(db, "ambassadors_enabled")) === "1";
}
