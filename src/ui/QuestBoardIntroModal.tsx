import { useEffect, useState } from 'react';
import { useEngine } from './useEngine';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../game/data/quests';
import { at } from './resultFx';
import { fxMs } from './purchaseFx';

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
 *
 * Patch 0424 -- rebuilt as an animated explainer, and moved after the
 * level-up card (result card -> level-up card -> this). The difficulty
 * ladder rises with "reward and loot up, odds down, time up", a sample
 * contract rolls a ⚡ Fast tag so its timer visibly shrinks and its odds
 * dip, and a "Next steps" checklist absorbs the potion and vendor tips
 * (engine.fireGuidance keeps those out of the banner queue while this is
 * pending), each with its own Go button.
 */

export function QuestBoardIntroModal({ onView, onClose }: { onView: () => void; onClose: () => void }) {
  const engine = useEngine();
  const heroName = engine.state.heroes[0]?.name ?? 'your hero';
  // The sample contract rolls Fast a beat after the ladder settles.
  const [fast, setFast] = useState(() => fxMs(1700) <= 0);
  useEffect(() => {
    if (fast) return undefined;
    const id = window.setTimeout(() => setFast(true), fxMs(1700));
    return () => window.clearTimeout(id);
  }, [fast]);

  const go = (tab: string) => {
    engine.requestTab(tab);
    onClose();
  };
  const steps = [
    ...(engine.state.hasObtainedConsumable
      ? [{ key: 'potion', a: 'Equip your Strength Potion', b: `From ${heroName}'s card in Heroes, before the next send`, label: 'Heroes', run: () => go('heroes') }]
      : []),
    { key: 'vendors', a: 'Have a look at the Vendors', b: 'Gear and supplies, if you want to kit out first', label: 'Vendors', run: () => go('vendors') },
    { key: 'send', a: `Send ${heroName} out again`, b: 'Several contracts are waiting on the board now', label: 'Quests', run: onView },
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal qbx-card" onClick={(e) => e.stopPropagation()}>
        <div className="qbx-kick">Your first job is done</div>
        <h3 style={{ marginTop: 2 }}>Reading the Quest Board</h3>
        <div className="qbx-cols">
          <div>
            <div className="qbx-ladder" aria-hidden="true">
              {DIFFICULTY_ORDER.map((d, i) => (
                <div key={d} className="qbx-rung">
                  <span className="qbx-bar" style={at(350 + i * 130, { height: `${22 + i * 19}%`, background: DIFFICULTIES[d].color })} />
                  <span className="qbx-nm" style={at(350 + i * 130)}>{DIFFICULTIES[d].label}</span>
                </div>
              ))}
            </div>
            <div className="qbx-axes" style={at(1050)}>
              <span className="up">▲ reward and loot</span><span className="dn">▼ odds, ▲ time</span>
            </div>
          </div>
          <div className={`qbx-sample ${fast ? 'fast' : ''}`}>
            <span className="qbx-tag">⚡ Fast</span>
            <b>A sample contract</b>
            <div className="qbx-row"><span>Normal</span><span className="t">⏱ {fast ? '18m' : '1h 30m'}</span><span className="o">{fast ? 61 : 78}% odds</span></div>
            <div className="qbx-why">
              {fast
                ? 'Fast is a rare roll on any difficulty: done in a fraction of the time, but the odds dip. A gamble, not a free bonus.'
                : 'Tap any contract to see its full odds, time and reward before you send anyone.'}
            </div>
          </div>
        </div>
        <div className="qbx-steps">
          <div className="qbx-h">Next steps</div>
          {steps.map((st, i) => (
            <div key={st.key} className="qbx-todo" style={at(2300 + i * 150)}>
              <span className="qbx-box" aria-hidden="true" />
              <span>{st.a}<small>{st.b}</small></span>
              <button className="btn-ghost" onClick={st.run}>{st.label}</button>
            </div>
          ))}
        </div>
        <div className="row end qbx-acts" style={at(2300 + steps.length * 150 + 200, { marginTop: 12, gap: 8 })}>
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={onView}>View Quest Board</button>
        </div>
      </div>
    </div>
  );
}
