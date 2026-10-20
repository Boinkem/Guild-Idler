import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useEngine } from './useEngine';
import { HERO_CLASSES, SKINS, SKIN_BY_ID } from '../game/data/progression';
import { PER_CLASS_SKINS, canWearSkin, isClassSkinEarned, isClassSkinOwned, classSkinLockReason, classSkinLockShort } from '../game/classSkins';
import type { GameState, Hero, HeroClass } from '../game/types';
import type { SkinDef } from '../game/data/progression';
import { formatGold } from '../game/util';
import { HeroSprite } from './sprites/HeroSprite';
import { buyWithFx, fxMs, useRecentIncrease } from './purchaseFx';
import { DyeFx } from './dyeFx';

/**
 * Patch 0429 -- the Wardrobe (Design canvas "Wardrobe -- skins & tints",
 * signed off). Replaces the Heroes panel's Skins section, which had grown
 * into a tint card grid plus one 14-card grid per per-class set, with a
 * single card:
 *
 *  - Class dropdown: whose art is being looked at (looks owned per class).
 *  - Skin: the outfit. Original, or a per-class set earned in raids, each
 *    a row with a thumbnail of this class wearing it and its status.
 *  - Tint: a dropdown that only applies to Original (the guild-wide
 *    recolours). Hovering a tint in the list previews it on the stage.
 *  - A big preview stage, the 14-class pips for a per-class set, and one
 *    action: Unlock (tint: whole guild; set: this class), Locked (with the
 *    raid), or Dress <hero> once it's owned.
 *
 * Data model unchanged: a hero still wears one skin id (`hero.skin`), so
 * "Original + tint" is just the tint's id, and per-class sets carry their
 * own palette. `LiveryPicker` is the hero card's compact version.
 */

/** The guild-wide recolours of Original, in skins.json order ('original' first). */
export const TINTS: SkinDef[] = SKINS.filter((s) => !s.perClass);

type LookStatus = 'own' | 'buy' | 'earn' | 'lock';

function lookStatus(state: GameState, id: string, cls: string): LookStatus {
  const def = SKIN_BY_ID[id];
  if (def?.perClass) return isClassSkinOwned(state, id, cls) ? 'own' : isClassSkinEarned(state, id, cls) ? 'earn' : 'lock';
  return canWearSkin(state, id, cls) ? 'own' : 'buy';
}

/** "Original", "Original · Holy" or "Frost Sovereign". */
export function lookName(id: string, short = false): string {
  const def = SKIN_BY_ID[id];
  if (!def) return 'Original';
  if (def.perClass || id === 'original' || short) return def.name;
  return `Original · ${def.name}`;
}

function looksOwned(state: GameState, cls: string): number {
  return TINTS.filter((t) => canWearSkin(state, t.id, cls)).length
    + PER_CLASS_SKINS.filter((s) => isClassSkinOwned(state, s.id, cls)).length;
}

function Swatch({ sw }: { sw?: [string, string] | string[] }) {
  return (
    <span className="wdr-sw" aria-hidden="true">
      <span style={{ background: sw?.[0] }} />
      <span style={{ background: sw?.[1] }} />
    </span>
  );
}

/** A button that toggles a floating menu; closes on an outside click or
 *  Escape. Same "button + floating card" family as the tombstone style
 *  picker, so a row can branch between pick / buy / locked. */
