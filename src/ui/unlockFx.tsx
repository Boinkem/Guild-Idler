import { useRecentIncrease } from './purchaseFx';

/**
 * Patch 0421 -- one shared moment for every one-time unlock (High Roller,
 * Grimsby's permanent spot, the Trade Route, the Gold-for-Renown
 * Exchange), mocked up and signed off on the Design canvas first.
 *
 * The engine flips the flag instantly, so this plays over the card's
 * *unlocked* content: a locked veil covers it, the padlock rattles, its
 * shackle springs and it drops away while the chains across the card
 * snap, then the veil dissolves, an UNLOCKED banner unfurls and a light
 * sweeps across. See .fx-unlock in app.css. The host element needs the
 * `fx-unlock-host` class (positioned, clipped).
 */
export function useJustUnlocked(key: string, unlocked: boolean): boolean {
  return !!useRecentIncrease([{ id: key, value: unlocked ? 1 : 0 }], 2200)[key];
}

export function UnlockFx() {
  return (
    <span className="fx-unlock" aria-hidden="true">
      <span className="fx-unlock-veil">
        <span className="fx-unlock-chain a"><i /><i /></span>
        <span className="fx-unlock-chain b"><i /><i /></span>
        <span className="fx-unlock-lock"><span className="fx-unlock-shackle" /><span className="fx-unlock-body" /></span>
      </span>
      <span className="fx-unlock-banner">UNLOCKED</span>
      <span className="fx-unlock-sweep" />
    </span>
  );
}
