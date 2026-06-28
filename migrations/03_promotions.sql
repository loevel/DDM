CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('percent', 'fixed')),
  value REAL NOT NULL,
  min_order_cad REAL DEFAULT 0,
  max_uses INTEGER,
  uses INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  tel TEXT,
  sujet TEXT,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);
