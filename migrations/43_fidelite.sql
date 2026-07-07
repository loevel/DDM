-- Programme de fidélité par points (LTV) + bonus points pour avis avec photo.
-- Gain : 1 point / 1 $ de marchandise nette payée. Échange : 20 points = 1 $
-- (min 100 points), appliqué comme remise au checkout. Ledger pour la
-- transparence côté cliente et l'affichage dans le tableau de bord.

ALTER TABLE customers ADD COLUMN loyalty_points INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     TEXT    NOT NULL,
  points          INTEGER NOT NULL,        -- positif = gagné, négatif = utilisé
  type            TEXT    NOT NULL,         -- earn | redeem | review | adjust
  reason          TEXT,
  order_reference TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_customer ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_order ON loyalty_transactions(order_reference);

ALTER TABLE orders ADD COLUMN loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN loyalty_discount_cad REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN loyalty_points_earned INTEGER NOT NULL DEFAULT 0;
