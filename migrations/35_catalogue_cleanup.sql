-- 35 : Nettoyage du catalogue de démonstration
-- Reclassement des accessoires, correction des prix barrés trompeurs (LPC),
-- suppression du produit synthétique (contredit la promesse "100 % cheveux humains").

-- Spray Brillance & Protection : accessoire de soin, pas une perruque
UPDATE products SET famille = 'accessoire', category = 'soin' WHERE id = 7;

-- Filet de Perruque Invisible : accessoire
UPDATE products SET famille = 'accessoire' WHERE id = 8;

-- Bonnet Grip : accessoire + prix barré non crédible (16,99 $ barré 89 $)
UPDATE products SET famille = 'accessoire', category = 'accessoire',
  compare_at_price_cad = NULL WHERE id = 9;

-- Adhésif Frontal : accessoire + retrait des attributs de perruque absurdes
UPDATE products SET famille = 'accessoire', category = 'accessoire',
  texture = NULL, longueur_po = NULL, densite = NULL WHERE id = 10;

-- Angel est une perruque (deep wave 40 po), pas un accessoire
UPDATE products SET famille = 'perruque', category = 'perruque' WHERE id = 11;

-- Pixie Cut : prix barré inversé (25 $ < 129 $)
UPDATE products SET compare_at_price_cad = NULL WHERE id = 4;

-- Produit démo "Bob Synthétique" : aucune commande/avis/favori, suppression
DELETE FROM product_variants WHERE product_id = 2
  AND NOT EXISTS (SELECT 1 FROM order_items WHERE product_id = 2);
DELETE FROM products WHERE id = 2
  AND NOT EXISTS (SELECT 1 FROM order_items WHERE product_id = 2);
