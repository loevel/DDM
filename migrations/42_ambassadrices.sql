-- Programme d'ambassadrices (micro-influenceuses) : code perso = code promo
-- pour la remise acheteuse + commission sur les ventes générées.
-- Se branche sur le checkout existant (promo_codes) ; l'attribution de la
-- commission est stockée sur la commande et créditée au paiement confirmé.

CREATE TABLE IF NOT EXISTS ambassadors (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT    NOT NULL,
  email                TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  code                 TEXT    UNIQUE COLLATE NOCASE,       -- code perso (= code promo acheteur)
  social_handle        TEXT,                                 -- @instagram / TikTok
  audience             TEXT,                                 -- taille / description de l'audience
  message              TEXT,                                 -- motivation (candidature)
  discount_percent     REAL    NOT NULL DEFAULT 10,          -- remise offerte à l'acheteur
  commission_rate      REAL    NOT NULL DEFAULT 10,          -- % de commission ambassadrice
  status               TEXT    NOT NULL DEFAULT 'pending',   -- pending | active | suspended | rejected
  payout_method        TEXT,                                 -- Interac / PayPal ...
  payout_details       TEXT,                                 -- courriel Interac, etc.
  total_sales_cad      REAL    NOT NULL DEFAULT 0,           -- CA généré (net marchandise)
  total_commission_cad REAL    NOT NULL DEFAULT 0,           -- commission cumulée
  paid_commission_cad  REAL    NOT NULL DEFAULT 0,           -- commission déjà versée
  notes                TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  approved_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_ambassadors_status ON ambassadors(status);

CREATE TABLE IF NOT EXISTS ambassador_sales (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ambassador_id   INTEGER NOT NULL REFERENCES ambassadors(id),
  order_reference TEXT    NOT NULL UNIQUE,                   -- 1 seule commission par commande (idempotence)
  sale_amount_cad REAL    NOT NULL,
  commission_cad  REAL    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending',        -- pending | paid
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  paid_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_ambassador_sales_amb ON ambassador_sales(ambassador_id);

ALTER TABLE orders ADD COLUMN ambassador_code TEXT;
