-- Source d'inscription à la newsletter, pour mesurer les canaux d'acquisition
-- (ex. 'quiz' pour les emails capturés via le quiz « Trouve ta perruque »).
-- L'inscription reste fonctionnelle même sans cette colonne : le tag est écrit
-- en best-effort (UPDATE dans un try/catch).

ALTER TABLE newsletter ADD COLUMN source TEXT;
