import { FastifyInstance, FastifyRequest, FastifyBaseLogger } from 'fastify';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { getPool, withTransaction } from './db.js';
import { AppConfig } from './config.js';
import { requireAnySession } from './listings.js';
import { requireAdmin } from './admin.js';
import type { Session } from './sessions.js';

/**
 * Realm Threat, patch 0477 -- the EVENT slice.
 *
 * The full feature (design doc "Realm Threat -- complete system spec") is
 * a month-long, four-chapter campaign. This file builds the part a one-off
 * event needs, on the spec's own tables and Ward rules, so the Next Fest
 * Breach (and short test runs of it) exercise the same contribution path
 * the campaigns will use:
 *
 *   - a campaign row of kind 'event' with a single chapter, any start and
 *     end time, created from realm.config.json or the admin routes;
 *   - GET /realm/current (public, cached), GET /realm/mine and
 *     POST /realm/contribute (signed in; demo sessions allowed when the
 *     event says so);
 *   - a 60s job: scheduled -> open -> closed -> finalised, with a grace
 *     period after the close in which late reports (offline quest time)
 *     are still accepted;
 *   - rewards are guild TITLES recorded per Steam account in
 *     realm_rewards, not mailbox chests -- demo sessions can't reach the
 *     mailbox, and the full game can read them back at launch.
 *
 * Not built yet: kinds 'full' and 'prologue' (chapter rollover, the Last
 * Stand rally, chests, the chain bonus). The server cannot verify that a
 * quest happened; the per-player cap, the per-batch max and cosmetic-only
 * rewards are the limits (spec section 16).
 *
 * On/off: AH_REALM_ENABLED=true in .env AND "enabled": true in
 * realm.config.json. Either one off means /realm/current answers
 * { realmEnabled: false } and clients show nothing.
 */

const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'realm.config.json');
const CURRENT_CACHE_MS = 15_000;
const FEED_ROWS = 6;
const FEED_KEEP = 50;
const MILESTONES = [25, 50, 75, 100];
const GUILD_NAME_MAX = 24;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RealmRewards {
  /** One entry per tier (same order as `tiers`); null = no title for it. */
  tierTitles?: (string | null)[];
  /** Granted to every contributor at tier 1+ if the event is sealed. */
  sealTitle?: string | null;
}

interface RealmEventConfig {
  eventKey: string;
  campaignKey: string;
  opensAt: string;
  endsAt: string;
  target: number;
  cap: number;
  tiers: number[];
  rewards?: RealmRewards;
  allowDemo?: boolean;
  graceMinutes?: number;
  teaserFrom?: string | null;
  resultsUntil?: string | null;
}

interface RealmConfig {
  enabled: boolean;
  /** Largest single batch accepted (before the cap). Defaults to the cap. */
  maxBatch?: number;
  /** A player's Ward within this many minutes folds into one feed line. */
  feedMinutes?: number;
  events?: RealmEventConfig[];
}

export function readRealmConfig(): RealmConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as RealmConfig;
}

function realmOn(config: AppConfig): boolean {
  if (!config.realmEnabled) return false;
  try { return readRealmConfig().enabled === true; } catch { return false; }
}

interface CampaignRow {
  id: number;
  campaign_key: string;
  kind: string;
  event_key: string | null;
  opens_at: Date;
  ends_at: Date;
  target: string;
  chapter_cap: number;
  tiers: number[];
  rewards: RealmRewards;
  allow_demo: boolean;
  grace_minutes: number;
  teaser_from: Date | null;
  results_until: Date | null;
  total: string;
  contributors: number;
  status: 'scheduled' | 'open' | 'closed';
  finalised_at: Date | null;
  result: { sealed: boolean; finalPct: number; milestonesReached: number } | null;
}

type Phase = 'teaser' | 'open' | 'tallying' | 'closed';

