-- Lie les annonces aux événements du calendrier pour désactivation automatique
ALTER TABLE announcements ADD COLUMN calendar_event_id INTEGER;
