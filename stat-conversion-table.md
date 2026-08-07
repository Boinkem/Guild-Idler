# Stat -> Modifier Conversion Table

Companion reference to `guild-idler-project-brief.md` / `guild-idler-status.md`.
Answers "how much does +1 Strength actually translate into?" directly from the
live formulas in `HeroManager.statMods` and `HeroManager.personalLootBonus`
(`src/game/managers/HeroManager.ts`) -- not estimated, computed.

---

## Why there's no single fixed ratio

Every stat curve in this game is a **square-root or power curve**, not linear:

```
success      = sqrt(strength) * 1.6 + sqrt(endurance) * 0.8
gold%        = sqrt(luck) * 2.2
xp%          = sqrt(wisdom) * 2.6
injuryResist = sqrt(endurance) * 2.0
speed%       = endurance^0.7 * 1.3
loot%        = luck^0.9 * 7.2   (personalLootBonus -- see "Units" below, this
                                  one is multiplicative, not additive)
```

Square-root and power-law curves have **diminishing returns**: the first few
points in a stat are worth far more than the same +1 point once a hero is
already stacked. So "+1 Strength = X% success" isn't a single number -- it
depends on how much Strength that hero already has. The table below gives the
real, computed marginal value of +1 point at a spread of benchmark levels
instead of a misleading single average.

## Units -- read this before the table

- **Success, Gold%, XP%, InjuryResist, Speed%** are all **additive**
  percentage-point modifiers, summed together with every other source
  (class, equipment, injuries, guild upgrades, consumables) via `sumMods`,
  then applied once:
  - Success: added directly to the quest's `baseSuccess` (0-100 scale,
    clamped 5-95 after the reqLevel-anchoring offset).
  - Gold% / XP%: `multiplier = 1 + mods/100` -- e.g. +20 gold mod = 1.2x
    gold on that quest.
  - Speed%: `factor = clamp(1 - mods/100, 0.25, 1.75)` applied to quest
    duration -- e.g. +20 speed mod = 0.8x duration (20% faster), floored at
    75% total reduction (0.25x) regardless of how high speed mods stack.
  - InjuryResist: used directly as a 0-100 percent chance to avoid an
    injury on a failed quest.
- **Loot%** (`personalLootBonus`, Luck's own contribution) is different --
  it's a **multiplicative** stage applied on top of (difficulty tier loot +
  every other account-wide loot bonus), not summed into the same additive
  pool: `chance = baseChance * (1 + accountLoot/100) * (1 + personalLoot/100)`,
  capped at 90% per item. A "+1 Loot%" point is not directly comparable to a
  "+1 Success" point -- they're different mechanisms. Don't add them together.

Luck feeds both Gold% (additive) and Loot% (multiplicative) independently --
they're two separate formulas reading the same stat, not one value split two
ways.

---

## The table

Marginal gain from the *next* +1 point, computed at each stat level shown
(i.e. "going from this level to level+1"). Endurance appears twice since it
feeds three different modifiers (Success, InjuryResist, Speed%) at three
different coefficients.

| Stat level | +1 Success (Str) | +1 Success (End) | +1 InjuryResist (End) | +1 Speed% (End) | +1 Gold% (Luck) | +1 XP% (Wis) | +1 Loot% (Luck, multiplicative) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5   | 0.341 | 0.171 | 0.427 | 0.546 | 0.470 | 0.555 | 5.465 |
| 10  | 0.247 | 0.123 | 0.309 | 0.450 | 0.340 | 0.401 | 5.122 |
| 15  | 0.203 | 0.102 | 0.254 | 0.400 | 0.279 | 0.330 | 4.927 |
| 20  | 0.177 | 0.088 | 0.221 | 0.368 | 0.243 | 0.287 | 4.791 |
| 25  | 0.158 | 0.079 | 0.198 | 0.344 | 0.218 | 0.257 | 4.687 |
| 30  | 0.145 | 0.072 | 0.181 | 0.326 | 0.199 | 0.235 | 4.604 |
| 40  | 0.126 | 0.063 | 0.157 | 0.300 | 0.173 | 0.204 | 4.475 |
| 50  | 0.113 | 0.056 | 0.141 | 0.281 | 0.155 | 0.183 | 4.378 |
| 65  | 0.099 | 0.049 | 0.124 | 0.260 | 0.136 | 0.161 | 4.265 |
| 80  | 0.089 | 0.045 | 0.111 | 0.244 | 0.123 | 0.145 | 4.178 |
| 100 | 0.080 | 0.040 | 0.100 | 0.228 | 0.110 | 0.130 | 4.087 |
| 125 | 0.071 | 0.036 | 0.089 | 0.214 | 0.098 | 0.116 | 3.997 |
| 150 | 0.065 | 0.033 | 0.082 | 0.202 | 0.090 | 0.106 | 3.925 |
| 200 | 0.056 | 0.028 | 0.071 | 0.186 | 0.078 | 0.092 | 3.814 |

**How to read a row:** at 30 Strength, the next point of Strength (30->31)
adds +0.145 percentage points of Success. At 30 Endurance, the next point
adds +0.072 Success, +0.181 InjuryResist, and +0.326 Speed% all at once
(Endurance feeds all three).

## Worked example

A level-30 Adventurer with 30 Strength / 25 Endurance (roughly what natural
class growth alone produces around that level, no spent points):

```
Success from stats = sqrt(30)*1.6 + sqrt(25)*0.8 = 8.76 + 4.00 = 12.76
```

Spending a stat point on Strength (30->31) instead of Endurance (25->26)
adds **+0.145** Success either way you'd expect from the table above
(Strength's own row at level 30) vs Endurance's smaller **+0.079** Success
contribution at level 25 -- but that same Endurance point *also* adds
InjuryResist and Speed% that a Strength point never touches. Which is
"better" depends on what that hero actually needs (a fragile hero on Hard+
quests may value the InjuryResist more than the raw Success), not a single
right answer -- that trade-off is deliberate, not an oversight.

## Practical takeaways

- **Early points matter far more than late ones.** Going from 5->10
  Strength is worth roughly 2x what 100->105 is, point for point. Spreading
  early recruits' stat points rather than dumping them all into one stat
  captures more of this steep early curve.
- **Endurance is the only "triple dip" stat** -- Strength/Luck/Wisdom each
  feed exactly one modifier; Endurance feeds three (Success, InjuryResist,
  Speed%) simultaneously. A point in Endurance is doing more total work per
  point than it looks like from the Success column alone.
- **Loot% numbers look huge (4-5+ per point) next to Success (0.1-0.3 per
  point) because they're not the same unit** -- Loot% is a multiplicative
  percentage on an already-small base drop chance, Success is a direct
  percentage-point on a 5-95 scale. Don't compare them at face value.

---

*Generated directly from `HeroManager.statMods`/`HeroManager.personalLootBonus`
as of this patch. If those formulas change, this table goes stale --
regenerate rather than hand-edit.*
