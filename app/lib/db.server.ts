import type { AppLoadContext } from "@remix-run/cloudflare";

export function getDB(context: AppLoadContext) {
  return context.cloudflare.env.DB;
}

export function getCache(context: AppLoadContext) {
  return context.cloudflare.env.CACHE;
}

export async function getProducts(
  db: D1Database,
  {
    category, featured, search,
    famille, texture, type_lace, couleur,
    longueur_min, longueur_max,
    hd_lace, glueless, pret_a_porter,
    sort,
  }: {
    category?: string; featured?: boolean; search?: string;
    famille?: string; texture?: string; type_lace?: string; couleur?: string;
    longueur_min?: number; longueur_max?: number;
    hd_lace?: boolean; glueless?: boolean; pret_a_porter?: boolean;
    sort?: string;
  } = {}
) {
  let q = "SELECT * FROM products WHERE stock > 0";
  const params: any[] = [];
  if (category) { q += " AND category = ?"; params.push(category); }
  if (famille) { q += " AND famille = ?"; params.push(famille); }
  if (featured) { q += " AND featured = 1"; }
  if (search) { q += " AND (name LIKE ? OR description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
  if (texture) { q += " AND texture = ?"; params.push(texture); }
  if (type_lace) { q += " AND type_lace = ?"; params.push(type_lace); }
  if (couleur) { q += " AND couleur = ?"; params.push(couleur); }
  if (longueur_min) { q += " AND longueur_po >= ?"; params.push(longueur_min); }
  if (longueur_max) { q += " AND longueur_po <= ?"; params.push(longueur_max); }
  if (hd_lace) { q += " AND hd_lace = 1"; }
  if (glueless) { q += " AND glueless = 1"; }
  if (pret_a_porter) { q += " AND pret_a_porter = 1"; }
  const orderMap: Record<string, string> = {
    "prix-asc": "price_cad ASC",
    "prix-desc": "price_cad DESC",
    "nouveautes": "created_at DESC",
    "popularite": "featured DESC, created_at DESC",
  };
  q += ` ORDER BY ${orderMap[sort ?? ""] ?? "featured DESC, created_at DESC"}`;
  const { results } = await db.prepare(q).bind(...params).all<Product>();
  return results;
}


export async function getProduct(db: D1Database, slug: string) {
  return db.prepare("SELECT * FROM products WHERE slug = ?").bind(slug).first<Product>();
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  price_cad: number;
  category: string;
  famille: string | null;
  type_lace: string | null;
  texture: string | null;
  longueur_po: number | null;
  densite: number | null;
  couleur: string | null;
  hd_lace: number;
  glueless: number;
  pret_a_porter: number;
  quantite_meches: number | null;
  compare_at_price_cad: number | null;
  stock: number;
  image_key: string | null;
  featured: number;
  created_at: string;
  sku?: string | null;
  tags?: string | null;
}


export interface ProductVariant {
  id: number;
  product_id: number;
  name: string;
  price_adjustment_cad: number;
  stock: number;
  sku: string | null;
}

export interface CartItem {
  productId: number;
  name: string;
  price_cad: number;
  slug: string;
  quantity: number;
  variantId?: number;
  variantName?: string;
}

export interface Cart {
  items: CartItem[];
  total: number;
}
