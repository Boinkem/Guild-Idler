import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useEngine } from './useEngine';
import { EggIcon } from './EggIcon';
import { PetSprite } from './sprites/PetSprite';
import { DlcManager } from '../game/managers/DlcManager';
import { playSound } from '../game/sound';
import { at } from './resultFx';
import type { DlcGrantNotice } from '../game/types';

/**
 * Patch 0442 -- the DLC thank-you card. A DLC grant (today: the Founder's
 * Pack Ruby Dragonling egg + "The Founding Flame" guild title) used to land
 * silently in the save; now engine.currentDlcGrant surfaces it here once
 * every result/offline/hatch popup ahead of it has been dismissed, and the
 * Level-Up card waits on it in turn.
 *
 * Timeline (1x ms, Settings > Animation speed scales it, Reduce motion
 * shows the final frame -- root classes contain "fx-"):
 *    0 card drops in            200 "DLC unlocked" + pack ribbon unfurls
 *  450 egg drops into the nest   900 egg wobbles, rays + sparks
 * 1150 pet preview glints in    1400 egg row slides in
 * 1750 title row, banner stamps 2150 thank-you line + buttons
 *
 * Compact (idle companion window): a short version with "Open guild",
 * which plays the full card in the menu -- same split as LevelUpModal.
 */
export function DlcGrantModal({ active, compact = false, onOpenMenu }: { active: boolean; compact?: boolean; onOpenMenu?: () => void }) {
  const engine = useEngine();
  const grant = engine.currentDlcGrant;
  if (!grant) return null;
  if (compact) return <DlcGrantCompact key={`${grant.packId}:c`} grant={grant} onOpenMenu={onOpenMenu} />;
  if (!active) return null;
  return <DlcGrantCard key={`${grant.packId}:m`} grant={grant} />;
}

function DlcGrantCard({ grant }: { grant: DlcGrantNotice }) {
  const engine = useEngine();
  const hatcheryOpen = engine.state.hatcheryUnlocked;
  const petDef = grant.egg ? DlcManager.petDef(grant.egg.petId) : undefined;
  useEffect(() => { playSound('legendary_drop'); }, []);

  const close = () => engine.dismissDlcGrant();
  const goHatchery = () => {
    engine.requestTab('hatchery');
    engine.dismissDlcGrant();
  };

  return (
    <div className="overlay dlcfx-overlay" onClick={close}>
      <div className="modal dlcfx-card" role="dialog" aria-label={`${grant.packName} unlocked`} onClick={(e) => e.stopPropagation()}>
        <div className="dlcfx-kicker" style={at(200)}>DLC unlocked</div>
        <div className="dlcfx-ribbon" style={at(260)}><span>{grant.packName}</span></div>

        {grant.egg && (
          <div className="dlcfx-stage" aria-hidden="true">
            <span className="dlcfx-rays" style={at(900)} />
            <span className="dlcfx-glow" style={at(450)} />
            <span className="dlcfx-spark s1" style={at(1000)} />
            <span className="dlcfx-spark s2" style={at(1250)} />
            <span className="dlcfx-spark s3" style={at(1500)} />
            {petDef && (
              <span className="dlcfx-preview" style={at(1150)}>
                <PetSprite species={petDef.spriteFolder} rarity={grant.egg.rarity} animation="idle" flip height={128} title={petDef.name} />
              </span>
            )}
            <span className="dlcfx-egg" style={at(450)}>
              <span className="dlcfx-egg-wob" style={at(900)}><EggIcon rarity={grant.egg.rarity} size={76} /></span>
            </span>
            <span className="hfx-nest dlcfx-nest" />
          </div>
        )}

        <div className="dlcfx-items">
          {grant.egg && (
            <div className="dlcfx-item" style={at(1400)}>
              <span className="dlcfx-item-ico"><EggIcon rarity={grant.egg.rarity} size={28} /></span>
              <span className="dlcfx-item-body">
                <span className="dlcfx-item-k">Pet egg</span>
                <span className="dlcfx-item-v">{grant.egg.petName}</span>
                <span className="dlcfx-item-n">
                  {hatcheryOpen ? 'Waiting in your Hatchery storage.' : "Waiting in storage -- it's ready the moment you unlock the Hatchery."}
                </span>
              </span>
            </div>
          )}
          {grant.guildTitle && (
            <div className="dlcfx-item" style={at(1750)}>
              <span className="dlcfx-item-ico dlcfx-flame" aria-hidden="true">🔥</span>
              <span className="dlcfx-item-body">
                <span className="dlcfx-item-k">Guild title</span>
                <span className="dlcfx-banner" style={at(1850)}>{grant.guildTitle}</span>
                <span className="dlcfx-item-n">Now shown under {engine.state.guildName || 'your guild'}'s name.</span>
              </span>
            </div>
          )}
        </div>

        <p className="dlcfx-thanks" style={at(2150)}>Thank you for supporting Guildbound!</p>
        <div className="dlcfx-actions" style={at(2250)}>
          {grant.egg && hatcheryOpen && <button type="button" className="btn-ghost" onClick={goHatchery}>Go to Hatchery</button>}
          <button type="button" className="btn-primary" onClick={close} autoFocus>Wonderful!</button>
        </div>
      </div>
    </div>
  );
}

function DlcGrantCompact({ grant, onOpenMenu }: { grant: DlcGrantNotice; onOpenMenu?: () => void }) {
  const engine = useEngine();
  useEffect(() => { playSound('legendary_drop'); }, []);
  return (
    <div className="dlcfx-compact" role="dialog" aria-label={`${grant.packName} unlocked`}>
      <span className="dlcfx-rays dlcfx-c-rays" aria-hidden="true" />
      <div className="dlcfx-kicker" style={at(150)}>DLC unlocked</div>
      <div className="dlcfx-ribbon dlcfx-c-ribbon" style={at(220)}><span>{grant.packName}</span></div>
      {grant.egg && (
        <div className="dlcfx-c-egg" style={at(450)} aria-hidden="true">
          <span className="dlcfx-egg-wob" style={{ ...at(800), display: 'inline-block' } as CSSProperties}><EggIcon rarity={grant.egg.rarity} size={64} /></span>
        </div>
      )}
      <div className="dlcfx-c-info" style={at(700)}>
        {grant.egg && <div className="dlcfx-c-chip">{grant.egg.petName} egg</div>}
        {grant.guildTitle && <div className="dlcfx-c-chip">Title: <b>{grant.guildTitle}</b></div>}
        <div className="dlcfx-c-actions">
          <button type="button" className="lu-c-btn lu-c-btn-gold" onClick={() => onOpenMenu?.()}>Open guild</button>
          <button type="button" className="lu-c-btn" onClick={() => engine.dismissDlcGrant()}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
