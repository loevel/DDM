CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('whatsapp_number', '+237971937230'),
  ('instagram_url', ''),
  ('tiktok_url', ''),
  ('facebook_url', ''),
  ('contact_email', 'contact@ddmwigs.ca'),
  ('site_slogan', 'Perruques en cheveux humains 100% — Montréal'),
  ('footer_note', '');
