-- Patch 0454 -- Legendary Shards on the Auction House.
--
-- A shard listing is a stack: item_type 'shard', item_payload
-- { "defId": "legendary_shard", "amount": N }. The buy / cancel / expiry
-- routes copy item_type and item_payload straight into the mailbox, so the
-- mailbox needs the same new type. Both CHECK constraints from 001_init.sql
-- are recreated with 'shard' added (Postgres' default names for an inline
-- column CHECK are <table>_<column>_check).

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_item_type_check;
ALTER TABLE listings ADD CONSTRAINT listings_item_type_check
  CHECK (item_type IN ('equipment', 'consumable', 'shard'));

ALTER TABLE mailbox DROP CONSTRAINT IF EXISTS mailbox_type_check;
ALTER TABLE mailbox ADD CONSTRAINT mailbox_type_check
  CHECK (type IN ('gold', 'scrap', 'equipment', 'consumable', 'shard'));
