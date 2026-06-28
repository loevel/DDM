-- Migration 04: Product attributes for full catalogue taxonomy
-- Famille, type lace, texture, longueur, densité, couleur, options

ALTER TABLE products ADD COLUMN famille TEXT DEFAULT 'perruque'
  CHECK(famille IN ('perruque', 'meche', 'closure', 'frontal', 'accessoire', 'soin', 'location'));

ALTER TABLE products ADD COLUMN type_lace TEXT
  CHECK(type_lace IN ('13x4','13x6','4x4','5x5','6x6','360','full','v-part','u-part','glueless','pre-everything') OR type_lace IS NULL);

ALTER TABLE products ADD COLUMN texture TEXT
  CHECK(texture IN ('lisse','body-wave','water-wave','deep-wave','loose-wave','boucle','kinky-curly','kinky-straight','bob','avec-frange','autre') OR texture IS NULL);

ALTER TABLE products ADD COLUMN longueur_po INTEGER;

ALTER TABLE products ADD COLUMN densite INTEGER
  CHECK(densite IN (130,150,180,200,250) OR densite IS NULL);

ALTER TABLE products ADD COLUMN couleur TEXT
  CHECK(couleur IN ('naturel','brun-fonce','chatain','balayage','ombre','blonde-613','colore','autre') OR couleur IS NULL);

ALTER TABLE products ADD COLUMN hd_lace INTEGER DEFAULT 0;

ALTER TABLE products ADD COLUMN glueless INTEGER DEFAULT 0;

ALTER TABLE products ADD COLUMN pret_a_porter INTEGER DEFAULT 0;

ALTER TABLE products ADD COLUMN quantite_meches INTEGER
  CHECK(quantite_meches IN (1,2,3,4) OR quantite_meches IS NULL);

-- Update existing category check to be broader (famille replaces category)
-- Keep category for backwards compat, famille is the new primary field
