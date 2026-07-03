-- Réponses aux messages de contact depuis l'admin.
-- La colonne `read` (migration 03) n'a jamais été branchée à l'UI, qui teste
-- `read_at` : on ajoute la colonne attendue plutôt que de réécrire l'UI.
ALTER TABLE contact_messages ADD COLUMN read_at TEXT;
ALTER TABLE contact_messages ADD COLUMN replied_at TEXT;
ALTER TABLE contact_messages ADD COLUMN reply_text TEXT;
