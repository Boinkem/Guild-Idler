import { useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { useSettings } from '../useSettings';
import { ShopManager } from '../../game/managers/ShopManager';
import { ModifierManager } from '../../game/managers/ModifierManager';
import { GuildManager } from '../../game/managers/GuildManager';
import { EquipmentManager } from '../../game/managers/EquipmentManager';
import { InventoryManager } from '../../game/managers/InventoryManager';
import { EQUIPMENT_BY_ID } from '../../game/data/equipment';
import { CONSUMABLE_BY_ID } from '../../game/data/items';
import { VENDORS, vendorUpgrades } from '../../game/data/progression';
import { EquipmentDef, ConsumableDef, VendorId, UpgradeDef, CraftingRecipeDef } from '../../game/types';
import { describeMods, formatDuration, formatGold, RARITY_COLOR } from '../../game/util';
import { ItemIcon, ConsumableIcon } from '../icons';
import { VendorSprite } from '../sprites/VendorSprite';
import { MaxFlash, useMaxFlash, usePulsesOnChange } from '../maxFlash';
import { CraftingStation } from '../CraftingStation';
import { EnhanceStation } from '../EnhanceStation';
import { WeaponEnchantStation } from '../WeaponEnchantStation';
import { ArmourInfusionStation } from '../ArmourInfusionStation';
import { ScrapStation } from '../ScrapStation';

/** Confirmed pairing, not a guess -- Blacksmith sells armour, Alchemist sells
 *  supplies, Enchanter sells the black market. Same mapping decides which
 *  slice of Crafting each vendor's overlay button opens. */
const VENDOR_CRAFT_CATEGORY: Record<VendorId, CraftingRecipeDef['category']> = {
  blacksmith: 'gear', alchemist: 'consumable', enchanter: 'enchant',
};

export function VendorsPanel() {
  const [tab, setTab] = useState<VendorId>('blacksmith');

  return (
    <>
      <h2>Vendors</h2>
      <p className="subtitle">Upgrades, stock, and Crafting all live on each vendor's own page now.</p>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        {VENDORS.map((v) => (
          <button key={v.id} className={`btn-subtab ${tab === v.id ? 'on' : ''}`} onClick={() => setTab(v.id)}>
            {v.name}
          </button>
        ))}
      </div>

      {VENDORS.filter((v) => v.id === tab).map((v) => <VendorPage key={v.id} vendorId={v.id} />)}
    </>
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
          {upMaxed ? 'Fully upgraded' : `Buy · ${formatGold(upCost ?? 0)}`}
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
              <span className="card-title">{vendorDef.name}</span>
              <span className={`small muted ${levelPulses[`vendor:${vendorId}`] ? 'purchase-pulse' : ''}`}>Level {level}/{upgradeList.length}</span>
            </div>
            <p className="card-flavour">{vendorDef.blurb}</p>
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn-yellow"
                disabled={maxed || cost === null || state.gold < cost}
                onClick={() => engine.levelUpVendor(vendorId)}
              >
                {maxed ? 'Nothing more to teach' : `Level up · ${formatGold(cost ?? 0)}`}
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
      {cost > 0 ? `Reroll stock · ${formatGold(cost)}` : 'Reroll stock · Free'}
    </button>
  );
}

function ArmourStock({ now, settings }: { now: number; settings: { confirmSell: boolean } }) {
  const engine = useEngine();
  const state = engine.state;

  return (
    <>
      <div className="spread" style={{ alignItems: 'center', marginBottom: 8 }}>
        <p className="tiny muted" style={{ margin: 0 }}>
          Stock rotates in {formatDuration(ShopManager.timeUntilRefresh(state, now))}. The armourer buys as well as sells.
        </p>
        <ShopRerollButton vendorId="blacksmith" />
      </div>
      {state.shop.equipment.length === 0 && <p className="small muted">Sold out. Come back after the next delivery.</p>}
      <div className="grid two">
        {state.shop.equipment.map((entry) => (
          <EquipmentShopCard
            key={entry.uid}
            def={EQUIPMENT_BY_ID[entry.defId]}
            price={entry.price}
            canAfford={state.gold >= entry.price}
            onBuy={() => engine.buyShopEquipment(entry.uid)}
          />
        ))}
      </div>

      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="section-heading" style={{ marginBottom: 0 }}>Sell from the stash</div>
        <span className="tiny muted">Scrap: {state.scrap}</span>
      </div>
      {state.stash.length === 0 && <p className="small muted">Nothing spare to sell.</p>}
      <div className="grid two">
        {state.stash.map((item) => {
          const def = EQUIPMENT_BY_ID[item.defId];
          if (!def) return null;
          return (
            <div key={item.uid} className="spread card" style={{ marginBottom: 0 }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <ItemIcon slot={def.slot} icon={def.icon} size={28} />
                <span style={{ color: RARITY_COLOR[def.rarity], fontSize: 11 }}>
                  {def.name}{item.plus > 0 ? ` +${item.plus}` : ''}
                </span>
              </div>
              <button onClick={() => { if (!settings.confirmSell || confirm('Sell this item?')) engine.sellItem(item.uid); }}>
                Sell · {formatGold(EquipmentManager.sellValue(item))}
              </button>
            </div>
          );
        })}
      </div>

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
      <div className="grid three">
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
      <p className="small muted">
        Rumour is there's a contact who deals in rarer stock — for a price. Unlock via the Black Market
        Contact upgrade in Guild Hall.
      </p>
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
      <div className="grid two">
        {state.blackMarket.equipment.map((entry) => (
          <EquipmentShopCard
            key={entry.uid}
            def={EQUIPMENT_BY_ID[entry.defId]}
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
  def, price, canAfford, onBuy, blackMarket,
}: {
  def: EquipmentDef | undefined; price: number; canAfford: boolean; onBuy: () => void; blackMarket?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  if (!def) return null;

  return (
    <>
      <div
        className={`card ${blackMarket ? 'black-market-item' : ''}`}
        style={{ marginBottom: 0 }}
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(true); } }}
      >
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <ItemIcon slot={def.slot} icon={def.icon} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: RARITY_COLOR[def.rarity], fontWeight: 700, fontSize: 11 }}>{def.name}</div>
            <div className="tiny muted">Lv {def.reqLevel} · {formatGold(price)}</div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <ItemIcon slot={def.slot} icon={def.icon} size={48} />
              <div>
                <span className="card-title" style={{ color: RARITY_COLOR[def.rarity] }}>{def.name}</span>
                <div className="tiny muted">{def.slot} · {def.rarity} · requires level {def.reqLevel}</div>
              </div>
            </div>
            <div className="stat-row" style={{ margin: '6px 0 12px' }}>
              {describeMods(def.mods).map((line) => <span key={line}>{line}</span>)}
            </div>
            <div className="row end" style={{ gap: 8 }}>
              <button className="btn-primary" onClick={() => setShowModal(false)}>Close</button>
              <button className="btn-primary" disabled={!canAfford} onClick={() => { onBuy(); setShowModal(false); }}>
                Buy · {formatGold(price)}
              </button>
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
        className="card"
        style={{ marginBottom: 0 }}
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(true); } }}
      >
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <ConsumableIcon icon={def.icon} glyph={def.glyph} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="card-title">{def.name}</div>
            <div className="tiny muted">{formatGold(price)}</div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <ConsumableIcon icon={def.icon} glyph={def.glyph} size={48} />
              <span className="card-title">{def.name}</span>
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
      )}
    </>
  );
}
