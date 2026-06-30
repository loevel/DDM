CREATE TABLE IF NOT EXISTS gift_cards (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT    NOT NULL UNIQUE,
  amount_cad    REAL    NOT NULL,
  balance_cad   REAL    NOT NULL,
  recipient_name  TEXT,
  recipient_email TEXT,
  note          TEXT,
  expires_at    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code);
