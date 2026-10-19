/**
 * The dedicated "you busted" interstitial, shared across all three of
 * Grimsby's games (Card, both Dice sub-games, Tab) -- patch 0261, direct
 * request: a bust used to just fall straight back through to the next
 * playable state automatically (Tab's tier-select screen reappearing the
 * instant a run busted; Dice's picker staying visible the whole time with
 * only a small inline "Bust." line to notice) rather than landing on a
 * distinct, deliberate moment the player has to click through. This is
 * that moment -- bold, unmissable, and gated behind a manual "Go Again"
 * rather than resolving itself.
 *
 * Deliberately its own tiny component rather than three near-identical
 * inline blocks -- the "big red BUST card" IS the shared concept across
 * all three games; only the subtitle text and what Go Again actually
 * does differ per game, both passed in rather than hardcoded here.
 */
export function GrimsbyBustCard({
  subtitle, onGoAgain, goAgainDisabled, goAgainTitle,
}: {
  subtitle: string;
  onGoAgain: () => void;
  goAgainDisabled?: boolean;
  goAgainTitle?: string;
}) {
  return (
    <div className="grimsby-bust-card">
      {/* Patch 0421 -- the letters drop in one at a time and land a little
          crooked (see .grimsby-bust-card-label > span in app.css). Shared
          by all three games, so Dice and Tab busts get it too. */}
      <div className="grimsby-bust-card-label" aria-label="Bust">
        {'BUST'.split('').map((ch, i) => <span key={i} aria-hidden="true">{ch}</span>)}
      </div>
      <p className="grimsby-bust-card-subtitle tiny">{subtitle}</p>
      <button
        type="button"
        className="btn-purple"
        onClick={onGoAgain}
        disabled={goAgainDisabled}
        title={goAgainTitle}
      >
        Go Again
      </button>
    </div>
  );
}
