#!/usr/bin/env node
/**
 * Little Knight Dev Tool — standalone content editor.
 *
 * A tiny local web server (no dependencies, no build step) that serves a plain
 * HTML/JS page for editing quest templates, equipment, consumables, and events.
 * It reads and writes the same JSON files the game itself loads at build time,
 * so a save here + `npm run dev` restart is all it takes to see the change.
 *
 * This is intentionally separate from the game's own dev server — it has
 * nothing to do with Electron or Vite, and can be run while the game is open
 * or closed.
 *
 * Usage:
 *   node tools/devtool/server.mjs
 *   (or)  npm run devtool
 *
 * Then open http://localhost:5175 in a browser.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'src', 'game', 'data', 'json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 5175;

/* --------------------------------------------------------------- schema --- */
// Required fields per content type. This is the real safety net: TypeScript's
// `as Foo[]` cast on the JSON import does NOT validate structure at compile
// time (confirmed — deleting a required field from the JSON still passes
// `tsc`), so this server is the only thing standing between a bad edit and a
// broken build. Every write is checked against these before it touches disk.

const SCHEMAS = {
  'quest-templates': {
    file: 'quest-templates.json',
    label: 'Quest Templates',
    idField: null,
    fields: {
      verb: { type: 'string', required: true },
      tag: { type: 'enum', required: true, options: ['combat', 'escort', 'explore', 'arcane', 'stealth', 'defense'] },
      subjects: { type: 'string[]', required: true },
      flavour: { type: 'string[]', required: true },
      minDifficulty: {
        type: 'enum', required: false,
        options: ['easy', 'normal', 'hard', 'epic', 'legendary'],
      },
    },
  },
  'equipment': {
    file: 'equipment.json',
    label: 'Equipment',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      slot: { type: 'enum', required: true, options: ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'amulet'] },
      rarity: { type: 'enum', required: true, options: ['common', 'uncommon', 'rare', 'epic', 'legendary'] },
      reqLevel: { type: 'number', required: true },
      maxDurability: { type: 'number', required: true },
      value: { type: 'number', required: true },
      mods: { type: 'mods', required: false },
      stats: { type: 'stats', required: false },
      setId: { type: 'string', required: false },
    },
  },
  'consumables': {
    file: 'consumables.json',
    label: 'Consumables',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      cost: { type: 'number', required: true },
      glyph: { type: 'string', required: true },
      effect: { type: 'effect', required: true },
    },
  },
  'events': {
    file: 'events.json',
    label: 'Events',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      kind: { type: 'enum', required: true, options: ['positive', 'neutral', 'negative'] },
      weight: { type: 'number', required: true },
      effects: { type: 'eventEffects', required: false },
      minDifficulty: { type: 'enum', required: false, options: ['easy', 'normal', 'hard', 'epic', 'legendary'] },
    },
  },
  'injuries': {
    file: 'injuries.json',
    label: 'Injuries',
    idField: 'id',
    fields: {
      id: { type: 'string', required: true, slug: true },
      name: { type: 'string', required: true },
      description: { type: 'string', required: true },
      durationHours: { type: 'number', required: true },
      mods: { type: 'mods', required: false },
      treatmentCost: { type: 'number', required: true },
      weight: { type: 'number', required: true },
      minDifficulty: { type: 'enum', required: false, options: ['easy', 'normal', 'hard', 'epic', 'legendary'] },
    },
  },
};

const MOD_KEYS = ['success', 'gold', 'xp', 'loot', 'injuryResist', 'speed', 'durability'];
const STAT_KEYS = ['strength', 'endurance', 'luck', 'wisdom'];
const EFFECT_KEYS = ['success', 'gold', 'preventInjury', 'guaranteedGoodEvent', 'healInjury'];
const EVENT_EFFECT_KEYS = ['success', 'goldPct', 'flatGold', 'xpPct', 'loot', 'durability', 'delay', 'injury', 'guaranteedLoot'];

