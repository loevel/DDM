import type { Product } from "~/lib/db.server";
import type { BlogPost } from "~/lib/blog";

export type { BlogPost, BlogIdea } from "~/lib/blog";
export { CATEGORIES, categoryLabel } from "~/lib/blog";

/**
 * Un article programmé devient visible tout seul quand sa date arrive : la
 * condition est dans la requête plutôt que dans un cron, pour qu'il n'existe
 * aucun décalage entre la date affichée à la rédactrice et la mise en ligne.
 */
const VISIBLE = `(status = 'published' OR (status = 'scheduled' AND published_at IS NOT NULL AND published_at <= datetime('now')))`;

export async function getPublishedPosts(
  db: D1Database,
  { category, limit }: { category?: string; limit?: number } = {}
) {
  let q = `SELECT * FROM blog_posts WHERE ${VISIBLE}`;
  const params: unknown[] = [];
  if (category) { q += " AND category = ?"; params.push(category); }
  q += " ORDER BY published_at DESC, id DESC";
  if (limit) { q += " LIMIT ?"; params.push(limit); }
  try {
    const { results } = await db.prepare(q).bind(...params).all<BlogPost>();
    return results ?? [];
  } catch {
    return []; // migration 44 pas encore appliquée
  }
}

export async function getPublishedPost(db: D1Database, slug: string) {
  try {
    return await db
      .prepare(`SELECT * FROM blog_posts WHERE slug = ? AND ${VISIBLE}`)
      .bind(slug)
      .first<BlogPost>();
  } catch {
    return null;
  }
}

/** Articles voisins : même catégorie d'abord, complétés par les plus récents. */
export async function getRelatedPosts(db: D1Database, post: BlogPost, limit = 3) {
  try {
    const { results } = await db
      .prepare(
        `SELECT * FROM blog_posts
         WHERE ${VISIBLE} AND id != ?
         ORDER BY (category IS NOT NULL AND category = ?) DESC, published_at DESC
         LIMIT ?`
      )
      .bind(post.id, post.category, limit)
      .all<BlogPost>();
    return results ?? [];
  } catch {
    return [];
  }
}

/** Produits épinglés à un article (« les perruques mentionnées »). */
export async function getPostProducts(db: D1Database, postId: number) {
  try {
    const { results } = await db
      .prepare(
        `SELECT p.* FROM blog_post_products bp
         JOIN products p ON p.id = bp.product_id
         WHERE bp.post_id = ?
         ORDER BY bp.position ASC`
      )
      .bind(postId)
      .all<Product>();
    return results ?? [];
  } catch {
    return [];
  }
}

export async function setPostProducts(db: D1Database, postId: number, productIds: number[]) {
  await db.prepare("DELETE FROM blog_post_products WHERE post_id = ?").bind(postId).run();
  if (!productIds.length) return;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO blog_post_products (post_id, product_id, position) VALUES (?, ?, ?)"
  );
  await db.batch(productIds.map((id, i) => stmt.bind(postId, id, i)));
}

/** Slug libre : on suffixe -2, -3… plutôt que de renvoyer une erreur à la rédactrice. */
export async function uniqueSlug(db: D1Database, base: string, exceptId?: number) {
  let slug = base || "article";
  for (let n = 2; n < 200; n++) {
    const row = await db
      .prepare("SELECT id FROM blog_posts WHERE slug = ? COLLATE NOCASE")
      .bind(slug)
      .first<{ id: number }>();
    if (!row || row.id === exceptId) return slug;
    slug = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}
