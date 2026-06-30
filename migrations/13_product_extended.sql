-- Migration 13 : champs étendus produit (finances, fournisseur, logistique, SEO)

-- Finances
ALTER TABLE products ADD COLUMN prix_achat_usd REAL;
ALTER TABLE products ADD COLUMN frais_expedition_usd REAL;
ALTER TABLE products ADD COLUMN frais_douane_pct REAL DEFAULT 0;

-- Fournisseur
ALTER TABLE products ADD COLUMN fournisseur TEXT;
ALTER TABLE products ADD COLUMN ref_fournisseur TEXT;
ALTER TABLE products ADD COLUMN url_fournisseur TEXT;
ALTER TABLE products ADD COLUMN contact_fournisseur TEXT;
ALTER TABLE products ADD COLUMN delai_livraison_jours INTEGER;
ALTER TABLE products ADD COLUMN pays_fabrication TEXT DEFAULT 'Chine';
ALTER TABLE products ADD COLUMN date_derniere_commande TEXT;
ALTER TABLE products ADD COLUMN date_prochain_reapprovisionnement TEXT;

-- Qualité cheveux
ALTER TABLE products ADD COLUMN qualite_cheveux TEXT;
ALTER TABLE products ADD COLUMN origine_cheveux TEXT;
ALTER TABLE products ADD COLUMN cap_size TEXT;
ALTER TABLE products ADD COLUMN nb_combs INTEGER;

-- Stock & logistique
ALTER TABLE products ADD COLUMN seuil_alerte_stock INTEGER DEFAULT 3;
ALTER TABLE products ADD COLUMN stock_en_commande INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN poids_g INTEGER;
ALTER TABLE products ADD COLUMN localisation_entrepot TEXT;

-- SEO & marketing
ALTER TABLE products ADD COLUMN meta_title TEXT;
ALTER TABLE products ADD COLUMN meta_description TEXT;
ALTER TABLE products ADD COLUMN tags TEXT;

-- Interne
ALTER TABLE products ADD COLUMN notes_internes TEXT;
