// ─────────────────────────────────────────────────────────────────────────────
// Effets post-paiement d'une commande — partagés entre le webhook Stripe
// (paiement carte) et le checkout payé intégralement par carte cadeau
// (aucun PaymentIntent créé dans ce cas).
// ─────────────────────────────────────────────────────────────────────────────

import { debitGiftCard } from "~/lib/gift-cards.server";

/**
 * Applique tous les effets d'un paiement confirmé : décrément du stock et
 * mouvements de vente, décompte du code promo, débit de la carte cadeau,
 * récupération du panier abandonné, sauvegarde de l'adresse. Chaque bloc est
 * isolé — une erreur n'empêche pas les suivants (ni le webhook de répondre).
 */
export async function applyPostPaymentEffects(db: D1Database, orderId: number): Promise<void> {
  const order = await db
    .prepare("SELECT id, reference, customer_email, shipping_address, promo_code, gift_card_code, gift_card_cad FROM orders WHERE id = ?")
    .bind(orderId)
    .first<{
      id: number;
      reference: string;
      customer_email: string;
      shipping_address: string | null;
      promo_code: string | null;
      gift_card_code: string | null;
      gift_card_cad: number;
    }>();
  if (!order) return;

  // Décrémenter stock + créer mouvements de vente pour chaque article
  try {
    const { results: items } = await db
      .prepare("SELECT product_id, quantity, unit_price_cad, variant_id FROM order_items WHERE order_id = ?")
      .bind(order.id)
      .all<{ product_id: number; quantity: number; unit_price_cad: number; variant_id: number | null }>();

    for (const item of items ?? []) {
      if (!item.product_id) continue;

      // Décrémenter le stock de la variante si applicable
      if (item.variant_id) {
        const variant = await db
          .prepare("SELECT stock FROM product_variants WHERE id = ?")
          .bind(item.variant_id)
          .first<{ stock: number }>();
        if (variant) {
          const newVStock = Math.max(0, variant.stock - item.quantity);
          await db.prepare("UPDATE product_variants SET stock = ? WHERE id = ?")
            .bind(newVStock, item.variant_id).run();
        }
      }

      const product = await db
        .prepare("SELECT stock FROM products WHERE id = ?")
        .bind(item.product_id)
        .first<{ stock: number }>();
      if (!product) continue;

      const stockAvant = product.stock;
      const stockApres = Math.max(0, stockAvant - item.quantity);

      await db.prepare("UPDATE products SET stock = ? WHERE id = ?")
        .bind(stockApres, item.product_id).run();

      await db.prepare(`INSERT INTO stock_mouvements
        (product_id, type, quantite, stock_avant, stock_apres, cout_unitaire_cad, reference_type, reference_id)
        VALUES (?, 'vente', ?, ?, ?, ?, 'order', ?)`)
        .bind(item.product_id, item.quantity, stockAvant, stockApres, item.unit_price_cad, order.id)
        .run();
    }
  } catch { /* ne pas bloquer si erreur stock */ }

  // Décompter l'utilisation du code promo (au paiement confirmé seulement,
  // pour ne pas brûler les usages sur des checkouts abandonnés)
  try {
    if (order.promo_code) {
      await db.prepare("UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ?")
        .bind(order.promo_code).run();
    }
  } catch { /* ne pas bloquer */ }

  // Débiter la carte cadeau utilisée (même logique : au paiement confirmé)
  try {
    if (order.gift_card_code && order.gift_card_cad > 0) {
      await debitGiftCard(db, order.gift_card_code, order.gift_card_cad);
    }
  } catch { /* ne pas bloquer */ }

  // Marquer le panier abandonné comme récupéré
  try {
    if (order.customer_email) {
      await db.prepare(`
        UPDATE abandoned_carts
        SET status = 'recovered',
            order_reference = ?,
            updated_at = datetime('now')
        WHERE email = ? AND status IN ('active', 'abandoned')
      `).bind(order.reference, order.customer_email).run();
    }
  } catch { /* ne pas bloquer */ }

  // Sauvegarder l'adresse de livraison si la cliente n'en a pas encore
  try {
    if (order.shipping_address) {
      const addr = JSON.parse(order.shipping_address) as {
        line1?: string; city?: string; province?: string; postal_code?: string;
      };

      if (addr.line1 && addr.city && addr.postal_code) {
        const customer = await db
          .prepare("SELECT id FROM customers WHERE email = ?")
          .bind(order.customer_email)
          .first<{ id: string }>();

        if (customer) {
          const existing = await db
            .prepare("SELECT COUNT(*) as n FROM customer_addresses WHERE customer_id = ?")
            .bind(customer.id)
            .first<{ n: number }>();

          if (!existing || existing.n === 0) {
            await db
              .prepare(`INSERT INTO customer_addresses
                (customer_id, label, street, city, province, postal_code, country, is_default)
                VALUES (?, 'Domicile', ?, ?, ?, ?, 'Canada', 1)`)
              .bind(customer.id, addr.line1, addr.city, addr.province ?? "QC", addr.postal_code)
              .run();
          }
        }
      }
    }
  } catch { /* ne pas bloquer si la sauvegarde échoue */ }
}
