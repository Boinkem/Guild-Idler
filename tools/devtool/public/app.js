/**
 * Guild Idler Dev Tool — frontend.
 *
 * Vanilla JS, no build step, no framework. Each content type is described by
 * the schema the server sends (tools/devtool/server.mjs), and this file
 * generates a table + an add/edit form from that schema generically — adding a
 * new field to a content type in the server schema is enough for it to show up
 * here with no frontend changes needed.
 */

const state = {
  schema: null, kind: null, rows: [], dirty: false, icons: null, banners: null, equipmentList: null,
  // Two-level nav state (see server.mjs's GROUP_ORDER / SCHEMAS[kind].group):
  // groupOrder is the fixed display order for the top-level groups, group
  // is whichever one is currently open, and lastSubTab remembers which
  // content type was last open *within* each group so switching groups
  // and back doesn't always dump you back on that group's first tab.
  groupOrder: [], group: null, lastSubTab: {},
  // Tuning's own grouped-view state -- kept here (not local to
  // renderTuningView) so it survives the full re-renders every edit/save
  // triggers: which categories are expanded, the current search text, and
  // whether the user has explicitly asked for the raw table instead (see
  // renderTable's dispatch).
  tuningViewMode: 'grouped', tuningExpanded: new Set(), tuningFilter: '',
  // Generic table sort -- which displayed column, if any, and which
  // direction. Reset whenever the tab changes (selectTab below) so
  // switching content types doesn't carry over a sort that may not even
  // apply to the new schema's columns; persists across re-renders within
  // the same tab (editing/saving a row calls renderTable directly, not
  // selectTab, so the chosen sort survives that).
  sortColumn: null, sortDir: 'asc',
};

const tabsEl = document.getElementById('tabs');
const subtabsEl = document.getElementById('subtabs');
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

/** Measures the topbar's real rendered height and pins #subtabs directly
 *  beneath it -- see the fallback comment on #subtabs in style.css for why
 *  this isn't just a fixed CSS value. Re-run on resize since the button
 *  row can wrap to a second line on a narrow window, changing the
 *  topbar's height. */
function syncSubtabsOffset() {
  subtabsEl.style.top = document.querySelector('.topbar').offsetHeight + 'px';
}
window.addEventListener('resize', syncSubtabsOffset);

/** Which content-type keys belong to a group, in the same order they're
 *  declared in SCHEMAS server-side (object key order) -- grouping changed,
 *  within-group order didn't. */
function kindsInGroup(group) {
  return Object.keys(state.schema).filter((k) => state.schema[k].group === group);
}

async function init() {
  const { schemas, groupOrder } = await api('/api/schema');
  state.schema = schemas;
  state.groupOrder = groupOrder;
  tabsEl.innerHTML = '';

  const patchBtn = document.createElement('button');
  patchBtn.textContent = 'Patches';
  patchBtn.dataset.group = '__patches__';
  patchBtn.onclick = () => selectPatchesTab();
  tabsEl.appendChild(patchBtn);

  groupOrder.forEach((group) => {
    const btn = document.createElement('button');
    btn.textContent = group;
    btn.dataset.group = group;
    btn.onclick = () => selectGroup(group);
    tabsEl.appendChild(btn);
  });

  syncSubtabsOffset();
  selectPatchesTab();
}

function markActiveGroup(group) {
  [...tabsEl.children].forEach((b) => b.classList.toggle('active', b.dataset.group === group));
}

function markActiveSubTab(kind) {
  [...subtabsEl.children].forEach((b) => b.classList.toggle('active', b.dataset.kind === kind));
}

/** Opens a top-level group: renders its sub-tab strip, then opens
 *  whichever content type was last open in that group (state.lastSubTab),
 *  falling back to the group's first content type the first time it's
 *  ever opened this session. */
function selectGroup(group) {
  state.group = group;
  markActiveGroup(group);

  subtabsEl.style.display = 'flex';
  subtabsEl.innerHTML = '';
  const kinds = kindsInGroup(group);
  kinds.forEach((kind) => {
    const btn = document.createElement('button');
    btn.textContent = state.schema[kind].label;
    btn.dataset.kind = kind;
    btn.onclick = () => selectTab(kind);
    subtabsEl.appendChild(btn);
  });
  syncSubtabsOffset();

  const target = state.lastSubTab[group] && kinds.includes(state.lastSubTab[group])
    ? state.lastSubTab[group]
    : kinds[0];
  selectTab(target);
}

