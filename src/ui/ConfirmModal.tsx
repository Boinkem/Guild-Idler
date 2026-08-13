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
/**
 * A small, reusable styled confirm/cancel prompt -- the in-theme
 * replacement for a native `window.confirm()` call. Same `.overlay`/
 * `.modal` shell and `.modal-pop-in` animation every other modal in the
 * game already uses (GuildNamingModal, PickerModal, etc.), so this reads
 * as part of the game rather than a browser chrome dialog dropped on top
 * of it.
 *
 * Deliberately generic (message + two labeled buttons) rather than
 * one-off per caller -- Recall was the first consumer (see
 * QuestPanel.tsx); StatsPanel's hard reset and EquipmentPanel's sell
 * confirmations (single item + bulk junk) have since moved onto this same
 * component too rather than keeping their own native `confirm()` calls.
 *
 * `infoOnly` covers the other native-dialog case, `window.alert()` --
 * a single acknowledgement with no real decision to make (StatsPanel's
 * "Where is my save?" location readout). Renders one button (labeled by
 * `confirmLabel`, default "OK") and routes both the backdrop click and
 * that button through `onConfirm`; `onCancel`/`cancelLabel` are ignored
 * in this mode since there's nothing to cancel.
 */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  infoOnly = false,
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
  /** Single-button acknowledgement mode -- see the doc comment above. */
  infoOnly?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="overlay" onClick={infoOnly ? onConfirm : onCancel}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
        <p className="small" style={{ marginTop: title ? 0 : undefined }}>{message}</p>
        <div className="row end" style={{ gap: 8, marginTop: 16 }}>
          {!infoOnly && <button className="btn-ghost" onClick={onCancel}>{cancelLabel}</button>}
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} autoFocus>
            {infoOnly ? (confirmLabel === 'Confirm' ? 'OK' : confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
