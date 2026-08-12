/**
 * A small, reusable styled confirm/cancel prompt -- the in-theme
 * replacement for a native `window.confirm()` call. Same `.overlay`/
 * `.modal` shell and `.modal-pop-in` animation every other modal in the
 * game already uses (GuildNamingModal, PickerModal, etc.), so this reads
 * as part of the game rather than a browser chrome dialog dropped on top
 * of it.
 *
 * Deliberately generic (message + two labeled buttons) rather than
 * one-off per caller -- Recall is the first consumer (see QuestPanel.tsx),
 * but the native-`confirm()` convention is still used a few other places
 * (StatsPanel's hard reset, Send-All-Idle) that can move onto this same
 * component later without needing their own bespoke modal each time. See
 * guild-idler-status.md's "Recall confirmation -- fixed" entry for the
 * full writeup and the deliberately-narrow scope of this pass.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button as .btn-danger instead of .btn-primary --
   *  same "destructive/irreversible action" accent StatsPanel's own hard
   *  reset button already uses. Recall isn't destructive in that sense
   *  (no gold/progress lost beyond the in-flight quest, which is exactly
   *  what the prompt is warning about), so it stays the default
   *  .btn-primary rather than reaching for red. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
        <p className="small" style={{ marginTop: title ? 0 : undefined }}>{message}</p>
        <div className="row end" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
