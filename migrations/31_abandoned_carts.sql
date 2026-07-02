-- Système de gestion des paniers abandonnés
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id TEXT NOT NULL UNIQUE,
  email TEXT,
  customer_name TEXT,
  items_json TEXT NOT NULL DEFAULT '[]',
  total_cad REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  -- active: panier en cours | abandoned: abandonné (>1h sans activité) | recovered: converti en commande | expired: vide/expiré
  reminder_1_sent_at TEXT,
  reminder_2_sent_at TEXT,
  reminder_3_sent_at TEXT,
  recovery_promo_code TEXT,
  order_reference TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON abandoned_carts(email);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status ON abandoned_carts(status);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_updated_at ON abandoned_carts(updated_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_cart_id ON abandoned_carts(cart_id);
