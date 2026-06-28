CREATE TABLE IF NOT EXISTS promo_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  type        TEXT    NOT NULL CHECK(type IN ('percent', 'fixed')),
  value       REAL    NOT NULL,
  min_order   REAL    NOT NULL DEFAULT 0,
  usage_limit INTEGER DEFAULT NULL,
  used_count  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  expires_at  TEXT    DEFAULT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
