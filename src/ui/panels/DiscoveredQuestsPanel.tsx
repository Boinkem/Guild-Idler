import { useMemo, useState } from 'react';
import { useEngine, useNow } from '../useEngine';
import { HeroTab, QuestCard, Offer } from './QuestPanel';

/**
 * Quest chains, split out of the Quest Board tab into its own destination
 * (patch 0190) -- previously a "Discovered Quests" section tacked onto the
 * bottom of a hero's ordinary Contracts list, easy to miss under a long
 * board and requiring a scroll past every regular contract to even notice
 * a chain was waiting. Sits next to Quests in the Adventure group now,
 * same tier as Contracts rather than a subsection of it, with its own nav
 * shimmer (originally chain-specific in patch 0190, generalized into the
 * notification-driven isNavTabUnread system in patch 0191 -- see
 * attention.ts and .nav-tab-unread in app.css) so a newly-discovered
 * chain is visible from the tab bar itself, not just after opening the
 * tab. The discovery notification itself fires from GameEngine's
 * chainBoard-regeneration block, targeting this tab ('chains').
 *
 * Reuses QuestCard/HeroTab directly from QuestPanel rather than
 * duplicating them -- identical card behaviour either way (chain cards
 * never showed freeze controls to begin with, see QuestCard's own
 * isFrozen/canFreeze being optional), so there's nothing chain-specific
 * to diverge on. Keeps its own hero-tab selection state, independent from
 * the Quests tab's -- same "picking the hero is the first thing you do on
 * this tab" pattern QuestPanel already established, not shared state
 * across tabs, since a player comparing two heroes' options might
 * reasonably want each tab parked on a different one.
 */
export function DiscoveredQuestsPanel() {
  const engine = useEngine();
  const now = useNow();
  const state = engine.state;

  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(state.heroes[0]?.id ?? null);
  const selectedHero = state.heroes.find((h) => h.id === selectedHeroId) ?? state.heroes[0];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Same per-hero level filter QuestPanel's old chainOffers used -- a
  // chain's discovery is guild-wide (generateChainBoard gates on the
  // guild's single highest-level hero), but that only means every hero
  // eventually sees it, not that a fresh recruit should see stages dozens
  // of levels above anything they could act on today.
  const chainOffers = useMemo(
    () => selectedHero
      ? [...state.chainBoard]
        .filter((offer) => selectedHero.level >= offer.reqLevel)
        .sort((a, b) => a.duration - b.duration)
      : [],
    [state.chainBoard, selectedHero],
  );

  const send = (offer: Offer, chainSteps = false) => {
    if (selectedHero) engine.startQuest(selectedHero.id, offer, [], chainSteps);
  };

  if (!selectedHero) {
    return (
      <>
        <h2>Discovered Quests</h2>
        <p className="subtitle">Recruit a hero first -- quest chains open up once you have someone to send.</p>
      </>
    );
  }

  return (
    <>
      <h2>Discovered Quests</h2>
      <p className="subtitle">
        Story quest chains your heroes have uncovered on the board. Pick a hero below to see which
        chains are open to them right now.
      </p>

      <div className="section-heading">Heroes</div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
        {state.heroes.map((h) => (
          <HeroTab key={h.id} hero={h} selected={h.id === selectedHero.id} onSelect={() => setSelectedHeroId(h.id)} />
        ))}
      </div>

      {selectedHero.status === 'questing' ? (
        <p className="small muted">{selectedHero.name} is already out -- see the Quests tab's "On the road" list.</p>
      ) : chainOffers.length === 0 ? (
        <p className="small muted">
          No quest chains open to {selectedHero.name} yet. Chains appear here once discovered on the
          board and this hero meets their level requirement.
        </p>
      ) : (
        chainOffers.map((offer) => (
          <QuestCard
            key={offer.id}
            offer={offer}
            isOpen={expanded.has(offer.id)}
            hero={selectedHero}
            now={now}
            onToggleExpanded={toggleExpanded}
            onSend={send}
          />
        ))
      )}
    </>
  );
}
