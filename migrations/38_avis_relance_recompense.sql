-- 38 : Relance d'avis post-livraison + récompense
-- Corrige aussi un bug critique : le webhook Stripe et commande-confirmee font
-- « UPDATE orders SET updated_at = ... » alors que la colonne n'existait pas,
-- ce qui faisait échouer le marquage payment_status='paid' et la décrémentation
-- du stock.

ALTER TABLE orders ADD COLUMN updated_at TEXT;
ALTER TABLE orders ADD COLUMN delivered_at TEXT;
ALTER TABLE orders ADD COLUMN review_request_sent_at TEXT;
ALTER TABLE reviews ADD COLUMN reward_code TEXT;

-- Rattrapage : les commandes déjà livrées prennent leur date de création comme
-- date de livraison approximative (évite de relancer de très vieilles commandes
-- comme si elles venaient d'être livrées).
UPDATE orders SET delivered_at = created_at WHERE status = 'delivered' AND delivered_at IS NULL;

-- Rattrapage : commandes Stripe payées jamais marquées 'paid' à cause du bug.
UPDATE orders SET payment_status = 'paid'
WHERE stripe_payment_intent_id IS NOT NULL
  AND payment_status = 'pending'
  AND status IN ('confirmed', 'shipped', 'delivered');
