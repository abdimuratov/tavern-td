import type { Replay } from '../core/replay';

/**
 * A fixed Original Run (Stage 1's Map, Easy, every family open) with Waves of
 * its own that bring flyers, a Bloater, Shieldbearers, Flesh Golems, Revenants,
 * Gargoyles and two bosses. It touches builds on Open ground (Stage 1's
 * former Build Spots, and one refused on the road), Tier upgrades, three
 * Specialisations, targeting, refused commands, early calls, the Arrow
 * capstone's crits, auras, poison, slows, splits, broods and enrage;
 * then it sells its best towers mid-Wave, and the Plague Mother's Leak ends
 * the Run. Node and WebKit must reach the same replayHash on it (e2e/determinism.spec.ts).
 */
export const ORIGINAL_FIXTURE_REPLAY: Replay = {
  mode: 'original',
  seed: 20261018,
  difficulty: 'easy',
  options: {
    stage: 1,
    cleared: 12,
    gold: 3700,
    talents: ['fletching', 'quick-nock', 'woodcutters', 'hawkeye', 'deep-chill', 'potency', 'contagion'],
    waves: [
      { groups: [{ creep: 'ghoul', count: 6 }, { creep: 'bloodbat', count: 3, at: 2 }] },
      { groups: [{ creep: 'hound', count: 4 }, { creep: 'bloater', count: 3 }] },
      { groups: [{ creep: 'shieldbearer', count: 2 }, { creep: 'flesh_golem', count: 2 }, { creep: 'revenant', count: 2 }] },
      { groups: [{ creep: 'ghoul', count: 6 }, { creep: 'gargoyle', count: 3, at: 1 }] },
      { groups: [{ creep: 'gravelord', count: 1 }, { creep: 'ghoul', count: 3, at: 1 }] },
      { groups: [{ creep: 'plague_mother', count: 1 }, { creep: 'cultist', count: 2, at: 2 }, { creep: 'hound', count: 10, gap: 0.3, at: 3 }] },
    ],
  },
  until: 9000,
  log: [
    { tick: 0, command: { type: 'original.build', col: 23, row: 4, spec: 'arrow_tower' } },
    { tick: 0, command: { type: 'original.build', col: 23, row: 6, spec: 'cannon_tower' } },
    { tick: 0, command: { type: 'original.build', col: 19, row: 4, spec: 'venom_dart' } },
    { tick: 0, command: { type: 'original.build', col: 19, row: 6, spec: 'drum_totem' } },
    { tick: 0, command: { type: 'original.build', col: 7, row: 10, spec: 'frost_tower' } },
    { tick: 0, command: { type: 'original.build', col: 11, row: 10, spec: 'mage_tower' } },
    { tick: 0, command: { type: 'original.build', col: 0, row: 2, spec: 'arrow_tower' } },
    { tick: 0, command: { type: 'original.upgrade', tower: 1, to: 'marksman_tower' } },
    { tick: 1, command: { type: 'original.sendNow' } },
    { tick: 2, command: { type: 'original.sendNow' } },
    { tick: 3, command: { type: 'original.target', tower: 2, targeting: 'strong' } },
    { tick: 300, command: { type: 'original.upgrade', tower: 1, to: 'longbow_tower' } },
    { tick: 300, command: { type: 'original.upgrade', tower: 1, to: 'marksman_tower' } },
    { tick: 300, command: { type: 'original.upgrade', tower: 1, to: 'deadeye_perch' } },
    { tick: 600, command: { type: 'original.upgrade', tower: 2, to: 'bombard' } },
    { tick: 600, command: { type: 'original.upgrade', tower: 2, to: 'great_bombard' } },
    { tick: 600, command: { type: 'original.upgrade', tower: 2, to: 'flak_battery' } },
    { tick: 700, command: { type: 'original.upgrade', tower: 5, to: 'ice_spire' } },
    { tick: 900, command: { type: 'original.sendNow' } },
    { tick: 1500, command: { type: 'original.sell', tower: 3 } },
    { tick: 1501, command: { type: 'original.build', col: 19, row: 4, spec: 'venom_dart' } },
    { tick: 2000, command: { type: 'original.upgrade', tower: 6, to: 'sorcerer_tower' } },
    { tick: 2000, command: { type: 'original.upgrade', tower: 6, to: 'archmage_tower' } },
    { tick: 2000, command: { type: 'original.upgrade', tower: 6, to: 'prism_tower' } },
    { tick: 2100, command: { type: 'original.upgrade', tower: 4, to: 'spirit_totem' } },
    { tick: 2100, command: { type: 'original.upgrade', tower: 4, to: 'ancestor_totem' } },
    { tick: 2100, command: { type: 'original.upgrade', tower: 4, to: 'war_totem' } },
    { tick: 2200, command: { type: 'original.upgrade', tower: 5, to: 'glacier_spire' } },
    { tick: 2200, command: { type: 'original.upgrade', tower: 5, to: 'rime_lance' } },
    { tick: 2500, command: { type: 'original.sendNow' } },
    { tick: 4000, command: { type: 'startWave' } },
    { tick: 4100, command: { type: 'original.sell', tower: 1 } },
    { tick: 4100, command: { type: 'original.sell', tower: 2 } },
    { tick: 4100, command: { type: 'original.sell', tower: 6 } },
    { tick: 5000, command: { type: 'original.sendNow' } },
  ],
};
