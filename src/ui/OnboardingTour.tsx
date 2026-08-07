import { useEffect, useLayoutEffect, useState } from 'react';

interface Step {
  id: string;
  label: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** One short line per tab -- deliberately terse, this is a tour, not
 *  documentation. Falls back to nothing (just the tab's own label shows)
 *  for any tab id that isn't listed, so a future new tab never breaks
 *  this rather than needing to be added here first. */
const STEP_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Your guild's home base -- a quick overview of heroes, vendors, and progress.",
  heroes: 'Recruit and manage your heroes here -- stats, gear, and skins.',
  equipment: 'Everything your guild owns: worn gear, the stash, and consumables.',
  vendors: 'The Blacksmith, Alchemist, and Enchanter -- buy gear and supplies, or craft your own.',
  guild: 'Guild Hall: permanent facility and general upgrades that apply to every hero.',
  harvest: 'Idle heroes gather materials here too -- click a shiny while it lasts, then spend the stock crafting with a vendor.',
  quests: 'Send heroes out on contracts here. New ones appear every 30 minutes.',
  raids: 'Multi-hero expeditions, once your guild is strong enough to field a whole party.',
  lore: "A record of every story your guild has lived through.",
  guide: "A running log of what's happened, plus a quick reference for how things work.",
  prestige: 'Retire a hero for Renown, spent on permanent guild-wide perks.',
  stats: 'Lifetime stats and achievements, if you like keeping score.',
  settings: 'Appearance, sound, and other preferences.',
};

function measure(tabId: string): Rect | null {
  const el = document.querySelector(`[data-tab-id="${tabId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * A scripted, one-time first-run tour -- a spotlight box positioned exactly
 * over each nav tab in turn. The "dim everything else" effect comes free
 * from a single oversized box-shadow on the spotlight box itself, rather
 * than a separate full-screen overlay element with a cutout.
 *
 * Restarts from the beginning if the app closes mid-tour rather than
 * resuming a saved step -- seenOnboarding only ever flips true on
 * completion or Skip, never partway through. The tour is short enough
 * that this is simpler than persisting resume state and not a real cost.
 */
export function OnboardingTour({
  steps, onTabChange, onDone,
}: { steps: Step[]; onTabChange: (id: string) => void; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[index];

  useLayoutEffect(() => {
    if (!step) return undefined;
    onTabChange(step.id);
    // One frame's delay so the measurement reflects whatever the panel
    // switch itself settles into, not a stale layout from the prior step.
    const raf = requestAnimationFrame(() => setRect(measure(step.id)));
    return () => cancelAnimationFrame(raf);
    // Deliberately keyed on index alone -- onTabChange/step are stable in
    // spirit (same steps array, same callback) even if their references
    // aren't memoized by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    const recompute = () => setRect(step ? measure(step.id) : null);
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  if (!step) return null;

  const isLast = index === steps.length - 1;
  const next = () => { if (isLast) onDone(); else setIndex((i) => i + 1); };
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Card sits just below the spotlight by default, flipping above it if
  // that would run off the bottom of the window -- worth checking given
  // the menu window is user-resizable now, not a fixed size to design for.
  const cardTop = rect
    ? (rect.top + rect.height + 160 > window.innerHeight ? rect.top - 150 : rect.top + rect.height + 10)
    : 40;
  const cardLeft = rect ? Math.min(Math.max(rect.left, 12), window.innerWidth - 280) : 12;

  return (
    <>
      {rect && (
        <div
          className="onboarding-spotlight"
          style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      )}
      <div className="onboarding-card" style={{ top: cardTop, left: cardLeft }}>
        <div className="tiny muted" style={{ marginBottom: 4 }}>Step {index + 1} of {steps.length}</div>
        <div className="card-title" style={{ marginBottom: 6 }}>{step.label}</div>
        <p className="small" style={{ margin: '0 0 12px' }}>{STEP_DESCRIPTIONS[step.id] ?? ''}</p>
        <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
          <button className="btn-ghost" onClick={onDone}>Skip</button>
          <div className="row" style={{ gap: 6 }}>
            {index > 0 && <button className="btn-ghost" onClick={back}>Back</button>}
            <button className="btn-primary" onClick={next}>{isLast ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
