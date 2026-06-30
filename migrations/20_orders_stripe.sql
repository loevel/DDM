-- Ajout des champs Stripe et livraison aux commandes
ALTER TABLE orders ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN payment_method TEXT;
ALTER TABLE orders ADD COLUMN shipping_address TEXT; -- JSON {line1, city, province, postal_code, country}
ALTER TABLE orders ADD COLUMN promo_code TEXT;
ALTER TABLE orders ADD COLUMN discount_cad REAL DEFAULT 0;

-- Infos produit snapshot dans les items (pour affichage historique)
ALTER TABLE order_items ADD COLUMN product_name TEXT;
ALTER TABLE order_items ADD COLUMN product_slug TEXT;
ALTER TABLE order_items ADD COLUMN image_key TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_stripe ON orders(stripe_payment_intent_id);
