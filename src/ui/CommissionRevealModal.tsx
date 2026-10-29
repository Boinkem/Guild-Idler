import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { at } from './resultFx';
import { fxMs } from './purchaseFx';
import { RARITY_BANNER, RARITY_COLOR, RARITY_ORDER } from '../game/util';
import { VENDORS } from '../game/data/progression';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { COMMISSION_CRATE_MARK, COMMISSION_MATERIAL, COMMISSION_SIGIL, COMMISSION_TITLE } from '../game/data/commissions';

/** Same backdrops the vendor pages use (VendorsPanel's own map). */
const VENDOR_BG: Record<string, string> = {
  blacksmith: './lore/vendors/blacksmith.jpg',
  alchemist: './lore/vendors/alchemist.jpg',
  enchanter: './lore/vendors/enchanter.jpg',
};

/** End points for the crate's wood splinters (px, px, deg). */
const SPLINTERS = 10;

/**
 * Patch 0455 -- the commission hand-in moment, signed off as an
 * interactive demo before it was built. Reads engine.lastCommission and
 * renders nothing when it's null, same transient shape HatchRevealModal
 * uses for engine.lastHatchedPet.
 *
 * Beats, all on one --fx-t timeline (resultFx `at()`):
 *  1. the order slip drops in and is stamped FULFILLED, then lifts away;
 *  2. a crate stencilled with the vendor's mark drops and shakes -- longer
 *     for rarer rolls, like the egg;
 *  3. the lid blows off (flash, splinters, a jolt of the whole card);
 *     a reward card shoots up face-down, spins and lands face-up with a
 *     shockwave, a shine sweep and a second jolt, then floats.
 * Rarer rolls add rays (Uncommon+), an aura, orbiting sparks and a second
 * shockwave (Uncommon+), foil and glints (Epic+), falling gold (Legendary).
 * Every root class contains "fx-", so Reduce motion lands on the final frame.
 */