function Dropdown({ button, disabled, label, onClose, className, menuClass, children }: {
  button: ReactNode;
  disabled?: boolean;
  label: string;
  onClose?: () => void;
  className?: string;
  menuClass?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => { setOpen(false); closeRef.current?.(); };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); closeRef.current?.(); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); closeRef.current?.(); } };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className={`wdr-dd ${className ?? ''}`} ref={ref}>
      <button
        type="button"
        className={`wdr-ddb ${open ? 'open' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {button}
        <span className="wdr-car" aria-hidden="true">▾</span>
      </button>
      {open && !disabled && <div className={`wdr-menu ${menuClass ?? ''}`} role="listbox">{children(close)}</div>}
    </div>
  );
}

export function Wardrobe() {
  const engine = useEngine();
  const state = engine.state;
  const classes = Object.keys(HERO_CLASSES) as HeroClass[];
  const first = state.heroes[0];

  const [cls, setCls] = useState<HeroClass>((first?.heroClass ?? classes[0]) as HeroClass);
  const firstSkin = first?.skin ?? 'original';
  const [set, setSet] = useState<string>(SKIN_BY_ID[firstSkin]?.perClass ? firstSkin : 'original');
  const [tint, setTint] = useState<string>(SKIN_BY_ID[firstSkin]?.perClass ? 'original' : firstSkin);
  const [hover, setHover] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(first?.id ?? null);
  const [stamp, setStamp] = useState<number | null>(null);
  const stampTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(stampTimer.current), []);

  const mine = state.heroes.filter((h) => h.heroClass === cls);
  const target = mine.find((h) => h.id === targetId) ?? mine[0] ?? null;
  const look = set === 'original' ? tint : set;
  const shown = set === 'original' && hover ? hover : look;
  const shownDef = SKIN_BY_ID[shown];
  const shownStatus = lookStatus(state, shown, cls);
  const status = lookStatus(state, look, cls);
  const lookDef = SKIN_BY_ID[look];
  const className = HERO_CLASSES[cls]?.name ?? cls;
  const an = /^[aeiou]/i.test(className) ? 'an' : 'a';

  // The existing dye moment (patch 0421), now played on the stage: tints
  // keyed by id (whole guild), per-class sets by id:class.
  const justDyed = useRecentIncrease([
    ...TINTS.filter((t) => t.id !== 'original').map((t) => ({ id: t.id, value: state.unlockedSkins.includes(t.id) ? 1 : 0 })),
    ...PER_CLASS_SKINS.flatMap((sk) => classes.map((c) => ({ id: `${sk.id}:${c}`, value: isClassSkinOwned(state, sk.id, c) ? 1 : 0 }))),
  ], 1700);
  const dyeKey = SKIN_BY_ID[look]?.perClass ? `${look}:${cls}` : look;
  const dyeing = !!justDyed[dyeKey] && !hover;

  const pickClass = (c: HeroClass) => {
    setCls(c);
    setTargetId(state.heroes.find((h) => h.heroClass === c)?.id ?? null);
  };
  const dress = () => {
    if (!target || status !== 'own') return;
    engine.setHeroSkin(target.id, look);
    window.clearTimeout(stampTimer.current);
    setStamp(Date.now());
    stampTimer.current = window.setTimeout(() => setStamp(null), fxMs(1400));
  };

  const wearers = mine.filter((h) => (h.skin ?? 'original') === shown).map((h) => h.name);
  const tagText = { own: 'Owned', buy: 'Not owned', earn: 'Earned', lock: 'Locked' }[shownStatus];

  // Action bar, for the committed look (not a hover preview).
  let why: ReactNode;
  let action: ReactNode;
  if (status === 'own') {
    if (!target) {
      why = <>No {className}s in the guild yet. Recruit one to wear this.</>;
      action = <button className="btn-primary wdr-act-btn" disabled>Dress</button>;
    } else if ((target.skin ?? 'original') === look) {
      why = <>{target.name} is already wearing this.</>;
      action = <button className="btn-primary wdr-act-btn" disabled>Worn</button>;
    } else {
      why = <>Swap {target.name} into <b>{lookName(look)}</b>.</>;
      action = <button className="btn-primary wdr-act-btn wdr-dress" onClick={dress}>Dress {target.name}</button>;
    }
  } else if (status === 'buy') {
    why = <><b>{lookDef.name}</b> is a guild-wide tint: one unlock and every class can wear it on their Original skin.</>;
    action = (
      <button className="btn-primary wdr-act-btn" disabled={state.gold < lookDef.cost} onClick={(e) => buyWithFx(engine, e.currentTarget, () => engine.buySkin(look))}>
        Unlock · {formatGold(lookDef.cost)}
      </button>
    );
  } else if (status === 'earn') {
    why = <>Earned with {an} <b>{className}</b> in a raid. Unlock it for this class.</>;
    action = (
      <button className="btn-primary wdr-act-btn" disabled={state.gold < lookDef.cost} onClick={(e) => buyWithFx(engine, e.currentTarget, () => engine.buyClassSkin(look, cls))}>
        Unlock for {className} · {formatGold(lookDef.cost)}
      </button>
    );
  } else {
    why = <>{classSkinLockReason(look, cls)} Then unlock it here.</>;
    action = <button className="btn-primary wdr-act-btn" disabled>Locked</button>;
  }

  const curTint = SKIN_BY_ID[tint];
  const tintOn = set === 'original';
  const ownedPips = shownDef?.perClass ? classes.filter((c) => isClassSkinOwned(state, shown, c)).length : 0;

  return (
    <div className="card wdr">
      <div className="wdr-top">
        <div>
          <div className="wdr-lbl">Class</div>
          <Dropdown
            label="Class"
            button={<><span>{className}</span><span className="wdr-meta">{looksOwned(state, cls)} / {TINTS.length + PER_CLASS_SKINS.length} looks</span></>}
          >
            {(close) => classes.map((c) => {
              const n = state.heroes.filter((h) => h.heroClass === c).length;
              return (
                <button key={c} type="button" role="option" aria-selected={c === cls} className={`wdr-mi ${c === cls ? 'on' : ''}`} onClick={() => { pickClass(c); close(); }}>
                  <span>{HERO_CLASSES[c].name}</span>
                  <span className="wdr-r">{n > 0 ? `${n} hero${n === 1 ? '' : 'es'} · ` : ''}{looksOwned(state, c)} / {TINTS.length + PER_CLASS_SKINS.length} looks</span>
                </button>
              );
            })}
          </Dropdown>
        </div>
        <div>
          <div className="wdr-lbl">Dress a hero</div>
          <Dropdown
            label="Hero to dress"
            disabled={mine.length === 0}
            button={target
              ? <><span>{target.name}</span><span className="wdr-meta">Lv {target.level}</span></>
              : <span className="muted">No {className}s yet</span>}
          >
            {(close) => mine.map((h) => (
              <button key={h.id} type="button" role="option" aria-selected={h.id === target?.id} className={`wdr-mi ${h.id === target?.id ? 'on' : ''}`} onClick={() => { setTargetId(h.id); close(); }}>
                <span>{h.name}</span>
                <span className="wdr-r">Lv {h.level} · wearing {lookName(h.skin ?? 'original', true)}</span>
              </button>
            ))}
          </Dropdown>
        </div>
      </div>

      <div className="wdr-mid">
        <div>
          <div
            className={`wdr-stage ${dyeing ? 'fx-dyed' : ''}`}
            style={{ '--dye-a': shownDef?.swatch[0], '--dye-b': shownDef?.swatch[1] } as CSSProperties}
          >
            <span className={`wdr-tag ${shownStatus}`}>{hover ? `Preview · ${tagText}` : tagText}</span>
            {wearers.length > 0 && <span className="wdr-worn">Worn by {wearers.join(', ')}</span>}
            <span className="wdr-floor" aria-hidden="true" />
            <span className="wdr-spr skin-card-preview-base">
              <HeroSprite heroClass={cls} skin={dyeing ? 'original' : shown} height={150} title={`${lookName(shown)} ${className}`} />
            </span>
            {dyeing && (
              <span className="wdr-spr skin-card-preview-dye">
                <HeroSprite heroClass={cls} skin={shown} height={150} />
              </span>
            )}
            {dyeing && <DyeFx />}
            {stamp && <span key={stamp} className="wdr-stamp fx-wdr" aria-hidden="true">Dressed</span>}
          </div>
          <div className="wdr-lk">{lookName(shown)} · {className}</div>
          <div className="wdr-desc">{shownDef?.description}</div>
          {shownDef?.perClass && (
            <div className="wdr-pips">
              {classes.map((c) => {
                const p = isClassSkinOwned(state, shown, c) ? 'own' : isClassSkinEarned(state, shown, c) ? 'earn' : '';
                const t = p === 'own' ? 'owned' : p === 'earn' ? 'earned, ready to unlock' : 'not earned yet';
                return <span key={c} className={`wdr-pip ${p} ${c === cls ? 'cur' : ''}`} title={`${HERO_CLASSES[c].name}: ${t}`} />;
              })}
              <span className="wdr-pipn">{ownedPips} / {classes.length} classes</span>
            </div>
          )}
        </div>

        <div>
          <div className="wdr-lbl">Skin</div>
          <div className="wdr-skins">
            {[SKIN_BY_ID.original, ...PER_CLASS_SKINS].map((sk) => {
              const isOrig = sk.id === 'original';
              const st = isOrig ? 'own' : lookStatus(state, sk.id, cls);
              const owned = TINTS.filter((t) => canWearSkin(state, t.id, cls)).length;
              return (
                <button
                  key={sk.id}
                  type="button"
                  className={`wdr-sk ${set === sk.id ? 'on' : ''}`}
                  aria-pressed={set === sk.id}
                  onClick={() => { setSet(sk.id); setHover(null); }}
                >
                  <span className={`wdr-thumb ${st === 'lock' ? 'locked' : ''}`}>
                    <HeroSprite heroClass={cls} skin={isOrig ? tint : sk.id} height={44} />
                    {st === 'lock' && <span className="wdr-padlock" aria-hidden="true">🔒</span>}
                  </span>
                  <span className="wdr-sk-text">
                    <span className="wdr-sk-name">{sk.name}</span>
                    <span className={`wdr-st ${st}`}>
                      {isOrig
                        ? `${owned} of ${TINTS.length} tints owned · all classes`
                        : st === 'own' ? `Owned for ${className}`
                        : st === 'earn' ? `Earned · unlock ${formatGold(sk.cost)}`
                        : `Locked · ${classSkinLockShort(sk.id).replace(/ with this class$/, '')}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="wdr-lbl" style={{ marginTop: 12 }}>Tint</div>
          <Dropdown
            label="Tint"
            disabled={!tintOn}
            onClose={() => setHover(null)}
            button={tintOn
              ? <><Swatch sw={curTint?.swatch} /><span>{curTint?.name}</span><span className="wdr-meta">{canWearSkin(state, tint, cls) ? 'owned' : formatGold(curTint?.cost ?? 0)}</span></>
              : <><Swatch sw={['var(--panel-3)', 'var(--panel-3)']} /><span>Fixed palette</span></>}
          >
            {(close) => (
              <div onMouseLeave={() => setHover(null)}>
                {TINTS.map((t) => {
                  const own = canWearSkin(state, t.id, cls);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="option"
                      aria-selected={t.id === tint}
                      className={`wdr-mi ${t.id === tint ? 'on' : ''}`}
                      onMouseEnter={() => setHover(t.id)}
                      onFocus={() => setHover(t.id)}
                      onClick={() => { setTint(t.id); close(); }}
                    >
                      <Swatch sw={t.swatch} />
                      <span>{t.name}</span>
                      <span className={`wdr-r ${own ? 'own' : 'cost'}`}>{own ? (t.id === tint ? '✓ selected' : 'owned') : formatGold(t.cost)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Dropdown>
          <div className="wdr-note">
            {tintOn
              ? 'Tints are guild-wide: unlock once, every class can wear it.'
              : `${lookDef?.name} has its own colours; tints only apply to Original.`}
          </div>
        </div>
      </div>

      <div className="wdr-act">
        <span className="wdr-why">{why}</span>
        {action}
      </div>
    </div>
  );
}

/**
 * Patch 0429 -- the hero card's livery chips, as one dropdown: tints under
 * Original, then the class sets. Looks this hero can't wear yet are
 * greyed with where to get them (the Wardrobe, or the raid).
 */
export function LiveryPicker({ hero }: { hero: Hero }) {
  const engine = useEngine();
  const state = engine.state;
  const worn = hero.skin ?? 'original';
  const wornDef = SKIN_BY_ID[worn];
  const row = (sk: SkinDef, sub: boolean, close: () => void) => {
    const ok = canWearSkin(state, sk.id, hero.heroClass);
    const on = worn === sk.id;
    const st = lookStatus(state, sk.id, hero.heroClass);
    const right = ok ? (on ? '✓' : '')
      : sk.perClass ? (st === 'earn' ? 'Unlock in Wardrobe' : classSkinLockShort(sk.id).replace(/ with this class$/, ''))
      : `${formatGold(sk.cost)} in Wardrobe`;
    return (
      <button
        key={sk.id}
        type="button"
        role="option"
        aria-selected={on}
        className={`wdr-mi ${sub ? 'sub' : ''} ${on ? 'on' : ''} ${ok ? '' : 'na'}`}
        disabled={!ok}
        title={ok ? sk.name : sk.perClass ? classSkinLockReason(sk.id, hero.heroClass) : `${sk.name}: unlock it in the Wardrobe`}
        onClick={() => { engine.setHeroSkin(hero.id, sk.id); close(); }}
      >
        <Swatch sw={sk.swatch} />
        <span>{sk.name}</span>
        <span className="wdr-r">{right}</span>
      </button>
    );
  };
  return (
    <Dropdown
      label="Livery"
      className="wdr-livery"
      menuClass="wdr-livery-menu"
      button={<><Swatch sw={wornDef?.swatch} /><span>{lookName(worn, true)}</span></>}
    >
      {(close) => (
        <>
          <div className="wdr-grp">Original</div>
          {TINTS.map((t) => row(t, true, close))}
          {PER_CLASS_SKINS.length > 0 && <div className="wdr-grp">Class sets</div>}
          {PER_CLASS_SKINS.map((s) => row(s, false, close))}
        </>
      )}
    </Dropdown>
  );
}
