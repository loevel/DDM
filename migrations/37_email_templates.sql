-- Surcharges des textes de courriels marketing, éditables via /admin/courriels.
-- Absence de ligne = valeurs par défaut du code (app/lib/email.server.ts).
CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
