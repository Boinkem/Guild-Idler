/**
 * Guild Idler Dev Tool — frontend.
 *
 * Vanilla JS, no build step, no framework. Each content type is described by
 * the schema the server sends (tools/devtool/server.mjs), and this file
 * generates a table + an add/edit form from that schema generically — adding a
 * new field to a content type in the server schema is enough for it to show up
 * here with no frontend changes needed.
 */

const state = { schema: null, kind: null, rows: [], dirty: false, icons: null, equipmentList: null };

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

  const patchBtn = document.createElement('button');
  patchBtn.textContent = 'Patches';
  patchBtn.dataset.kind = '__patches__';
  patchBtn.onclick = () => selectPatchesTab();
  tabsEl.appendChild(patchBtn);

  kinds.forEach((kind) => {
    const btn = document.createElement('button');
    btn.textContent = state.schema[kind].label;
    btn.onclick = () => selectTab(kind);
    btn.dataset.kind = kind;
    tabsEl.appendChild(btn);
  });

  selectPatchesTab();
}

function markActiveTab(kind) {
  [...tabsEl.children].forEach((b) => b.classList.toggle('active', b.dataset.kind === kind));
}

async function selectTab(kind) {
  state.kind = kind;
  markActiveTab(kind);
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
  // The icon field (if this content type has one) gets its own leading
  // thumbnail column in the table, separate from the generic text-cell
  // columns above -- a name/rarity/etc. row is still useful as plain text,
  // but "which icon is this assigned" is only really legible as an image.
  const iconKey = Object.entries(schema.fields).find(([, spec]) => spec.picker === 'icon')?.[0];

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <button class="primary" id="addBtn">+ Add ${schema.label.replace(/s$/, '')}</button>
    <span class="spacer"></span>
    <span style="color: var(--muted); font-size: 11px;">${state.rows.length} entries</span>
  `;

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${iconKey ? '<th></th>' : ''}${cols.map((c) => `<th>${c}</th>`).join('')}<th></th></tr>`;
  const tbody = document.createElement('tbody');

  if (state.rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${cols.length + (iconKey ? 2 : 1)}"><div class="empty">Nothing here yet.</div></td>`;
    tbody.appendChild(tr);
  }

  state.rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    const iconCell = iconKey
      ? `<td class="icon-cell">${row[iconKey]
          ? `<img src="/item-icons/${escapeHtml(row[iconKey])}" alt="" class="table-icon" />`
          : '<span class="table-icon-empty">—</span>'}</td>`
      : '';
    const cells = cols.map((c) => {
      let val = row[c];
      if (Array.isArray(val)) val = val.slice(0, 2).join(', ') + (val.length > 2 ? '…' : '');
      const cls = c === 'rarity' ? `rarity-${val}` : c === 'kind' ? `kind-${val}` : '';
      return `<td class="${cls}">${val ?? ''}</td>`;
    }).join('');
    tr.innerHTML = `${iconCell}${cells}<td class="actions">
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
  if (spec.picker === 'icon') {
    // Just a container here -- renderIconField fills it in and wires the
    // buttons once it's actually attached to the DOM (see wireIconFields,
    // called alongside wireListInput in openEditor).
    return `<div class="icon-field" id="${id}" data-value="${escapeHtml(value ?? '')}"></div>`;
  }
  if (spec.picker === 'lootTable') {
    // Same deferred-render approach as the icon field -- a bare container,
    // filled in by renderLootField once it's attached to the DOM (needs an
    // async fetch of the equipment list first, which can't happen while
    // building this HTML string synchronously).
    return `<div class="loot-field" id="${id}" data-value='${escapeHtml(JSON.stringify(value ?? []))}'></div>`;
  }
  if (spec.type === 'string' && (key === 'description' || key === 'flavour')) {
    return `<textarea id="${id}">${escapeHtml(value ?? '')}</textarea>`;
  }
  if (spec.type === 'string') {
    const placeholder = spec.slug ? 'lowercase_with_underscores' : spec.steamId ? 'UPPER_SNAKE_CASE' : '';
    return `<input type="text" id="${id}" value="${escapeHtml(value ?? '')}" ${placeholder ? `placeholder="${placeholder}"` : ''} />`;
  }
  if (spec.type === 'number') {
    return `<input type="number" id="${id}" value="${value ?? 0}" step="any" />`;
  }
  if (spec.type === 'enum') {
    const opts = spec.options.map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('');
    return `<select id="${id}">${opts}</select>`;
  }
  if (spec.type === 'string[]' || spec.type === 'modKeyList' || spec.type === 'statKeyList') {
    return listInput(id, value ?? []);
  }
  if (spec.type === 'boolean') {
    return `<input type="checkbox" id="${id}" ${value ? 'checked' : ''} style="width:18px;height:18px;" />`;
  }
  if (spec.type === 'mods') return kvGrid(id, MOD_KEYS, value ?? {}, 'number');
  if (spec.type === 'stats') return kvGrid(id, STAT_KEYS, value ?? {}, 'number');
  if (spec.type === 'materials') return kvGrid(id, MATERIAL_KEYS, value ?? {}, 'number');
  if (spec.type === 'effect') return kvGrid(id, EFFECT_KEYS, value ?? {}, 'mixed');
  if (spec.type === 'eventEffects') return kvGrid(id, EVENT_EFFECT_KEYS, value ?? {}, 'mixed');
  return `<input type="text" id="${id}" value="${escapeHtml(JSON.stringify(value))}" />`;
}

const MOD_KEYS = ['success', 'gold', 'xp', 'loot', 'injuryResist', 'speed', 'durability'];
const STAT_KEYS = ['strength', 'endurance', 'luck', 'wisdom'];
const MATERIAL_KEYS = ['ore', 'timber', 'herbs', 'fish'];
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

/* ----------------------------------------------------------- icon field --- */
// Fetched once and cached for the session -- the icon set only changes when
// someone drops new files into public/item-icons/, which means restarting
// this tool anyway, so there's no need to re-fetch on every editor open.
async function ensureIcons() {
  if (state.icons) return state.icons;
  state.icons = await api('/api/icons');
  return state.icons;
}

/** Fills in and wires an .icon-field container. Called on initial render and
 *  again every time the value changes (pick or clear), rather than trying to
 *  patch the DOM in place -- the control is small enough that a full re-render
 *  is simpler and hard to get subtly wrong. */
function renderIconField(field) {
  const value = field.dataset.value || '';
  field.innerHTML = `
    <div class="icon-preview">
      ${value ? `<img src="/item-icons/${escapeHtml(value)}" alt="" />` : '<span class="icon-preview-empty">?</span>'}
    </div>
    <div class="icon-field-controls">
      <span class="icon-field-name">${value ? escapeHtml(value) : 'No icon assigned'}</span>
      <button type="button" data-choose-icon>${value ? 'Change' : 'Choose icon'}</button>
      ${value ? '<button type="button" class="remove" data-clear-icon>Clear</button>' : ''}
    </div>`;

  field.querySelector('[data-choose-icon]').onclick = async () => {
    const folders = await ensureIcons();
    openIconPicker(folders, field.dataset.value, (chosen) => {
      field.dataset.value = chosen;
      renderIconField(field);
    });
  };
  const clearBtn = field.querySelector('[data-clear-icon]');
  if (clearBtn) clearBtn.onclick = () => { field.dataset.value = ''; renderIconField(field); };
}

function wireIconFields(container) {
  container.querySelectorAll('.icon-field').forEach((field) => renderIconField(field));
}

/* ---------------------------------------------------------- loot field --- */
// Fetched once and cached for the session, same reasoning as ensureIcons --
// the equipment list only changes via this same devtool, which means a
// restart anyway.
async function ensureEquipmentList() {
  if (state.equipmentList) return state.equipmentList;
  const { data } = await api('/api/data/equipment');
  state.equipmentList = data;
  return state.equipmentList;
}

/**
 * Renders a loot-table field: a list of {item, chance%, remove} rows plus
 * an "+ Add item" button that opens a full equipment picker. Entries are
 * kept as {defId, chance} objects in a closure while editing (much easier
 * to manipulate than re-parsing "defId@chance" strings on every change),
 * and only flattened back to that on-disk string format when readField()
 * asks for the final value via the getter stashed on the element.
 */
async function renderLootField(field) {
  const equipment = await ensureEquipmentList();
  const byId = Object.fromEntries(equipment.map((e) => [e.id, e]));
  const nameOf = (defId) => byId[defId]?.name ?? defId;
  const rarityOf = (defId) => byId[defId]?.rarity ?? '';

  let entries;
  try {
    entries = JSON.parse(field.dataset.value || '[]').map((raw) => {
      const at = String(raw).lastIndexOf('@');
      return at > 0
        ? { defId: raw.slice(0, at), chance: Number(raw.slice(at + 1)) || 0 }
        : { defId: raw, chance: 5 };
    });
  } catch {
    entries = [];
  }

  const draw = () => {
    field.innerHTML = `
      <div class="loot-rows">
        ${entries.length === 0 ? '<p class="tiny muted">No loot yet.</p>' : entries.map((e, i) => `
          <div class="loot-row">
            <span class="loot-row-name rarity-${rarityOf(e.defId)}">${escapeHtml(nameOf(e.defId))}</span>
            <input type="number" step="any" class="loot-row-chance" data-i="${i}" value="${e.chance}" />
            <span class="tiny muted">%</span>
            <button type="button" class="remove" data-remove-loot="${i}">&minus;</button>
          </div>
        `).join('')}
      </div>
      <button type="button" data-add-loot>+ Add item</button>
    `;
    field.querySelectorAll('[data-remove-loot]').forEach((btn) => {
      btn.onclick = () => { entries.splice(+btn.dataset.removeLoot, 1); draw(); };
    });
    field.querySelectorAll('.loot-row-chance').forEach((input) => {
      input.oninput = () => { entries[+input.dataset.i].chance = parseFloat(input.value) || 0; };
    });
    field.querySelector('[data-add-loot]').onclick = () => {
      openLootPicker(equipment, (defId) => { entries.push({ defId, chance: 5 }); draw(); });
    };
  };

  draw();
  // readField() reads this rather than re-deriving from the DOM, since
  // chance values live in the `entries` closure, not (only) in the inputs.
  field.__getLootValue = () => entries.map((e) => `${e.defId}@${e.chance}`);
}

function wireLootFields(container) {
  container.querySelectorAll('.loot-field').forEach((field) => { void renderLootField(field); });
}

/** Equipment picker for loot tables -- grouped by slot, shows an icon
 *  thumbnail when the item has one assigned, same visual language as the
 *  icon picker itself. */
function openLootPicker(equipment, onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay icon-picker-overlay';
  const panel = document.createElement('div');
  panel.className = 'editor icon-picker';

  const bySlot = {};
  for (const item of equipment) {
    (bySlot[item.slot] ??= []).push(item);
  }

  const sectionsHtml = Object.entries(bySlot).map(([slot, items]) => `
    <div class="icon-picker-section">
      <div class="icon-picker-folder">${escapeHtml(slot)} (${items.length})</div>
      <div class="loot-picker-grid">
        ${items.map((item) => `
          <button type="button" class="loot-picker-item" data-def-id="${escapeHtml(item.id)}" title="${escapeHtml(item.id)}">
            ${item.icon
              ? `<img src="/item-icons/${escapeHtml(item.icon)}" alt="" class="loot-picker-thumb" />`
              : '<span class="loot-picker-thumb loot-picker-thumb-empty">?</span>'}
            <span class="tiny rarity-${item.rarity}">${escapeHtml(item.name)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');

  panel.innerHTML = `
    <h2>Add loot</h2>
    <div class="icon-picker-body">${sectionsHtml}</div>
    <div class="editor-actions">
      <button id="lootPickerCancel">Cancel</button>
    </div>`;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelectorAll('[data-def-id]').forEach((btn) => {
    btn.onclick = () => {
      onPick(btn.dataset.defId);
      overlay.remove();
    };
  });
  panel.querySelector('#lootPickerCancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

/** A grid of every available icon, grouped by folder, in an overlay of its
 *  own on top of the editor overlay. Picking one or cancelling both just
 *  remove this overlay -- the underlying editor is untouched either way. */
function openIconPicker(folders, currentValue, onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay icon-picker-overlay';
  const panel = document.createElement('div');
  panel.className = 'editor icon-picker';

  const sectionsHtml = folders.length === 0
    ? '<p class="tiny muted">No icons found in public/item-icons/. Drop image files into its subfolders (weapons, armor, shields, potions, crafting, food, accessories, misc) and reopen this picker.</p>'
    : folders.map((f) => `
        <div class="icon-picker-section">
          <div class="icon-picker-folder">${escapeHtml(f.name)} (${f.files.length})</div>
          <div class="icon-picker-grid">
            ${f.files.map((file) => {
              const rel = `${f.name}/${file}`;
              const selected = rel === currentValue;
              return `<button type="button" class="icon-picker-item ${selected ? 'selected' : ''}" data-icon="${escapeHtml(rel)}" title="${escapeHtml(rel)}">
                <img src="/item-icons/${escapeHtml(rel)}" alt="" loading="lazy" />
              </button>`;
            }).join('')}
          </div>
        </div>`).join('');

  panel.innerHTML = `
    <h2>Choose an icon</h2>
    <div class="icon-picker-body">${sectionsHtml}</div>
    <div class="editor-actions">
      <button id="iconPickerCancel">Cancel</button>
    </div>`;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelectorAll('[data-icon]').forEach((btn) => {
    btn.onclick = () => {
      onPick(btn.dataset.icon);
      overlay.remove();
    };
  });
  panel.querySelector('#iconPickerCancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
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
  if (spec.picker === 'icon') return el.dataset.value || '';
  if (spec.picker === 'lootTable') return el.__getLootValue ? el.__getLootValue() : [];
  if (spec.type === 'string' || spec.type === 'enum') return el.value;
  if (spec.type === 'number') return parseFloat(el.value) || 0;
  if (spec.type === 'boolean') return el.checked;
  if (spec.type === 'string[]' || spec.type === 'modKeyList' || spec.type === 'statKeyList') {
    return [...el.querySelectorAll('[data-list-item]')].map((i) => i.value.trim()).filter(Boolean);
  }
  if (['mods', 'stats', 'materials', 'effect', 'eventEffects'].includes(spec.type)) {
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
      ${spec.type === 'modKeyList' ? `<div class="hint">One per line, must be one of: ${MOD_KEYS.join(', ')}</div>` : ''}
      ${spec.type === 'statKeyList' ? `<div class="hint">One per line, must be one of: ${STAT_KEYS.join(', ')}</div>` : ''}
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
  wireIconFields(editor);
  wireLootFields(editor);

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
    if (spec.steamId && entry[key] && !/^[A-Z][A-Z0-9_]*$/.test(entry[key])) {
      errors.push(`"${key}" should be UPPER_SNAKE_CASE`);
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

/* -------------------------------- patches -------------------------------- */

const patchState = { files: [], gitStatus: null, selected: null, checked: false, applied: false };

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function formatWhen(mtime) {
  const diffMs = Date.now() - mtime;
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

async function selectPatchesTab() {
  state.kind = '__patches__';
  markActiveTab('__patches__');
  setStatus('Loading…');
  try {
    const [{ files, status }, versionInfo, devStatus] = await Promise.all([
      api('/api/patches/list'),
      api('/api/version'),
      api('/api/dev/status'),
    ]);
    patchState.files = files;
    patchState.gitStatus = status;
    patchState.version = versionInfo.version;
    patchState.tags = versionInfo.tags;
    patchState.devRunning = devStatus.running;
    setStatus('');
    renderPatches();
  } catch (err) {
    setStatus(err.message, 'err');
  }
}

async function refreshDevStatus() {
  const s = await api('/api/dev/status');
  patchState.devRunning = s.running;
  renderPatches();
}

async function refreshGitStatus() {
  patchState.gitStatus = await api('/api/patches/status');
  renderPatches();
}

function resultBlock(result, label) {
  if (!result) return '';
  const cls = result.ok ? 'good' : 'bad';
  const text = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return `
    <div class="patch-result ${cls}">
      <div class="patch-result-label">${label}: ${result.ok ? 'succeeded' : 'failed' + (result.timedOut ? ' (timed out)' : '')}</div>
      ${text ? `<pre>${escapeHtml(text)}</pre>` : '<div class="tiny muted">No output.</div>'}
    </div>`;
}

function renderPatches() {
  const gs = patchState.gitStatus;
  const sel = patchState.selected;

  appEl.innerHTML = `
    <h2 style="font-family: inherit; font-size: 14px; margin: 0 0 4px;">Apply a Patch</h2>
    <p style="color: var(--muted); font-size: 11px; margin: 0 0 16px;">
      Runs the same git/npm commands you'd type by hand, one confirmed step at a time. Nothing here
      auto-chains — each button only does the one thing it says.
    </p>

    <div class="patch-git-status">
      <div class="spread">
        <span><b>Dev server:</b> ${patchState.devRunning ? '🟢 running' : '⚪ stopped'}</span>
        <span class="row" style="gap:6px;">
          <button id="devStartBtn" ${patchState.devRunning ? 'disabled' : ''}>Start (npm run dev)</button>
          <button id="devStopBtn" ${!patchState.devRunning ? 'disabled' : ''}>Stop</button>
        </span>
      </div>
      <p class="tiny muted" style="margin: 6px 0 0;">
        Starts Vite + Electron in the background and returns immediately — this page doesn't wait for
        it to exit, since it isn't supposed to. Stop kills the whole process tree, not just the shell.
      </p>
    </div>

    <div class="patch-git-status ${gs?.clean ? 'clean' : 'dirty'}" style="margin-top:10px;">
      <div class="spread">
        <span><b>Branch:</b> ${escapeHtml(gs?.branch || '?')} &nbsp; <b>Last commit:</b> ${escapeHtml(gs?.lastCommit || '?')}</span>
        <button id="refreshStatusBtn">Refresh</button>
      </div>
      <div class="tiny muted" style="margin-top:4px;">
        ${gs?.upstream
          ? `Pushes to <b>${escapeHtml(gs.upstream)}</b>.`
          : `No upstream tracking branch configured — Push will fail until one is set (e.g. <code>git push -u origin ${escapeHtml(gs?.branch || 'main')}</code> once from a terminal).`}
      </div>
      ${gs?.clean
        ? '<div class="tiny" style="margin-top:6px;">Working tree is clean.</div>'
        : `<div class="tiny" style="margin-top:6px; color: var(--brass);">Uncommitted changes present — review before applying a patch on top:</div>
           <pre style="margin-top:4px;">${escapeHtml(gs?.statusText || '')}</pre>`}
    </div>

    <div class="section-heading" style="margin-top:18px;">1. Select a patch</div>
    ${patchState.files.length === 0
      ? '<p class="tiny muted">No .patch files found in the project root or a patches/ folder. Drop one in and hit Refresh.</p>'
      : `<div class="patch-list">${patchState.files.map((f) => `
          <label class="patch-item ${sel === f.name ? 'selected' : ''}">
            <input type="radio" name="patchfile" value="${escapeHtml(f.name)}" ${sel === f.name ? 'checked' : ''} />
            <div>
              <div class="patch-name">${escapeHtml(f.name)}</div>
              <div class="tiny muted">${f.dir === '.' ? 'project root' : f.dir} · ${formatBytes(f.size)} · ${formatWhen(f.mtime)}</div>
            </div>
          </label>
        `).join('')}</div>`}

    <div class="section-heading">2. Check</div>
    <p class="tiny muted">Dry run — confirms the patch would apply cleanly without changing anything yet.</p>
    <button id="checkBtn" class="primary" ${!sel ? 'disabled' : ''}>Check patch</button>
    <div id="checkResult"></div>

    <div class="section-heading">3. Apply</div>
    <p class="tiny muted">Actually modifies files on disk. Only enabled after a successful check.</p>
    <button id="applyBtn" class="primary" ${!patchState.checked ? 'disabled' : ''}>Apply patch</button>
    <div id="applyResult"></div>

    <div class="section-heading">4. Commit</div>
    <p class="tiny muted">Stages everything and commits. Only enabled after a successful apply.</p>
    <div class="row" style="gap: 8px; margin-bottom: 8px;">
      <input type="text" id="commitMsg" placeholder="Commit message"
        value="${sel ? escapeHtml('Apply ' + sel.replace(/\.patch$/, '').replace(/^\d+-/, '').replace(/-/g, ' ')) : ''}"
        style="flex:1; background: var(--panel2); border: 1px solid var(--panel3); color: var(--text); padding: 7px 8px;" />
      <button id="commitBtn" class="primary" ${gs?.clean !== false ? 'disabled' : ''}>Commit</button>
    </div>
    <div id="commitResult"></div>

    <div class="section-heading">5. Push</div>
    <p class="tiny muted">
      Sends committed history to the upstream branch shown above. Doesn't require having just
      applied a patch this session — it pushes whatever's already committed, so it's also the
      right button after committing something outside this flow entirely.
    </p>
    <button id="pushBtn">Push</button>
    <div id="pushResult"></div>

    <div class="section-heading">6. Build</div>
    <p class="tiny muted">Runs <code>npm run build</code> to confirm nothing is broken. Can take a minute.</p>
    <button id="buildBtn">Run build</button>
    <div id="buildResult"></div>

    <div class="section-heading">7. Package into an installer</div>
    <p class="tiny muted">
      Runs <code>npm run package</code> — produces installers/unpacked builds in <code>release/</code>.
      This is what you'd upload to Steam or hand to playtesters. Can take several minutes the first time.
    </p>
    <button id="packageBtn">Run package</button>
    <div id="packageResult"></div>

    <div class="section-heading">8. Tag a release version</div>
    <p class="tiny muted">
      Current version: <b>${escapeHtml(patchState.version || '?')}</b>.
      ${patchState.tags?.length ? `Recent tags: ${patchState.tags.map(escapeHtml).join(', ')}.` : 'No tags yet.'}
      This is separate from the <code>000N-name.patch</code> filenames, which just identify a batch of
      changes between us — a version bump is the real release number, and creates a git commit + tag
      (e.g. <code>v${escapeHtml(patchState.version || '0.0.0')}</code> → next patch bump) in one step.
      Do this once you're happy with everything above, not per-patch.
    </p>
    <div class="row" style="gap:6px;">
      <button id="bumpPatchBtn">Bump patch (bug fixes)</button>
      <button id="bumpMinorBtn">Bump minor (new features)</button>
      <button id="bumpMajorBtn">Bump major (breaking/big)</button>
    </div>
    <div id="versionResult"></div>
  `;

  document.getElementById('refreshStatusBtn').onclick = () => refreshGitStatus();

  const devStartBtn = document.getElementById('devStartBtn');
  devStartBtn.onclick = async () => {
    devStartBtn.disabled = true;
    devStartBtn.textContent = 'Starting…';
    const result = await api('/api/dev/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!result.ok) alert(result.error || 'Could not start the dev server.');
    await refreshDevStatus();
  };

  const devStopBtn = document.getElementById('devStopBtn');
  devStopBtn.onclick = async () => {
    devStopBtn.disabled = true;
    devStopBtn.textContent = 'Stopping…';
    const result = await api('/api/dev/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!result.ok) alert(result.error || 'Could not stop the dev server.');
    await refreshDevStatus();
  };

  appEl.querySelectorAll('input[name="patchfile"]').forEach((input) => {
    input.onchange = () => {
      patchState.selected = input.value;
      patchState.checked = false;
      patchState.applied = false;
      renderPatches();
    };
  });

  const checkBtn = document.getElementById('checkBtn');
  if (checkBtn) checkBtn.onclick = async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';
    const result = await api('/api/patches/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: patchState.selected }),
    });
    patchState.checked = result.ok;
    checkBtn.disabled = false;
    checkBtn.textContent = 'Check patch';
    renderPatches();
    document.getElementById('checkResult').innerHTML = resultBlock(result, 'Check');
  };

  const applyBtn = document.getElementById('applyBtn');
  if (applyBtn) applyBtn.onclick = async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying…';
    const result = await api('/api/patches/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: patchState.selected }),
    });
    patchState.applied = result.ok;
    renderPatches();
    document.getElementById('applyResult').innerHTML = resultBlock(result, 'Apply');
    if (result.ok) refreshGitStatus();
  };

  const commitBtn = document.getElementById('commitBtn');
  if (commitBtn) commitBtn.onclick = async () => {
    const message = document.getElementById('commitMsg').value;
    commitBtn.disabled = true;
    commitBtn.textContent = 'Committing…';
    const result = await api('/api/patches/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    renderPatches();
    document.getElementById('commitResult').innerHTML = resultBlock(result, 'Commit');
    if (result.ok) refreshGitStatus();
  };

  const pushBtn = document.getElementById('pushBtn');
  if (pushBtn) pushBtn.onclick = async () => {
    const target = patchState.gitStatus?.upstream || 'the upstream branch';
    if (!confirm(`Push commits to ${target}?`)) return;
    pushBtn.disabled = true;
    pushBtn.textContent = 'Pushing…';
    const result = await api('/api/patches/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    pushBtn.disabled = false;
    pushBtn.textContent = 'Push';
    document.getElementById('pushResult').innerHTML = resultBlock(result, 'Push');
    if (result.ok) refreshGitStatus();
  };

  const buildBtn = document.getElementById('buildBtn');
  if (buildBtn) buildBtn.onclick = async () => {
    buildBtn.disabled = true;
    buildBtn.textContent = 'Building… (this can take a minute)';
    const result = await api('/api/patches/build', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    buildBtn.disabled = false;
    buildBtn.textContent = 'Run build';
    document.getElementById('buildResult').innerHTML = resultBlock(result, 'Build');
  };

  const packageBtn = document.getElementById('packageBtn');
  if (packageBtn) packageBtn.onclick = async () => {
    packageBtn.disabled = true;
    packageBtn.textContent = 'Packaging… (this can take several minutes)';
    const result = await api('/api/patches/package', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    packageBtn.disabled = false;
    packageBtn.textContent = 'Run package';
    document.getElementById('packageResult').innerHTML = resultBlock(result, 'Package');
  };

  ['bumpPatchBtn', 'bumpMinorBtn', 'bumpMajorBtn'].forEach((id, i) => {
    const level = ['patch', 'minor', 'major'][i];
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.onclick = async () => {
      if (!confirm(`Bump the ${level} version? This commits and creates a git tag.`)) return;
      btn.disabled = true;
      const result = await api('/api/version/bump', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level }),
      });
      btn.disabled = false;
      document.getElementById('versionResult').innerHTML = resultBlock(result, `Version bump (${level})`);
      if (result.ok) {
        const versionInfo = await api('/api/version');
        patchState.version = versionInfo.version;
        patchState.tags = versionInfo.tags;
        renderPatches();
        document.getElementById('versionResult').innerHTML = resultBlock(result, `Version bump (${level})`);
      }
    };
  });
}
