-- Déclinaisons de produits (couleur, longueur, etc.)
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_adjustment_cad REAL NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  sku TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- Snapshot de la déclinaison choisie dans les articles de commande
ALTER TABLE order_items ADD COLUMN variant_id INTEGER REFERENCES product_variants(id);
ALTER TABLE order_items ADD COLUMN variant_name TEXT;
