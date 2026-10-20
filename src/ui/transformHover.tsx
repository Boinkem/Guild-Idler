/**
 * Patch 0427 -- the "what it's becoming" card on the Enhance station's
 * right-hand box (both tabs). The left box holds your item; the right box
 * is its replica as it will be. Hover (or focus) the right box to see the
 * change line by line: what it was, and what it's turning into.
 */
export interface TransformRow { key: string; label: string; from: string; to: string; tone?: 'up' | 'same' }

export function TransformHover({ title, fromLabel, toLabel, fromColor, toColor, rows }: {
  title: string; fromLabel: string; toLabel: string;
  /** Colour for each side's header -- rarity, or how strong the item is. */
  fromColor?: string; toColor?: string;
  rows: TransformRow[];
}) {
  return (
    <span className="thx-card" role="tooltip">
      <span className="thx-title">{title}</span>
      <span className="thx-head">
        <b style={fromColor ? { color: fromColor } : undefined}>{fromLabel}</b>
        <i>{'\u2192'}</i>
        <b style={toColor ? { color: toColor } : undefined}>{toLabel}</b>
      </span>
      {rows.map((r) => (
        <span key={r.key} className="thx-row">
          <span className="thx-k">{r.label}</span>
          <span className="thx-from">{r.from}</span>
          <i>{'\u2192'}</i>
          <span className={`thx-to ${r.from === r.to ? 'same' : 'up'}`}>{r.to}</span>
        </span>
      ))}
    </span>
  );
}

/** Red -> brass -> green as an item's strength (0..1) climbs. */
export function strengthColor(r: number): string {
  if (r >= 0.999) return 'var(--moss)';
  if (r >= 0.75) return 'var(--brass)';
  if (r >= 0.5) return '#d98a3a';
  return 'var(--blood)';
}
