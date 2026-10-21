import { useEffect, useRef, useState } from 'react';
import { useEngine } from './useEngine';
import { HeroManager } from '../game/managers/HeroManager';
import { CHAIN_BY_ID } from '../game/managers/QuestManager';
import { QUEST_CHAINS } from '../game/data/quests';
import { DEMO, DEMO_BUILD, DEMO_STORE_URL, DemoWallReason, demoAllowsChain, onDemoWall, requestDemoWall } from '../game/demo';

/**
 * Patch 0438 -- the demo build's wishlist card, and the small "Demo ·
 * Wishlist" badge in the menu titlebar. Both render nothing in the full
 * game (DEMO_BUILD is a compile-time constant, see demo.ts).
 *
 * Opening the store goes through the Electron main process
 * (`openStorePage`, which hands Steam a steam://store link so the page
 * opens inside the Steam client, where the Wishlist button is one click).
 * The browser build has no preload bridge, so it opens the web store page
 * in a new tab instead.
 */
export function openStorePage() {
  const bridge = window.littleKnight;
  if (bridge?.openStorePage) {
    void bridge.openStorePage();
    return;
  }
  window.open(DEMO_STORE_URL, '_blank', 'noopener');
}

function copyFor(reason: DemoWallReason): { kicker: string; title: string; body: string } {
  switch (reason.kind) {
    case 'rank':
      return {
        kicker: 'Demo limit reached',
        title: reason.name ? `${reason.name} goes further` : 'This upgrade goes further',
        body: `The demo stops every upgrade at rank ${DEMO.upgradeRankCap}. In the full game, every one of them can be built all the way up.`,
      };
    case 'unlock':
      return {
        kicker: 'Full game feature',
        title: reason.name ?? 'Not in the demo',
        body: "This one's waiting in the full game, along with Heroic and Mythic raids, the Auction House, and every story chain.",
      };
    case 'story': {
      const chain = CHAIN_BY_ID[DEMO.storyChainId];
      return {
        kicker: 'End of the demo story',
        title: chain ? `${chain.name} was only the beginning` : 'The story continues',
        body: `${QUEST_CHAINS.filter((c) => !demoAllowsChain(c.id)).length} more story chains wait in the full game: a keep to win and hold, a villain who never shows its face, and something very old at the bottom of the world. Your guild can keep playing here as long as you like.`,
      };
    }
    case 'level':
      return {
        kicker: 'Demo level cap',
        title: `Level ${DEMO.heroLevelCap} reached`,
        body: `Heroes stop at level ${DEMO.heroLevelCap} in the demo. The full game goes all the way to 55, with Legendary and Mythic contracts, raids and retirements along the way.`,
      };
    case 'badge':
    default:
      return {
        kicker: 'Guildbound Demo',
        title: 'Enjoying the guild?',
        body: `This demo includes one story chain, upgrades up to rank ${DEMO.upgradeRankCap} and heroes up to level ${DEMO.heroLevelCap}. Wishlist Guildbound on Steam to hear the moment the full game launches.`,
      };
  }
}

/** Lifetime "level cap card already shown" marker -- a light per-player
 *  convenience, so a guild that sits at the cap doesn't get the card on
 *  every launch. Losing it (private window, cleared storage) only means
 *  the card shows once more. */
const LEVEL_SEEN_KEY = 'guildbound-demo-level-card-seen';
function levelCardSeen(): boolean {
  try { return window.localStorage.getItem(LEVEL_SEEN_KEY) === '1'; } catch { return false; }
}
function markLevelCardSeen() {
  try { window.localStorage.setItem(LEVEL_SEEN_KEY, '1'); } catch { /* storage unavailable -- fine */ }
}

/**
 * Mounted once in App. `active` is the menu-is-open flag every other big
 * modal already uses -- a request that arrives while only the idle
 * companion window is showing waits here until the menu opens, rather
 * than rendering cropped inside the tiny window.
 */
export function DemoWallHost({ active }: { active: boolean }) {
  const engine = useEngine();
  const [reason, setReason] = useState<DemoWallReason | null>(null);

  useEffect(() => (DEMO_BUILD ? onDemoWall((r) => setReason(r)) : undefined), []);

  // First hero to hit the demo's level cap -> the card, once.
  const anyCapped = DEMO_BUILD && engine.state.heroes.some((h) => HeroManager.isMaxLevel(h));
  const firedRef = useRef(false);
  useEffect(() => {
    if (!anyCapped || firedRef.current || levelCardSeen()) return;
    firedRef.current = true;
    markLevelCardSeen();
    requestDemoWall({ kind: 'level' });
  }, [anyCapped]);

  if (!DEMO_BUILD || !active || !reason) return null;
  const copy = copyFor(reason);
  const close = () => setReason(null);
  return (
    <div className="overlay demo-wall-overlay" onClick={close}>
      <div className="modal demo-wall-modal" onClick={(e) => e.stopPropagation()}>
        <div className="demo-wall-kicker">{copy.kicker}</div>
        <h2 className="demo-wall-title">{copy.title}</h2>
        <p className="card-flavour">{copy.body}</p>
        <div className="row end" style={{ marginTop: 16, gap: 8 }}>
          <button onClick={close}>Keep playing</button>
          <button className="btn-yellow" onClick={() => { openStorePage(); close(); }}>Wishlist on Steam</button>
        </div>
      </div>
    </div>
  );
}

/** Titlebar badge -- always there in the demo, so the wishlist link is
 *  never more than one click away. */
export function DemoBadge() {
  if (!DEMO_BUILD) return null;
  return (
    <button className="demo-badge" onClick={() => requestDemoWall({ kind: 'badge' })} title="This is the Guildbound demo">
      Demo · Wishlist
    </button>
  );
}
