import type { ArmorType, OriginalCreepInfo, OriginalCreepSpec } from './types';

// The Original's ten creeps and three bosses (docs/original-design.md §5). HP
// is a multiple of a Ghoul's HP at the Wave's Threat, so a spec's `hp` is only
// its HP at Threat 1; the Waves set the real HP and bounty. Numeric armor is 0
// on every creep: only debuffs move it.

/** A Ghoul's HP at Threat 1, the unit every creep's HP is a multiple of. */
export const GHOUL_BASE_HP = 20;

function creep(id: string, name: string, armorType: ArmorType, speed: number, flying: boolean, info: OriginalCreepInfo): [string, OriginalCreepSpec] {
  return [id, {
    name, hp: GHOUL_BASE_HP * info.hpMult, armor: 0, armorType, speed, flying, bounty: 0, leakCost: info.lives, original: info,
  }];
}

const ROWS: readonly [string, OriginalCreepSpec][] = [
  creep('ghoul', 'Ghoul', 'unarmored', 160, false, { role: 'normal', hpMult: 1, perWave: 10, gap: 1, lives: 1, xp: 2 }),
  creep('hound', 'Hound', 'unarmored', 260, false, { role: 'fast', hpMult: 0.7, perWave: 10, gap: 0.8, lives: 1, xp: 2 }),
  creep('crawler', 'Crawler', 'unarmored', 180, false, { role: 'swarm', hpMult: 0.4, perWave: 20, gap: 0.35, lives: 1, xp: 1 }),
  creep('bloodbat', 'Bloodbat', 'unarmored', 200, true, { role: 'flying', hpMult: 0.6, perWave: 8, gap: 0.8, lives: 1, xp: 2 }),
  creep('revenant', 'Revenant', 'armored', 120, false, { role: 'armored', hpMult: 3, perWave: 4, gap: 1.6, lives: 2, xp: 6 }),
  creep('cultist', 'Cultist', 'warded', 150, false, { role: 'magic-resistant', hpMult: 1.5, perWave: 6, gap: 1.2, lives: 1, xp: 3 }),
  creep('flesh_golem', 'Flesh Golem', 'unarmored', 140, false, { role: 'regenerating', hpMult: 1.8, perWave: 6, gap: 1.2, lives: 1, xp: 4, regen: 0.03 }),
  creep('bloater', 'Bloater', 'unarmored', 150, false, {
    role: 'splitting', hpMult: 1.2, perWave: 6, gap: 1.2, lives: 1, xp: 3, split: { creep: 'crawler', count: 2 },
  }),
  creep('shieldbearer', 'Shieldbearer', 'unarmored', 140, false, { role: 'shielded', hpMult: 2, perWave: 5, gap: 1.4, lives: 2, xp: 5, shield: 0.1 }),
  creep('gargoyle', 'Gargoyle', 'armored', 170, true, { role: 'armored flyer', hpMult: 1.2, perWave: 6, gap: 1, lives: 2, xp: 4 }),
  creep('gravelord', 'Gravelord', 'boss', 100, false, {
    role: 'boss', hpMult: 12, perWave: 1, gap: 1, lives: 5, xp: 30, boss: { kind: 'enrage', at: 0.5, haste: 0.5, duration: 4 },
  }),
  creep('plague_mother', 'Plague Mother', 'boss', 90, false, {
    role: 'boss', hpMult: 12, perWave: 1, gap: 1, lives: 10, xp: 40, regen: 0.01, boss: { kind: 'brood', every: 6, creep: 'crawler', count: 3 },
  }),
  creep('riftlord', 'Riftlord', 'boss', 80, false, {
    role: 'final boss', hpMult: 24, perWave: 1, gap: 1, lives: 20, xp: 60,
    // Its Shield is four times a Shieldbearer's.
    boss: { kind: 'rift', at: [0.75, 0.5, 0.25], shield: 0.4, duration: 4, creep: 'hound', count: 4 },
  }),
];

export const ORIGINAL_CREEPS: Readonly<Record<string, OriginalCreepSpec>> = Object.fromEntries(ROWS);
