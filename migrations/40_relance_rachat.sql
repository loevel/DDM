-- Relance de rachat J+90 : nudge d'entretien + rachat après livraison.
-- Une perruque cheveux humains se renouvelle tous les 6-12 mois ; 90 jours
-- après la livraison on relance la cliente (entretien + code -15 %).

ALTER TABLE orders ADD COLUMN rebuy_email_sent_at TEXT;

-- Anti-spam du backlog : au premier passage du cron, marquer comme déjà
-- relancées toutes les commandes livrées il y a plus de 180 jours, pour ne pas
-- envoyer d'un coup un email à toutes les anciennes clientes. Seules les
-- commandes de la fenêtre 90-180 j restent éligibles immédiatement ; les
-- commandes plus récentes deviendront éligibles en franchissant 90 jours.
UPDATE orders
   SET rebuy_email_sent_at = datetime('now')
 WHERE status = 'delivered'
   AND delivered_at IS NOT NULL
   AND julianday('now') - julianday(delivered_at) > 180;

CREATE INDEX IF NOT EXISTS idx_orders_rebuy
  ON orders(status, rebuy_email_sent_at, delivered_at);
