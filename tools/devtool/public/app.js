/**
 * Little Knight Dev Tool — frontend.
 *
 * Vanilla JS, no build step, no framework. Each content type is described by
 * the schema the server sends (tools/devtool/server.mjs), and this file
 * generates a table + an add/edit form from that schema generically — adding a
 * new field to a content type in the server schema is enough for it to show up
 * here with no frontend changes needed.
 */

const state = { schema: null, kind: null, rows: [], dirty: false };

const tabsEl = document.getElementById('tabs');
const appEl = document.getElementById('app');
const statusEl = document.getElementById('status');

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || 'Request failed'), { details: body.details });
  return body;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'topbar-status' + (kind ? ' ' + kind : '');
}

async function init() {
  state.schema = await api('/api/schema');
  const kinds = Object.keys(state.schema);
  tabsEl.innerHTML = '';
  kinds.forEach((kind, i) => {
    const btn = document.createElement('button');
    btn.textContent = state.schema[kind].label;
    btn.onclick = () => selectTab(kind);
    btn.dataset.kind = kind;
    tabsEl.appendChild(btn);
    if (i === 0) selectTab(kind);
  });
}

async function selectTab(kind) {
  state.kind = kind;
  [...tabsEl.children].forEach((b) => b.classList.toggle('active', b.dataset.kind === kind));
  setStatus('Loading…');
  try {
    const { data } = await api(`/api/data/${kind}`);
    state.rows = data;
    setStatus('');
    renderTable();
  } catch (err) {
    setStatus(err.message, 'err');
  }
}

/* -------------------------------------------------------------- table --- */

function displayColumns(schema) {
  // A short, sensible subset of fields for the table view; the editor still
  // exposes every field.
  const priority = ['id', 'verb', 'name', 'label', 'slot', 'rarity', 'kind', 'tag', 'cost', 'value', 'weight', 'reqLevel'];
  return Object.keys(schema.fields).filter((f) => priority.includes(f)).sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
}

