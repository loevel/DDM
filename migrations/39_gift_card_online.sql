-- 39 : Achat en ligne des cartes cadeaux + utilisation au checkout
--
-- gift_card_purchases : intentions d'achat en attente de paiement Stripe.
-- La carte (gift_cards) n'est créée qu'à la confirmation du paiement (webhook),
-- pour ne jamais émettre de code sur un paiement échoué ou abandonné.

CREATE TABLE IF NOT EXISTS gift_card_purchases (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_payment_intent_id  TEXT    NOT NULL UNIQUE,
  amount_cad                REAL    NOT NULL,
  buyer_name                TEXT    NOT NULL,
  buyer_email               TEXT    NOT NULL,
  recipient_name            TEXT,
  recipient_email           TEXT,
  message                   TEXT,
  status                    TEXT    NOT NULL DEFAULT 'pending', -- pending | completed | failed
  gift_card_id              INTEGER REFERENCES gift_cards(id),
  created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gift_card_purchases_pi ON gift_card_purchases(stripe_payment_intent_id);

-- Utilisation d'une carte cadeau comme mode de paiement sur une commande.
-- gift_card_cad = portion du total payée par la carte ; le solde n'est
-- débité qu'au paiement confirmé (webhook), comme les codes promo.
ALTER TABLE orders ADD COLUMN gift_card_code TEXT;
ALTER TABLE orders ADD COLUMN gift_card_cad REAL NOT NULL DEFAULT 0;
