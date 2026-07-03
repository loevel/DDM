-- 34 : Conformité LCAP/CASL — preuve de consentement + désabonnement sans compte
-- Chaque email commercial doit contenir un lien de désabonnement fonctionnel.

ALTER TABLE newsletter ADD COLUMN consent_ip TEXT;
ALTER TABLE newsletter ADD COLUMN unsub_token TEXT;
ALTER TABLE newsletter ADD COLUMN unsubscribed_at TEXT;

-- Jeton de désabonnement pour les abonnés existants
UPDATE newsletter SET unsub_token = lower(hex(randomblob(16))) WHERE unsub_token IS NULL;

-- Les clients avec compte reçoivent aussi un jeton (désabonnement sans connexion)
ALTER TABLE customers ADD COLUMN unsub_token TEXT;
UPDATE customers SET unsub_token = lower(hex(randomblob(16))) WHERE unsub_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_unsub ON newsletter(unsub_token);
CREATE INDEX IF NOT EXISTS idx_customers_unsub ON customers(unsub_token);
