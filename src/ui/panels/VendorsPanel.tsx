import { useEffect, useState, CSSProperties } from 'react';
import { useEngine, useNow } from '../useEngine';
import { GameEngine } from '../../game/engine';
import { useSettings } from '../useSettings';
import { ShopManager } from '../../game/managers/ShopManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { EquipmentManager } from '../../game/managers/EquipmentManager';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { EQUIPMENT_BY_ID } from '../../game/data/equipment';
import { isProceduralTemplate } from '../../game/data/proceduralLoot';
import { scrapIconFor } from '../../game/data/elements';
import { CONSUMABLE_BY_ID } from '../../game/data/items';
import { VENDORS, vendorUpgrades } from '../../game/data/progression';
import { EquipmentDef, EquipmentItem, ConsumableDef, VendorId, UpgradeDef, CraftingRecipeDef, Rarity } from '../../game/types';
import { describeMods, formatDuration, formatGold, RARITY_BANNER, RARITY_COLOR, RARITY_ORDER } from '../../game/util';
import { isTabUnread } from '../../game/attention';
import { ItemIcon, ConsumableIcon } from '../icons';
import { VendorSprite } from '../sprites/VendorSprite';
import { MaxFlash, useMaxFlash, usePulsesOnChange } from '../maxFlash';
import { CraftingStation } from '../CraftingStation';
import { EnhanceStation } from '../EnhanceStation';
import { WeaponEnchantStation } from '../WeaponEnchantStation';
import { ArmourInfusionStation } from '../ArmourInfusionStation';
import { ScrapStation } from '../ScrapStation';
import { ReputationRing } from '../ReputationRing';
import { ConfirmModal } from '../ConfirmModal';
import { RewardGlowParticle } from '../RewardGlowParticle';
import { useFlyTargetRef, getFlyTargetCenter } from '../flyTarget';

/** Confirmed pairing, not a guess -- Blacksmith sells armour, Alchemist sells
 *  supplies, Enchanter sells the black market. Same mapping decides which
 *  slice of Crafting each vendor's overlay button opens. */
const VENDOR_CRAFT_CATEGORY: Record<VendorId, CraftingRecipeDef['category']> = {
  blacksmith: 'gear', alchemist: 'consumable', enchanter: 'enchant',
};

/**
 * One backdrop scene per vendor tab (patch 0242, moved up to wrap the
 * whole Vendors page in patch 0244) -- the same room each vendor's own
 * dedicated crafting/enhance/scrap stations already show in their own
 * modals (STATION_BG in CraftingStation.tsx and its siblings), now
 * behind the entire Vendors page -- header, tab row, and the active
 * vendor's own content -- rather than just the sub-stations or just
 * VendorPage's own content below the tab row. Keyed by `tab` (the
 * currently open vendor) here in VendorsPanel rather than by VendorPage's
 * own `vendorId` prop -- same value, just read one component higher now
 * that the wrapper lives up here. Committed art under public/lore/ like
 * every other background this game paints, not the gitignored-licensed
 * public/vendors/ convention VendorSprite.tsx has to fall back
 * gracefully without.
 */
const VENDOR_BG: Record<VendorId, string> = {
  blacksmith: './lore/vendors/blacksmith.jpg',
  alchemist: './lore/vendors/alchemist.jpg',
  enchanter: './lore/vendors/enchanter.jpg',
};

