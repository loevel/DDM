CREATE TABLE IF NOT EXISTS sales_calendar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📅',
  type TEXT NOT NULL DEFAULT 'promo',
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  action_type TEXT,
  action_value TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO sales_calendar (name, emoji, type, description, start_date, end_date, status, action_type) VALUES
('Nouvel An', '🎉', 'promo', '-15% du 1er au 7 jan sur les bestsellers — liquider le stock de fin décembre', '2027-01-01', '2027-01-07', 'scheduled', 'promo'),
('Saint-Valentin', '💕', 'promo', 'Cartes cadeaux + bundles perruque + soin. Cibler les conjoints.', '2027-02-10', '2027-02-14', 'scheduled', 'promo'),
('Mois Beauté Noire (BHM)', '✊🏾', 'content', 'Collection thématique + collabs influenceuses. Pas de solde — valoriser.', '2027-03-01', '2027-03-31', 'scheduled', 'collection'),
('Pâques / Printemps', '🌸', 'flash', '-20% sur les nouveautés texttures légères (body wave, loose wave)', '2027-04-18', '2027-04-20', 'scheduled', 'flash'),
('Fête des Mères', '🌷', 'promo', 'Campagne 2 semaines — cartes cadeaux + coffrets. Emails J-14, J-7, J-3, Jour J.', '2027-05-01', '2027-05-11', 'scheduled', 'promo'),
('Été / Glueless', '☀️', 'flash', 'Ventes flash chaque vendredi. Focus glueless + perruques courtes.', '2027-06-01', '2027-06-30', 'scheduled', 'flash'),
('Rentrée', '📚', 'promo', 'Collection professionnelle. Email de réengagement clientes inactives 3+ mois.', '2027-09-01', '2027-09-07', 'scheduled', 'promo'),
('Halloween', '🎃', 'flash', '-25% sur perruques colorées/fantaisie. Teaser Black Friday dernière semaine.', '2027-10-28', '2027-10-31', 'scheduled', 'flash'),
('Black Friday', '🛍️', 'flash', 'PLUS GRANDE VENTE DE L''ANNÉE. Accès clientes fidèles 48h avant. Max -35%.', '2027-11-26', '2027-12-01', 'scheduled', 'flash'),
('Noël / Cartes cadeaux', '🎄', 'promo', 'Mise en avant cartes cadeaux + emballage cadeau. Dernière commande garantie 20 déc.', '2027-12-01', '2027-12-25', 'scheduled', 'promo');