function validateEntry(schema, entry, index) {
  const errors = [];
  for (const [key, spec] of Object.entries(schema.fields)) {
    const value = entry[key];
    const present = value !== undefined && value !== null && value !== '';
    if (spec.required && !present) {
      errors.push(`entry ${index}: "${key}" is required`);
      continue;
    }
    if (!present) continue;
    switch (spec.type) {
      case 'string':
        if (typeof value !== 'string') errors.push(`entry ${index}: "${key}" must be text`);
        break;
      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`entry ${index}: "${key}" must be a number`);
        break;
      case 'enum':
        if (!spec.options.includes(value)) errors.push(`entry ${index}: "${key}" must be one of ${spec.options.join(', ')}`);
        break;
      case 'string[]':
        if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string')) {
          errors.push(`entry ${index}: "${key}" must be a non-empty list of text`);
        }
        break;
      case 'mods':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else for (const k of Object.keys(value)) if (!MOD_KEYS.includes(k)) errors.push(`entry ${index}: unknown modifier "${k}"`);
        break;
      case 'stats':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else for (const k of Object.keys(value)) if (!STAT_KEYS.includes(k)) errors.push(`entry ${index}: unknown stat "${k}"`);
        break;
      case 'effect':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else for (const k of Object.keys(value)) if (!EFFECT_KEYS.includes(k)) errors.push(`entry ${index}: unknown effect key "${k}"`);
        break;
      case 'eventEffects':
        if (typeof value !== 'object') errors.push(`entry ${index}: "${key}" must be an object`);
        else for (const k of Object.keys(value)) if (!EVENT_EFFECT_KEYS.includes(k)) errors.push(`entry ${index}: unknown effect key "${k}"`);
        break;
    }
    if (spec.slug && typeof value === 'string' && !/^[a-z][a-z0-9_]*$/.test(value)) {
      errors.push(`entry ${index}: "${key}" should be lowercase_with_underscores (got "${value}")`);
    }
  }
  return errors;
}

function validateArray(kind, data) {
  const schema = SCHEMAS[kind];
  if (!Array.isArray(data)) return [`${schema.label}: data must be a list`];
  const errors = [];
  data.forEach((entry, i) => errors.push(...validateEntry(schema, entry, i)));
  if (schema.idField) {
    const ids = data.map((e) => e[schema.idField]).filter(Boolean);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) errors.push(`duplicate id(s): ${[...new Set(dupes)].join(', ')}`);
  }
  return errors;
}

/* ---------------------------------------------------------------- patches --- */
// Applying a patch, committing, and building are the same handful of commands
// every time — this wraps them behind buttons instead of copy-pasted shell
// lines. It only ever runs a small, fixed set of git/npm subcommands, and the
// one piece of user input that reaches a shell (the patch filename) is always
// checked against the real directory listing first, never passed through raw.

const GIT_TIMEOUT_MS = 20_000;
const BUILD_TIMEOUT_MS = 5 * 60_000;
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

async function run(cmd, args, timeout) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: ROOT, timeout, maxBuffer: 20 * 1024 * 1024,
    });
    return { ok: true, code: 0, stdout, stderr };
  } catch (err) {
    // execFile rejects on non-zero exit; that's a normal outcome here (e.g. a
    // failed `git apply --check`), not a tool malfunction, so it's reported
    // back as data rather than re-thrown.
    return {
      ok: false,
      code: typeof err.code === 'number' ? err.code : -1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(err.message ?? err),
      timedOut: !!err.killed && err.signal === 'SIGTERM',
    };
  }
}

async function listPatchFiles() {
  const found = [];
  const dirs = [ROOT, path.join(ROOT, 'patches')];
  for (const dir of dirs) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.patch')) {
        const full = path.join(dir, entry.name);
        const stat = await fs.stat(full);
        found.push({
          name: entry.name,
          dir: path.relative(ROOT, dir) || '.',
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return found;
}

/** Resolves a client-supplied filename to a real, whitelisted patch path. Never trusts the client's path directly. */
async function resolvePatchPath(name) {
  const files = await listPatchFiles();
  const match = files.find((f) => f.name === name);
  if (!match) return null;
  return path.join(ROOT, match.dir, match.name);
}

async function gitStatus() {
  const status = await run('git', ['status', '--porcelain'], GIT_TIMEOUT_MS);
  const log = await run('git', ['log', '-1', '--oneline'], GIT_TIMEOUT_MS);
  const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], GIT_TIMEOUT_MS);
  return {
    clean: status.ok && status.stdout.trim() === '',
    statusText: status.stdout,
    lastCommit: log.stdout.trim(),
    branch: branch.stdout.trim(),
  };
}

