-- Prix de comparaison (avant réduction) — null si pas de promo
ALTER TABLE products ADD COLUMN compare_at_price_cad REAL DEFAULT NULL;
