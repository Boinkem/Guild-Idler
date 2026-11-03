-- Patch 0462 -- Auction House Broker.
--
-- A sale bought by the Broker has no player buyer: transactions.buyer_steam_id
-- becomes nullable (listings.buyer_steam_id already was). NULL buyer = Broker
-- buyout, the same way a NULL seller has always meant a system-seeded
-- (Broker) listing. Nothing else changes shape.

ALTER TABLE transactions ALTER COLUMN buyer_steam_id DROP NOT NULL;

-- The Broker's per-seller daily buyout cap counts these.
CREATE INDEX IF NOT EXISTS idx_transactions_broker_seller
  ON transactions(seller_steam_id, created_at) WHERE buyer_steam_id IS NULL;
-- Bracket supply counts active listings every tick.
CREATE INDEX IF NOT EXISTS idx_listings_active_type
  ON listings(item_type) WHERE status = 'active';
