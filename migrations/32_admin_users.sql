-- 32 : Comptes admin individuels + journal d'audit
-- Remplace le mot de passe partagé ADMIN_SECRET par des comptes nominatifs.
-- ADMIN_SECRET reste utilisé uniquement pour créer le premier compte (bootstrap).

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  -- PBKDF2-SHA256, 100 000 itérations — format: hex(salt):hex(hash)
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  admin_email TEXT NOT NULL,
  -- ex: login, login_failed, order.update_status, product.update, product.delete, user.create, user.deactivate
  action TEXT NOT NULL,
  entity TEXT,                -- ex: order, product, admin_user
  entity_id TEXT,             -- référence/id de l'entité touchée
  details TEXT,               -- JSON libre (avant/après, champs modifiés…)
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity ON admin_audit_log(entity, entity_id);