function phaseOf(row: CampaignRow, now: number): Phase | null {
  if (row.status === 'open') return 'open';
  if (row.status === 'scheduled') {
    return !row.teaser_from || row.teaser_from.getTime() <= now ? 'teaser' : null;
  }
  if (!row.finalised_at) return 'tallying';
  return !row.results_until || row.results_until.getTime() > now ? 'closed' : null;
}

/** How long a just-finished event's result outranks the next event's
 *  countdown, so players get to see how it ended. */
const FRESH_RESULT_MS = 72 * 60 * 60_000;

/** Lower shows first: a live event, then one being tallied, then a result
 *  from the last few days, then the next countdown, then older results. */
function rankOf(row: CampaignRow, phase: Phase, now: number): number {
  if (phase === 'open') return 0;
  if (phase === 'tallying') return 1;
  if (phase === 'teaser') return 3;
  return row.finalised_at && now - row.finalised_at.getTime() < FRESH_RESULT_MS ? 2 : 4;
}

/** The one event clients should be shown right now, if any. */
async function pickCurrent(): Promise<{ row: CampaignRow; phase: Phase } | null> {
  const { rows } = await getPool().query<CampaignRow>(
    `SELECT * FROM realm_campaigns WHERE kind = 'event' ORDER BY opens_at DESC LIMIT 20`,
  );
  const now = Date.now();
  let best: { row: CampaignRow; phase: Phase; rank: number } | null = null;
  for (const row of rows) {
    const phase = phaseOf(row, now);
    if (!phase) continue;
    const rank = rankOf(row, phase, now);
    if (!best || rank < best.rank
      // Among countdowns, the one opening soonest; rows arrive newest-first.
      || (rank === best.rank && phase === 'teaser' && row.opens_at < best.row.opens_at)) {
      best = { row, phase, rank };
    }
  }
  return best;
}

function tierOf(points: number, tiers: number[]): number {
  let tier = 0;
  for (const threshold of tiers) if (points >= threshold) tier++;
  return tier;
}

function cleanGuildName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, GUILD_NAME_MAX);
  return cleaned || null;
}

function publicEvent(row: CampaignRow, phase: Phase, feed: unknown[]) {
  return {
    id: row.id,
    campaignKey: row.campaign_key,
    eventKey: row.event_key,
    kind: row.kind,
    phase,
    chapter: 1,
    opensAt: row.opens_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    finalisesAt: new Date(row.ends_at.getTime() + row.grace_minutes * 60_000).toISOString(),
    target: Number(row.target),
    total: Number(row.total),
    contributors: row.contributors,
    tiers: row.tiers,
    cap: row.chapter_cap,
    rewards: { tierTitles: row.rewards?.tierTitles ?? [], sealTitle: row.rewards?.sealTitle ?? null },
    allowDemo: row.allow_demo,
    result: row.result,
    feed,
  };
}