export function VendorsPanel() {
  const engine = useEngine();
  const [tab, setTab] = useState<VendorId>('blacksmith');

  // Deep-link support for a notification's "Go to Enchanter" button (see
  // levelUpVendor's targetSubTab in engine.ts) -- same consume-once shape
  // HatcheryPanel already uses for its own sub-tabs. VENDORS.some(...)
  // guards against a stale/foreign id rather than trusting the request
  // blindly, same defensive shape every other consumer of a generic
  // requested-id field already uses.
  useEffect(() => {
    const requested = engine.consumeRequestedSubTab();
    if (requested && VENDORS.some((v) => v.id === requested)) setTab(requested as VendorId);
  }, [engine, engine.requestedSubTab]);

  // Acknowledges whichever vendor page is currently open -- on mount (the
  // default Blacksmith) and again on every switch -- clearing the nav
  // shimmer for a banner-worthy notification targeting this specific
  // vendor (patch 0191). See acknowledgeTab's own comment in engine.ts.
  useEffect(() => {
    engine.acknowledgeTab('vendors', tab);
  }, [engine, tab]);

  return (
    <div className="vendor-scene" style={{ backgroundImage: `url(${VENDOR_BG[tab]})` }}>
      <div className="vendor-scene-content">
        <h2>Vendors</h2>
        <p className="subtitle">Upgrades, stock, and Crafting all live on each vendor's own page now.</p>

        <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
          {VENDORS.map((v) => (
            <button
              key={v.id}
              className={`btn-subtab ${tab === v.id ? 'on' : ''} ${isTabUnread(engine.state, 'vendors', v.id) ? 'subtab-unread' : ''}`}
              onClick={() => setTab(v.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {v.name}
              <ReputationRing goldSpent={engine.state.vendorGoldSpent[v.id]} size={18} />
            </button>
          ))}
        </div>

        {VENDORS.filter((v) => v.id === tab).map((v) => <VendorPage key={v.id} vendorId={v.id} />)}
      </div>
    </div>
  );
}

function VendorPage({ vendorId }: { vendorId: VendorId }) {
  const engine = useEngine();
  const state = engine.state;
  const now = useNow();
  const { settings } = useSettings();
  const [showCrafting, setShowCrafting] = useState(false);
  const [showEnhance, setShowEnhance] = useState(false);
  const [showScrap, setShowScrap] = useState(false);
  const [showWeaponEnchant, setShowWeaponEnchant] = useState(false);
  const [showArmourInfusion, setShowArmourInfusion] = useState(false);
  const [showCharms, setShowCharms] = useState(false);

  const vendorDef = VENDORS.find((v) => v.id === vendorId)!;
  const level = GuildManager.vendorLevel(state, vendorId);
  const upgradeList = vendorUpgrades(vendorId);
  const cost = GuildManager.nextVendorLevelCost(state, vendorId);
  const maxed = cost === null;

  const { flashes, dismiss } = useMaxFlash([
    { id: `vendor:${vendorId}`, name: `${vendorDef.name} — fully trained`, level, maxLevel: upgradeList.length },
    ...upgradeList.map((def) => ({
      id: def.id, name: def.name, level: GuildManager.upgradeLevel(state, def.id), maxLevel: def.maxLevel,
    })),
  ]);
  const vendorFlash = flashes[`vendor:${vendorId}`];
  // Same combined vendor-level+upgrades list useMaxFlash above already
  // builds, tracking every change for the "Level N/M" pulse -- see
  // usePulsesOnChange's own doc comment (maxFlash.tsx) for why a plain
  // key={level} remount trick isn't enough: it replays on every ordinary
  // tab switch, not just an actual purchase.
  const levelPulses = usePulsesOnChange([
    { id: `vendor:${vendorId}`, value: level },
    ...upgradeList.map((def) => ({ id: def.id, value: GuildManager.upgradeLevel(state, def.id) })),
  ]);

  function upgradeCard(def: UpgradeDef) {
    const upLevel = GuildManager.upgradeLevel(state, def.id);
    const upCost = GuildManager.nextUpgradeCost(state, def.id);
    const upMaxed = upCost === null && upLevel >= def.maxLevel;
    const flash = flashes[def.id];
    const pulsing = levelPulses[def.id];
    return (
      <div key={def.id} className="card" style={{ marginBottom: 0 }}>
        <div className="spread">
          <span className="card-title">{def.name}</span>
          <span className={`small muted ${pulsing ? 'purchase-pulse' : ''}`}>{upLevel}/{def.maxLevel}</span>
        </div>
        <p className="card-flavour">{def.description}</p>
        <div className="stat-row" style={{ marginBottom: 8 }}>
          {describeMods(def.modsPerLevel).map((line) => <span key={line}>{line} per level</span>)}
          {def.unlocks === 'legendaryQuests' && <span className="gold-text">Unlocks Legendary quests</span>}
          {def.unlocks === 'blackMarket' && <span className="gold-text">Unlocks the Black Market</span>}
        </div>
        <button
          className="btn-yellow"
          disabled={upMaxed || upCost === null || state.gold < upCost}
          onClick={() => engine.buyUpgrade(def.id)}
        >
          {upMaxed ? 'Fully upgraded' : `Buy · ◆ ${formatGold(upCost ?? 0)}`}
        </button>
        {flash && <MaxFlash key={flash.key} label={flash.name} onDone={() => dismiss(def.id)} />}
      </div>
    );
  }

  function lockedCard(requiredLevel: number) {
    return (
      <div key={`locked-${requiredLevel}`} className="card locked-upgrade" style={{ marginBottom: 0 }}>
        <div className="card-title muted">???</div>
        <p className="card-flavour muted">Level up {vendorDef.name} to level {requiredLevel} to see this.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card vendor-card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <VendorSprite vendor={vendorId} height={72} animate />
          <div style={{ flex: 1 }}>
            <div className="spread">
              <span className="card-title row" style={{ gap: 6, alignItems: 'center' }}>
                {vendorDef.name}
                <ReputationRing goldSpent={state.vendorGoldSpent[vendorId]} size={22} />
              </span>
              <span className={`small muted ${levelPulses[`vendor:${vendorId}`] ? 'purchase-pulse' : ''}`}>Level {level}/{upgradeList.length}</span>
            </div>
            <p className="card-flavour">{vendorDef.blurb}</p>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn-yellow"
                disabled={maxed || cost === null || state.gold < cost}
                onClick={() => engine.levelUpVendor(vendorId)}
              >
                {maxed ? 'Nothing more to teach' : `Level up · ◆ ${formatGold(cost ?? 0)}`}
              </button>
              <button className="btn-purple" onClick={() => setShowCrafting(true)}>Crafting</button>
              {/* Durability repair -- moved here from a per-item button
                  buried in the Inventory tab, gear-specific so it only
                  makes sense on the Blacksmith's own page. */}
              {vendorId === 'blacksmith' && (
                <button className="btn-purple" onClick={() => setShowEnhance(true)}>Enhance</button>
              )}
              {/* Breaks an owned item down into Scrap instead of gold --
                  its own dedicated station now (own background art),
                  moved off the stash list the same way Enhance moved off
                  the Inventory tab before it. */}
              {vendorId === 'blacksmith' && (
                <button className="btn-purple" onClick={() => setShowScrap(true)}>Scrap</button>
              )}
              {/* Elemental infusion moved here entirely, split in two --
                  Weapon Enchanting (weapons only) and Armour Infusion
                  (everything else), both now living at the Enchanter
                  rather than split across Blacksmith (apply) and
                  Enchanter (craft the gem first, separately). Each is a
                  single collapsed craft-then-apply action now -- see
                  CraftingManager.craftAndInfuse. */}
              {vendorId === 'enchanter' && (
                <button className="btn-purple" onClick={() => setShowWeaponEnchant(true)}>Weapon Enchanting</button>
              )}
              {vendorId === 'enchanter' && (
                <button className="btn-purple" onClick={() => setShowArmourInfusion(true)}>Armour Infusion</button>
              )}
              {/* A handful of consumables (Lucky Charm, Fortune Weave,
                  Windfall Sigil) were mistakenly showing under the
                  Alchemist's Supplies -- thematically the Enchanter's own
                  bench-made items (patch 0247), not potions. Given their
                  own button/category (`charm`) rather than folded into
                  this page's existing Crafting button, which is
                  `category="enchant"` here -- an item-application flow,
                  structurally incompatible with these being simple
                  recipe crafts (see CraftingRecipeDef.category's own
                  comment on why `charm` exists as a separate value at
                  all). */}
              {vendorId === 'enchanter' && (
                <button className="btn-purple" onClick={() => setShowCharms(true)}>Charms</button>
              )}
            </div>
          </div>
        </div>
        {vendorFlash && <MaxFlash key={vendorFlash.key} label={vendorFlash.name} onDone={() => dismiss(`vendor:${vendorId}`)} />}
      </div>

      <div className="section-heading">Upgrades</div>
      <div className="grid two">
        {upgradeList.map((def, index) => (level >= index + 1 ? upgradeCard(def) : lockedCard(index + 1)))}
      </div>

      <div className="section-heading">Stock</div>
      {vendorId === 'blacksmith' && <ArmourStock now={now} settings={settings} />}
      {vendorId === 'alchemist' && <SuppliesStock />}
      {vendorId === 'enchanter' && <BlackMarketStock now={now} />}

      {showCrafting && (
        <CraftingStation category={VENDOR_CRAFT_CATEGORY[vendorId]} onClose={() => setShowCrafting(false)} />
      )}
      {showEnhance && <EnhanceStation onClose={() => setShowEnhance(false)} />}
      {showScrap && <ScrapStation onClose={() => setShowScrap(false)} />}
      {showWeaponEnchant && <WeaponEnchantStation onClose={() => setShowWeaponEnchant(false)} />}
      {showArmourInfusion && <ArmourInfusionStation onClose={() => setShowArmourInfusion(false)} />}
      {showCharms && <CraftingStation category="charm" onClose={() => setShowCharms(false)} />}
    </>
  );
}

/**
 * One of three -- Blacksmith/Alchemist/Enchanter each reroll their own
 * stock independently now (own cost curve, own daily counter, own Trade
 * Favor upgrade), replacing the old single button that restocked
 * Blacksmith gear and Alchemist supplies together. See
 * ShopManager.rerollBlacksmith/rerollAlchemist/rerollEnchanter.
 */
function ShopRerollButton({ vendorId }: { vendorId: VendorId }) {
  const engine = useEngine();
  const state = engine.state;
  const now = useNow();
  const cost = vendorId === 'blacksmith' ? ShopManager.blacksmithRerollCost(state, now)
    : vendorId === 'alchemist' ? ShopManager.alchemistRerollCost(state, now)
    : ShopManager.enchanterRerollCost(state, now);
  const onClick = vendorId === 'blacksmith' ? () => engine.rerollBlacksmith()
    : vendorId === 'alchemist' ? () => engine.rerollAlchemist()
    : () => engine.rerollEnchanter();
  return (
    <button
      className="btn-ghost"
      style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
      onClick={onClick}
      disabled={cost > state.gold}
      title={cost > 0 ? `Restock early for ${cost} gold` : 'Restock early -- free today'}
    >
      {cost > 0 ? `Reroll stock · ◆ ${formatGold(cost)}` : 'Reroll stock · Free'}
    </button>
  );
}

function ArmourStock({ now, settings }: { now: number; settings: { confirmSell: boolean } }) {
  const engine = useEngine();
  const state = engine.state;

  /**
   * The redesigned Sell/Scrap card + Scrap All -- moved here from the
   * Inventory tab (patch 0265 first landed it there; patch 0267, direct
   * follow-up request, relocated it to the Blacksmith's own "Sell from
   * the stash" section instead, where selling/scrapping equipment
   * actually belongs, and reverted Inventory's own cards back to their
   * original simple form). See EquipmentPanel.tsx's own StashCard/
   * EquipmentPanel comments (prior to this patch) for the full original
   * design reasoning -- unchanged here, just relocated and simplified:
   * no Equip button or detail-modal click-through exists on this page
   * (there's no hero context here to equip onto), so this card is the
   * quick-action row alone, nothing to expand into.
   */
  const [bursts, setBursts] = useState<{ key: number; x: number; y: number; gained: number; icon?: string; kind: 'scrap' | 'gold' }[]>([]);
  const pushBurst = (x: number, y: number, gained: number, kind: 'scrap' | 'gold', icon?: string) => {
    const key = Date.now() + Math.random();
    setBursts((prev) => [...prev, { key, x, y, gained, icon, kind }]);
    window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.key !== key)), 900);
  };
  const [goldFlights, setGoldFlights] = useState<{ key: number; x: number; y: number; dx: number; dy: number }[]>([]);
  const pushGoldFlight = (x: number, y: number, gained: number) => {
    pushBurst(x, y, gained, 'gold');
    const target = getFlyTargetCenter('gold');
    if (target) {
      const key = Date.now() + Math.random() + 0.5;
      setGoldFlights((prev) => [...prev, { key, x, y, dx: target.x - x, dy: target.y - y }]);
      window.setTimeout(() => setGoldFlights((prev) => prev.filter((f) => f.key !== key)), 750);
    }
  };
  /**
   * Scrap gets the real long-distance flight here too, unlike on
   * Inventory -- this page has a genuine persistent Scrap total on
   * screen (the counter just below, `scrapRef`), so there's actually
   * somewhere for it to fly toward, matching Gold's own treatment
   * rather than staying local-burst-only the way it had to on
   * Inventory (no equivalent counter shown there at all).
   */
  const scrapRef = useFlyTargetRef<HTMLSpanElement>('scrap');
  const pushScrapFlight = (x: number, y: number, gained: number, icon: string) => {
    pushBurst(x, y, gained, 'scrap', icon);
    const target = getFlyTargetCenter('scrap');
    if (target) {
      const key = Date.now() + Math.random() + 0.5;
      setGoldFlights((prev) => [...prev, { key, x, y, dx: target.x - x, dy: target.y - y }]);
      window.setTimeout(() => setGoldFlights((prev) => prev.filter((f) => f.key !== key)), 750);
    }
  };

  const scrapBonus = ModifierManager.global(state).scrapBonus ?? 0;
  const [scrapRarity, setScrapRarity] = useState<Rarity>('common');
  const scrapMaxIndex = RARITY_ORDER.indexOf(scrapRarity);
  const scrapPreview = state.stash.filter((item) => {
    if (item.locked) return false;
    if (item.enchantStats && Object.keys(item.enchantStats).length > 0) return false;
    const def = EQUIPMENT_BY_ID[item.defId];
    if (!def) return false;
    if (item.customMods && def.rarity !== 'common') return false;
    return RARITY_ORDER.indexOf(def.rarity) <= scrapMaxIndex;
  });
  const scrapPreviewTotal = scrapPreview.reduce((sum, item) => sum + EquipmentManager.scrapValue(item, scrapBonus), 0);
  const [pendingScrapAll, setPendingScrapAll] = useState(false);
  const STAGGER_MS = 140;
  const runScrapAll = () => {
    if (scrapPreview.length === 0) return;
    const targets = scrapPreview.map((item) => {
      const el = document.querySelector(`[data-stash-uid="${item.uid}"]`);
      const rect = el?.getBoundingClientRect();
      return {
        uid: item.uid,
        gained: EquipmentManager.scrapValue(item, scrapBonus),
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      };
    });
    targets.forEach((t, i) => {
      window.setTimeout(() => {
        engine.scrapItem(t.uid);
        pushScrapFlight(t.x, t.y, t.gained, scrapIconFor(Date.now() + i));
      }, i * STAGGER_MS);
    });
  };

  return (
    <>
      <div className="spread" style={{ alignItems: 'center', marginBottom: 8 }}>
        <p className="tiny muted" style={{ margin: 0 }}>
          Stock rotates in {formatDuration(ShopManager.timeUntilRefresh(state, now))}. The armourer buys as well as sells.
        </p>
        <ShopRerollButton vendorId="blacksmith" />
      </div>
      {state.shop.equipment.length === 0 && <p className="small muted">Sold out. Come back after the next delivery.</p>}
      <div className="grid vendor-stock-grid">
        {state.shop.equipment.map((entry) => (
          <EquipmentShopCard
            key={entry.uid}
            def={EQUIPMENT_BY_ID[entry.defId]}
            itemLevel={entry.itemLevel}
            price={entry.price}
            canAfford={state.gold >= entry.price}
            onBuy={() => engine.buyShopEquipment(entry.uid)}
          />
        ))}
      </div>

      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="section-heading" style={{ marginBottom: 0 }}>Sell from the stash</div>
        <span ref={scrapRef} className="tiny muted">Scrap: {state.scrap}</span>
      </div>
      {state.stash.length === 0 && <p className="small muted">Nothing spare to sell.</p>}
      {state.stash.length > 0 && (
        <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <select
            value={scrapRarity}
            onChange={(e) => setScrapRarity(e.target.value as Rarity)}
            style={{
              background: 'var(--panel-2)', border: '1px solid var(--panel-3)',
              color: 'var(--parchment)', padding: '3px 6px', fontSize: '0.625rem',
            }}
          >
            {RARITY_ORDER.map((r) => (
              <option key={r} value={r}>{r} and below</option>
            ))}
          </select>
          <button
            className="btn-purple"
            style={{ minHeight: 22, padding: '2px 10px', fontSize: '0.625rem' }}
            onClick={() => setPendingScrapAll(true)}
            disabled={scrapPreview.length === 0}
            title="Enchanted and Vault-locked items are never swept up by this, regardless of rarity"
          >
            Scrap All ({scrapPreview.length}) · {scrapPreviewTotal} ⚙
          </button>
        </div>
      )}
      <div className="grid two">
        {state.stash.map((item) => (
          <ArmourStashCard
            key={item.uid}
            item={item}
            confirmSell={settings.confirmSell}
            engine={engine}
            scrapBonus={scrapBonus}
            onSell={pushGoldFlight}
            onScrap={pushScrapFlight}
          />
        ))}
      </div>
      {/* See EquipmentPanel.tsx's own (pre-0267) bursts/goldFlights
          comment for why these live at this level rather than inside
          each card -- the card unmounts the instant its item leaves
          state.stash, which would tear a child animation down
          mid-flight. Unchanged reasoning, just relocated here. */}
      {bursts.map((b) => (
        <span
          key={b.key}
          aria-hidden="true"
          className={`collect-particle ${b.kind === 'gold' ? 'coin' : 'scrap'}`}
          style={{ position: 'fixed', left: b.x, top: b.y, zIndex: 50 } as CSSProperties}
        >
          {b.icon && <img src={`./item-icons/${b.icon}`} alt="" style={{ width: 18, height: 18, objectFit: 'contain', verticalAlign: '-4px', marginRight: 4 }} />}
          +{b.gained} {b.kind === 'gold' ? 'gold' : 'Scrap'}
        </span>
      ))}
      {goldFlights.map((f) => (
        <RewardGlowParticle
          key={f.key}
          x={f.x} y={f.y} dx={f.dx} dy={f.dy}
          color="var(--brass)" delay={0} durationMs={750}
        />
      ))}

      {/* Second thoughts, for a price -- every sale made through the
          button just above lands here, exact item intact (durability,
          plus, any crafted mods or enchants), buyable back at a markup
          rather than gone for good the instant "Sell" is pressed. Oldest
          entry drops off past shop.buybackMaxEntries -- see
          ShopManager.sell's own comment. */}
      {state.buyback.length > 0 && (
        <>
          <div className="section-heading">Buy back</div>
          <div className="grid two">
            {state.buyback.map((entry) => {
              const def = EQUIPMENT_BY_ID[entry.item.defId];
              if (!def) return null;
              const price = ShopManager.buybackPrice(entry);
              return (
                <div key={entry.item.uid} className="spread card" style={{ marginBottom: 0 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <ItemIcon slot={def.slot} icon={def.icon} size={28} />
                    <span style={{ color: RARITY_COLOR[def.rarity], fontSize: 11 }}>
                      {def.name}{entry.item.plus > 0 ? ` +${entry.item.plus}` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => engine.buyBackItem(entry.item.uid)}
                    disabled={state.gold < price}
                    title={`Sold for ${formatGold(entry.soldFor)}`}
                  >
                    Buy back · {formatGold(price)}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {pendingScrapAll && (
        <ConfirmModal
          title="Scrap all"
          message={`Scrap ${scrapPreview.length} item${scrapPreview.length === 1 ? '' : 's'} (${scrapRarity} and below) for ${scrapPreviewTotal} Scrap? This cannot be undone.`}
          confirmLabel="Scrap"
          onConfirm={() => { runScrapAll(); setPendingScrapAll(false); }}
          onCancel={() => setPendingScrapAll(false)}
        />
      )}
    </>
  );
}

/**
 * The Sell/Scrap card for the Blacksmith's own "Sell from the stash"
 * grid -- patch 0267 (relocated here from Inventory, see ArmourStock's
 * own comment above). No detail-modal click-through and no Equip button
 * -- there's no hero context on this page to equip onto, so this card
 * is just the icon/name header plus the Lock/Sell/Scrap quick-action
 * row, nothing to expand into.
 */
function ArmourStashCard({
  item, confirmSell, engine, scrapBonus, onSell, onScrap,
}: {
  item: EquipmentItem; confirmSell: boolean; engine: GameEngine; scrapBonus: number;
  onSell: (x: number, y: number, gained: number) => void;
  onScrap: (x: number, y: number, gained: number, icon: string) => void;
}) {
  const [pendingSell, setPendingSell] = useState<{ x: number; y: number } | null>(null);
  const [pendingScrap, setPendingScrap] = useState<{ x: number; y: number } | null>(null);
  const def = EQUIPMENT_BY_ID[item.defId];
  if (!def) return null;
  const scrapValue = EquipmentManager.scrapValue(item, scrapBonus);

  const centerOf = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  const doSell = (pos: { x: number; y: number }) => {
    onSell(pos.x, pos.y, EquipmentManager.sellValue(item));
    engine.sellItem(item.uid);
    setPendingSell(null);
  };
  const doScrap = (pos: { x: number; y: number }) => {
    onScrap(pos.x, pos.y, scrapValue, scrapIconFor(Date.now()));
    engine.scrapItem(item.uid);
    setPendingScrap(null);
  };

  return (
    <>
      <div className="item-card" data-stash-uid={item.uid}>
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="item-card-summary">
          <ItemIcon slot={def.slot} icon={def.icon} />
          <div className="item-card-body">
            <div className="item-card-name" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}{item.plus > 0 ? ` +${item.plus}` : ''}</div>
            <span className="rarity-pill" style={{ color: RARITY_COLOR[def.rarity], borderColor: RARITY_COLOR[def.rarity] }}>{def.rarity}</span>
            {item.locked && <span className="rarity-pill" style={{ color: 'var(--sky)', borderColor: 'var(--sky)' }}>{'\uD83D\uDD12'} vaulted</span>}
          </div>
        </div>
        <div className="item-card-actions">
          <button
            type="button"
            onClick={() => engine.toggleItemLock(item.uid)}
            title={item.locked
              ? 'Unlock -- Sell, Sell Junk, and Scrap can reach this item again'
              : 'Lock in the Vault -- protects this item from Sell, Sell Junk, and Scrap'}
          >
            {item.locked ? '\uD83D\uDD13' : '\uD83D\uDD12'}<br />{item.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            type="button"
            disabled={item.locked}
            title={item.locked ? 'Locked in the Vault -- unlock it first to sell' : undefined}
            onClick={(e) => {
              const pos = centerOf(e.currentTarget);
              if (!confirmSell) doSell(pos); else setPendingSell(pos);
            }}
          >
            <span style={{ color: item.locked ? undefined : 'var(--brass)' }}>{'\u25c6'} {formatGold(EquipmentManager.sellValue(item))}</span><br />Sell
          </button>
          <button
            type="button"
            disabled={item.locked}
            title={item.locked ? 'Locked in the Vault -- unlock it first to scrap' : 'Breaks the item down for Scrap materials. This cannot be undone.'}
            onClick={(e) => setPendingScrap(centerOf(e.currentTarget))}
          >
            <span style={{ color: item.locked ? undefined : 'var(--violet)' }}>{'\u2699'} {scrapValue}</span><br />Scrap
          </button>
        </div>
      </div>
      {pendingSell && (
        <ConfirmModal
          title="Sell item"
          message={`Sell ${def.name} for ${formatGold(EquipmentManager.sellValue(item))}?`}
          confirmLabel="Sell"
          onConfirm={() => doSell(pendingSell)}
          onCancel={() => setPendingSell(null)}
        />
      )}
      {pendingScrap && (
        <ConfirmModal
          title="Scrap item"
          message={`Scrap ${def.name} for ${scrapValue} Scrap? This cannot be undone.`}
          confirmLabel="Scrap"
          onConfirm={() => doScrap(pendingScrap)}
          onCancel={() => setPendingScrap(null)}
        />
      )}
    </>
  );
}

function SuppliesStock() {
  const engine = useEngine();
  const state = engine.state;

  return (
    <>
      <div className="row end" style={{ marginBottom: 8 }}>
        <ShopRerollButton vendorId="alchemist" />
      </div>
      <div className="grid vendor-stock-grid">
        {state.shop.consumables.map((entry) => {
          const def = CONSUMABLE_BY_ID[entry.defId];
          const price = def ? InventoryManager.price(state, def) : 0;
          return (
            <ConsumableShopCard
              key={entry.defId}
              def={def}
              price={price}
              canAfford={(amount) => state.gold >= price * amount}
              onBuy={(amount) => engine.buyConsumable(entry.defId, amount)}
            />
          );
        })}
      </div>
    </>
  );
}

function BlackMarketStock({ now }: { now: number }) {
  const engine = useEngine();
  const state = engine.state;
  const blackMarketUnlocked = ModifierManager.hasUnlock(state, 'blackMarket');

  if (!blackMarketUnlocked) {
    return (
      <>
        <p className="small muted">
          Rumour is there's a contact who deals in rarer stock — for a price. Unlock via the Black Market
          Contact upgrade in Guild Hall.
        </p>
        {/* Same "jump to and highlight the requirement" treatment as
         *  RaidsPanel's difficulty circles / whole-tab locked state and
         *  HeroesPanel's locked recruit cards (patch 0179) -- rather than
         *  leaving the player to go find Black Market Contact among every
         *  other Guild Hall upgrade by hand. */}
        <button
          className="btn-ghost"
          onClick={() => engine.requestTab('guild', 'black_market_contact')}
        >
          Go to Guild Hall →
        </button>
      </>
    );
  }

  return (
    <>
      <div className="spread" style={{ alignItems: 'center', marginBottom: 8 }}>
        <p className="tiny muted" style={{ margin: 0 }}>
          Rare, epic, and legendary only. No haggling. Stock turns over in{' '}
          {formatDuration(ShopManager.timeUntilBlackMarketRefresh(state, now))}.
        </p>
        <ShopRerollButton vendorId="enchanter" />
      </div>
      {state.blackMarket.equipment.length === 0 && (
        <p className="small muted">The contact has nothing worth showing right now.</p>
      )}
      <div className="grid vendor-stock-grid">
        {state.blackMarket.equipment.map((entry) => (
          <EquipmentShopCard
            key={entry.uid}
            def={EQUIPMENT_BY_ID[entry.defId]}
            itemLevel={entry.itemLevel}
            price={entry.price}
            canAfford={state.gold >= entry.price}
            onBuy={() => engine.buyBlackMarketEquipment(entry.uid)}
            blackMarket
          />
        ))}
      </div>
    </>
  );
}

/** Collapsed summary (icon, name, price) only -- clicking opens a detail modal. */
function EquipmentShopCard({
  def, itemLevel, price, canAfford, onBuy, blackMarket,
}: {
  def: EquipmentDef | undefined; itemLevel?: number; price: number; canAfford: boolean; onBuy: () => void; blackMarket?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  if (!def) return null;
  // patch 0241 -- itemLevel is the level this specific stock slot was
  // actually rolled against (ShopManager.rollEquipment/refreshBlackMarket),
  // which is what the eventual purchase's real power is budgeted off of.
  // Falls back to def.reqLevel for a slot generated before this patch
  // (ShopStock.equipment's itemLevel is optional for exactly that reason).
  const displayLevel = itemLevel ?? def.reqLevel;
  const procedural = isProceduralTemplate(def);

  return (
    <>
      <div
        className={`card vendor-stock-card ${blackMarket ? 'black-market-item' : ''}`}
        style={{ marginBottom: 0 }}
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(true); } }}
      >
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="rarity-banner-content row" style={{ gap: 10, alignItems: 'center' }}>
          <ItemIcon slot={def.slot} icon={def.icon} size={41} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: RARITY_COLOR[def.rarity], fontWeight: 700, fontSize: 13 }}>{def.name}</div>
            <div className="tiny muted">Lv {displayLevel} · {formatGold(price)}</div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
            <div className="modal-banner-scrim">
              <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <ItemIcon slot={def.slot} icon={def.icon} size={55} />
                <div>
                  <span className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</span>
                  <div className="tiny muted">{def.slot} · {def.rarity} · requires level {def.reqLevel}</div>
                </div>
              </div>
              {procedural ? (
                // Procedural templates (patch 0214) carry no fixed mods of
                // their own -- def.mods is deliberately empty, real stats
                // roll fresh at purchase time (EquipmentManager.instantiate,
                // via ShopManager.purchaseRoll) budgeted off displayLevel
                // above, same "randomised rolls" quest/raid loot already
                // has. Showing "No bonuses" here (describeMods({}) would)
                // read as a broken/statless item rather than what's
                // actually true, so this reads as intentional mystery
                // instead.
                <p className="tiny muted" style={{ margin: '6px 0 12px' }}>
                  Stats roll when purchased, scaled to level {displayLevel}.
                </p>
              ) : (
                <div className="stat-row" style={{ margin: '6px 0 12px' }}>
                  {describeMods(def.mods).map((line) => <span key={line}>{line}</span>)}
                </div>
              )}
              <div className="row end" style={{ gap: 8 }}>
                <button className="btn-primary" onClick={() => setShowModal(false)}>Close</button>
                <button className="btn-primary" disabled={!canAfford} onClick={() => { onBuy(); setShowModal(false); }}>
                  Buy · {formatGold(price)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ConsumableShopCard({
  def, price, canAfford, onBuy,
}: {
  def: ConsumableDef | undefined; price: number; canAfford: (amount: number) => boolean; onBuy: (amount: number) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  if (!def) return null;

  return (
    <>
      <div
        className="card vendor-stock-card"
        style={{ marginBottom: 0 }}
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(true); } }}
      >
        <div className="rarity-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
        <div className="rarity-banner-content row" style={{ gap: 10, alignItems: 'center' }}>
          <ConsumableIcon icon={def.icon} glyph={def.glyph} size={41} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: RARITY_COLOR[def.rarity], fontWeight: 700, fontSize: 13 }}>{def.name}</div>
            <div className="tiny muted">{formatGold(price)}</div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-banner" style={{ backgroundImage: `url(${RARITY_BANNER[def.rarity]})` }} />
            <div className="modal-banner-scrim">
              <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <ConsumableIcon icon={def.icon} glyph={def.glyph} size={55} />
                <span className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</span>
              </div>
              <p className="card-flavour">{def.description}</p>
              <div className="row end" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn-primary" onClick={() => setShowModal(false)}>Close</button>
                <button className="btn-primary" disabled={!canAfford(1)} onClick={() => { onBuy(1); setShowModal(false); }}>
                  Buy · {formatGold(price)}
                </button>
                {/* Alchemist stock (potions, charms) gets bought through
                    repeatedly far more than gear does -- a x5 button here
                    cuts five separate clicks (open modal, buy, close,
                    repeat) down to one, on the item people actually stock
                    up on. */}
                <button className="btn-primary" disabled={!canAfford(5)} onClick={() => { onBuy(5); setShowModal(false); }}>
                  Buy ×5 · {formatGold(price * 5)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
