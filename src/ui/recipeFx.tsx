import { useEffect, useRef, useState } from 'react';
import { CraftingRecipeDef } from '../game/types';
import { MATERIAL_BY_ID } from '../game/data/materials';
import { formatGold } from '../game/util';
import { fxMs } from './purchaseFx';
import { getFlyTargetCenter } from './flyTarget';

/**
 * Patch 0428 -- learning a recipe (Design canvas "Learning a recipe",
 * signed off). The scroll unrolls and its contents ink in line by line,
 * LEARNED is stamped across it, then it rolls back up and flies to the
 * Vendors tab (where the recipe is now craftable), with a line saying
 * which vendor. Played on top of everything after engine.learnRecipe has
 * already applied; the overlay removes itself. Skipped with motion off.
 */

/** Which vendor crafts each recipe category (VendorsPanel's own routing:
 *  gear at the Blacksmith, supplies and charms at the Alchemist, enchant
 *  and gem crafting at the Enchanter). */
export const RECIPE_VENDOR: Record<CraftingRecipeDef['category'], string> = {
  gear: 'the Blacksmith', consumable: 'the Alchemist', charm: 'the Alchemist', enchant: 'the Enchanter', gem: 'the Enchanter',
};

type Phase = 'open' | 'stamp' | 'close' | 'fly';

export function RecipeLearnFx({ recipe, onDone }: { recipe: CraftingRecipeDef; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('open');
  const [fly, setFly] = useState<{ dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const ids = [
      window.setTimeout(() => setPhase('stamp'), fxMs(1600)),
      window.setTimeout(() => setPhase('close'), fxMs(2400)),
      window.setTimeout(() => {
        const r = ref.current?.getBoundingClientRect();
        const to = getFlyTargetCenter('vendors');
        setFly(r && to ? { dx: to.x - (r.left + r.width / 2), dy: to.y - (r.top + r.height / 2) } : { dx: 0, dy: -200 });
        setPhase('fly');
      }, fxMs(2800)),
      window.setTimeout(() => done.current(), fxMs(3400)),
    ];
    return () => ids.forEach((t) => window.clearTimeout(t));
  }, []);

  const mats = Object.entries(recipe.materialCost) as [keyof typeof MATERIAL_BY_ID, number][];
  const lines: { k: string; v: string }[] = [
    ...mats.map(([id, n]) => ({ k: MATERIAL_BY_ID[id]?.name ?? id, v: `×${n}` })),
    ...(recipe.scrapCost ? [{ k: 'Scrap', v: `×${recipe.scrapCost}` }] : []),
    ...(recipe.goldCost ? [{ k: 'Gold', v: formatGold(recipe.goldCost) }] : []),
  ];

  return (
    <div className="rcx-overlay fx-recipe" aria-hidden="true">
      <div
        ref={ref}
        className={`rcx-scroll ${phase === 'close' || phase === 'fly' ? 'closing' : 'open'} ${phase === 'fly' ? 'fly' : ''}`}
        style={fly ? { ['--dx' as string]: `${fly.dx}px`, ['--dy' as string]: `${fly.dy}px` } : undefined}
      >
        <span className="rcx-rod" />
        <div className="rcx-sheet">
          <div className="rcx-inner">
            <div className="rcx-title rcx-ink" style={{ animationDelay: 'calc(var(--fx-t) * 450)' }}>{recipe.name}</div>
            <div className="rcx-desc rcx-ink" style={{ animationDelay: 'calc(var(--fx-t) * 620)' }}>{recipe.description}</div>
            {lines.map((l, i) => (
              <div key={l.k} className="rcx-mat rcx-ink" style={{ animationDelay: `calc(var(--fx-t) * ${780 + i * 100})` }}>
                <span>{l.k}</span><span>{l.v}</span>
              </div>
            ))}
            <div className="rcx-note rcx-ink" style={{ animationDelay: `calc(var(--fx-t) * ${800 + lines.length * 100})` }}>
              Craft it at {RECIPE_VENDOR[recipe.category]}.
            </div>
          </div>
          {phase !== 'open' && <span className="rcx-stamp">Learned</span>}
        </div>
        <span className="rcx-rod bottom" />
      </div>
    </div>
  );
}
