import { FastifyInstance, FastifyRequest } from 'fastify';
import { appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './db.js';
import { AppConfig } from './config.js';
import { optionalSession } from './listings.js';
import { requireAdmin } from './admin.js';

/**
 * In-game bug reports, patch 0477.
 *
 * POST /bugs takes a short report from the game's "Report a bug" form. No
 * sign-in: the demo has to be able to report, and so does a player whose
 * Steam session is the thing that's broken. If a valid session token does
 * come along, the SteamID is recorded with the report.
 *
 * Each report goes to two places: the bug_reports table (the DevTool's
 * list, with a status and a "fixed in patch" note), and one JSON line
 * appended to server/bug-reports.jsonl -- a plain file in the repo folder
 * (gitignored) that can be read without the database or the DevTool.
 *
 * Abuse limits, since it is open to anyone: per-address rate limit, hard
 * caps on every field, a daily ceiling, and an idempotency key so the
 * client's offline queue can retry without duplicating.
 */

const FILE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'bug-reports.jsonl');
const MESSAGE_MAX = 4000;
const PER_ADDRESS = 5;            // reports...
const PER_ADDRESS_MS = 10 * 60_000; // ...per ten minutes
const PER_DAY = 2000;
const CATEGORIES = new Set(['bug', 'balance', 'ui', 'crash', 'suggestion', 'other']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const recent = new Map<string, number[]>();
let dayStart = 0;
let dayCount = 0;

function addressOf(request: FastifyRequest): string {
  // Behind the Cloudflare Tunnel every request arrives from localhost;
  // the real address is in this header.
  const cf = request.headers['cf-connecting-ip'];
  return (Array.isArray(cf) ? cf[0] : cf) || request.ip || 'unknown';
}

function allow(address: string, now: number): boolean {
  if (now - dayStart > 24 * 60 * 60_000) { dayStart = now; dayCount = 0; }
  if (dayCount >= PER_DAY) return false;
  const times = (recent.get(address) ?? []).filter((t) => now - t < PER_ADDRESS_MS);
  if (times.length >= PER_ADDRESS) { recent.set(address, times); return false; }
  times.push(now);
  recent.set(address, times);
  if (recent.size > 5000) for (const [key, list] of recent) if (list.every((t) => now - t >= PER_ADDRESS_MS)) recent.delete(key);
  dayCount++;
  return true;
}

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
  return cleaned || null;
};

/** Small, flat, string/number/boolean-only copy of the client's context. */
function cleanContext(value: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
    const k = key.slice(0, 32);
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
  }
  return out;
}

interface BugBody { reportKey?: string; message?: string; category?: string; contact?: string; build?: string; demo?: boolean; context?: unknown }

export function registerBugRoutes(app: FastifyInstance, config: AppConfig) {
  app.post<{ Body: BugBody }>('/bugs', async (request, reply) => {
    const body = request.body ?? {};
    const message = text(body.message, MESSAGE_MAX);
    if (!message || message.length < 5) { reply.code(400); return { ok: false, error: 'Please describe what happened.' }; }
    const reportKey = typeof body.reportKey === 'string' && UUID_RE.test(body.reportKey) ? body.reportKey : null;
    if (reportKey) {
      const seen = await getPool().query('SELECT id FROM bug_reports WHERE report_key = $1', [reportKey]);
      if (seen.rows[0]) return { ok: true, id: Number(seen.rows[0].id), duplicate: true };
    }
    if (!allow(addressOf(request), Date.now())) {
      reply.code(429);
      return { ok: false, error: 'Too many reports from here just now -- try again in a few minutes.' };
    }
    const session = optionalSession(request, config);
    const report = {
      steamId: session?.steamId ?? null,
      app: body.demo === true || session?.app === 'demo' ? 'demo' : 'full',
      build: text(body.build, 24),
      category: typeof body.category === 'string' && CATEGORIES.has(body.category) ? body.category : 'bug',
      message,
      contact: text(body.contact, 64),
      context: cleanContext(body.context),
    };
    const inserted = await getPool().query<{ id: string; created_at: Date }>(
      `INSERT INTO bug_reports (report_key, steam_id, app, build, category, message, contact, context)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (report_key) DO NOTHING RETURNING id, created_at`,
      [reportKey, report.steamId, report.app, report.build, report.category, report.message, report.contact, JSON.stringify(report.context)],
    );
    const row = inserted.rows[0];
    if (!row) return { ok: true, duplicate: true }; // lost a race with its own retry
    try {
      await appendFile(FILE_PATH, `${JSON.stringify({ id: Number(row.id), at: row.created_at.toISOString(), ...report })}\n`, 'utf8');
    } catch (err) {
      app.log.error({ err }, 'could not append to bug-reports.jsonl (the report is still in the database)');
    }
    return { ok: true, id: Number(row.id) };
  });

  if (!config.adminToken) return;
  const admin = requireAdmin(config);

  app.get<{ Querystring: { status?: string; limit?: string } }>('/admin/bugs', { preHandler: admin }, async (request) => {
    const status = request.query.status;
    const limit = Math.max(1, Math.min(500, Number(request.query.limit) || 200));
    const filtered = status && status !== 'all';
    const { rows } = await getPool().query(
      `SELECT id, created_at, steam_id, app, build, category, message, contact, context, status, fixed_patch, note
         FROM bug_reports ${filtered ? 'WHERE status = $2' : ''} ORDER BY id DESC LIMIT $1`,
      filtered ? [limit, status] : [limit],
    );
    const counts = await getPool().query<{ status: string; n: number }>('SELECT status, count(*)::int AS n FROM bug_reports GROUP BY status');
    return {
      counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
      reports: rows.map((r) => ({
        id: Number(r.id), at: (r.created_at as Date).toISOString(), steamId: r.steam_id, app: r.app, build: r.build,
        category: r.category, message: r.message, contact: r.contact, context: r.context,
        status: r.status, fixedPatch: r.fixed_patch, note: r.note,
      })),
    };
  });

  app.post<{ Params: { id: string }; Body: { status?: string; fixedPatch?: string; note?: string } }>(
    '/admin/bugs/:id', { preHandler: admin }, async (request, reply) => {
      const status = request.body?.status;
      if (status !== undefined && !['new', 'seen', 'fixed', 'wontfix'].includes(status)) {
        reply.code(400);
        return { ok: false, error: 'status must be new, seen, fixed or wontfix.' };
      }
      const { rowCount } = await getPool().query(
        `UPDATE bug_reports SET status = COALESCE($2, status),
                fixed_patch = CASE WHEN $3::text IS NULL THEN fixed_patch ELSE NULLIF($3, '') END,
                note = CASE WHEN $4::text IS NULL THEN note ELSE NULLIF($4, '') END
          WHERE id = $1`,
        [request.params.id, status ?? null, text(request.body?.fixedPatch, 24) ?? (request.body?.fixedPatch === '' ? '' : null),
          text(request.body?.note, 500) ?? (request.body?.note === '' ? '' : null)],
      );
      if (!rowCount) { reply.code(404); return { ok: false, error: 'No report with that id.' }; }
      return { ok: true };
    });
}
