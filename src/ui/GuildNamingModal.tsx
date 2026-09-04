import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import type { BackgroundMoodId } from '../game/settings';

/**
 * Blocking, non-dismissible prompt asking the player to name their guild.
 * Gated purely on state.guildName === '' -- this covers a brand-new save,
 * an old save migrated in before guildName existed, and a fresh hardReset()
 * (which recreates initial state, guildName included), so no separate
 * "isNew" plumbing is needed to decide when to show it.
 *
 * Deliberately has no overlay-click-to-dismiss and no close button -- unlike
 * QuestResultModal/OfflineReportModal, this isn't optional information, it's
 * a one-time setup step. App.tsx also holds the other modals back while this
 * is showing so nothing stacks behind it.
 */
export function GuildNamingModal({ onNeedsSpace }: { onNeedsSpace: () => Promise<void> | void }) {
  const engine = useEngine();
  const { update: updateSettings } = useSettings();
  const [draft, setDraft] = useState('');
  const unnamed = engine.state.guildName === '';
  const inputRef = useRef<HTMLInputElement>(null);
  // Two-step setup (patch 0305, direct request: "Guild's Mood" toggle
  // during first-time setup) -- 'name' first, then 'vibe'. Both steps
  // live in this one component/gate (unnamed) rather than splitting vibe
  // into its own separately-gated modal, since a second gate would need
  // its own "have we asked yet" flag persisted somewhere, and the guild
  // not being named yet is already exactly the right one-shot condition
  // for "this is a brand-new guild that hasn't finished setup." Picking a
  // name on step 1 no longer immediately calls setGuildName -- it now
  // only advances `step`, holding the trimmed name in `draft` (already
  // local state) until the vibe is picked too, since setGuildName is what
  // flips `unnamed` false and closes this modal entirely.
  const [step, setStep] = useState<'name' | 'vibe'>('name');

  // Forces full menu size before this modal has to render at all -- lives
  // here rather than in App.tsx specifically because this component
  // reliably re-renders whenever guildName changes (it's a normal
  // useEngine() consumer reading state directly), which an effect in
  // App.tsx keyed on [engine, changeMode] could not do: engine.hardReset()
  // reassigns state internally without ever changing the engine instance
  // itself, so that effect only ever fired once, on the very first boot.
  // Confirmed as the actual cause of the naming prompt getting trapped,
  // unusable, inside the tiny idle-companion window after a reset.
  //
  // Also owns the input's own focus now (folded in from a separate effect
  // that used to schedule it via requestAnimationFrame -- see below for
  // why that wasn't enough on its own). `onNeedsSpace` (App.tsx's
  // changeMode) now returns the actual promise from the
  // `window:setMode` IPC call, which only resolves once Electron's main
  // process has *finished* calling `win.setBounds(...)` -- so awaiting it
  // here means the window is guaranteed to already be at full menu size
  // before this ever tries to focus anything, not just "probably, if one
  // animation frame was enough time."
  //
  // The rAF-only version was a real, separate race from the hardReset one
  // above: on a genuinely fresh launch (not a reset), this modal first
  // mounts inside the tiny 260x300 idle-companion window, well under the
  // modal's own layout needs. A same-or-next-frame `.focus()` call could
  // fire while the window was still that tiny size (or mid-resize) --
  // the input existed in the DOM and *looked* focused, but real keyboard
  // input silently went nowhere, matching the reported "can't type until
  // pressing Escape first" (Escape, or any key, being enough to make
  // Chromium re-settle real focus once the window had actually finished
  // growing by then anyway). Awaiting the resize itself removes the
  // guesswork entirely instead of hoping one frame is always enough.
  useEffect(() => {
    if (!unnamed) return;
    let live = true;
    let raf: number | null = null;
    void Promise.resolve(onNeedsSpace()).then(() => {
      if (!live) return;
      // Still one rAF after the resize settles, not focusing immediately --
      // covers the *other* known race this modal can hit: "Start a new
      // guild" (StatsPanel) calls hardReset() from inside a
      // window.confirm() handler, and Chromium can still be mid-way
      // through returning window focus from that just-closed native
      // dialog at this exact instant. That race is independent of the
      // window-resize one above (the window's usually already at menu
      // size in that path, so the resize promise alone resolves near-
      // instantly) -- one rAF is enough to land after the dialog's own
      // focus restoration settles, same fix this modal already had before
      // the resize-await was added on top of it.
      raf = requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      live = false;
      if (raf !== null) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unnamed]);

  if (!unnamed) return null;

  const trimmed = draft.trim();

  const confirmName = () => {
    if (!trimmed) return;
    setStep('vibe');
  };

  const confirmVibe = (mood: BackgroundMoodId) => {
    updateSettings('backgroundMood', mood);
    engine.setGuildName(trimmed);
  };

  return (
    <div className="overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/*
          Placeholder for the guild's sprite/seal. A scroll-and-note-taker
          character is planned here -- sized and positioned so dropping the
          real art in later is a one-line swap, same fallback approach
          HeroSprite already uses for missing character art. Nothing else
          in this component needs to change when that lands.
        */}
        <div
          className="guild-naming-sprite-placeholder"
          style={{
            width: 96, height: 96, margin: '0 auto 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px dashed var(--panel-3)', borderRadius: 4, fontSize: 40,
          }}
          aria-hidden="true"
        >
          📜
        </div>

        {step === 'name' ? (
          <>
            <h3 style={{ textAlign: 'center' }}>What is your guild called?</h3>
            <p className="small muted" style={{ marginTop: 0, textAlign: 'center' }}>
              You can rename it later from the Dashboard.
            </p>

            <div className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
              <span className="tiny muted">Guild -</span>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                placeholder="Ironclad"
                maxLength={24}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmName(); }}
                style={{
                  flex: 1, background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
                  color: 'var(--parchment)', padding: '7px 8px',
                }}
              />
            </div>

            <div className="row end" style={{ marginTop: 16 }}>
              <button className="btn-primary" onClick={confirmName} disabled={!trimmed}>
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ textAlign: 'center' }}>What's your guild's vibe?</h3>
            <p className="small muted" style={{ marginTop: 0, textAlign: 'center' }}>
              Sets the look of every hall and tab -- changeable anytime later from Settings.
            </p>

            <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button
                className="btn-primary"
                onClick={() => confirmVibe('dim')}
                style={{ flex: 1, maxWidth: 130, padding: '14px 8px', textAlign: 'center' }}
                title="Candlelit halls, torchlit chambers -- the classic look"
              >
                🕯️<br />Moody
              </button>
              <button
                className="btn-primary"
                onClick={() => confirmVibe('bright')}
                style={{ flex: 1, maxWidth: 130, padding: '14px 8px', textAlign: 'center' }}
                title="Sunlit halls, daylight chambers -- a brighter take on the same guild"
              >
                ☀️<br />Bright
              </button>
              {/* System (patch 0309) -- added here alongside Moody/Bright
               *  rather than left Settings-only, so a new guild can pick
               *  the "just do it automatically" option on day one instead
               *  of discovering it later. */}
              <button
                className="btn-primary"
                onClick={() => confirmVibe('system')}
                style={{ flex: 1, maxWidth: 130, padding: '14px 8px', textAlign: 'center' }}
                title="Switches automatically -- bright by day, moody by night, off your own clock"
              >
                🕐<br />System
              </button>
            </div>

            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button className="btn-ghost tiny" onClick={() => setStep('name')}>
                ← Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
