-- Migration 15 : Profil client étendu — préférences capillaires, quiz, favoris

-- Préférences capillaires sur le profil client
ALTER TABLE customers ADD COLUMN cap_size TEXT;
ALTER TABLE customers ADD COLUMN texture_preferee TEXT;
ALTER TABLE customers ADD COLUMN longueur_preferee TEXT;
ALTER TABLE customers ADD COLUMN couleur_naturelle TEXT;
ALTER TABLE customers ADD COLUMN style_pose TEXT;
ALTER TABLE customers ADD COLUMN budget_habituel TEXT;
ALTER TABLE customers ADD COLUMN date_naissance TEXT;
ALTER TABLE customers ADD COLUMN newsletter_optin INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN alertes_stock INTEGER DEFAULT 1;

-- Résultat du dernier quiz sauvegardé (JSON)
ALTER TABLE customers ADD COLUMN quiz_result TEXT;
ALTER TABLE customers ADD COLUMN quiz_completed_at TEXT;

-- Liste de souhaits
CREATE TABLE IF NOT EXISTS wishlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_customer ON wishlists(customer_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product ON wishlists(product_id);
