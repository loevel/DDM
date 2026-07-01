ALTER TABLE reviews ADD COLUMN customer_email TEXT;
ALTER TABLE reviews ADD COLUMN verified_purchase INTEGER NOT NULL DEFAULT 0;
