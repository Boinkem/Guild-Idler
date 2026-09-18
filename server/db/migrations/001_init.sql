-- Core listings + buyout, patch 0409. See guild-idler-status.md's
-- Auction House entry for the full design.
--
-- Currency scope: 'gold' or 'scrap', per the design revision recorded in
-- patch 0400's status.md entry (originally gold-only, revised once Scrap
-- became a real second currency).
--
-- Deposit fee / sale cut: still genuinely undecided (see the Auction
-- House entry's own "Still open" list) -- deposit_amount defaults to 0
-- and is unused for now rather than guessing at a real percentage. Add
-- the real logic once actual numbers are picked, not before.
--
-- item_payload carries the FULL rolled-stat JSON, not just an id -- see
-- the design doc's own reasoning: equipment carries randomized stats and
-- crafted mods, so a listing has to capture the actual roll.

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = system-seeded stock (padding supply during low real-listing
  -- periods -- see the design doc). Real player listings always have one.
  seller_steam_id TEXT,
  item_type TEXT NOT NULL CHECK (item_type IN ('equipment', 'consumable')),
  item_payload JSONB NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('gold', 'scrap')),
  price BIGINT NOT NULL CHECK (price > 0),
  deposit_amount BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  sold_at TIMESTAMPTZ,
  buyer_steam_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_listings_status_expires ON listings(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON listings(seller_steam_id);

-- Server-side mailbox -- the delivery mechanism for BOTH purchased items
-- and sale gold now (patch 0403's design revision from the original
-- seller-gold-only decision). This is a separate table from the client's
-- own local `state.mailbox` array (MailboxManager.ts) -- the client's
-- copy is what a player actually claims from; this table is what the
-- server hands out, synced down to the client (see the mailbox-sync
-- client-side work, still to come, noted in this patch's own status.md
-- entry).
CREATE TABLE IF NOT EXISTS mailbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_steam_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gold', 'scrap', 'equipment', 'consumable')),
  amount BIGINT,
  item_payload JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set once the OWNING CLIENT confirms it applied the entry locally
  -- (gold added, item pushed to stash) -- see listings.ts's /mailbox
  -- claim route. A row existing with claimed_at set is kept, not
  -- deleted, as the audit trail transactions alone wouldn't fully cover
  -- (a mailbox entry can exist without ever being tied to a sale, e.g. a
  -- future compensation grant).
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mailbox_owner_unclaimed ON mailbox(owner_steam_id) WHERE claimed_at IS NULL;

-- Audit trail for support/dispute lookups -- per the design doc's own
-- data model. Never mutated after insert.
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id),
  buyer_steam_id TEXT NOT NULL,
  seller_steam_id TEXT,
  price BIGINT NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_steam_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller ON transactions(seller_steam_id);
