-- Migration 14 : Opérations — commandes fournisseurs, mouvements stock, inventaires, retours

-- ─── Commandes fournisseurs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commandes_fournisseurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE,
  fournisseur TEXT NOT NULL,
  contact TEXT,
  statut TEXT DEFAULT 'brouillon',
  -- statuts: brouillon, confirmee, en_transit, dedouanement, recue, partielle, annulee
  date_commande TEXT DEFAULT (date('now')),
  date_livraison_prevue TEXT,
  date_livraison_reelle TEXT,
  num_tracking TEXT,
  frais_expedition_usd REAL DEFAULT 0,
  frais_douane_cad REAL DEFAULT 0,
  taux_change REAL DEFAULT 1.38,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commandes_fournisseurs_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commande_id INTEGER NOT NULL REFERENCES commandes_fournisseurs(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  nom_produit TEXT NOT NULL,
  ref_fournisseur TEXT,
  quantite_commandee INTEGER NOT NULL DEFAULT 1,
  quantite_recue INTEGER DEFAULT 0,
  prix_unitaire_usd REAL NOT NULL DEFAULT 0
);

-- ─── Mouvements de stock ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_mouvements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  -- types: reception, vente, retour_client, retour_fournisseur, ajustement_positif, ajustement_negatif, perte, inventaire
  quantite INTEGER NOT NULL,
  stock_avant INTEGER,
  stock_apres INTEGER,
  cout_unitaire_cad REAL,
  reference_type TEXT,  -- 'commande_fournisseur', 'order', 'inventaire', 'retour', 'manuel'
  reference_id INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Inventaires physiques ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventaires_physiques (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statut TEXT DEFAULT 'en_cours',  -- en_cours, termine, annule
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  termine_at TEXT
);

CREATE TABLE IF NOT EXISTS inventaires_physiques_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inventaire_id INTEGER NOT NULL REFERENCES inventaires_physiques(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  nom_produit TEXT NOT NULL,
  quantite_systeme INTEGER NOT NULL DEFAULT 0,
  quantite_comptee INTEGER,
  notes TEXT
);

-- ─── Retours clients ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retours_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_ref TEXT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  nom_produit TEXT NOT NULL,
  client_nom TEXT,
  client_email TEXT,
  quantite INTEGER NOT NULL DEFAULT 1,
  raison TEXT,  -- defaut_produit, mauvaise_taille, changement_avis, non_conforme, autre
  etat_produit TEXT DEFAULT 'revendable',  -- revendable, non_revendable, a_inspecter
  statut TEXT DEFAULT 'en_attente',  -- en_attente, approuve, refuse, traite
  remboursement_cad REAL,
  remboursement_methode TEXT DEFAULT 'original',  -- original, credit_boutique, aucun
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Index ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_mvt_product ON stock_mouvements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_created ON stock_mouvements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_type ON stock_mouvements(type);
CREATE INDEX IF NOT EXISTS idx_cf_statut ON commandes_fournisseurs(statut);
CREATE INDEX IF NOT EXISTS idx_retours_statut ON retours_clients(statut);
