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
  // Newest entry that's actually banner-worthy -- not necessarily
  // notifications[0] itself, since a routine (non-banner) message could
  // have landed more recently without displacing this from being the
  // thing that still deserves the top banner.
  const latestBanner = state.notifications.find((n) => n.banner) ?? null;

  const [shown, setShown] = useState<NotificationEntry | null>(null);

  useEffect(() => {
    if (!latestBanner) return;
    if (latestBanner.id === state.lastBannerShownId) return;
    setShown(latestBanner);
    engine.markBannerShown(latestBanner.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestBanner?.id]);

  useEffect(() => {
    if (!shown) return undefined;
    const id = window.setTimeout(() => setShown(null), DISPLAY_MS);
    return () => window.clearTimeout(id);
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
    setShown(null);
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