async function selectTab(kind) {
  state.kind = kind;
  state.sortColumn = null;
  state.sortDir = 'asc';
  if (state.group) state.lastSubTab[state.group] = kind;
  markActiveSubTab(kind);
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

/** Dispatches to the tuning content type's own dedicated grouped view
 *  (see renderTuningView below) instead of the generic flat table, unless
 *  the user has explicitly asked to see the raw table (the "Table view"
 *  toggle inside renderTuningView itself, or its own reciprocal "Grouped
 *  view" button below) -- the generic table+modal-editor flow is still
 *  fully correct and available for tuning, just no longer the default,
 *  since 286 flat rows with no category grouping was the actual pain
 *  point being fixed here. Every other content type is unaffected. */
function renderTable() {
  if (state.kind === 'tuning' && state.tuningViewMode !== 'table') {
    renderTuningView();
    return;
  }
  renderGenericTable();
}

function renderGenericTable() {
  const schema = state.schema[state.kind];
  const cols = displayColumns(schema);
  // The icon field (if this content type has one) gets its own leading
  // thumbnail column in the table, separate from the generic text-cell
  // columns above -- a name/rarity/etc. row is still useful as plain text,
  // but "which icon is this assigned" is only really legible as an image.
  const iconKey = Object.entries(schema.fields).find(([, spec]) => spec.picker === 'icon')?.[0];
  // Same idea for a bannerImage field (quest-chains/raids) -- shows
  // whatever the row would actually render in-game (the override if set,
  // else the folder/id.jpg convention), not just "has one been assigned."
  const bannerKey = Object.entries(schema.fields).find(([, spec]) => spec.type === 'bannerImage')?.[0];
  const bannerSpec = bannerKey ? schema.fields[bannerKey] : null;
  const extraCols = (iconKey ? 1 : 0) + (bannerKey ? 1 : 0);

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <button class="primary" id="addBtn">+ Add ${schema.label.replace(/s$/, '')}</button>
    ${state.kind === 'tuning' ? '<button id="tuningGroupedViewBtn">Grouped view</button>' : ''}
    <span class="spacer"></span>
    <span style="color: var(--muted); font-size: 11px;">${state.rows.length} entries</span>
  `;

  // Every displayed column is sortable generically (id/name/slot/rarity/
  // etc., whichever this content type's schema actually has) rather than
  // hand-picking id/name/slot specifically for Equipment alone -- that
  // covers the actual ask (Equipment has all three; Consumables has no
  // slot field at all, so it naturally just offers id/name) without a
  // per-content-type special case to maintain. Only clears/resets on tab
  // switch (see selectTab), so it survives edit/save re-renders.
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const sortArrow = (c) => state.sortColumn === c ? (state.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  thead.innerHTML = `<tr>${iconKey ? '<th></th>' : ''}${bannerKey ? '<th></th>' : ''}${cols.map((c) =>
    `<th class="sortable" data-sort="${c}">${c}${sortArrow(c)}</th>`).join('')}<th></th></tr>`;
  const tbody = document.createElement('tbody');

  if (state.rows.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${cols.length + extraCols + 1}"><div class="empty">Nothing here yet.</div></td>`;
    tbody.appendChild(tr);
  }

  // Carries each row's real index in state.rows alongside it, since the
  // Edit/Duplicate/Delete buttons below (and the underlying save-to-disk
  // order) all key off that real index, not display position -- sorting
  // only ever reorders what's rendered, never state.rows itself.
  let displayEntries = state.rows.map((row, index) => ({ row, index }));
  if (state.sortColumn && cols.includes(state.sortColumn)) {
    const col = state.sortColumn;
    const isNumeric = schema.fields[col]?.type === 'number';
    const dir = state.sortDir === 'asc' ? 1 : -1;
    displayEntries = [...displayEntries].sort((a, b) => {
      const av = a.row[col];
      const bv = b.row[col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (isNumeric) return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true }) * dir;
    });
  }

  displayEntries.forEach(({ row, index }) => {
    const tr = document.createElement('tr');
    const iconCell = iconKey
      ? `<td class="icon-cell">${row[iconKey]
          ? `<img src="/item-icons/${escapeHtml(row[iconKey])}" alt="" class="table-icon" />`
          : '<span class="table-icon-empty">—</span>'}</td>`
      : '';
    const bannerCell = bannerKey
      ? (() => {
          const b = row[bannerKey];
          const rel = b?.path || (bannerSpec?.defaultFolder && row.id ? `${bannerSpec.defaultFolder}/${row.id}.jpg` : null);
          return `<td class="icon-cell">${rel
            ? `<span class="table-banner" style="background-image:url('/lore-art/${escapeHtml(rel)}');"></span>`
            : '<span class="table-icon-empty">—</span>'}</td>`;
        })()
      : '';
    const cells = cols.map((c) => {
      let val = row[c];
      if (Array.isArray(val)) val = val.slice(0, 2).join(', ') + (val.length > 2 ? '…' : '');
      const cls = c === 'rarity' ? `rarity-${val}` : c === 'kind' ? `kind-${val}` : '';
      return `<td class="${cls}">${val ?? ''}</td>`;
    }).join('');
    tr.innerHTML = `${iconCell}${bannerCell}${cells}<td class="actions">
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
  const groupedViewBtn = document.getElementById('tuningGroupedViewBtn');
  if (groupedViewBtn) groupedViewBtn.onclick = () => { state.tuningViewMode = 'grouped'; renderTable(); };
  thead.querySelectorAll('th[data-sort]').forEach((th) => {
    th.onclick = () => {
      const col = th.dataset.sort;
      if (state.sortColumn === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = col;
        state.sortDir = 'asc';
      }
      renderTable();
    };
  });
  tbody.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEditor(+b.dataset.edit));
  tbody.querySelectorAll('[data-dup]').forEach((b) => b.onclick = () => duplicateRow(+b.dataset.dup));
  tbody.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => deleteRow(+b.dataset.del));
}

/* ------------------------------------------------------------- tuning --- */
// A dedicated grouped view for the `tuning` content type specifically --
// 286 flat rows with no category grouping and no current-vs-default
// distinction was the actual pain point (flagged as a wanted follow-up
// back when the tuning registry itself was first exposed to the DevTool,
// and never built). Deliberately its own view rather than a generalization
// of the generic table: no other content type has a "value vs. default"
// pair or benefits from category grouping the same way, and folding this
// in as options on the generic renderer would have made that function
// harder to follow for every content type that doesn't need any of it.
//
// Editing model: each value input auto-saves on change (blur/Enter, not
// per-keystroke) via the same saveToServer/full-array POST every other
// edit in this tool already uses -- deliberately NOT a separate "batch up
// local edits, click one big Save button" model, because switching tabs
// (selectTab) does a fresh GET that would silently discard anything not
// yet persisted. Auto-save keeps this view's edits exactly as durable as
// every other edit already is, with no new way to lose changes.

/** Matches a tuning row against the current search box text -- checked
 *  against id/label/category/description together, so searching either
 *  the human label or the underlying dotted id (e.g. "raid_speed.") finds
 *  the same entries. */
function tuningRowMatches(row, filter) {
  if (!filter) return true;
  return [row.id, row.label, row.category, row.description]
    .some((v) => String(v ?? '').toLowerCase().includes(filter));
}

/** Category ids are raw snake_case ("raid_upgrades") -- display-only Title
 *  Case for the section header. CSS text-transform: capitalize alone can't
 *  do this correctly (it only capitalizes the first letter of each
 *  whitespace-separated word, so an underscored id renders as
 *  "Raid_upgrades" rather than "Raid Upgrades"). The raw id is still what
 *  gets used for grouping/matching/data-toggle-cat -- this only touches
 *  what's shown. */
function formatCategoryLabel(cat) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderTuningView() {
  const filter = state.tuningFilter.trim().toLowerCase();
  // Real index into state.rows travels with each entry (not the filtered
  // position) -- every edit/reset/full-edit action needs to mutate and
  // save the actual row, and state.rows is otherwise in whatever order
  // the JSON file itself lists entries in, not grouped by category.
  const filtered = state.rows
    .map((row, realIndex) => ({ row, realIndex }))
    .filter(({ row }) => tuningRowMatches(row, filter));

  const byCategory = new Map();
  filtered.forEach((entry) => {
    const cat = entry.row.category ?? '(uncategorized)';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(entry);
  });
  const categories = [...byCategory.keys()].sort((a, b) => a.localeCompare(b));

  // Searching auto-expands every matching category -- without this, a
  // search that matches something inside a collapsed section would show
  // zero visible results with no indication anything matched at all.
  if (filter) categories.forEach((c) => state.tuningExpanded.add(c));

  const totalChanged = state.rows.filter((r) => r.value !== r.default).length;

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar tuning-toolbar';
  toolbar.innerHTML = `
    <input type="text" id="tuningSearch" placeholder="Search id, label, category, description…"
           value="${escapeHtml(state.tuningFilter)}" class="tuning-search" />
    <button id="tuningExpandAll">Expand all</button>
    <button id="tuningCollapseAll">Collapse all</button>
    <span class="spacer"></span>
    <button id="tuningTableViewBtn">Table view</button>
    <button class="primary" id="addBtn">+ Add Tuning Entry</button>
  `;

  const summary = document.createElement('div');
  summary.className = 'tiny muted tuning-summary';
  summary.textContent = filter
    ? `${filtered.length} of ${state.rows.length} entries match · ${totalChanged} changed from default overall`
    : `${state.rows.length} entries across ${categories.length} categories · ${totalChanged} changed from default`;

  const container = document.createElement('div');
  container.className = 'tuning-groups';

  if (categories.length === 0) {
    container.innerHTML = '<div class="empty">No tuning entries match that search.</div>';
  }

  categories.forEach((cat) => {
    const entries = byCategory.get(cat);
    const changedCount = entries.filter(({ row }) => row.value !== row.default).length;
    const expanded = state.tuningExpanded.has(cat);

    const section = document.createElement('div');
    section.className = 'tuning-section';
    section.innerHTML = `
      <button type="button" class="tuning-section-head" data-toggle-cat="${escapeHtml(cat)}">
        <span class="tuning-section-arrow">${expanded ? '▾' : '▸'}</span>
        <span class="tuning-section-name">${escapeHtml(formatCategoryLabel(cat))}</span>
        <span class="tuning-section-count tiny muted">${entries.length}</span>
        ${changedCount > 0 ? `<span class="tuning-section-changed">${changedCount} changed</span>` : ''}
      </button>
      <div class="tuning-section-body"${expanded ? '' : ' style="display:none;"'}>
        ${entries.map(({ row, realIndex }) => tuningRowHtml(row, realIndex)).join('')}
      </div>
    `;
    container.appendChild(section);
  });

  // Re-rendering fully rebuilds the DOM (same "small enough not to bother
  // patching in place" approach every other field in this tool already
  // takes), which would otherwise steal focus out from under the search
  // box on every keystroke -- restore it explicitly afterward.
  const searchWasFocused = document.activeElement?.id === 'tuningSearch';
  const caret = searchWasFocused ? document.activeElement.selectionStart : null;

  appEl.innerHTML = '';
  appEl.appendChild(toolbar);
  appEl.appendChild(summary);
  appEl.appendChild(container);

  const searchInput = document.getElementById('tuningSearch');
  searchInput.oninput = () => { state.tuningFilter = searchInput.value; renderTuningView(); };
  if (searchWasFocused) {
    searchInput.focus();
    if (caret !== null) searchInput.setSelectionRange(caret, caret);
  }

  document.getElementById('tuningExpandAll').onclick = () => {
    categories.forEach((c) => state.tuningExpanded.add(c));
    renderTuningView();
  };
  document.getElementById('tuningCollapseAll').onclick = () => {
    state.tuningExpanded.clear();
    renderTuningView();
  };
  document.getElementById('tuningTableViewBtn').onclick = () => {
    state.tuningViewMode = 'table';
    renderTable();
  };
  document.getElementById('addBtn').onclick = () => openEditor(null);

  wireTuningRows(container);
}

/** One tuning entry's row: label/id/description on the left, an editable
 *  value input (pre-populated with its own min/max as real HTML
 *  attributes, unlike the generic modal editor's plain number input for
 *  this same field) plus the default and a conditional Reset button on
 *  the right. `changed` styling is purely `value !== default` -- the same
 *  comparison the category header's own "N changed" count uses. */
function tuningRowHtml(row, realIndex) {
  const changed = row.value !== row.default;
  const hasRange = row.min !== undefined || row.max !== undefined;
  return `
    <div class="tuning-row ${changed ? 'tuning-row-changed' : ''}">
      <div class="tuning-row-main">
        <div class="tuning-row-label">${escapeHtml(row.label)}</div>
        <div class="tuning-row-id tiny muted">${escapeHtml(row.id)}</div>
        ${row.description ? `<div class="tuning-row-desc tiny muted">${escapeHtml(row.description)}</div>` : ''}
      </div>
      <div class="tuning-row-controls">
        <label class="tuning-value-wrap">
          <input type="number" step="any" class="tuning-value-input" data-tuning-value="${realIndex}"
                 value="${row.value}"
                 ${row.min !== undefined ? `min="${row.min}"` : ''}
                 ${row.max !== undefined ? `max="${row.max}"` : ''} />
        </label>
        ${hasRange ? `<span class="tiny muted tuning-range">range ${row.min ?? '−∞'}–${row.max ?? '∞'}</span>` : ''}
        <span class="tiny muted tuning-default">default ${row.default}</span>
        ${changed ? `<button type="button" class="tuning-reset" data-tuning-reset="${realIndex}" title="Reset to default">Reset</button>` : ''}
        <button type="button" class="tuning-full-edit" data-edit="${realIndex}" title="Edit id/label/category/min/max/description">Edit</button>
      </div>
    </div>
  `;
}

function wireTuningRows(container) {
  container.querySelectorAll('[data-toggle-cat]').forEach((btn) => {
    btn.onclick = () => {
      const cat = btn.dataset.toggleCat;
      if (state.tuningExpanded.has(cat)) state.tuningExpanded.delete(cat); else state.tuningExpanded.add(cat);
      renderTuningView();
    };
  });

  container.querySelectorAll('[data-tuning-value]').forEach((input) => {
    input.addEventListener('change', () => {
      const idx = +input.dataset.tuningValue;
      const row = state.rows[idx];
      const raw = parseFloat(input.value);
      if (Number.isNaN(raw)) { input.value = row.value; return; } // revert garbage input, don't save it
      // Clamp to the entry's own min/max, same bounds shown right next to
      // the input -- these aren't enforced server-side (min/max are
      // descriptive on every schema, not just this one), so this is the
      // one place a typed value actually gets kept inside them.
      let clamped = raw;
      if (row.min !== undefined) clamped = Math.max(row.min, clamped);
      if (row.max !== undefined) clamped = Math.min(row.max, clamped);
      if (clamped === row.value) { input.value = row.value; return; } // no real change, skip a needless save
      state.rows[idx] = { ...row, value: clamped };
      saveToServer(`Updated ${row.label}.`);
    });
  });

  container.querySelectorAll('[data-tuning-reset]').forEach((btn) => {
    btn.onclick = () => {
      const idx = +btn.dataset.tuningReset;
      const row = state.rows[idx];
      state.rows[idx] = { ...row, value: row.default };
      saveToServer(`Reset ${row.label} to default.`);
    };
  });

  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => openEditor(+btn.dataset.edit);
  });
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
  if (spec.type === 'bannerImage') {
    // Same deferred-render approach as the icon field -- a bare container
    // filled in by renderBannerField once attached to the DOM (it needs the
    // sibling id-field's current value to compute the fallback preview
    // path, and an async fetch of the available banner art). `data-folder`
    // carries the schema's `defaultFolder` hint through to the picker.
    // `data-preview-aspect` carries the schema's `previewAspect` hint (a
    // CSS aspect-ratio value like "8/1") through to the preview box, so it
    // crops to roughly the same shape the real in-game strip does instead
    // of one generic box for every content type -- falls back to the old
    // 420x130-ish "8/2.5" shape if a schema hasn't set one. `data-scale`
    // carries the optional zoom (100 = no zoom, matches plain `cover`).
    return `<div class="banner-field" id="${id}" data-path="${escapeHtml(value?.path ?? '')}" data-focus-x="${value?.focusX ?? 50}" data-focus-y="${value?.focusY ?? 50}" data-scale="${value?.scale ?? 100}" data-folder="${escapeHtml(spec.defaultFolder ?? '')}" data-preview-aspect="${escapeHtml(spec.previewAspect ?? '8/2.5')}"></div>`;
  }
  if (spec.type === 'string' && (key === 'description' || key === 'flavour' || key === 'blurb' || key === 'body' || key === 'licenseSummary')) {
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
  if (spec.type === 'string[]' || spec.type === 'modKeyList' || spec.type === 'statKeyList' || spec.type === 'questTagList') {
    return listInput(id, value ?? []);
  }
  if (spec.type === 'boolean') {
    return `<input type="checkbox" id="${id}" ${value ? 'checked' : ''} style="width:18px;height:18px;" />`;
  }
  if (spec.type === 'mods') return kvGrid(id, MOD_KEYS, value ?? {}, 'number', MOD_FIELD_INFO);
  if (spec.type === 'stats') return kvGrid(id, STAT_KEYS, value ?? {}, 'number', STAT_FIELD_INFO);
  if (spec.type === 'materials') return kvGrid(id, MATERIAL_KEYS, value ?? {}, 'number');
  if (spec.type === 'roleFlavors') return kvGrid(id, ROLE_KEYS, value ?? {}, 'text');
  // roleDescriptions holds a full sentence per role, not a short display
  // name like roleFlavors -- 'textarea' kind gets each row a proper
  // multi-line box (see kvGrid below) instead of the cramped single-line
  // input roleFlavors uses, which is what made these very hard to write
  // or even just read back before -- reported directly.
  if (spec.type === 'roleDescriptions') return kvGrid(id, ROLE_KEYS, value ?? {}, 'textarea');
  if (spec.type === 'roleRequirements') return kvGrid(id, ROLE_KEYS, value ?? {}, 'number');
  if (spec.type === 'effect') return kvGrid(id, EFFECT_KEYS, value ?? {}, 'mixed', EFFECT_FIELD_INFO);
  if (spec.type === 'eventEffects') return kvGrid(id, EVENT_EFFECT_KEYS, value ?? {}, 'mixed', EVENT_EFFECT_FIELD_INFO);
  if (spec.type === 'eggReward') return eggRewardInput(id, value);
  if (spec.type === 'resultGem') return resultGemInput(id, value);
  if (spec.type === 'chainStages') return stagesInput(id, value ?? []);
  return `<input type="text" id="${id}" value="${escapeHtml(JSON.stringify(value))}" />`;
}

const RARITY_KEYS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
// Same 4 elements as ElementType in types.ts -- used by resultGemInput below.
const ELEMENT_KEYS = ['fire', 'frost', 'lightning', 'poison'];
const CHAIN_STAGE_TAGS = ['combat', 'escort', 'explore', 'arcane', 'stealth', 'defense'];
const CHAIN_STAGE_DIFFICULTIES = ['easy', 'normal', 'hard', 'epic', 'legendary'];

/**
 * A toggle (has this chain got a guaranteed egg reward at all?) plus two
 * sub-fields, shown/hidden together -- rewardEgg is optional on ChainDef,
 * so "no toggle checked" has to be a real, distinct state from "rarity
 * defaults to common," not just a rarity picker that's always present.
 */
function eggRewardInput(id, value) {
  const has = !!value;
  return `
    <div class="egg-reward" id="${id}">
      <label><input type="checkbox" data-egg-enabled ${has ? 'checked' : ''} /> Grants an egg reward</label>
      <div class="egg-reward-fields" ${has ? '' : 'style="display:none"'}>
        <label>Rarity</label>
        <select data-egg-rarity>
          ${RARITY_KEYS.map((r) => `<option value="${r}" ${value?.rarity === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <label>Dedicated pet id (optional)</label>
        <input type="text" data-egg-pet value="${escapeHtml(value?.dedicatedPetId ?? '')}" placeholder="leave blank for the general random pool" />
      </div>
    </div>`;
}

/**
 * `resultGem`'s two sub-fields -- which counter a `gem`-category recipe
 * adds to (GameState.gems for a weapon-enchant gem, resistGems for an
 * armor-infusion one) and which of the 4 elements. Needs the same
 * enabled-toggle eggRewardInput above uses, for the same reason: every
 * field in this schema renders for every recipe regardless of category
 * (there's no category-conditional visibility in this editor), and a
 * <select> can't naturally read as "empty" the way a blank text input
 * can -- without an explicit toggle, saving any gear/consumable/enchant
 * recipe would silently attach a `resultGem: {kind:'elemental',
 * element:'fire'}` default to it, the exact class of bug already flagged
 * elsewhere in this schema (see raidExclusive/craftable's own comment).
 * Defaults unchecked for anything that didn't already have a value.
 */
function resultGemInput(id, value) {
  const has = !!value;
  return `
    <div class="result-gem" id="${id}">
      <label><input type="checkbox" data-gem-enabled ${has ? 'checked' : ''} /> Produces a gem (gem-category recipes only)</label>
      <div class="result-gem-fields" ${has ? '' : 'style="display:none"'}>
        <label>Kind</label>
        <select data-gem-kind>
          <option value="elemental" ${value?.kind === 'elemental' ? 'selected' : ''}>Elemental (Weapon Enchanting)</option>
          <option value="resist" ${value?.kind === 'resist' ? 'selected' : ''}>Resistance (Armour Infusion)</option>
        </select>
        <label>Element</label>
        <select data-gem-element>
          ${ELEMENT_KEYS.map((el) => `<option value="${el}" ${value?.element === el ? 'selected' : ''}>${el}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

/**
 * The repeatable stage sub-form -- the actual reason chainStages needed to
 * be a genuinely new field type rather than reusing listInput (a flat list
 * of single text values), since each row here is itself a 6-field
 * mini-form (name/flavour/tag/difficulty/durationMinutes/goldMultiplier),
 * not one string. Built synchronously (unlike the icon/loot pickers)
 * since tag/difficulty options are static, no server round-trip needed.
 */
function stagesInput(id, stages) {
  const rows = (stages.length ? stages : [{}]).map((s) => stageRowHtml(s)).join('');
  return `<div class="stages-input" id="${id}">${rows}<button type="button" data-add-stage>+ add stage</button></div>`;
}

function stageRowHtml(s) {
  return `
    <div class="stage-row">
      <div class="stage-row-header">
        <span class="stage-row-title">Stage</span>
        <button type="button" class="remove" data-remove-stage>&minus; remove stage</button>
      </div>
      <label>Name</label>
      <input type="text" data-stage-name value="${escapeHtml(s.name ?? '')}" />
      <label>Flavour</label>
      <textarea data-stage-flavour>${escapeHtml(s.flavour ?? '')}</textarea>
      <div class="stage-row-grid">
        <div>
          <label>Tag</label>
          <select data-stage-tag>
            ${CHAIN_STAGE_TAGS.map((t) => `<option value="${t}" ${s.tag === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Difficulty</label>
          <select data-stage-difficulty>
            ${CHAIN_STAGE_DIFFICULTIES.map((d) => `<option value="${d}" ${s.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Duration (minutes)</label>
          <input type="number" data-stage-duration value="${s.durationMinutes ?? ''}" step="any" />
        </div>
        <div>
          <label>Gold multiplier</label>
          <input type="number" data-stage-gold value="${s.goldMultiplier ?? ''}" step="any" />
        </div>
      </div>
    </div>`;
}

// Kept in sync with server.mjs's own copy, which is kept in sync with
// the real `Modifiers`/ConsumableDef.effect types by hand -- see that
// file's comments on both lists for the full "found drifted, fixed in
// the same pass" note.
const MOD_KEYS = ['success', 'gold', 'xp', 'loot', 'injuryResist', 'speed', 'durability', 'health', 'revivalDiscount', 'petHealth', 'petRevivalDiscount', 'repairDiscount', 'scrapBonus', 'consumableDiscount', 'enchantDiscount', 'blackMarketDiscount'];
const STAT_KEYS = ['strength', 'endurance', 'luck', 'wisdom'];
// Same 6 values server.mjs's own QUEST_TAG_KEYS validates against --
// used by hero-classes' `preferred` field (the questTagList type).
const QUEST_TAG_KEYS = ['combat', 'escort', 'explore', 'arcane', 'stealth', 'defense'];
// See server.mjs's own ROLE_KEYS comment -- the 3 Role values, used by
// roleFlavors (hero-classes) and roleRequirements (raids).
const ROLE_KEYS = ['melee', 'ranged', 'caster'];
const MATERIAL_KEYS = ['ore', 'timber', 'herbs', 'fish'];
const EFFECT_KEYS = [
  'success', 'gold', 'xp', 'loot', 'injuryResist', 'speed', 'durability',
  'health', 'restoreHealth', 'healthDamageReduction', 'revivalDiscount',
  'petHealth', 'petRevivalDiscount', 'peddlerCounterReduction',
  'preventInjury', 'guaranteedGoodEvent', 'healInjury',
];
const EVENT_EFFECT_KEYS = ['success', 'goldPct', 'flatGold', 'xpPct', 'loot', 'durability', 'delay', 'injury', 'guaranteedLoot'];
const BOOL_KEYS = new Set(['preventInjury', 'guaranteedGoodEvent', 'healInjury', 'injury']);
// guaranteedLoot is eventEffects' one non-numeric, non-boolean key -- a
// Rarity string, not a percentage or flat amount. Kept as its own named
// set (rather than generalizing kvGrid to an arbitrary per-key type map,
// which nothing else here currently needs) since it's a single field on
// a single content type today. Rendered as a real <select> in kvGrid
// below instead of falling through to a plain number input, which is
// what it did before this fix -- typing into that number input saved a
// garbage number where a rarity string belonged.
const ENUM_KV_KEYS = { guaranteedLoot: RARITY_KEYS };

/**
 * Short unit tags + full descriptions shown alongside every kv-grid field
 * (mods/stats/effect/eventEffects), so a value like "success: -5" doesn't
 * require already knowing the codebase to read correctly. Grounded
 * directly in the real doc comments on Modifiers/Stats/ConsumableDef.
 * effect/EventDef.effects in types.ts and data/events.ts -- not guessed.
 *
 * `unit` is the short inline tag next to the label (e.g. "pts", "%mult").
 * `title` is the fuller sentence, shown as the input's hover tooltip.
 * Three genuinely different conventions exist across this game's various
 * percentage-shaped fields, and mixing them up produces a value that's
 * silently wrong rather than erroring, so the tag distinguishes each one
 * rather than lumping them all under one generic "%" label:
 *   - "pts"   -- flat percentage POINTS, added directly (5 = +5%, on top
 *                of whatever the base already was).
 *   - "%mult" -- a percentage MULTIPLIER where the number itself IS the
 *                percentage (10 = +10%, i.e. result * 1.10).
 *   - "0-1x"  -- a FRACTIONAL multiplier where 1.0 = 100% (0.5 = +50%,
 *                i.e. result * (1 + 0.5)) -- goldPct/xpPct's own
 *                convention, confirmed directly against QuestManager.
 *                resolve's actual formula, and deliberately flagged since
 *                it's easy to mistake for the "%mult" convention above at
 *                a glance (both are called a "percentage" in prose, but a
 *                goldPct of 10 means +1000%, not +10%).
 *   - "flat"  -- a plain number with no percentage meaning at all.
 */
const MOD_FIELD_INFO = {
  success: { unit: 'pts', title: 'Flat percentage points added to success chance (5 = +5%, -5 = -5%).' },
  gold: { unit: '%mult', title: 'Percentage multiplier on gold reward (10 = +10% gold).' },
  xp: { unit: '%mult', title: 'Percentage multiplier on XP reward (10 = +10% XP).' },
  loot: { unit: 'pts', title: 'Flat percentage points added to rare loot chance.' },
  injuryResist: { unit: 'pts', title: 'Flat percentage points removed from injury chance.' },
  speed: { unit: '%mult', title: 'Percentage reduction of quest duration (10 = 10% shorter).' },
  durability: { unit: '%mult', title: 'Percentage reduction of durability lost per quest.' },
  health: { unit: 'flat', title: "Flat bonus added directly to a hero's Max Health pool." },
  revivalDiscount: { unit: 'pts', title: "Percentage points shaved off a hero's revival gold cost." },
  petHealth: { unit: 'flat', title: 'Flat bonus to pet Max Health -- a separate pool from the hero `health` key above; never mixes with it.' },
  petRevivalDiscount: { unit: 'pts', title: "Percentage points shaved off a pet's revival cost." },
};
const STAT_FIELD_INFO = {
  // Phrasing matches the Guide tab's own player-facing "Stat Points"
  // entry (guideTopics.ts) word for word, so this tooltip never
  // contradicts what a player sees in-game.
  strength: { unit: '', title: 'Pushes success chance (alongside Endurance).' },
  endurance: { unit: '', title: 'Pushes success chance (alongside Strength).' },
  luck: { unit: '', title: 'Pushes gold and loot chance.' },
  wisdom: { unit: '', title: 'Pushes XP gained.' },
};
const EFFECT_FIELD_INFO = {
  // Same underlying units as MOD_FIELD_INFO above for the 7 keys shared
  // with Modifiers -- ConsumableDef.effect's own doc comment says so
  // explicitly ("Same units as Modifiers"), so these entries are the
  // same tags/titles, not independently re-derived.
  success: MOD_FIELD_INFO.success,
  gold: MOD_FIELD_INFO.gold,
  xp: MOD_FIELD_INFO.xp,
  loot: MOD_FIELD_INFO.loot,
  injuryResist: MOD_FIELD_INFO.injuryResist,
  speed: MOD_FIELD_INFO.speed,
  durability: MOD_FIELD_INFO.durability,
  health: { unit: 'flat', title: "Flat bonus added to a hero's Max Health pool -- widens the pool, doesn't fill it. See restoreHealth for immediate healing." },
  restoreHealth: { unit: 'pts', title: '% of Max Health restored immediately on use (the "Apply" action) -- not a per-quest loadout effect.' },
  healthDamageReduction: { unit: 'pts', title: '% reduction to Health damage on the one quest this consumable is equipped for -- a loadout effect, consumed at send time.' },
  revivalDiscount: MOD_FIELD_INFO.revivalDiscount,
  petHealth: MOD_FIELD_INFO.petHealth,
  petRevivalDiscount: MOD_FIELD_INFO.petRevivalDiscount,
  peddlerCounterReduction: { unit: 'flat', title: "Flat reduction to the guild's quest-count counter toward Grimsby's next visit." },
  preventInjury: { unit: 'bool', title: 'Blocks any injury roll on the quest this is equipped for.' },
  guaranteedGoodEvent: { unit: 'bool', title: 'Forces the quest event roll (if any fires) to land positive.' },
  healInjury: { unit: 'bool', title: "Clears the hero's current injury immediately on use." },
};
const EVENT_EFFECT_FIELD_INFO = {
  success: { unit: 'pts', title: 'Percentage points added to the success roll for this quest.' },
  goldPct: { unit: '0-1x', title: 'Multiplier applied to gold -- 0.5 = +50%. NOT the same convention as Modifiers/effect\'s "gold" key (10 = +10%) -- easy to mix up, confirmed against the real formula in QuestManager.resolve.' },
  flatGold: { unit: 'flat', title: 'Flat gold added regardless of quest outcome.' },
  xpPct: { unit: '0-1x', title: 'Multiplier applied to XP -- 0.5 = +50%, same 0-1 convention as goldPct (confirmed against QuestManager.resolve), not Modifiers\' "xp" key\'s 10=+10% convention.' },
  loot: { unit: 'pts', title: 'Percentage points added to loot chance.' },
  durability: { unit: 'flat', title: 'Extra durability damage applied.' },
  delay: { unit: '%mult', title: 'Percentage added to quest duration (resolved as a delay note only).' },
  injury: { unit: 'bool', title: 'Forces an injury attempt even on an otherwise successful quest.' },
  guaranteedLoot: { unit: 'rarity', title: 'Guarantees an extra loot roll at this rarity floor or higher.' },
};

function listInput(id, items) {
  const rows = (items.length ? items : ['']).map((v, i) => `
    <div class="row">
      <input type="text" data-list-item value="${escapeHtml(v)}" />
      <button type="button" class="remove" data-remove-item>&minus;</button>
    </div>`).join('');
  return `<div class="list-input" id="${id}">${rows}<button type="button" data-add-item>+ add</button></div>`;
}

/**
 * `fieldInfo`, if given, is a per-key { unit, title } lookup (see
 * MOD_FIELD_INFO etc. above) -- renders a short muted unit tag right next
 * to the label, and a full-sentence hover tooltip on the input itself, so
 * a value like "success: -5" doesn't require already knowing the
 * codebase to read correctly (see those constants' own top comment for
 * why this exists and what each unit tag means). Falls back to no tag/
 * tooltip for any key without an entry, same as before this existed.
 *
 * `ENUM_KV_KEYS[k]`, if present, renders a real `<select>` instead of a
 * number/checkbox input -- currently only `guaranteedLoot`
 * (eventEffects), which is a Rarity string, not a number. See that
 * constant's own comment for the bug this fixes.
 */
function kvGrid(id, keys, values, kind, fieldInfo) {
  const rows = keys.map((k) => {
    const info = fieldInfo?.[k];
    const unitTag = info?.unit ? ` <span class="tiny muted">(${escapeHtml(info.unit)})</span>` : '';
    const titleAttr = info?.title ? ` title="${escapeHtml(info.title)}"` : '';
    const label = `<label>${k}${unitTag}</label>`;
    if (ENUM_KV_KEYS[k]) {
      const opts = ['<option value="">—</option>', ...ENUM_KV_KEYS[k].map((o) =>
        `<option value="${o}" ${o === values[k] ? 'selected' : ''}>${o}</option>`)].join('');
      return `${label}<select data-kv="${k}"${titleAttr}>${opts}</select>`;
    }
    if (kind === 'mixed' && BOOL_KEYS.has(k)) {
      return `${label}<input type="checkbox" data-kv="${k}"${titleAttr} ${values[k] ? 'checked' : ''} />`;
    }
    if (kind === 'text') {
      return `${label}<input type="text" data-kv="${k}"${titleAttr} value="${escapeHtml(values[k] ?? '')}" placeholder="—" />`;
    }
    if (kind === 'textarea') {
      return `${label}<textarea data-kv="${k}"${titleAttr} placeholder="—">${escapeHtml(values[k] ?? '')}</textarea>`;
    }
    return `${label}<input type="number" step="any" data-kv="${k}"${titleAttr} value="${values[k] ?? ''}" placeholder="—" />`;
  }).join('');
  // 'textarea' kind gets its own modifier class -- the default .kv-grid
  // layout (label + a 90px-wide field side by side, see style.css) fits a
  // short name or number but not a full sentence, so this switches to a
  // stacked, full-width layout instead (see .kv-grid-textarea in style.css).
  const gridClass = kind === 'textarea' ? 'kv-grid kv-grid-textarea' : 'kv-grid';
  return `<div class="${gridClass}" id="${id}">${rows}</div>`;
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

/* --------------------------------------------------------- banner field --- */
// Same session-cache reasoning as ensureIcons -- public/lore/ only changes
// when someone drops new art in, which means a tool restart anyway.
async function ensureBanners() {
  if (state.banners) return state.banners;
  state.banners = await api('/api/banners');
  return state.banners;
}

// Matches server.mjs's GENERAL_BANNER_FOLDER -- loose files sitting
// directly in public/lore/ (not inside a chains/raids/etc subfolder) are
// grouped under this label for display, but their real on-disk path has no
// folder prefix at all, so picking one must NOT prepend the label.
const BANNER_GENERAL_LABEL = '(general)';

function bannerRelPath(folderName, file) {
  return folderName === BANNER_GENERAL_LABEL ? file : `${folderName}/${file}`;
}

/** The folder/id.jpg path a chain or raid falls back to when no explicit
 *  override is chosen -- mirrors ChainBanner/RaidBanner's own fallback
 *  exactly. Reads the sibling id-field's live value (not the value this
 *  editor opened with), so a brand-new entry's preview keeps up as its id
 *  is typed -- see the input listener wired in wireBannerFields below. */
function bannerDefaultPath(field) {
  const folder = field.dataset.folder;
  const idInput = field.closest('.editor')?.querySelector('#f_id');
  const entryId = idInput ? idInput.value.trim() : '';
  if (!folder || !entryId) return null;
  return `${folder}/${entryId}.jpg`;
}

// How far a single nudge-button click moves focusX/focusY, in percentage
// points. Small enough for real precision (the original ask was "more
// accurately," not "faster"), while still visibly moving the crosshair in
// one click on any reasonably-sized preview box.
const BANNER_NUDGE_STEP = 2;

/** backgroundSize for a given zoom value -- 100 (the default, and what an
 *  omitted `scale` means) maps to the exact same plain 'cover' every banner
 *  used before this feature existed, so existing entries render pixel-
 *  identical. Above 100, a plain percentage still fills the box (the image
 *  was already >=100% of it under 'cover') while letting focusX/focusY
 *  reveal more or less of the surrounding art -- this is the "zoom"
 *  control, deliberately independent of the focus point itself. */
function bannerBackgroundSize(scale) {
  return scale && scale !== 100 ? `${scale}%` : 'cover';
}

/** Fills in and wires a .banner-field container: a live preview strip --
 *  sized to roughly the same aspect ratio the art actually renders at
 *  in-game (data-preview-aspect, set per content type in server.mjs's
 *  schema) rather than one generic box for every field -- that doubles as
 *  a focus-point picker (click or drag sets the crosshair, which is
 *  exactly what backgroundPosition uses in-game) and carries four nudge
 *  buttons for 1-click precision alongside the drag. A separate zoom
 *  slider controls backgroundSize independently of the focus point, since
 *  "where" and "how much" are different questions a single crosshair can't
 *  answer on its own. Plus buttons to choose an art override, revert to
 *  the default path, or reset focus/zoom to their defaults. Full re-render
 *  on every value change except live drag/slider input (see the in-place
 *  updates below), same "small enough not to bother patching in place"
 *  reasoning as renderIconField. */
function renderBannerField(field) {
  const override = field.dataset.path || '';
  const focusX = parseFloat(field.dataset.focusX);
  const focusY = parseFloat(field.dataset.focusY);
  const fx = Number.isFinite(focusX) ? focusX : 50;
  const fy = Number.isFinite(focusY) ? focusY : 50;
  const scaleVal = parseFloat(field.dataset.scale);
  const scale = Number.isFinite(scaleVal) ? scaleVal : 100;
  const aspect = field.dataset.previewAspect || '8/2.5';
  const defaultPath = bannerDefaultPath(field);
  const previewPath = override || defaultPath;

  field.innerHTML = `
    <div class="banner-preview-box" data-drag-target
         style="aspect-ratio:${escapeHtml(aspect)};${previewPath ? `background-image:url('/lore-art/${escapeHtml(previewPath)}');` : ''}background-size:${bannerBackgroundSize(scale)};background-position:${fx}% ${fy}%;">
      ${previewPath ? '' : '<span class="banner-preview-empty">No banner art yet — click/drag still sets focus for when art is added</span>'}
      <div class="banner-focus-marker" style="left:${fx}%; top:${fy}%;"></div>
      <div class="banner-nudge-pad" aria-hidden="true">
        <button type="button" class="banner-nudge banner-nudge-up" data-nudge="0,-1" title="Move focus up">▲</button>
        <button type="button" class="banner-nudge banner-nudge-left" data-nudge="-1,0" title="Move focus left">◀</button>
        <button type="button" class="banner-nudge banner-nudge-right" data-nudge="1,0" title="Move focus right">▶</button>
        <button type="button" class="banner-nudge banner-nudge-down" data-nudge="0,1" title="Move focus down">▼</button>
      </div>
    </div>
    <div class="banner-field-controls">
      <span class="banner-field-name">${override ? escapeHtml(override) : (defaultPath ? `Using default: ${escapeHtml(defaultPath)}` : 'Set an id first to see the default path')}</span>
      <span class="banner-field-focus tiny muted" data-focus-readout>Focus: ${Math.round(fx)}%, ${Math.round(fy)}% · Zoom: ${Math.round(scale)}%</span>
      <label class="banner-zoom-row tiny muted">
        Zoom
        <input type="range" min="100" max="300" step="1" value="${scale}" data-zoom-slider />
        <span data-zoom-readout>${Math.round(scale)}%</span>
      </label>
      <div class="banner-field-buttons">
        <button type="button" data-choose-banner>${override ? 'Change' : 'Choose banner'}</button>
        ${override ? '<button type="button" class="remove" data-clear-banner-path>Use default</button>' : ''}
        <button type="button" data-reset-focus>Center &amp; reset zoom</button>
      </div>
    </div>`;

  const box = field.querySelector('[data-drag-target]');
  const marker = field.querySelector('.banner-focus-marker');
  const readout = field.querySelector('[data-focus-readout]');
  const zoomSlider = field.querySelector('[data-zoom-slider]');
  const zoomReadout = field.querySelector('[data-zoom-readout]');

  // In-place updates only (no renderBannerField call) while dragging or
  // dragging the zoom slider -- re-rendering mid-interaction would tear
  // down `box`/`zoomSlider` themselves and break pointer capture / the
  // slider's own native drag below.
  const applyFocus = (x, y) => {
    field.dataset.focusX = x.toFixed(1);
    field.dataset.focusY = y.toFixed(1);
    box.style.backgroundPosition = `${x}% ${y}%`;
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    readout.textContent = `Focus: ${Math.round(x)}%, ${Math.round(y)}% · Zoom: ${Math.round(parseFloat(field.dataset.scale) || 100)}%`;
  };
  const setFocusFromEvent = (e) => {
    const rect = box.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    applyFocus(x, y);
  };

  // Pointer capture keeps drag tracking even if the cursor leaves the box
  // mid-drag, without needing any window-level listener -- since these are
  // bound directly to `box`, they're discarded for free the moment this
  // field next re-renders (a fresh box replaces this one), no manual
  // cleanup or accumulating global listeners across repeated edits.
  let dragging = false;
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-nudge]')) return; // nudge buttons sit inside the box; don't start a drag from them
    dragging = true;
    box.setPointerCapture(e.pointerId);
    setFocusFromEvent(e);
  });
  box.addEventListener('pointermove', (e) => { if (dragging) setFocusFromEvent(e); });
  box.addEventListener('pointerup', () => { dragging = false; });

  // Nudge buttons -- same 1-2 percentage-point-per-click precision either
  // arrow keys or a mouse can reliably hit, which a single click/drag
  // gesture on a small preview box can't always manage on its own.
  field.querySelectorAll('[data-nudge]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const [dx, dy] = btn.dataset.nudge.split(',').map(Number);
      const x = Math.min(100, Math.max(0, (parseFloat(field.dataset.focusX) || 50) + dx * BANNER_NUDGE_STEP));
      const y = Math.min(100, Math.max(0, (parseFloat(field.dataset.focusY) || 50) + dy * BANNER_NUDGE_STEP));
      applyFocus(x, y);
    };
  });

  // Zoom slider -- independent of focus point entirely. Live-updates the
  // preview's backgroundSize as it's dragged, same in-place-no-rerender
  // approach as the focus drag above.
  zoomSlider.addEventListener('input', () => {
    const s = parseFloat(zoomSlider.value) || 100;
    field.dataset.scale = String(s);
    box.style.backgroundSize = bannerBackgroundSize(s);
    zoomReadout.textContent = `${Math.round(s)}%`;
    readout.textContent = `Focus: ${Math.round(parseFloat(field.dataset.focusX) || 50)}%, ${Math.round(parseFloat(field.dataset.focusY) || 50)}% · Zoom: ${Math.round(s)}%`;
  });

  field.querySelector('[data-choose-banner]').onclick = async () => {
    const folders = await ensureBanners();
    openBannerPicker(folders, field.dataset.path, field.dataset.folder, (chosen) => {
      field.dataset.path = chosen;
      renderBannerField(field);
    });
  };
  const clearBtn = field.querySelector('[data-clear-banner-path]');
  if (clearBtn) clearBtn.onclick = () => { field.dataset.path = ''; renderBannerField(field); };
  field.querySelector('[data-reset-focus]').onclick = () => {
    field.dataset.focusX = '50';
    field.dataset.focusY = '50';
    field.dataset.scale = '100';
    renderBannerField(field);
  };
}

function wireBannerFields(container) {
  container.querySelectorAll('.banner-field').forEach((field) => renderBannerField(field));
  // Keep a new entry's default-path preview in sync as its id is typed --
  // existing entries rarely change id, but nothing stops it, and this is
  // free either way. Only reruns for fields with no explicit override,
  // since an overridden field's preview doesn't depend on id at all.
  const idInput = container.querySelector('#f_id');
  if (idInput) {
    idInput.addEventListener('input', () => {
      container.querySelectorAll('.banner-field').forEach((field) => {
        if (!field.dataset.path) renderBannerField(field);
      });
    });
  }
}

/** Same overlay-on-overlay pattern as openIconPicker, sized for wide banner
 *  art instead of small square icons -- thumbnails use background-size:
 *  cover, matching how the game itself renders these strips, so what's
 *  picked here previews close to the real in-game look. `preferredFolder`
 *  (the schema's defaultFolder hint -- "chains" or "raids") is just sorted
 *  first; everything stays fully browsable, this only saves a scroll for
 *  the common case. */
function openBannerPicker(folders, currentValue, preferredFolder, onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay icon-picker-overlay';
  const panel = document.createElement('div');
  panel.className = 'editor icon-picker banner-picker';

  const ordered = [...folders].sort((a, b) => {
    if (a.name === preferredFolder) return -1;
    if (b.name === preferredFolder) return 1;
    return 0;
  });

  const sectionsHtml = ordered.length === 0
    ? '<p class="tiny muted">No banner art found in public/lore/. Drop .jpg/.png files into it (or its chains/raids/harvest/crafting subfolders) and reopen this picker.</p>'
    : ordered.map((f) => `
        <div class="icon-picker-section">
          <div class="icon-picker-folder">${escapeHtml(f.name)} (${f.files.length})</div>
          <div class="banner-picker-grid">
            ${f.files.map((file) => {
              const rel = bannerRelPath(f.name, file);
              const selected = rel === currentValue;
              return `<button type="button" class="banner-picker-item ${selected ? 'selected' : ''}" data-banner="${escapeHtml(rel)}" title="${escapeHtml(rel)}">
                <span class="banner-picker-thumb" style="background-image:url('/lore-art/${escapeHtml(rel)}');"></span>
                <span class="banner-picker-name tiny muted">${escapeHtml(file)}</span>
              </button>`;
            }).join('')}
          </div>
        </div>`).join('');

  panel.innerHTML = `
    <h2>Choose a banner</h2>
    <div class="icon-picker-body">${sectionsHtml}</div>
    <div class="editor-actions">
      <button id="bannerPickerCancel">Cancel</button>
    </div>`;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  panel.querySelectorAll('[data-banner]').forEach((btn) => {
    btn.onclick = () => {
      onPick(btn.dataset.banner);
      overlay.remove();
    };
  });
  panel.querySelector('#bannerPickerCancel').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
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

/** Add/remove-row wiring for the chainStages repeatable sub-form -- same
 *  "insert a fresh row before the add button, wire its own remove button
 *  inline" shape as wireListInput above, just a bigger row template. */
function wireStagesInput(container) {
  container.querySelectorAll('.stages-input').forEach((stagesEl) => {
    const addBtn = stagesEl.querySelector('[data-add-stage]');
    const wireRemove = (row) => {
      row.querySelector('[data-remove-stage]').onclick = () => {
        // Always leave at least one row -- chainStages is required and
        // non-empty (see server.mjs's validateEntry), so an empty stage
        // list would just fail to save with a confusing error instead of
        // being prevented here where the reason is obvious.
        if (stagesEl.querySelectorAll('.stage-row').length > 1) row.remove();
      };
    };
    addBtn.onclick = () => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = stageRowHtml({});
      const row = wrapper.firstElementChild;
      wireRemove(row);
      stagesEl.insertBefore(row, addBtn);
    };
    stagesEl.querySelectorAll('.stage-row').forEach(wireRemove);
  });
}

/** Shows/hides the rarity+petId sub-fields as the "grants an egg reward"
 *  checkbox toggles -- the fields stay in the DOM either way (readField's
 *  eggReward case only reads them when the checkbox is checked), so
 *  toggling off and back on doesn't lose whatever was already typed. */
function wireEggRewardInput(container) {
  container.querySelectorAll('.egg-reward').forEach((el) => {
    const checkbox = el.querySelector('[data-egg-enabled]');
    const fields = el.querySelector('.egg-reward-fields');
    checkbox.onchange = () => { fields.style.display = checkbox.checked ? '' : 'none'; };
  });
}

function wireResultGemInput(container) {
  container.querySelectorAll('.result-gem').forEach((el) => {
    const checkbox = el.querySelector('[data-gem-enabled]');
    const fields = el.querySelector('.result-gem-fields');
    checkbox.onchange = () => { fields.style.display = checkbox.checked ? '' : 'none'; };
  });
}

function readField(spec, key) {
  const el = document.getElementById(`f_${key}`);
  if (spec.picker === 'icon') return el.dataset.value || '';
  if (spec.picker === 'lootTable') return el.__getLootValue ? el.__getLootValue() : [];
  if (spec.type === 'bannerImage') {
    const path = el.dataset.path || '';
    const fx = parseFloat(el.dataset.focusX);
    const fy = parseFloat(el.dataset.focusY);
    const out = {};
    if (path) out.path = path;
    // Only recorded when actually off-center -- an untouched field (still
    // sitting at the 50/50 default) should save as fully omitted, same as
    // before this feature existed, not as an explicit "centered" entry.
    if (Number.isFinite(fx) && Math.round(fx * 10) !== 500) out.focusX = Math.round(fx * 10) / 10;
    if (Number.isFinite(fy) && Math.round(fy * 10) !== 500) out.focusY = Math.round(fy * 10) / 10;
    // Same "only recorded when it differs from the no-op default" rule --
    // an untouched zoom slider (100, plain 'cover') saves as fully
    // omitted, so nothing already-placed art needs migrating.
    const fs = parseFloat(el.dataset.scale);
    if (Number.isFinite(fs) && Math.round(fs) !== 100) out.scale = Math.round(fs);
    return out;
  }
  if (spec.type === 'string' || spec.type === 'enum') return el.value;
  if (spec.type === 'number') return parseFloat(el.value) || 0;
  if (spec.type === 'boolean') return el.checked;
  if (spec.type === 'string[]' || spec.type === 'modKeyList' || spec.type === 'statKeyList' || spec.type === 'questTagList') {
    return [...el.querySelectorAll('[data-list-item]')].map((i) => i.value.trim()).filter(Boolean);
  }
  if (['mods', 'stats', 'materials', 'roleRequirements', 'effect', 'eventEffects'].includes(spec.type)) {
    const out = {};
    el.querySelectorAll('[data-kv]').forEach((input) => {
      const k = input.dataset.kv;
      if (input.tagName === 'SELECT') {
        // guaranteedLoot today -- a real enum value (Rarity string), not
        // a number. See ENUM_KV_KEYS/kvGrid's own comment for the bug
        // this replaces (a plain number input silently accepting and
        // saving garbage where a rarity string belonged).
        if (input.value !== '') out[k] = input.value;
      } else if (input.type === 'checkbox') {
        if (input.checked) out[k] = true;
      } else if (input.value !== '') {
        out[k] = parseFloat(input.value);
      }
    });
    return out;
  }
  if (spec.type === 'roleFlavors' || spec.type === 'roleDescriptions') {
    // Text values, not numbers -- kvGrid's 'text'/'textarea' kinds (see
    // kvGrid's own comment), so this reads plain trimmed strings rather
    // than parseFloat like the numeric kv-grids above. A <textarea>'s
    // `.value` works identically to an <input>'s here, so roleDescriptions
    // (now rendered as textareas) reads back through the same branch.
    const out = {};
    el.querySelectorAll('[data-kv]').forEach((input) => {
      const v = input.value.trim();
      if (v !== '') out[input.dataset.kv] = v;
    });
    return out;
  }
  if (spec.type === 'eggReward') {
    const enabled = el.querySelector('[data-egg-enabled]').checked;
    if (!enabled) return undefined;
    const dedicatedPetId = el.querySelector('[data-egg-pet]').value.trim();
    return {
      rarity: el.querySelector('[data-egg-rarity]').value,
      ...(dedicatedPetId ? { dedicatedPetId } : {}),
    };
  }
  if (spec.type === 'resultGem') {
    const enabled = el.querySelector('[data-gem-enabled]').checked;
    if (!enabled) return undefined;
    return {
      kind: el.querySelector('[data-gem-kind]').value,
      element: el.querySelector('[data-gem-element]').value,
    };
  }
  if (spec.type === 'chainStages') {
    return [...el.querySelectorAll('.stage-row')].map((row) => ({
      name: row.querySelector('[data-stage-name]').value,
      flavour: row.querySelector('[data-stage-flavour]').value,
      tag: row.querySelector('[data-stage-tag]').value,
      difficulty: row.querySelector('[data-stage-difficulty]').value,
      durationMinutes: parseFloat(row.querySelector('[data-stage-duration]').value) || 0,
      goldMultiplier: parseFloat(row.querySelector('[data-stage-gold]').value) || 0,
    }));
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
      ${spec.type === 'questTagList' ? `<div class="hint">One per line, must be one of: ${QUEST_TAG_KEYS.join(', ')}. At least one required.</div>` : ''}
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
  wireBannerFields(editor);
  wireLootFields(editor);
  wireStagesInput(editor);
  wireEggRewardInput(editor);
  wireResultGemInput(editor);

  editor.querySelector('#cancelBtn').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  editor.querySelector('#saveBtn').onclick = () => {
    const entry = {};
    for (const [key, spec] of Object.entries(schema.fields)) {
      const value = readField(spec, key);
      const isEmpty = value === '' || value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) || (Array.isArray(value) && value.length === 0);
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

const patchState = {
  files: [], gitStatus: null, selected: null, checked: false, applied: false,
  discordConfigured: false, discordPreview: '', discordDraft: '',
};

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
  state.group = null;
  markActiveGroup('__patches__');
  // Patches isn't a content group -- no sub-tab strip to show.
  subtabsEl.style.display = 'none';
  subtabsEl.innerHTML = '';
  setStatus('Loading…');
  try {
    const [{ files, status }, versionInfo, devStatus, discordConfig] = await Promise.all([
      api('/api/patches/list'),
      api('/api/version'),
      api('/api/dev/status'),
      api('/api/discord/config'),
    ]);
    patchState.files = files;
    patchState.gitStatus = status;
    patchState.version = versionInfo.version;
    patchState.tags = versionInfo.tags;
    patchState.devRunning = devStatus.running;
    patchState.discordConfigured = discordConfig.configured;
    patchState.discordPreview = discordConfig.preview;
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

    <div class="section-heading" style="margin-top:18px;">9. Post a dev update to Discord</div>
    <p class="tiny muted">
      Sends a message to your updates channel via a Discord webhook. The webhook URL is saved
      locally (<code>tools/devtool/discord.config.json</code>, gitignored) and never leaves this
      machine except in the request to Discord itself.
    </p>
    <div class="row" style="gap: 8px; margin-bottom: 8px;">
      <input type="password" id="discordWebhookInput" placeholder="https://discord.com/api/webhooks/..."
        style="flex:1; background: var(--panel2); border: 1px solid var(--panel3); color: var(--text); padding: 7px 8px;" />
      <button id="discordSaveBtn">Save webhook</button>
    </div>
    <p class="tiny muted">
      Status: ${patchState.discordConfigured ? `🟢 ${escapeHtml(patchState.discordPreview)}` : '⚪ not configured yet'}
    </p>
    <textarea id="discordMessageInput" rows="4"
      placeholder="What changed in this update? (pre-fill from the selected patch below)"
      style="width:100%; background: var(--panel2); border: 1px solid var(--panel3); color: var(--text); padding: 7px 8px; box-sizing: border-box; font-family: inherit;">${escapeHtml(patchState.discordDraft)}</textarea>
    <div class="row" style="gap:6px; margin-top:8px;">
      <button id="discordFillBtn" ${!sel ? 'disabled' : ''}>Fill from selected patch</button>
      <button id="discordPostBtn" class="primary" ${!patchState.discordConfigured ? 'disabled' : ''}>Post to Discord</button>
    </div>
    <p id="discordContinuity" class="tiny muted" style="margin: 4px 0 0;"></p>
    <div id="discordResult"></div>
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

  const discordSaveBtn = document.getElementById('discordSaveBtn');
  discordSaveBtn.onclick = async () => {
    const input = document.getElementById('discordWebhookInput');
    const webhookUrl = input.value.trim();
    discordSaveBtn.disabled = true;
    discordSaveBtn.textContent = 'Saving…';
    try {
      const result = await api('/api/discord/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
      });
      patchState.discordConfigured = result.configured;
      patchState.discordPreview = result.preview;
      input.value = '';
      renderPatches();
    } catch (err) {
      alert(err.message || 'Could not save the webhook URL.');
      discordSaveBtn.disabled = false;
      discordSaveBtn.textContent = 'Save webhook';
    }
  };

  const discordFillBtn = document.getElementById('discordFillBtn');
  if (discordFillBtn) discordFillBtn.onclick = async () => {
    const messageInput = document.getElementById('discordMessageInput');
    const continuityEl = document.getElementById('discordContinuity');
    discordFillBtn.disabled = true;
    discordFillBtn.textContent = 'Filling…';
    try {
      const summary = await api(`/api/discord/patch-summary?patch=${encodeURIComponent(sel)}`);
      if (summary.found) {
        messageInput.value = summary.text;
      } else {
        // No ```discord-update block on this entry (an older patch, or one
        // written before this convention existed) -- fall back to a plain
        // title derived from the filename, same as before this feature.
        const name = sel.replace(/\.patch$/, '').replace(/^\d+-/, '').replace(/-/g, ' ');
        messageInput.value = `**${name}**\n\nSee the full changelog in guild-idler-status.md.`;
      }
      patchState.discordDraft = messageInput.value;
      if (continuityEl) {
        if (summary.latestPriorPatch === null) {
          continuityEl.textContent = '';
        } else if (summary.continuityOk) {
          continuityEl.textContent = `✓ Continuity OK -- previous logged patch is ${summary.latestPriorPatch}.`;
          continuityEl.className = 'tiny muted';
        } else {
          continuityEl.textContent = `⚠ Continuity check: previous logged patch is ${summary.latestPriorPatch}, expected patch ${String(parseInt(summary.latestPriorPatch, 10) + 1).padStart(4, '0')} -- check guild-idler-status.md for a numbering gap.`;
          continuityEl.className = 'tiny';
          continuityEl.style.color = 'var(--brass)';
        }
      }
    } catch (err) {
      alert(err.message || 'Could not look up a summary for this patch.');
    }
    discordFillBtn.disabled = false;
    discordFillBtn.textContent = 'Fill from selected patch';
  };

  const discordPostBtn = document.getElementById('discordPostBtn');
  discordPostBtn.onclick = async () => {
    const messageInput = document.getElementById('discordMessageInput');
    patchState.discordDraft = messageInput.value;
    discordPostBtn.disabled = true;
    discordPostBtn.textContent = 'Posting…';
    const outcome = await api('/api/discord/post', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: sel ? sel.replace(/\.patch$/, '') : undefined, message: messageInput.value }),
    }).catch((err) => ({ ok: false, error: err.message }));
    discordPostBtn.disabled = !patchState.discordConfigured;
    discordPostBtn.textContent = 'Post to Discord';
    const result = { ok: outcome.ok, stdout: outcome.ok ? 'Posted to Discord.' : '', stderr: outcome.error || '' };
    document.getElementById('discordResult').innerHTML = resultBlock(result, 'Discord post');
  };
}
