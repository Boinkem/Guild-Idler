/**
 * Patch 0332. Fires the moment the scripted tutorial quest resolves and
 * the board becomes a real, ordinary multi-offer one for the first time
 * -- see GameState.pendingQuestBoardIntro's own comment for the full
 * trigger reasoning. Same "promote a guidance moment to a standalone
 * modal instead of a toast" treatment ChainDiscoveryModal already
 * established for the first quest chain discovery -- this is the direct
 * replacement for what used to be a forced, single guaranteed Fast offer
 * on that same second board (retired: "I only disagree on the forced
 * second quest, that was my mistake"). Only ever shown when
 * guidedOnboarding is true (set by QuestManager.resolve before this ever
 * arms), so an experienced player who opted out never sees it.
 */
export function QuestBoardIntroModal({ onView, onClose }: { onView: () => void; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Reading the Quest Board</h3>
        <p className="small" style={{ marginTop: 0 }}>
          From here on your board fills with several contracts at once, across five difficulties -- Easy through
          Legendary. Harder difficulties pay more and drop better loot, but run longer and succeed less often.
          Tap any card to see its full odds, time, and reward before sending anyone.
        </p>
        <p className="small">
          Watch for the <b>⚡ Fast</b> tag -- a rare roll on any difficulty that finishes in a fraction of the
          normal time, still worth a real reward. It can turn up anywhere, so keep an eye on the board.
        </p>
        <div className="row end" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn-primary" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={onView}>View Quest Board</button>
        </div>
      </div>
    </div>
  );
}
