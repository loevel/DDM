-- Blog éditorial (« Le Journal ») + banque d'idées.
-- Le corps de l'article est stocké en Markdown : c'est ce que l'éditeur produit
-- et ce que app/lib/markdown.ts rend côté public — jamais de HTML brut en base,
-- pour qu'aucune saisie ne puisse devenir du script à l'affichage.

CREATE TABLE IF NOT EXISTS blog_posts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  slug             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  title            TEXT    NOT NULL,
  excerpt          TEXT,                                    -- chapô, affiché en liste
  body             TEXT    NOT NULL DEFAULT '',             -- Markdown
  cover_image_key  TEXT,                                    -- URL imagedelivery.net ou externe
  cover_alt        TEXT,                                    -- texte alternatif de la couverture
  category         TEXT,                                    -- entretien | conseils | tendances | coulisses
  tags             TEXT,                                    -- liste séparée par des virgules
  author           TEXT,
  status           TEXT    NOT NULL DEFAULT 'draft',        -- draft | scheduled | published
  published_at     TEXT,                                    -- date de parution (future si scheduled)
  seo_title        TEXT,
  seo_description  TEXT,
  reading_minutes  INTEGER NOT NULL DEFAULT 0,
  views            INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- La liste publique filtre toujours sur (status, published_at) : index composite.
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);

-- Produits mis en avant dans un article (« les perruques mentionnées »).
CREATE TABLE IF NOT EXISTS blog_post_products (
  post_id    INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_blog_post_products_post ON blog_post_products(post_id);

-- Banque d'idées / calendrier éditorial. Alimentée à la main ou par l'IA
-- (source = 'ia' quand la suggestion vient du catalogue ou des questions clients).
CREATE TABLE IF NOT EXISTS blog_ideas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  angle        TEXT,                                        -- l'angle proposé, une ou deux phrases
  keywords     TEXT,
  source       TEXT    NOT NULL DEFAULT 'manuelle',         -- manuelle | ia
  status       TEXT    NOT NULL DEFAULT 'idee',             -- idee | planifiee | ecrite | abandonnee
  planned_date TEXT,                                        -- date visée dans le calendrier
  post_id      INTEGER,                                     -- renseigné quand l'idée devient un article
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_blog_ideas_status ON blog_ideas(status, planned_date);