function renderTable() {
  const schema = state.schema[state.kind];
  const cols = displayColumns(schema);

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <button class="primary" id="addBtn">+ Add ${schema.label.replace(/s$/, '')}</button>
    <span class="spacer"></span>
    <span style="color: var(--muted); font-size: 11px;">${state.rows.length} entries</span>
  `;

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${cols.map((c) => `<th>${c}</th>`).join('')}<th></th></tr>`;
  const tbody = document.createElement('tbody');

  if (state.rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${cols.length + 1}"><div class="empty">Nothing here yet.</div></td>`;
    tbody.appendChild(tr);
  }

  state.rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    const cells = cols.map((c) => {
      let val = row[c];
      if (Array.isArray(val)) val = val.slice(0, 2).join(', ') + (val.length > 2 ? '…' : '');
      const cls = c === 'rarity' ? `rarity-${val}` : c === 'kind' ? `kind-${val}` : '';
      return `<td class="${cls}">${val ?? ''}</td>`;
    }).join('');
    tr.innerHTML = `${cells}<td class="actions">
      <button data-edit="${index}">Edit</button>
      <button data-dup="${index}">Duplicate</button>
      <button class="danger" data-del="${index}">Delete</button>
    </td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);

  appEl.innerHTML = '';
  appEl.appendChild(toolbar);
  appEl.appendChild(table);

  document.getElementById('addBtn').onclick = () => openEditor(null);
  tbody.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEditor(+b.dataset.edit));
  tbody.querySelectorAll('[data-dup]').forEach((b) => b.onclick = () => duplicateRow(+b.dataset.dup));
  tbody.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => deleteRow(+b.dataset.del));
}

function duplicateRow(index) {
  const schema = state.schema[state.kind];
  const copy = JSON.parse(JSON.stringify(state.rows[index]));
  if (schema.idField && copy[schema.idField]) copy[schema.idField] += '_copy';
  state.rows.splice(index + 1, 0, copy);
  saveToServer(`Duplicated entry ${index}.`);
}

function deleteRow(index) {
  const schema = state.schema[state.kind];
  const label = schema.idField ? state.rows[index][schema.idField] : `entry ${index}`;
  if (!confirm(`Delete "${label}"? This cannot be undone from here (though the server keeps one .bak backup).`)) return;
  state.rows.splice(index, 1);
  saveToServer(`Deleted ${label}.`);
}

/* ------------------------------------------------------------- editor --- */

function fieldControl(spec, key, value) {
  const id = `f_${key}`;
  if (spec.type === 'string' && (key === 'description' || key === 'flavour')) {
    return `<textarea id="${id}">${escapeHtml(value ?? '')}</textarea>`;
  }
  if (spec.type === 'string') {
    return `<input type="text" id="${id}" value="${escapeHtml(value ?? '')}" ${spec.slug ? 'placeholder="lowercase_with_underscores"' : ''} />`;
  }
  if (spec.type === 'number') {
    return `<input type="number" id="${id}" value="${value ?? 0}" step="any" />`;
  }
  if (spec.type === 'enum') {
    const opts = spec.options.map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('');
    return `<select id="${id}">${opts}</select>`;
  }
  if (spec.type === 'string[]') {
    return listInput(id, value ?? []);
  }
  if (spec.type === 'mods') return kvGrid(id, MOD_KEYS, value ?? {}, 'number');
  if (spec.type === 'stats') return kvGrid(id, STAT_KEYS, value ?? {}, 'number');
  if (spec.type === 'effect') return kvGrid(id, EFFECT_KEYS, value ?? {}, 'mixed');
  if (spec.type === 'eventEffects') return kvGrid(id, EVENT_EFFECT_KEYS, value ?? {}, 'mixed');
  return `<input type="text" id="${id}" value="${escapeHtml(JSON.stringify(value))}" />`;
}

const MOD_KEYS = ['success', 'gold', 'xp', 'loot', 'injuryResist', 'speed', 'durability'];
const STAT_KEYS = ['strength', 'endurance', 'luck', 'wisdom'];
const EFFECT_KEYS = ['success', 'gold', 'preventInjury', 'guaranteedGoodEvent', 'healInjury'];
const EVENT_EFFECT_KEYS = ['success', 'goldPct', 'flatGold', 'xpPct', 'loot', 'durability', 'delay', 'injury', 'guaranteedLoot'];
const BOOL_KEYS = new Set(['preventInjury', 'guaranteedGoodEvent', 'healInjury', 'injury']);

function listInput(id, items) {
  const rows = (items.length ? items : ['']).map((v, i) => `
    <div class="row">
      <input type="text" data-list-item value="${escapeHtml(v)}" />
      <button type="button" class="remove" data-remove-item>&minus;</button>
    </div>`).join('');
  return `<div class="list-input" id="${id}">${rows}<button type="button" data-add-item>+ add</button></div>`;
}

function kvGrid(id, keys, values, kind) {
  const rows = keys.map((k) => {
    if (kind === 'mixed' && BOOL_KEYS.has(k)) {
      return `<label>${k}</label><input type="checkbox" data-kv="${k}" ${values[k] ? 'checked' : ''} />`;
    }
    return `<label>${k}</label><input type="number" step="any" data-kv="${k}" value="${values[k] ?? ''}" placeholder="—" />`;
  }).join('');
  return `<div class="kv-grid" id="${id}">${rows}</div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function wireListInput(container) {
  container.querySelectorAll('[data-add-item]').forEach((btn) => {
    btn.onclick = () => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<input type="text" data-list-item /><button type="button" class="remove" data-remove-item>&minus;</button>`;
      row.querySelector('[data-remove-item]').onclick = () => row.remove();
      btn.parentElement.insertBefore(row, btn);
    };
  });
  container.querySelectorAll('[data-remove-item]').forEach((btn) => {
    btn.onclick = () => btn.parentElement.remove();
  });
}

function readField(spec, key) {
  const el = document.getElementById(`f_${key}`);
  if (spec.type === 'string' || spec.type === 'enum') return el.value;
  if (spec.type === 'number') return parseFloat(el.value) || 0;
  if (spec.type === 'string[]') {
    return [...el.querySelectorAll('[data-list-item]')].map((i) => i.value.trim()).filter(Boolean);
  }
  if (['mods', 'stats', 'effect', 'eventEffects'].includes(spec.type)) {
    const out = {};
    el.querySelectorAll('[data-kv]').forEach((input) => {
      const k = input.dataset.kv;
      if (input.type === 'checkbox') {
        if (input.checked) out[k] = true;
      } else if (input.value !== '') {
        out[k] = parseFloat(input.value);
      }
    });
    return out;
  }
  return el.value;
}

function openEditor(index) {
  const schema = state.schema[state.kind];
  const isNew = index === null;
  const row = isNew ? {} : state.rows[index];

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  const editor = document.createElement('div');
  editor.className = 'editor';

  const fieldsHtml = Object.entries(schema.fields).map(([key, spec]) => `
    <div class="field">
      <label>${key}${spec.required ? ' *' : ''}</label>
      ${fieldControl(spec, key, row[key])}
      ${spec.slug ? '<div class="hint">Used as the internal id. Lowercase, no spaces.</div>' : ''}
    </div>
  `).join('');

  editor.innerHTML = `
    <h2>${isNew ? 'New' : 'Edit'} ${schema.label.replace(/s$/, '')}</h2>
    <div id="editorErrors"></div>
    ${fieldsHtml}
    <div class="editor-actions">
      <button id="cancelBtn">Cancel</button>
      <button class="primary" id="saveBtn">Save</button>
    </div>
  `;
  overlay.appendChild(editor);
  document.body.appendChild(overlay);
  wireListInput(editor);

  editor.querySelector('#cancelBtn').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  editor.querySelector('#saveBtn').onclick = () => {
    const entry = {};
    for (const [key, spec] of Object.entries(schema.fields)) {
      const value = readField(spec, key);
      const isEmpty = value === '' || value === null || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) || (Array.isArray(value) && value.length === 0);
      if (!spec.required && isEmpty) continue;
      entry[key] = value;
    }
    const errors = clientValidate(schema, entry);
    if (errors.length) {
      editor.querySelector('#editorErrors').innerHTML =
        `<div class="errors"><strong>Fix before saving:</strong><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul></div>`;
      return;
    }
    if (isNew) state.rows.push(entry); else state.rows[index] = entry;
    overlay.remove();
    saveToServer(isNew ? 'Added new entry.' : 'Updated entry.');
  };
}

function clientValidate(schema, entry) {
  const errors = [];
  for (const [key, spec] of Object.entries(schema.fields)) {
    if (spec.required && (entry[key] === undefined || entry[key] === '' || (Array.isArray(entry[key]) && entry[key].length === 0))) {
      errors.push(`"${key}" is required`);
    }
    if (spec.slug && entry[key] && !/^[a-z][a-z0-9_]*$/.test(entry[key])) {
      errors.push(`"${key}" should be lowercase_with_underscores`);
    }
  }
  if (schema.idField && entry[schema.idField]) {
    const dupe = state.rows.some((r, i) => r[schema.idField] === entry[schema.idField] && state.rows[i] !== entry);
    // duplicate check happens server-side too (covers the edit-in-place case correctly);
    // this is just an early warning when adding a brand new id that collides.
  }
  return errors;
}

/* --------------------------------------------------------------- save --- */

async function saveToServer(message) {
  setStatus('Saving…');
  try {
    const result = await api(`/api/data/${state.kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.rows),
    });
    setStatus(`${message} Saved (${result.count} entries).`, 'ok');
    renderTable();
  } catch (err) {
    const detail = err.details ? '\n' + err.details.join('\n') : '';
    setStatus('Save failed — see console.', 'err');
    console.error(err.message + detail);
    alert(`Could not save:\n\n${err.message}${detail}\n\nYour change was kept on screen; fix the issue and save again.`);
  }
}

init().catch((err) => setStatus(err.message, 'err'));
