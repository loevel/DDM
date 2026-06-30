-- Table de médias produit : images et vidéos multiples
CREATE TABLE IF NOT EXISTS product_media (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL DEFAULT 'image' CHECK(type IN ('image', 'video')),
  url          TEXT    NOT NULL,
  thumbnail_url TEXT,
  alt_text     TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_product_media_product ON product_media(product_id, position);
