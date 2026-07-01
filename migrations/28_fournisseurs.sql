CREATE TABLE IF NOT EXISTS fournisseurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  url TEXT,
  email TEXT,
  telephone TEXT,
  pays TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Migrer les fournisseurs uniques depuis les produits existants
INSERT OR IGNORE INTO fournisseurs (nom, url)
SELECT DISTINCT fournisseur, url_fournisseur
FROM products
WHERE fournisseur IS NOT NULL AND fournisseur != '';

-- Lier les produits à leurs fournisseurs migrés
ALTER TABLE products ADD COLUMN fournisseur_id INTEGER REFERENCES fournisseurs(id);

UPDATE products
SET fournisseur_id = (SELECT id FROM fournisseurs WHERE nom = products.fournisseur)
WHERE fournisseur IS NOT NULL AND fournisseur != '';

CREATE INDEX IF NOT EXISTS idx_fournisseurs_nom ON fournisseurs(nom);
CREATE INDEX IF NOT EXISTS idx_products_fournisseur ON products(fournisseur_id);