export function CommissionRevealModal() {
  const engine = useEngine();
  const reward = engine.lastCommission;
  const joltRef = useRef<HTMLDivElement>(null);

  const extra = reward ? Math.max(0, RARITY_ORDER.indexOf(reward.rarity) - 1) : 0;
  const shake = 1100 + extra * 260;
  const T = { slip: 120, stamp: 760, crate: 1380, shake: 1820, burst: 1820 + shake, land: 0 };
  T.land = T.burst + 80 + 1150;

  // Two screen jolts: when the lid blows, and when the card lands. Driven
  // from JS so they re-trigger on the card itself; skipped with motion off
  // (fxMs returns 0 at --anim-speed 0).
  useEffect(() => {
    if (!reward) return undefined;
    const burst = fxMs(T.burst);
    const land = fxMs(T.land);
    if (!burst) return undefined;
    // Restart the jolt on a wrapper, not the card itself, so the card's
    // own entrance animation is never re-run.
    const jolt = () => {
      const el = joltRef.current;
      if (!el) return;
      el.classList.remove('cmfx-jolt');
      void el.offsetWidth;
      el.classList.add('cmfx-jolt');
    };
    const a = window.setTimeout(jolt, burst);
    const b = window.setTimeout(jolt, land);
    return () => { window.clearTimeout(a); window.clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reward]);

  if (!reward) return null;

  const vendor = VENDORS.find((v) => v.id === reward.vendorId);
  const vendorName = vendor?.name ?? reward.vendorId;
  const materialName = MATERIAL_BY_ID[COMMISSION_MATERIAL[reward.vendorId]]?.name ?? 'Materials';
  const color = RARITY_COLOR[reward.rarity];
  const close = () => engine.dismissCommission();
  const goToInventory = () => { engine.requestTab('equipment'); engine.dismissCommission(); };
  const orbitCount = 4 + extra * 2;

  return (
    <div className="overlay" onClick={close}>
      <div ref={joltRef} className="cmfx-joltbox">
      <div
        className="modal cmfx-reveal"
        style={{ color } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmfx-stage" aria-hidden="true">
          <div className="cmfx-bg" style={{ backgroundImage: `url(${VENDOR_BG[reward.vendorId]})` }} />
          <div className="cmfx-vignette" />
          {extra > 0 && <span className="cmfx-rays" style={at(T.burst)} />}

          <div className="cmfx-slip" style={at(T.slip)}>
            <div className="cmfx-slip-k">{vendorName} commission</div>
            <div className="cmfx-slip-t">{COMMISSION_TITLE[reward.vendorId]}</div>
            <div className="cmfx-slip-line"><span>Scrap</span><span>{reward.scrapSpent.toLocaleString()}</span></div>
            <div className="cmfx-slip-line"><span>{materialName}</span><span>{reward.materialSpent.toLocaleString()}</span></div>
            <span className="cmfx-stamp" style={at(T.stamp)}>FULFILLED</span>
          </div>

          <span className="cmfx-shadow" style={at(T.crate + 300)} />
          <div className="cmfx-crate" style={at(T.crate)}>
            <div className="cmfx-crate-shake" style={at(T.shake, { ['--cmfx-shake' as string]: `calc(var(--fx-t) * ${shake})` })}>
              <div className="cmfx-crate-gone" style={at(T.burst + 160)}>
                <div className="cmfx-crate-box" data-mark={COMMISSION_CRATE_MARK[reward.vendorId]} />
              </div>
              <div className="cmfx-crate-lid" style={at(T.burst)} />
            </div>
          </div>
          {Array.from({ length: Math.min(SPLINTERS, 6 + extra * 2) }, (_, i) => (
            <span key={i} className={`cmfx-splinter s${i}`} style={at(T.burst)} />
          ))}

          <span className="cmfx-glow" style={at(T.burst + 60)} />
          <div className="cmfx-rise" style={at(T.burst + 80)}>
            <div className="cmfx-float" style={at(T.land + 400)}>
              {extra >= 1 && <span className="cmfx-aura" style={at(T.land)} />}
              <div className="cmfx-spin" style={at(T.burst + 80)}>
                <div className="cmfx-back" data-sigil={COMMISSION_SIGIL[reward.vendorId]} />
                <div className="cmfx-face">
                  <div className="cmfx-banner" style={{ backgroundImage: `url(${RARITY_BANNER[reward.rarity]})` }} />
                  <div className="cmfx-art">
                    <RewardArt icon={reward.icon} glyph={reward.glyph} />
                    {reward.qty > 1 && <span className="cmfx-qty">×{reward.qty}</span>}
                  </div>
                  <div className="cmfx-name">{reward.name}</div>
                  <span className="cmfx-pill">{reward.rarity}</span>
                  {extra >= 2 && <span className="cmfx-foil" />}
                  <span className="cmfx-shine" style={at(T.land)} />
                  <span className="cmfx-shine again" style={at(T.land + 1800)} />
                </div>
              </div>
            </div>
          </div>
          <span className="cmfx-shock" style={at(T.land)} />
          {extra >= 1 && <span className="cmfx-shock" style={at(T.land + 140)} />}
          {extra >= 1 && (
            <span className="cmfx-orbit">
              {Array.from({ length: orbitCount }, (_, i) => {
                const a = (i / orbitCount) * Math.PI * 2;
                return <i key={i} style={at(T.land + i * 60, { left: Math.round(Math.cos(a) * 112), top: Math.round(Math.sin(a) * 100) })} />;
              })}
            </span>
          )}
          {extra >= 2 && Array.from({ length: 4 + extra * 2 }, (_, i) => (
            <span key={i} className="cmfx-glint" style={at(T.land + 120 + i * 140, { left: `${22 + ((i * 37) % 56)}%`, top: `${12 + ((i * 23) % 52)}%` })} />
          ))}
          {reward.rarity === 'legendary' && Array.from({ length: 26 }, (_, i) => (
            <span key={i} className="cmfx-coin" style={at(T.land + ((i * 97) % 900), { left: `${(i * 37) % 100}%` })} />
          ))}
          <span className="cmfx-flash" style={at(T.burst)} />
        </div>

        <div className="cmfx-kick cmfx-late" style={at(T.land + 150)}>{vendorName} · Level {reward.level}</div>
        <h3 className="cmfx-title" style={at(T.land + 250)}>Commission Complete!</h3>
        <div className="cmfx-late" style={at(T.land + 500)}>
          <span className="cmfx-rep small">Rep with {vendorName} <b>+{reward.rep.toLocaleString()}</b></span>
        </div>
        <div className="row cmfx-late" style={at(T.land + 750, { justifyContent: 'center', gap: 8, marginTop: 14 })}>
          <button className="btn-primary" onClick={close}>Close</button>
          {reward.kind !== 'gem' && <button className="btn-primary" onClick={goToInventory}>Go to Inventory</button>}
        </div>
        <p className="tiny muted cmfx-late" style={at(T.land + 900, { margin: '10px 0 0' })}>
          A new commission from {vendorName} tomorrow.
        </p>
      </div>
      </div>
    </div>
  );
}

/** The reward's own art, or its glyph if there's no icon (gems) or the file is missing. */
function RewardArt({ icon, glyph }: { icon?: string; glyph: string }) {
  const [failed, setFailed] = useState(false);
  if (icon && !failed) return <img src={`./item-icons/${icon}`} alt="" onError={() => setFailed(true)} />;
  return <span className="cmfx-glyph">{glyph}</span>;
}
