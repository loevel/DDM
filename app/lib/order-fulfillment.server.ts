// ─────────────────────────────────────────────────────────────────────────────
// Effets post-paiement d'une commande — partagés entre le webhook Stripe
// (paiement carte) et le checkout payé intégralement par carte cadeau
// (aucun PaymentIntent créé dans ce cas).
// ─────────────────────────────────────────────────────────────────────────────

import { debitGiftCard } from "~/lib/gift-cards.server";
import { pointsEarnedFor, recordPoints, hasPointsTxForOrder } from "~/lib/loyalty.server";

/**
 * Applique tous les effets d'un paiement confirmé : décrément du stock et
 * mouvements de vente, décompte du code promo, débit de la carte cadeau,
 * récupération du panier abandonné, sauvegarde de l'adresse. Chaque bloc est
 * isolé — une erreur n'empêche pas les suivants (ni le webhook de répondre).
 */
export async function applyPostPaymentEffects(db: D1Database, orderId: number): Promise<void> {
  const order = await db
    .prepare("SELECT id, reference, customer_email, shipping_address, promo_code, gift_card_code, gift_card_cad, ambassador_code, total_cad, tps_cad, tvq_cad, loyalty_points_redeemed FROM orders WHERE id = ?")
    .bind(orderId)
    .first<{
      id: number;
      reference: string;
      customer_email: string;
      shipping_address: string | null;
      promo_code: string | null;
      gift_card_code: string | null;
      gift_card_cad: number;
      ambassador_code: string | null;
      total_cad: number;
      tps_cad: number;
      tvq_cad: number;
      loyalty_points_redeemed: number;
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

  // Créditer la commission de l'ambassadrice (au paiement confirmé seulement).
  // Base = marchandise nette (total − taxes). Idempotent : ambassador_sales a
  // une contrainte UNIQUE sur order_reference, et on ne cumule les totaux que
  // si la ligne vient d'être créée.
  try {
    if (order.ambassador_code) {
      const amb = await db
        .prepare("SELECT id, commission_rate FROM ambassadors WHERE code = ? AND status = 'active'")
        .bind(order.ambassador_code)
        .first<{ id: number; commission_rate: number }>();
      if (amb) {
        const already = await db
          .prepare("SELECT id FROM ambassador_sales WHERE order_reference = ?")
          .bind(order.reference)
          .first<{ id: number }>();
        if (!already) {
          const base = Math.max(0, Math.round((order.total_cad - order.tps_cad - order.tvq_cad) * 100) / 100);
          const commission = Math.round(base * amb.commission_rate) / 100;
          await db
            .prepare("INSERT INTO ambassador_sales (ambassador_id, order_reference, sale_amount_cad, commission_cad, status) VALUES (?,?,?,?, 'pending')")
            .bind(amb.id, order.reference, base, commission)
            .run();
          await db
            .prepare("UPDATE ambassadors SET total_sales_cad = total_sales_cad + ?, total_commission_cad = total_commission_cad + ? WHERE id = ?")
            .bind(base, commission, amb.id)
            .run();
        }
      }
    }
  } catch { /* ne pas bloquer */ }

  // Fidélité : débiter les points échangés puis créditer les points gagnés
  // (au paiement confirmé seulement, une seule fois par commande).
  try {
    const customer = await db
      .prepare("SELECT id FROM customers WHERE email = ?")
      .bind(order.customer_email)
      .first<{ id: string }>();
    if (customer) {
      if (order.loyalty_points_redeemed > 0 && !(await hasPointsTxForOrder(db, order.reference, "redeem"))) {
        await recordPoints(db, {
          customerId: customer.id,
          points: -order.loyalty_points_redeemed,
          type: "redeem",
          reason: `Échange sur commande ${order.reference}`,
          orderRef: order.reference,
        });
      }
      if (!(await hasPointsTxForOrder(db, order.reference, "earn"))) {
        const netMerch = Math.max(0, Math.round((order.total_cad - order.tps_cad - order.tvq_cad) * 100) / 100);
        const earned = pointsEarnedFor(netMerch);
        if (earned > 0) {
          await recordPoints(db, {
            customerId: customer.id,
            points: earned,
            type: "earn",
            reason: `Achat ${order.reference}`,
            orderRef: order.reference,
          });
          await db.prepare("UPDATE orders SET loyalty_points_earned = ? WHERE id = ?").bind(earned, order.id).run();
        }
      }
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
