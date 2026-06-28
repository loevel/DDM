-- Migration 09: Barre d'annonces gérée via admin
CREATE TABLE IF NOT EXISTS announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT    NOT NULL,
  link_label  TEXT,
  link_to     TEXT,
  countdown_to TEXT,
  highlight   INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Annonces de démarrage
INSERT INTO announcements (text, link_label, link_to, highlight, position) VALUES
  ('🚚 Livraison gratuite sur toutes les commandes au Canada', 'Boutique →', '/boutique', 0, 0),
  ('⏳ Offre flash : Achetez 1, obtenez 1 à -50%', 'Profiter →', '/promotions', 1, 1),
  ('✨ Nouveautés disponibles — Perruques HD Lace Full Lace', 'Découvrir →', '/boutique', 0, 2),
  ('💬 Consultation capillaire gratuite disponible', 'Réserver →', '/contact', 0, 3);
