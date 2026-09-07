import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';
import { backgroundSrc, BackgroundMoodId } from '../game/settings';

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
 *
 * Patch 0337, direct redesign request with a reference mockup attached:
 * full-bleed background art behind the whole card (the Guild Hall tab's own
 * under-construction scene, public/lore/panels/guildhall.jpg -- already
 * exists in both Moody and Bright versions, which is what makes the Mood
 * step's live preview below possible with zero new art), a real gold
 * frame, and dark semi-opaque text plaques instead of a plain compact
 * card. Replaces the old placeholder-sprite version entirely, not layered
 * on top of it.
 */
export function GuildNamingModal({ onNeedsSpace }: { onNeedsSpace: () => Promise<void> | void }) {
  const engine = useEngine();
  const { settings, update: updateSettings } = useSettings();
  const [draft, setDraft] = useState('');
  const unnamed = engine.state.guildName === '';
  const inputRef = useRef<HTMLInputElement>(null);
  // Three-step setup: 'name', then 'vibe' (patch 0305, direct request:
  // "Guild's Mood" toggle during first-time setup), then 'guide' (patch
  // 0330, direct tester feedback -- a non-idle-game player felt
  // overwhelmed by the amount of onboarding text, and asked for a way
  // for a more experienced player to skip it). All three steps live in
  // this one component/gate (unnamed) rather than splitting each into
  // its own separately-gated modal, since a second gate would need its
  // own "have we asked yet" flag persisted somewhere, and the guild not
  // being named yet is already exactly the right one-shot condition for
  // "this is a brand-new guild that hasn't finished setup." Picking a
  // name on step 1 no longer immediately calls setGuildName -- it now
  // only advances `step`, holding the trimmed name in `draft` (already
  // local state) until the vibe and guide preference are picked too,
  // since setGuildName is what flips `unnamed` false and closes this
  // modal entirely.
  const [step, setStep] = useState<'name' | 'vibe' | 'guide'>('name');
  // Patch 0337, direct request: "clicking any of those will swap the
  // background so you can see an example take place" + "clicking mood
  // shouldnt auto next page, need to confirm." Seeded from the real
  // current setting so Name/Guide already show whatever mood the
  // player's device already prefers, then updated LIVE the instant a
  // Mood option is clicked on the vibe step -- but only ever written
  // back to the real setting (updateSettings) when Next is actually
  // pressed, in confirmVibe below. Backing out via Back after previewing
  // a mood without confirming leaves the real setting untouched.
  const [previewMood, setPreviewMood] = useState<BackgroundMoodId>(settings.backgroundMood);

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

  // Commits the previewed mood to the real setting, only now -- see
  // previewMood's own comment above for why this is separate from
  // picking it.
  const confirmVibe = () => {
    updateSettings('backgroundMood', previewMood);
    setStep('guide');
  };

  // Order matters: setGuidedOnboarding has to run while guildName is
  // still '' so its own "is this initial setup" check (see its comment
  // in engine.ts) can tell this call apart from a later Settings toggle
  // and swap the seeded Tutorial Quest board for an ordinary one when
  // guided is false. setGuildName is what closes this modal, so it has
  // to run second either way.
  const confirmGuide = (guided: boolean) => {
    engine.setGuidedOnboarding(guided);
    engine.setGuildName(trimmed);
  };

  const bgSrc = backgroundSrc('./lore/panels/guildhall.jpg', previewMood);

  return (
    <div className="overlay">
      <div
        className="guild-naming-card"
        style={{ backgroundImage: `url(${bgSrc})` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="guild-naming-content">
          {step === 'name' ? (
            <>
              <div className="guild-naming-textbox guild-naming-textbox-title">
                <h3 style={{ margin: 0 }}>What is your guild called?</h3>
              </div>
              <div className="guild-naming-textbox guild-naming-textbox-sub">
                <p className="small muted" style={{ margin: 0 }}>You can rename it later from the Dashboard.</p>
              </div>

              <div className="guild-naming-textbox guild-naming-input-row">
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

              <div className="row end" style={{ marginTop: 4 }}>
                <button className="btn-primary" onClick={confirmName} disabled={!trimmed}>
                  Next
                </button>
              </div>
            </>
          ) : step === 'vibe' ? (
            <>
              <div className="guild-naming-textbox guild-naming-textbox-title">
                <h3 style={{ margin: 0 }}>What's your guild's vibe?</h3>
              </div>
              <div className="guild-naming-textbox guild-naming-textbox-sub">
                <p className="small muted" style={{ margin: 0 }}>
                  Sets the look of every hall and tab -- pick one to see it take effect right here.
                  Changeable anytime later from Settings.
                </p>
              </div>

              <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 4 }}>
                <button
                  className={`btn-primary guild-naming-mood-btn ${previewMood === 'dim' ? 'selected' : ''}`}
                  onClick={() => setPreviewMood('dim')}
                  title="Candlelit halls, torchlit chambers -- the classic look"
                >
                  🕯️<br />Moody
                </button>
                <button
                  className={`btn-primary guild-naming-mood-btn ${previewMood === 'bright' ? 'selected' : ''}`}
                  onClick={() => setPreviewMood('bright')}
                  title="Sunlit halls, daylight chambers -- a brighter take on the same guild"
                >
                  ☀️<br />Bright
                </button>
                {/* System (patch 0309) -- added here alongside Moody/Bright
                 *  rather than left Settings-only, so a new guild can pick
                 *  the "just do it automatically" option on day one instead
                 *  of discovering it later. Previewed the same as the other
                 *  two (resolveBackgroundMood picks Moody or Bright off the
                 *  player's own clock, same helper backgroundSrc itself
                 *  uses) rather than a special-cased third preview path. */}
                <button
                  className={`btn-primary guild-naming-mood-btn ${previewMood === 'system' ? 'selected' : ''}`}
                  onClick={() => setPreviewMood('system')}
                  title="Switches automatically -- bright by day, moody by night, off your own clock"
                >
                  🕐<br />System
                </button>
              </div>

              <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <button className="btn-ghost tiny" onClick={() => setStep('name')}>
                  ← Back
                </button>
                <button className="btn-primary" onClick={confirmVibe}>
                  Next
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Guide-mode step (patch 0330). Deliberately plain yes/no
               *  rather than a Segmented/THEMES-style picker -- this isn't a
               *  cosmetic preference, it's "how much hand-holding do you
               *  want," and framing it as two big buttons (matching
               *  QuestResultModal's own outcome-choice weight) reads more
               *  like a real decision than a settings row would. */}
              <div className="guild-naming-textbox guild-naming-textbox-title">
                <h3 style={{ margin: 0 }}>Do you need a guide to your guild?</h3>
              </div>
              <div className="guild-naming-textbox guild-naming-textbox-sub">
                <p className="small muted" style={{ margin: 0 }}>
                  A short walkthrough covers the basics on your first quest. You can turn it
                  back on or off anytime from Settings.
                </p>
              </div>

              <div className="row" style={{ gap: 10, justifyContent: 'center', marginTop: 4 }}>
                <button
                  className="btn-primary guild-naming-mood-btn"
                  onClick={() => confirmGuide(true)}
                  title="Show a short walkthrough and helpful nudges as you play"
                >
                  🧭<br />Guide me
                </button>
                <button
                  className="btn-primary guild-naming-mood-btn"
                  onClick={() => confirmGuide(false)}
                  title="Skip the walkthrough -- jump straight into a normal quest board"
                >
                  ⚔️<br />I've got this
                </button>
              </div>

              <div className="row" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
                <button className="btn-ghost tiny" onClick={() => setStep('vibe')}>
                  ← Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
