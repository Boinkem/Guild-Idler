-- Patch 0477 -- in-game bug reports (POST /bugs). No Steam sign-in needed,
-- so demo players can report; steam_id is filled only when the reporter
-- happened to have a session.
CREATE TABLE IF NOT EXISTS bug_reports (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_key UUID UNIQUE,                   -- client idempotency key (offline queue retries)
  steam_id TEXT,
  app TEXT NOT NULL DEFAULT 'full',         -- 'full' | 'demo'
  build TEXT,                               -- package.json version the client was built from
  category TEXT NOT NULL DEFAULT 'bug',
  message TEXT NOT NULL,
  contact TEXT,                             -- optional Discord name
  context JSONB NOT NULL DEFAULT '{}',      -- tab, guild name, top hero level, platform...
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'fixed', 'wontfix')),
  fixed_patch TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status, id DESC);
