-- 33 : Taxes de vente (TPS/TVQ) sur les commandes
-- Le calcul est désactivé par défaut (petit fournisseur < 30 000 $).
-- S'active dans Admin → Paramètres quand l'entreprise s'inscrit aux fichiers TPS/TVQ.

ALTER TABLE orders ADD COLUMN tps_cad REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN tvq_cad REAL NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('taxes_enabled', '0'),
  ('tps_number', ''),
  ('tvq_number', ''),
  ('delivery_delay', '3 à 7 jours ouvrables');

-- Conformité LPC art. 187.3 : pas d'expiration sur les cartes prépayées au Québec
UPDATE gift_cards SET expires_at = NULL WHERE expires_at IS NOT NULL;
