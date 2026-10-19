import { useEffect, useState } from 'react';
import { useEngine } from './useEngine';
import { NotificationEntry } from '../game/types';
import { TAB_LABELS } from './tabLabels';

/** How long a banner stays up before it's considered missed. Matches the
 *  CSS countdown-bar animation's own duration exactly (see
 *  .notification-banner-bar's keyframe in app.css) -- if either changes,
 *  the other has to change with it, since the bar is a purely visual
 *  CSS animation and this timer is what actually removes the banner.
 *  Doubled from 5000 -- the original window read as too quick to
 *  reliably catch and read before it auto-dismissed. */
const DISPLAY_MS = 10000;
/** Patch 0424 -- breathing room between queued banners. */
const BANNER_GAP_MS = 900;
const STALE_MS = 5 * 60_000;

/**
 * Pops up near the header the moment a genuinely new, banner-worthy entry
 * lands in the persistent notification log (state.notifications) --
 * separate from Toast.tsx's existing bottom-center popup, which fires for
 * every archived message regardless of whether it's worth a player's
 * attention (most are routine confirmations like "Sold."/"Repaired.").
 * "Banner-worthy" means `NotificationEntry.banner === true` -- today,
 * only GuidanceManager's one-time "how to"/unlock nudges set that (see
 * GameEngine.reportGuidance); everything else stays Toast-only.
 *
 * Which entry has already been shown is tracked in GameState
 * (state.lastBannerShownId, an id -- same shape notificationsSeenId
 * already uses), NOT component-local state. This is deliberate: a
 * component-lifecycle-only guard (e.g. a ref that's set on first mount)
 * only protects against replay within a single running session -- it
 * says nothing about whether this exact entry was already shown in a
 * PRIOR session, so a banner left unclicked-and-timed-out before the app
 * closed would otherwise re-display every single time the app reopens,
 * for as long as it remains the newest banner-worthy entry. Persisting
 * the "already shown" marker closes that gap entirely.
 *
 * This is tied into the header unread-count badge: clicking the banner
 * (or its own "Go to" target, if it has one) acknowledges it -- same as
 * opening the Guide's Notifications list or clicking the header icon --
 * but letting it simply time out unclicked deliberately does NOT
 * acknowledge it, so a missed banner still shows up as unread later.
 * That's the entire point of having both a banner AND a persistent
 * badge: the banner is a chance to catch it live, the badge is the
 * fallback for whenever that chance is missed. "Shown once" and
 * "acknowledged" are tracked completely independently for exactly this
 * reason -- see GameEngine.markBannerShown vs. markNotificationsSeen.
 */
export function NotificationBanner() {
  const engine = useEngine();
  const state = engine.state;

  // Patch 0424 -- banners now play as a queue, one at a time with a short
  // gap, instead of only ever showing the newest (which used to drop the
  // others when several guidance topics fired together). Pending = every
  // banner-worthy entry newer than the last one shown, oldest first.
  const markerIx = state.notifications.findIndex((n) => n.id === state.lastBannerShownId);
  const newer = markerIx >= 0 ? state.notifications.slice(0, markerIx) : state.notifications;
  const pending = [...newer].reverse().filter((n) => n.banner);
  // Anything older than a few minutes (left over from time in the idle
  // companion, where it already showed as a toast) is skipped, not replayed.
  const fresh = pending.filter((n) => Date.now() - n.timestamp <= STALE_MS);
  const lastStale = fresh.length < pending.length ? pending[pending.length - fresh.length - 1] : null;
  const next = fresh[0] ?? null;
  // Hold the queue while a card that should come first is on screen
  // (results, level-up, the Quest Board explainer, discovery...).
  const held = engine.levelUpBlocked || engine.levelUpQueue.length > 0 || !!state.pendingQuestBoardIntro;

  const [shown, setShown] = useState<NotificationEntry | null>(null);
  const [cooling, setCooling] = useState(false);

  useEffect(() => {
    if (lastStale && !fresh.length) engine.markBannerShown(lastStale.id);
    if (shown || cooling || held || !next) return;
    setShown(next);
    engine.markBannerShown(next.id);
  }, [next?.id, shown, cooling, held]);

  const finish = () => {
    setShown(null);
    setCooling(true);
    window.setTimeout(() => setCooling(false), BANNER_GAP_MS);
  };

  useEffect(() => {
    if (!shown) return undefined;
    const id = window.setTimeout(finish, DISPLAY_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  if (!shown) return null;

  // The dismiss itself (hiding the banner) is local UI state and must
  // always succeed the instant the button's clicked -- previously it ran
  // AFTER engine.markNotificationsSeen(), so any error thrown by that call
  // (a malformed notification entry, a save failure, anything) aborted
  // before setShown(null) ever ran, and the close button appeared to do
  // nothing at all. Reordered so the banner always closes first, with the
  // acknowledge side-effect now wrapped so it can never block that again.
  const acknowledge = () => {
    finish();
    try {
      engine.markNotificationsSeen();
    } catch (err) {
      console.error('Failed to mark notifications as seen:', err);
    }
  };

  const handleClick = () => {
    if (shown.targetTab) engine.requestTab(shown.targetTab, undefined, shown.targetSubTab);
    acknowledge();
  };

  return (
    <div key={shown.id} className="notification-banner" role="status">
      <button type="button" className="notification-banner-body" onClick={handleClick}>
        <span className="notification-banner-message">{shown.message}</span>
        {shown.targetTab && (
          <span className="tiny notification-banner-goto">Go to {TAB_LABELS[shown.targetTab] ?? shown.targetTab} →</span>
        )}
      </button>
      <button
        type="button"
        className="notification-banner-close"
        onClick={(e) => { e.stopPropagation(); acknowledge(); }}
        aria-label="Dismiss"
      >
        ×
      </button>
      <div className="notification-banner-bar" aria-hidden="true"><span /></div>
    </div>
  );
}