async function feedFor(campaignId: number) {
  const { rows } = await getPool().query(
    `SELECT guild_name, text_key, points, created_at FROM realm_feed
      WHERE campaign_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [campaignId, FEED_ROWS],
  );
  return rows.map((r) => ({ guild: r.guild_name, kind: r.text_key, points: r.points, at: (r.created_at as Date).toISOString() }));
}

let currentCache: { at: number; body: unknown } | null = null;

async function currentBody(config: AppConfig) {
  if (!realmOn(config)) return { realmEnabled: false, event: null, serverNow: new Date().toISOString() };
  const picked = await pickCurrent();
  return {
    realmEnabled: true,
    event: picked ? publicEvent(picked.row, picked.phase, await feedFor(picked.row.id)) : null,
    serverNow: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------ events --- */

function parseEvent(input: Partial<RealmEventConfig>): { ok: true; event: Required<Omit<RealmEventConfig, 'teaserFrom' | 'resultsUntil'>> & { teaserFrom: Date | null; resultsUntil: Date | null; opens: Date; ends: Date } } | { ok: false; error: string } {
  const eventKey = typeof input.eventKey === 'string' ? input.eventKey.trim() : '';
  const campaignKey = typeof input.campaignKey === 'string' ? input.campaignKey.trim() : '';
  if (!/^[a-z0-9][a-z0-9_-]{1,48}$/.test(eventKey)) return { ok: false, error: 'eventKey must be 2-49 chars of a-z, 0-9, - or _.' };
  if (!campaignKey) return { ok: false, error: 'campaignKey is required.' };
  const opens = new Date(String(input.opensAt));
  const ends = new Date(String(input.endsAt));
  if (Number.isNaN(opens.getTime()) || Number.isNaN(ends.getTime())) return { ok: false, error: 'opensAt / endsAt must be ISO dates.' };
  if (ends <= opens) return { ok: false, error: 'endsAt must be after opensAt.' };
  const target = Math.floor(Number(input.target));
  const cap = Math.floor(Number(input.cap));
  if (!(target > 0) || !(cap > 0)) return { ok: false, error: 'target and cap must be positive numbers.' };
  const tiers = Array.isArray(input.tiers) ? input.tiers.map((t) => Math.floor(Number(t))) : [];
  if (tiers.length === 0 || tiers.some((t, i) => !(t > 0) || (i > 0 && t <= tiers[i - 1]))) {
    return { ok: false, error: 'tiers must be a rising list of positive numbers.' };
  }
  const optDate = (value: unknown): Date | null => {
    if (value === undefined || value === null || value === '') return null;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const rewards: RealmRewards = {
    tierTitles: Array.isArray(input.rewards?.tierTitles)
      ? input.rewards!.tierTitles!.slice(0, tiers.length).map((t) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, 40) : null))
      : [],
    sealTitle: typeof input.rewards?.sealTitle === 'string' && input.rewards.sealTitle.trim() ? input.rewards.sealTitle.trim().slice(0, 40) : null,
  };
  return {
    ok: true,
    event: {
      eventKey, campaignKey, opensAt: opens.toISOString(), endsAt: ends.toISOString(), opens, ends, target, cap, tiers, rewards,
      allowDemo: input.allowDemo !== false,
      graceMinutes: Math.max(0, Math.min(24 * 60, Math.floor(Number(input.graceMinutes ?? 60)) || 0)),
      teaserFrom: optDate(input.teaserFrom),
      resultsUntil: optDate(input.resultsUntil),
    },
  };
}

/**
 * Creates the event, or updates it while it is still only scheduled. An
 * event that has opened is never touched from here (use the target /
 * close-now routes), so a stale realm.config.json can't rewrite history.
 */
async function upsertEvent(client: PoolClient, input: Partial<RealmEventConfig>): Promise<{ ok: boolean; error?: string; id?: number; created?: boolean }> {
  const parsed = parseEvent(input);
  if (!parsed.ok) return parsed;
  const e = parsed.event;
  const existing = await client.query<{ id: number; status: string }>(
    'SELECT id, status FROM realm_campaigns WHERE event_key = $1 FOR UPDATE', [e.eventKey],
  );
  if (existing.rows[0] && existing.rows[0].status !== 'scheduled') {
    return { ok: false, error: `Event '${e.eventKey}' has already opened -- it can no longer be rescheduled.`, id: existing.rows[0].id };
  }
  const values = [e.campaignKey, e.opens, e.ends, e.target, e.cap, JSON.stringify(e.tiers), JSON.stringify(e.rewards), e.allowDemo, e.graceMinutes, e.teaserFrom, e.resultsUntil];
  let id: number;
  if (existing.rows[0]) {
    id = existing.rows[0].id;
    await client.query(
      `UPDATE realm_campaigns SET campaign_key = $1, opens_at = $2, ends_at = $3, target = $4, chapter_cap = $5,
              tiers = $6, rewards = $7, allow_demo = $8, grace_minutes = $9, teaser_from = $10, results_until = $11
        WHERE id = $12`, [...values, id],
    );
    await client.query('UPDATE realm_chapters SET opens_at = $1, closes_at = $2, cap = $3 WHERE campaign_id = $4 AND chapter = 1', [e.opens, e.ends, e.cap, id]);
  } else {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO realm_campaigns (campaign_key, kind, event_key, opens_at, ends_at, chapter_count, target, chapter_cap,
                                    tiers, rewards, allow_demo, grace_minutes, teaser_from, results_until, status)
       VALUES ($1, 'event', $12, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled') RETURNING id`,
      [...values, e.eventKey],
    );
    id = inserted.rows[0].id;
    await client.query(
      `INSERT INTO realm_chapters (campaign_id, chapter, opens_at, closes_at, cap, status) VALUES ($1, 1, $2, $3, $4, 'pending')`,
      [id, e.opens, e.ends, e.cap],
    );
  }
  return { ok: true, id, created: !existing.rows[0] };
}

