-- Suivi d'expédition, remise manuelle et note admin sur les commandes
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN tracking_carrier TEXT;
ALTER TABLE orders ADD COLUMN discount_override_cad REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN admin_note TEXT;
