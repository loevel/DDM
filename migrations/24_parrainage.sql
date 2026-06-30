CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_email TEXT NOT NULL,
  referred_email TEXT,
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_cad REAL NOT NULL DEFAULT 15.0,
  discount_cad REAL NOT NULL DEFAULT 10.0,
  order_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  rewarded_at TEXT
);

ALTER TABLE customers ADD COLUMN referral_code TEXT;
ALTER TABLE customers ADD COLUMN referral_credit_cad REAL NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_referral_code ON customers(referral_code);
