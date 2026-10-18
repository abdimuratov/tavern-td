import type { ArmorType, MaulCreepInfo, MaulCreepSpec } from './types';

// Maul's creeps (docs/maul-design.md §6). HP is a multiple of a Raider's HP on
// the Wave (src/sim/modes/maul/waves.ts), so a spec's `hp` is only its HP on
// Wave 1. Bounty is 0 on every spec: the Wave's bounty pool pays kills instead.

/** A Raider's HP on Wave 1, the unit every creep's HP is a multiple of. */
export const RAIDER_BASE_HP = 8;

/** Bosses can't be slowed below this share of their speed. */
export const BOSS_SLOW_FLOOR = 0.5;

function creep(id: string, name: string, armorType: ArmorType, speed: number, info: MaulCreepInfo & { readonly flying?: boolean }): [string, MaulCreepSpec] {
  const { flying = false, ...maul } = info;
  // An unslowable creep's floor is its own speed, so slows do nothing; a stun still holds it.
  const minSpeed = maul.unslowable ? speed : maul.kind === 'boss' ? speed * BOSS_SLOW_FLOOR : undefined;
  return [id, {
    name, hp: RAIDER_BASE_HP * maul.hpMult, armor: maul.armor, armorType, speed, flying, bounty: 0, leakCost: maul.lives,
    ...(minSpeed === undefined ? {} : { minSpeed }),
    maul,
  }];
}

const ROWS: readonly [string, MaulCreepSpec][] = [
  creep('raider', 'Raider', 'medium', 230, {
    kind: 'normal', hpMult: 1, perSpawn: 10, gap: 0.5, lives: 1, armor: 0, hint: 'Frost hits Medium armor hardest',
  }),
  creep('snowling', 'Snowling', 'light', 250, {
    kind: 'swarm', hpMult: 0.4, perSpawn: 20, gap: 0.3, lives: 1, armor: 0, hint: 'A swarm: splash and multishot',
  }),
  creep('frost_wolf', 'Frost Wolf', 'light', 360, {
    kind: 'fast', hpMult: 0.7, perSpawn: 10, gap: 0.4, lives: 1, armor: 0, hint: 'Fast: slow them, or make the maze longer',
  }),
  creep('brute', 'Brute', 'heavy', 200, {
    kind: 'brute', hpMult: 2.5, perSpawn: 5, gap: 0.8, lives: 2, armor: 2, hint: 'Heavy armor: Magic hits hardest',
  }),
  creep('golem', 'Ice Golem', 'fortified', 170, {
    kind: 'golem', hpMult: 3, perSpawn: 4, gap: 1.0, lives: 2, armor: 4, hint: 'Fortified: Siege, poison or Chaos',
  }),
  creep('troll', 'Troll', 'medium', 220, {
    kind: 'regen', hpMult: 1.4, perSpawn: 8, gap: 0.6, lives: 1, armor: 1, hint: 'Heals 2% a second: burst it down',
  }),
  creep('wraith', 'Wraith', 'medium', 240, {
    kind: 'unslowable', hpMult: 1.1, perSpawn: 9, gap: 0.5, lives: 1, armor: 0, unslowable: true, hint: 'Slows can\'t touch it',
  }),
  creep('harpy', 'Harpy', 'light', 260, {
    kind: 'air', hpMult: 0.6, perSpawn: 8, gap: 0.6, lives: 1, armor: 0, flying: true, hint: 'Flies over the maze: Pierce hits Light armor hardest',
  }),
  creep('warlord', 'Tusked Warlord', 'hero', 170, {
    kind: 'boss', hpMult: 10, perSpawn: 1, gap: 1, lives: 5, armor: 3, hint: 'A boss: every armor type takes full damage',
  }),
  creep('mammoth', 'War Mammoth', 'hero', 150, {
    kind: 'boss', hpMult: 11, perSpawn: 1, gap: 1, lives: 5, armor: 5, hint: 'A boss with thick hide',
  }),
  creep('colossus', 'Glacier Colossus', 'hero', 140, {
    kind: 'boss', hpMult: 12, perSpawn: 1, gap: 1, lives: 5, armor: 7, hint: 'A boss: slow, huge, and armored',
  }),
  creep('winter_king', 'The Winter King', 'hero', 140, {
    kind: 'boss', hpMult: 14, perSpawn: 1, gap: 1, lives: 20, armor: 8, hint: 'The last boss: if one leaks, the Run is lost',
  }),
];

export const MAUL_CREEPS: Readonly<Record<string, MaulCreepSpec>> = Object.fromEntries(ROWS);

/** Share of max HP a Troll heals each second. */
export const TROLL_REGEN = 0.02;
