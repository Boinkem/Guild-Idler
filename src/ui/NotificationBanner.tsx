import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { NotificationEntry } from '../game/types';
import { TAB_LABELS } from './tabLabels';

/** How long a banner stays up before it's considered missed. Matches the
 *  CSS countdown-bar animation's own duration exactly (see
 *  .notification-banner-bar's keyframe in app.css) -- if either changes,
 *  the other has to change with it, since the bar is a purely visual
 *  CSS animation and this timer is what actually removes the banner. */
const DISPLAY_MS = 5000;

/**
 * Pops up near the header the moment a genuinely NEW entry lands in the
 * persistent notification log (state.notifications) -- separate from
 * Toast.tsx's existing bottom-center popup, which fires for every say()
 * call regardless of whether it's worth a player's attention (most
 * toasts are routine confirmations like "Sold."/"Repaired."). This is
 * specifically the "worth surfacing prominently" layer, tied into the
 * header unread-count badge: clicking the banner (or its own "Go to"
 * target, if it has one) acknowledges it -- same as opening the Guide's
 * Notifications list or clicking the header icon -- but letting it
 * simply time out unclicked deliberately does NOT acknowledge it, so a
 * missed banner still shows up as unread later. That's the entire point
 * of having both a banner AND a persistent badge: the banner is a
 * chance to catch it live, the badge is the fallback for whenever that
 * chance is missed.
 */
export function NotificationBanner() {
  const engine = useEngine();
  const state = engine.state;
  const topId = state.notifications[0]?.id ?? null;

  const [shown, setShown] = useState<NotificationEntry | null>(null);
  // Guards against bannering whatever notification already happens to be
  // at the top of the log the first time this component ever mounts
  // (app launch) -- only a notification that arrives WHILE this has been
  // watching counts as new. Same "prev === null on first render, never
  // fires" shape as every other change-detecting hook built this session
  // (useMaxFlash, useLevelUpFlash, usePulsesOnChange).
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (topId === null) return;
    setShown(state.notifications[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topId]);

  useEffect(() => {
    if (!shown) return undefined;
    const id = window.setTimeout(() => setShown(null), DISPLAY_MS);
    return () => window.clearTimeout(id);
  }, [shown]);

  if (!shown) return null;

  const acknowledge = () => {
    engine.markNotificationsSeen();
    setShown(null);
  };

  const handleClick = () => {
    if (shown.targetTab) engine.requestTab(shown.targetTab);
    acknowledge();
  };

  return (
    <div key={shown.id} className="notification-banner" role="status">
      <button className="notification-banner-body" onClick={handleClick}>
        <span className="notification-banner-message">{shown.message}</span>
        {shown.targetTab && (
          <span className="tiny notification-banner-goto">Go to {TAB_LABELS[shown.targetTab] ?? shown.targetTab} →</span>
        )}
      </button>
      <button className="notification-banner-close" onClick={acknowledge} aria-label="Dismiss">×</button>
      <div className="notification-banner-bar" aria-hidden="true"><span /></div>
    </div>
  );
}
