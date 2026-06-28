-- Migration 10: Couleur de fond personnalisée pour les annonces
ALTER TABLE announcements ADD COLUMN bg_color TEXT DEFAULT '#1b1c1c';

-- Migrer les données existantes
UPDATE announcements SET bg_color = '#7d562d' WHERE highlight = 1;
UPDATE announcements SET bg_color = '#1b1c1c' WHERE highlight = 0;