/* ------------------------------------------------------------------ http --- */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

async function serveStatic(req, res) {
  let rel = req.url === '/' ? '/index.html' : req.url;
  rel = rel.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => { chunks += c; });
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/schema') {
    return json(res, 200, SCHEMAS);
  }

  if (url.pathname === '/api/patches/list' && req.method === 'GET') {
    const files = await listPatchFiles();
    const status = await gitStatus();
    return json(res, 200, { files, status });
  }

  if (url.pathname === '/api/patches/status' && req.method === 'GET') {
    return json(res, 200, await gitStatus());
  }

  if (url.pathname === '/api/patches/check' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const resolved = await resolvePatchPath(body.name);
    if (!resolved) return json(res, 404, { error: 'Unknown patch file.' });
    const result = await run('git', ['apply', '--check', resolved], GIT_TIMEOUT_MS);
    return json(res, 200, result);
  }

  if (url.pathname === '/api/patches/apply' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const resolved = await resolvePatchPath(body.name);
    if (!resolved) return json(res, 404, { error: 'Unknown patch file.' });
    const result = await run('git', ['apply', resolved], GIT_TIMEOUT_MS);
    return json(res, 200, result);
  }

  if (url.pathname === '/api/patches/commit' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req));
    const message = typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : 'Apply patch';
    const add = await run('git', ['add', '-A'], GIT_TIMEOUT_MS);
    if (!add.ok) return json(res, 200, add);
    // The commit message is passed as a single execFile argument, never
    // through a shell, so it can't be used to inject additional commands
    // regardless of what characters it contains.
    const commit = await run('git', ['commit', '-m', message], GIT_TIMEOUT_MS);
    return json(res, 200, commit);
  }

  if (url.pathname === '/api/patches/build' && req.method === 'POST') {
    const result = await run(NPM_BIN, ['run', 'build'], BUILD_TIMEOUT_MS);
    return json(res, 200, result);
  }

  const match = url.pathname.match(/^\/api\/data\/([\w-]+)$/);
  if (match) {
    const kind = match[1];
    const schema = SCHEMAS[kind];
    if (!schema) return json(res, 404, { error: `Unknown content type "${kind}"` });
    const filePath = path.join(DATA_DIR, schema.file);

    if (req.method === 'GET') {
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        return json(res, 200, { data: JSON.parse(raw) });
      } catch (err) {
        return json(res, 500, { error: `Could not read ${schema.file}: ${err.message}` });
      }
    }

    if (req.method === 'POST') {
      let data;
      try {
        data = JSON.parse(await readBody(req));
      } catch {
        return json(res, 400, { error: 'Malformed JSON in request body.' });
      }
      const errors = validateArray(kind, data);
      if (errors.length) return json(res, 400, { error: 'Validation failed.', details: errors });

      try {
        const previous = await fs.readFile(filePath, 'utf8').catch(() => null);
        if (previous) await fs.writeFile(filePath + '.bak', previous, 'utf8');
        await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      } catch (err) {
        return json(res, 500, { error: `Could not write ${schema.file}: ${err.message}` });
      }
      return json(res, 200, { ok: true, count: data.length });
    }

    res.writeHead(405);
    return res.end();
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Little Knight Dev Tool running at http://localhost:${PORT}`);
  console.log(`Editing JSON files in ${path.relative(ROOT, DATA_DIR)}`);
  console.log('Save in the tool, then restart `npm run dev` to see changes in the game.');
  console.log('Press Ctrl+C to stop.');
});