/** Makes sure every event listed in realm.config.json exists. */
async function ensureConfigEvents(log: FastifyBaseLogger) {
  let events: RealmEventConfig[] = [];
  try { events = readRealmConfig().events ?? []; } catch (err) { log.error({ err }, 'realm.config.json unreadable'); return; }
  for (const event of events) {
    try {
      const result = await withTransaction((client) => upsertEvent(client, event));
      if (result.ok && result.created) log.info({ eventKey: event.eventKey }, 'realm event scheduled from realm.config.json');
      else if (!result.ok && result.id === undefined) log.warn({ eventKey: event.eventKey, error: result.error }, 'realm event in realm.config.json is invalid');
    } catch (err) {
      log.error({ err, eventKey: event.eventKey }, 'could not schedule realm event');
    }
  }
}

/* --------------------------------------------------------------- job --- */

/**
 * Moves events along: scheduled -> open at opens_at, open -> closed at
 * ends_at, closed -> finalised once the grace period is over. All three in
 * one transaction, in that order, so an event whose whole window passed
 * while the server was down is caught up in a single tick. Idempotent:
 * each step only matches rows still in the earlier state.
 */
export async function tickRealm(log: FastifyBaseLogger): Promise<void> {
  await ensureConfigEvents(log);
  const changed = await withTransaction(async (client) => {
    let touched = 0;
    const opened = await client.query<{ id: number }>(
      `UPDATE realm_campaigns SET status = 'open'
        WHERE kind = 'event' AND status = 'scheduled' AND opens_at <= now() RETURNING id`,
    );
    for (const { id } of opened.rows) {
      await client.query(`UPDATE realm_chapters SET status = 'open' WHERE campaign_id = $1 AND chapter = 1`, [id]);
      log.info({ campaignId: id }, 'realm event opened');
      touched++;
    }
    const closed = await client.query<{ id: number }>(
      `UPDATE realm_campaigns SET status = 'closed', closed_at = now()
        WHERE kind = 'event' AND status = 'open' AND ends_at <= now() RETURNING id`,
    );
    for (const { id } of closed.rows) { log.info({ campaignId: id }, 'realm event closed -- accepting late reports for the grace period'); touched++; }

    const due = await client.query<CampaignRow>(
      `SELECT * FROM realm_campaigns
        WHERE kind = 'event' AND status = 'closed' AND finalised_at IS NULL
          AND ends_at + make_interval(mins => grace_minutes) <= now()
        FOR UPDATE SKIP LOCKED`,
    );
    for (const row of due.rows) {
      const total = Number(row.total);
      const target = Number(row.target);
      const finalPct = target > 0 ? Math.round((total / target) * 1000) / 1000 : 0;
      const sealed = finalPct >= 1;
      const result = { sealed, finalPct, milestonesReached: MILESTONES.filter((m) => finalPct * 100 >= m).length };
      const sealTitle = sealed ? row.rewards?.sealTitle : null;
      if (sealTitle) {
        // Everyone at the first tier or better. Adds the title only where
        // it isn't already listed.
        await client.query(
          `INSERT INTO realm_rewards (campaign_id, steam_id, rewards)
           SELECT campaign_id, steam_id, jsonb_build_object('titles', jsonb_build_array($2::text))
             FROM realm_contributions WHERE campaign_id = $1 AND chapter = 1 AND points >= $3
           ON CONFLICT (campaign_id, steam_id) DO UPDATE
             SET rewards = jsonb_set(realm_rewards.rewards, '{titles}', (realm_rewards.rewards->'titles') || to_jsonb($2::text))
           WHERE NOT (realm_rewards.rewards->'titles') ? $2`,
          [row.id, sealTitle, row.tiers[0]],
        );
      }
      await client.query(`UPDATE realm_campaigns SET finalised_at = now(), result = $2 WHERE id = $1`, [row.id, JSON.stringify(result)]);
      await client.query(`UPDATE realm_chapters SET status = 'closed', held = $2 WHERE campaign_id = $1 AND chapter = 1`, [row.id, sealed]);
      await client.query(
        `DELETE FROM realm_feed WHERE campaign_id = $1 AND id NOT IN
           (SELECT id FROM realm_feed WHERE campaign_id = $1 ORDER BY id DESC LIMIT $2)`,
        [row.id, FEED_KEEP],
      );
      log.info({ campaignId: row.id, ...result }, 'realm event finalised');
      touched++;
    }
    return touched;
  });
  if (changed > 0) currentCache = null;
}

