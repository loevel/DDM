-- Migration 11: Collections de produits
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_key TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_collections (
  product_id INTEGER NOT NULL,
  collection_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, collection_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

-- Quelques collections de départ
INSERT INTO collections (name, slug, description, active, position) VALUES
  ('Nouveautés', 'nouveautes', 'Les dernières arrivées', 1, 0),
  ('Collection Hiver 2026', 'hiver-2026', 'Perruques et accessoires de la saison hivernale 2026', 1, 1),
  ('Best-sellers', 'best-sellers', 'Nos produits les plus populaires', 1, 2);
