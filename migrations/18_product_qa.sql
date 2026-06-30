-- Questions / Réponses sur les fiches produit
CREATE TABLE IF NOT EXISTS product_questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_name TEXT    NOT NULL,
  question      TEXT    NOT NULL,
  answer        TEXT,
  answered_at   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pq_product ON product_questions(product_id, answered_at);