/* ------------------------------------------------------------ routes --- */

interface ContributeBody { campaignId?: number; chapter?: number; points?: number; guildName?: string; batchKey?: string }

export function registerRealmRoutes(app: FastifyInstance, config: AppConfig) {
  const anySession = requireAnySession(config);

  app.get('/realm/current', async () => {
    const now = Date.now();
    if (!currentCache || now - currentCache.at > CURRENT_CACHE_MS) {
      currentCache = { at: now, body: await currentBody(config) };
    }
    return currentCache.body;
  });

  app.get('/realm/mine', { preHandler: anySession }, async (request) => {
    const session = (request as FastifyRequest & { session: Session }).session;
    if (!realmOn(config)) return { campaignId: null };
    const picked = await pickCurrent();
    if (!picked) return { campaignId: null };
    const [mine, rewards] = await Promise.all([
      getPool().query<{ points: number }>(
        'SELECT points FROM realm_contributions WHERE campaign_id = $1 AND chapter = 1 AND steam_id = $2', [picked.row.id, session.steamId]),
      getPool().query<{ rewards: { titles?: string[] } }>(
        'SELECT rewards FROM realm_rewards WHERE campaign_id = $1 AND steam_id = $2', [picked.row.id, session.steamId]),
    ]);
    const points = mine.rows[0]?.points ?? 0;
    return {
      campaignId: picked.row.id,
      points,
      tier: tierOf(points, picked.row.tiers),
      titles: rewards.rows[0]?.rewards?.titles ?? [],
    };
  });

  app.post<{ Body: ContributeBody }>('/realm/contribute', { preHandler: anySession }, async (request, reply) => {
    const session = (request as FastifyRequest & { session: Session }).session;
    if (!realmOn(config)) { reply.code(409); return { ok: false, error: 'realm_off' }; }
    const body = request.body ?? {};
    const campaignId = Math.floor(Number(body.campaignId));
    const sent = Math.floor(Number(body.points));
    const batchKey = typeof body.batchKey === 'string' ? body.batchKey : '';
    if (!Number.isFinite(campaignId) || !Number.isFinite(sent) || sent < 0 || !UUID_RE.test(batchKey)) {
      reply.code(400);
      return { ok: false, error: 'Bad request: campaignId, points and a UUID batchKey are required.' };
    }
    const guildName = cleanGuildName(body.guildName);
    let fileCfg: RealmConfig | null = null;
    try { fileCfg = readRealmConfig(); } catch { /* defaults below */ }

    const outcome = await withTransaction(async (client) => {
      // The campaign row is the lock: totals, milestone lines and the
      // per-player cap all read-then-write under it.
      const found = await client.query<CampaignRow>('SELECT * FROM realm_campaigns WHERE id = $1 FOR UPDATE', [campaignId]);
      const row = found.rows[0];
      // Open, or closed but still inside the grace period (late reports of
      // Ward earned before the close). Anything else: the client drops it.
      const accepting = row && row.kind === 'event' && (row.status === 'open' || (row.status === 'closed' && !row.finalised_at));
      if (!row || !accepting || Math.floor(Number(body.chapter ?? 1)) !== 1) return { status: 409 as const, error: 'not_open' };
      if (session.app === 'demo' && !row.allow_demo) return { status: 403 as const, error: 'Not available in the demo.' };

      const mine = await client.query<{ points: number; last_batch_key: string | null }>(
        'SELECT points, last_batch_key FROM realm_contributions WHERE campaign_id = $1 AND chapter = 1 AND steam_id = $2',
        [campaignId, session.steamId],
      );
      const before = mine.rows[0]?.points ?? 0;
      const replay = mine.rows[0]?.last_batch_key === batchKey;
      const maxBatch = Math.max(1, Math.floor(Number(fileCfg?.maxBatch ?? row.chapter_cap)) || row.chapter_cap);
      const after = replay ? before : Math.min(row.chapter_cap, before + Math.min(sent, maxBatch));
      const applied = after - before;
      const totalBefore = Number(row.total);
      const totalAfter = totalBefore + applied;

      if (!replay) {
        await client.query(
          `INSERT INTO realm_contributions (campaign_id, chapter, steam_id, app, guild_name, points, last_batch_key)
           VALUES ($1, 1, $2, $3, $4, $5, $6)
           ON CONFLICT (campaign_id, chapter, steam_id) DO UPDATE
             SET points = $5, last_batch_key = $6, app = $3, guild_name = COALESCE($4, realm_contributions.guild_name), updated_at = now()`,
          [campaignId, session.steamId, session.app, guildName, after, batchKey],
        );
        if (applied > 0) {
          await client.query(
            'UPDATE realm_campaigns SET total = total + $2, contributors = contributors + $3 WHERE id = $1',
            [campaignId, applied, before === 0 ? 1 : 0],
          );
        }
        if (applied > 0) {
          // One feed line per player per few minutes: later Ward folds into it.
          const feedMinutes = Math.max(0, Number(fileCfg?.feedMinutes ?? 5) || 0);
          const folded = await client.query(
            `UPDATE realm_feed SET points = points + $3, created_at = now(), guild_name = COALESCE($4, guild_name)
              WHERE id = (SELECT id FROM realm_feed
                           WHERE campaign_id = $1 AND steam_id = $2 AND text_key = 'quests'
                             AND created_at > now() - make_interval(mins => $5::int)
                           ORDER BY id DESC LIMIT 1)`,
            [campaignId, session.steamId, applied, guildName, Math.ceil(feedMinutes)],
          );
          if (folded.rowCount === 0) {
            await client.query(
              `INSERT INTO realm_feed (campaign_id, steam_id, guild_name, text_key, points) VALUES ($1, $2, $3, 'quests', $4)`,
              [campaignId, session.steamId, guildName, applied],
            );
          }
          const target = Number(row.target);
          for (const milestone of MILESTONES) {
            const line = (target * milestone) / 100;
            if (totalBefore < line && totalAfter >= line) {
              await client.query(
                `INSERT INTO realm_feed (campaign_id, guild_name, text_key, points) VALUES ($1, $2, 'milestone', $3)`,
                [campaignId, guildName, milestone],
              );
            }
          }
        }
      }

      // Titles for every tier reached so far (also heals a row that missed one).
      const tier = tierOf(after, row.tiers);
      const earned = (row.rewards?.tierTitles ?? []).slice(0, tier).filter((t): t is string => !!t);
      let titles: string[] = [];
      if (earned.length > 0) {
        const saved = await client.query<{ rewards: { titles?: string[] } }>(
          `INSERT INTO realm_rewards (campaign_id, steam_id, rewards) VALUES ($1, $2, jsonb_build_object('titles', $3::jsonb))
           ON CONFLICT (campaign_id, steam_id) DO UPDATE
             SET rewards = jsonb_set(realm_rewards.rewards, '{titles}',
               (SELECT COALESCE(jsonb_agg(DISTINCT t), '[]'::jsonb)
                  FROM jsonb_array_elements_text((realm_rewards.rewards->'titles') || $3::jsonb) AS t))
           RETURNING rewards`,
          [campaignId, session.steamId, JSON.stringify(earned)],
        );
        titles = saved.rows[0]?.rewards?.titles ?? earned;
      } else {
        const saved = await client.query<{ rewards: { titles?: string[] } }>(
          'SELECT rewards FROM realm_rewards WHERE campaign_id = $1 AND steam_id = $2', [campaignId, session.steamId]);
        titles = saved.rows[0]?.rewards?.titles ?? [];
      }
      const contributors = row.contributors + (!replay && before === 0 && applied > 0 ? 1 : 0);
      return { status: 200 as const, applied, points: after, tier, cap: row.chapter_cap, total: totalAfter, target: Number(row.target), contributors, titles };
    });

    if (outcome.status !== 200) {
      reply.code(outcome.status);
      return { ok: false, error: outcome.error };
    }
    // Fresh numbers go out with the reply; the cached /realm/current catches up within 15s.
    currentCache = null;
    return { ok: true, applied: outcome.applied, points: outcome.points, tier: outcome.tier, cap: outcome.cap, total: outcome.total, target: outcome.target, contributors: outcome.contributors, titles: outcome.titles };
  });

  if (!config.adminToken) return;
  const admin = requireAdmin(config);

  /** Every event, newest first, with how the Ward is spread across players. */
  app.get('/admin/realm', { preHandler: admin }, async () => {
    const pool = getPool();
    const { rows } = await pool.query<CampaignRow>(`SELECT * FROM realm_campaigns ORDER BY opens_at DESC LIMIT 20`);
    const now = Date.now();
    const events = [];
    for (const row of rows) {
      const top = await pool.query(
        `SELECT guild_name, app, points FROM realm_contributions WHERE campaign_id = $1 ORDER BY points DESC, updated_at LIMIT 10`, [row.id]);
      const spread = await pool.query<{ players: number; at_cap: number; demo: number; avg: string | null }>(
        `SELECT count(*)::int AS players, count(*) FILTER (WHERE points >= $2)::int AS at_cap,
                count(*) FILTER (WHERE app = 'demo')::int AS demo, round(avg(points), 1) AS avg
           FROM realm_contributions WHERE campaign_id = $1`, [row.id, row.chapter_cap]);
      events.push({
        ...publicEvent(row, phaseOf(row, now) ?? 'closed', []),
        status: row.status,
        visible: phaseOf(row, now) !== null,
        graceMinutes: row.grace_minutes,
        teaserFrom: row.teaser_from?.toISOString() ?? null,
        resultsUntil: row.results_until?.toISOString() ?? null,
        finalisedAt: row.finalised_at?.toISOString() ?? null,
        players: spread.rows[0]?.players ?? 0,
        atCap: spread.rows[0]?.at_cap ?? 0,
        demoPlayers: spread.rows[0]?.demo ?? 0,
        avgPoints: Number(spread.rows[0]?.avg ?? 0),
        top: top.rows.map((r) => ({ guild: r.guild_name, app: r.app, points: r.points })),
      });
    }
    return { realmEnabled: realmOn(config), envEnabled: config.realmEnabled, serverNow: new Date().toISOString(), events };
  });

  app.post<{ Body: Partial<RealmEventConfig> }>('/admin/realm/schedule', { preHandler: admin }, async (request, reply) => {
    const result = await withTransaction((client) => upsertEvent(client, request.body ?? {}));
    if (!result.ok) reply.code(400);
    currentCache = null;
    return result;
  });

  app.post<{ Body: { id?: number; target?: number } }>('/admin/realm/target', { preHandler: admin }, async (request, reply) => {
    const target = Math.floor(Number(request.body?.target));
    if (!(target > 0)) { reply.code(400); return { ok: false, error: 'target must be a positive number.' }; }
    const { rowCount } = await getPool().query(
      `UPDATE realm_campaigns SET target = $2 WHERE id = $1 AND kind = 'event' AND finalised_at IS NULL`, [request.body?.id, target]);
    currentCache = null;
    if (!rowCount) { reply.code(404); return { ok: false, error: 'No unfinalised event with that id.' }; }
    return { ok: true };
  });

  /** Ends an open event now (the grace period still applies), or opens a
   *  scheduled one early with `{ open: true }`. */
  app.post<{ Body: { id?: number; open?: boolean; skipGrace?: boolean } }>('/admin/realm/close-now', { preHandler: admin }, async (request, reply) => {
    const id = request.body?.id;
    const sql = request.body?.open
      ? `UPDATE realm_campaigns SET opens_at = now() WHERE id = $1 AND kind = 'event' AND status = 'scheduled'`
      : `UPDATE realm_campaigns SET ends_at = now()${request.body?.skipGrace ? ', grace_minutes = 0' : ''}
          WHERE id = $1 AND kind = 'event' AND (status = 'open' OR (status = 'closed' AND finalised_at IS NULL))`;
    const { rowCount } = await getPool().query(sql, [id]);
    if (!rowCount) { reply.code(404); return { ok: false, error: 'No event in the right state with that id.' }; }
    await tickRealm(app.log);
    currentCache = null;
    return { ok: true };
  });

  /** Test helper: adds Ward straight to the bar, as "The Crown's Reserve". */
  app.post<{ Body: { id?: number; points?: number } }>('/admin/realm/add', { preHandler: admin }, async (request, reply) => {
    const points = Math.floor(Number(request.body?.points));
    if (!Number.isFinite(points) || points === 0) { reply.code(400); return { ok: false, error: 'points must be a non-zero number.' }; }
    const { rowCount } = await getPool().query(
      `UPDATE realm_campaigns SET total = GREATEST(0, total + $2) WHERE id = $1 AND kind = 'event' AND finalised_at IS NULL`, [request.body?.id, points]);
    if (!rowCount) { reply.code(404); return { ok: false, error: 'No unfinalised event with that id.' }; }
    if (points > 0) {
      await getPool().query(`INSERT INTO realm_feed (campaign_id, guild_name, text_key, points) VALUES ($1, $2, 'reserve', $3)`, [request.body?.id, "The Crown's Reserve", points]);
    }
    currentCache = null;
    return { ok: true };
  });

  /** Removes an event and everything recorded for it (test runs). */
  app.post<{ Body: { id?: number } }>('/admin/realm/delete', { preHandler: admin }, async (request, reply) => {
    const { rowCount } = await getPool().query(`DELETE FROM realm_campaigns WHERE id = $1 AND kind = 'event'`, [request.body?.id]);
    currentCache = null;
    if (!rowCount) { reply.code(404); return { ok: false, error: 'No event with that id.' }; }
    return { ok: true };
  });
}

/** Starts the 60s job. Routes are registered separately so /realm/current
 *  can answer "off" even when the job never runs. */
export function startRealm(log: FastifyBaseLogger, config: AppConfig): boolean {
  // Patch 0479 -- only the .env flag decides whether the job runs at all.
  // realm.config.json's "enabled" is re-checked on every tick, so the
  // DevTool's on/off switch works without a restart (before, a server
  // started with it off never ran the job, even after it was turned on).
  if (!config.realmEnabled) return false;
  const tick = () => {
    if (!realmOn(config)) return;
    tickRealm(log).catch((err) => log.error({ err }, 'realm tick failed'));
  };
  setInterval(tick, 60_000).unref();
  tick();
  return true;
}
