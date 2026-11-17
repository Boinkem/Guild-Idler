-- Patch 0477 -- Realm Threat tables (spec: "Realm Threat -- complete system
-- spec", section 10.1), plus what one-off EVENTS need (kind 'event': the
-- Next Fest Breach and its test runs). This patch only drives events; the
-- chapter, rally and chain-bonus columns/tables are here already so the
-- full campaign build doesn't need to reshape live data.

CREATE TABLE IF NOT EXISTS realm_campaigns (
  id SERIAL PRIMARY KEY,                    -- campaign number
  campaign_key TEXT NOT NULL,               -- content id (client JSON), e.g. 'next_fest_breach'
  kind TEXT NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'prologue', 'event')),
  event_key TEXT UNIQUE,                    -- events only: stable id from realm.config.json / admin
  opens_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  chapter_count INT NOT NULL,               -- 4 full, 1 prologue/event
  target BIGINT NOT NULL,                   -- T (events: admin may retune while open)
  chapter_cap INT NOT NULL,
  tiers JSONB NOT NULL,                     -- e.g. [25,100,250]
  glory JSONB NOT NULL DEFAULT '[]',
  -- Events only. {"tierTitles": [null, "Festival Breacher", null], "sealTitle": null}
  rewards JSONB NOT NULL DEFAULT '{}',
  allow_demo BOOLEAN NOT NULL DEFAULT false, -- may demo-build sessions contribute?
  grace_minutes INT NOT NULL DEFAULT 0,     -- late reports accepted this long after ends_at
  teaser_from TIMESTAMPTZ,                  -- /realm/current shows the countdown from here
  results_until TIMESTAMPTZ,                -- ...and the result until here (NULL = keep showing)
  total BIGINT NOT NULL DEFAULT 0,
  contributors INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('scheduled', 'open', 'closed')),
  closed_at TIMESTAMPTZ,
  finalised_at TIMESTAMPTZ,                 -- result locked in (after the grace period)
  result JSONB                              -- {sealed, finalPct, milestonesReached}
);

CREATE TABLE IF NOT EXISTS realm_chapters (
  campaign_id INT NOT NULL REFERENCES realm_campaigns(id) ON DELETE CASCADE,
  chapter INT NOT NULL,                     -- 1..chapter_count
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  ward_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  cap INT NOT NULL,
  total_at_open BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed')),
  held BOOLEAN,
  PRIMARY KEY (campaign_id, chapter)
);

CREATE TABLE IF NOT EXISTS realm_contributions (
  campaign_id INT NOT NULL REFERENCES realm_campaigns(id) ON DELETE CASCADE,
  chapter INT NOT NULL,
  steam_id TEXT NOT NULL,
  app TEXT NOT NULL DEFAULT 'full',         -- 'full' | 'demo' build the Ward came from
  guild_name TEXT,                          -- display only, length-capped, sanitised
  points INT NOT NULL DEFAULT 0,
  last_batch_key UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, chapter, steam_id)
);
CREATE INDEX IF NOT EXISTS idx_realm_contrib_player ON realm_contributions(campaign_id, steam_id);

CREATE TABLE IF NOT EXISTS realm_chain_bonus (
  campaign_id INT NOT NULL REFERENCES realm_campaigns(id) ON DELETE CASCADE,
  steam_id TEXT NOT NULL,
  band TEXT NOT NULL,
  amount INT NOT NULL,
  bonus_key UUID NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, steam_id)
);

CREATE TABLE IF NOT EXISTS realm_feed (
  id BIGSERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES realm_campaigns(id) ON DELETE CASCADE,
  steam_id TEXT,
  guild_name TEXT,
  text_key TEXT NOT NULL DEFAULT 'quests',  -- 'quests' | 'tier' | 'milestone' | 'reserve'
  points INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_realm_feed_campaign ON realm_feed(campaign_id, id DESC);

-- What each Steam account has earned from an event, so the full game can
-- hand it over at launch even if the demo save never reaches that PC.
CREATE TABLE IF NOT EXISTS realm_rewards (
  campaign_id INT NOT NULL REFERENCES realm_campaigns(id) ON DELETE CASCADE,
  steam_id TEXT NOT NULL,
  rewards JSONB NOT NULL DEFAULT '{"titles": []}',
  claimed_full_at TIMESTAMPTZ,
  PRIMARY KEY (campaign_id, steam_id)
);

-- The full campaign's chests arrive as mailbox rows of this type (spec 9.4).
-- Nothing writes one yet. If the Weekly Pot migration also widens this
-- constraint, merge the lists.
ALTER TABLE mailbox DROP CONSTRAINT IF EXISTS mailbox_type_check;
ALTER TABLE mailbox ADD CONSTRAINT mailbox_type_check
  CHECK (type IN ('gold', 'scrap', 'equipment', 'consumable', 'shard', 'realm_chest'));
