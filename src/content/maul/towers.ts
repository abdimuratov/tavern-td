import type { AttackSpec, AuraSpec, EffectSpec, TargetLayer } from '../../sim';
import type { AttackType, MaulTowerInfo, MaulTowerSpec, RaceId, RaceSpec, TowerLine } from './types';

// Maul's 36 towers (docs/maul-design.md §5): four Races of nine. Each Race has
// a Wall and two lines; a Wall upgrades into either line's Tier 1 (of any Race
// the Run holds), a Tier 1 into its Tier 2, and a Tier 2 forks into one of two
// Tier 3 towers. Every tower is 2 × 2 and goes anywhere on open ground, so
// towers are the maze.
//
// Prices: a Wall is 10; Tier 1 is about 0.10 DPS per gold, each Tier after
// about 5% less, splash about half that per target, and range or slows paid
// for out of damage, as td-design-and-balance.md §9 proposes. Every line can
// hit air but the Mortar's and the Spore Pod's, as in Wintermaul, where
// nearly every tower could and none hit only air.

/** Every tower covers 2 × 2 cells, as WC3 buildings on a 64-unit grid did. */
export const TOWER_FOOTPRINT = 2;

/** All of Maul's slows share one key, so only the strongest on a creep counts. */
export const SLOW_KEY = 'maul:slow';
/** Spores and rot each have a key of their own, so one of each can tick on a creep beside every Dart tower's venom. */
export const SPORE_KEY = 'maul:spore';
export const ROT_KEY = 'maul:rot';
export const BLIGHT_KEY = 'maul:blight';
export const SHATTER_KEY = 'maul:shatter';

interface Attack {
  readonly type: AttackType;
  readonly damage: readonly [number, number];
  readonly cooldown: number;
  readonly range: number;
  readonly targets: TargetLayer;
  /** World units per second; 0 lands at once. */
  readonly speed: number;
  readonly effects?: readonly EffectSpec[];
}

function attackOf(a: Attack): AttackSpec {
  return {
    damage: a.damage, cooldown: a.cooldown, range: a.range, attackType: a.type, targets: a.targets, projectileSpeed: a.speed,
    ...(a.effects ? { effects: a.effects } : {}),
  };
}

interface Row {
  readonly line: TowerLine;
  readonly tier: 0 | 1 | 2 | 3;
  readonly price: number;
  readonly next?: readonly string[];
  readonly role: string;
  readonly attack?: Attack;
  readonly auras?: readonly AuraSpec[];
}

const splash = (full: number, half: number, targets?: TargetLayer): EffectSpec =>
  ({ kind: 'splash', bands: [[full, 1], [half, 0.5]], ...(targets ? { targets } : {}) });
const slow = (amount: number, duration: number): EffectSpec => ({ kind: 'slow', amount, duration, key: SLOW_KEY });
/** Each tower's venom ticks on its own (src/sim/modes/maul/effects.ts), so Dart towers stack with each other but not with themselves. */
const venom = (dps: number, duration: number): EffectSpec => ({ kind: 'maul.venom', dps, duration });

/** Every Wall's weak attack, like Wintermaul's cheap openers: about 0.075 DPS per gold, at ground and air. */
const wallAttack = (type: AttackType): Attack => ({ type, damage: [1, 2], cooldown: 2, range: 320, targets: 'both', speed: 1100 });

function race(id: RaceId, rows: Readonly<Record<string, readonly [name: string, row: Row]>>): [string, MaulTowerSpec][] {
  const out: [string, MaulTowerSpec][] = [];
  const totals: Record<string, number> = {};
  const below: Record<string, string> = {};
  for (const [spec, [, row]] of Object.entries(rows)) for (const n of row.next ?? []) below[n] = spec;
  for (const [spec, [name, row]] of Object.entries(rows)) {
    const parent = below[spec];
    // A line's Tier 1 is built from nothing at the Wall's price plus its own.
    const from = parent === undefined ? 0 : totals[parent] ?? 0;
    const total = from + row.price;
    totals[spec] = total;
    const maul: MaulTowerInfo = { race: id, line: row.line, tier: row.tier, price: row.price, total, next: row.next ?? [], role: row.role };
    out.push([spec, {
      name, cost: total, footprint: TOWER_FOOTPRINT, maul,
      ...(row.attack ? { attack: attackOf(row.attack) } : {}),
      ...(row.auras ? { auras: row.auras } : {}),
    }]);
  }
  return out;
}

// --- Ironclad: Pierce bolts and Siege shells -----------------------------------

const IRONCLAD = race('ironclad', {
  bulwark: ['Bulwark', {
    line: 'wall', tier: 0, price: 10, next: ['ballista', 'mortar'], role: 'A cheap block to shape the maze, with a weak Pierce bolt',
    attack: wallAttack('pierce'),
  }],
  ballista: ['Ballista', {
    line: 'a', tier: 1, price: 40, next: ['heavy_ballista'], role: 'Pierce bolts at ground and air',
    attack: { type: 'pierce', damage: [6, 8], cooldown: 1.4, range: 420, targets: 'both', speed: 1400 },
  }],
  heavy_ballista: ['Heavy Ballista', {
    line: 'a', tier: 2, price: 85, next: ['skypiercer', 'repeater'], role: 'Heavier Pierce bolts at ground and air',
    attack: { type: 'pierce', damage: [17, 21], cooldown: 1.5, range: 450, targets: 'both', speed: 1500 },
  }],
  skypiercer: ['Skypiercer', {
    line: 'a', tier: 3, price: 200, role: 'Very long-range bolts at ground and air: one can cover the whole air line',
    attack: { type: 'pierce', damage: [48, 54], cooldown: 1.5, range: 720, targets: 'both', speed: 2000 },
  }],
  repeater: ['Repeater', {
    line: 'a', tier: 3, price: 200, role: 'Three bolts at once, at ground and air',
    attack: { type: 'pierce', damage: [18, 22], cooldown: 1.2, range: 450, targets: 'both', speed: 1500, effects: [{ kind: 'multishot', count: 3 }] },
  }],
  mortar: ['Mortar', {
    line: 'b', tier: 1, price: 50, next: ['siege_mortar'], role: 'Siege shells that splash the ground',
    attack: { type: 'siege', damage: [7, 9], cooldown: 2.5, range: 480, targets: 'ground', speed: 700, effects: [splash(80, 150)] },
  }],
  siege_mortar: ['Siege Mortar', {
    line: 'b', tier: 2, price: 100, next: ['thunder_mortar', 'bombard'], role: 'Bigger shells, wider splash',
    attack: { type: 'siege', damage: [20, 24], cooldown: 2.5, range: 520, targets: 'ground', speed: 700, effects: [splash(90, 170)] },
  }],
  thunder_mortar: ['Thunder Mortar', {
    line: 'b', tier: 3, price: 220, role: 'Wide splash; a quarter of shells stun what they land on',
    attack: {
      type: 'siege', damage: [48, 56], cooldown: 2.5, range: 520, targets: 'ground', speed: 700,
      effects: [splash(100, 190), { kind: 'stun', chance: 0.25, duration: 0.8 }],
    },
  }],
  bombard: ['Bombard', {
    line: 'b', tier: 3, price: 220, role: 'Huge single shells from very far: the answer to Fortified creeps and bosses',
    attack: { type: 'siege', damage: [70, 80], cooldown: 3, range: 800, targets: 'ground', speed: 650, effects: [splash(70, 120)] },
  }],
});

// --- Rimeborn: Frost bolts that slow, and totems that chill whatever is near --

const RIMEBORN = race('rimeborn', {
  rime_wall: ['Rime Wall', {
    line: 'wall', tier: 0, price: 10, next: ['frost_spire', 'chill_totem'], role: 'A cheap block of ice to shape the maze, with a weak Frost bolt',
    attack: wallAttack('frost'),
  }],
  frost_spire: ['Frost Spire', {
    line: 'a', tier: 1, price: 40, next: ['frost_lance'], role: 'Frost bolts that slow, at ground and air',
    attack: { type: 'frost', damage: [6, 8], cooldown: 1.5, range: 400, targets: 'both', speed: 1000, effects: [slow(0.25, 2)] },
  }],
  frost_lance: ['Frost Lance', {
    line: 'a', tier: 2, price: 90, next: ['glacier_spike', 'hailcaller'], role: 'Harder bolts, deeper slow',
    attack: { type: 'frost', damage: [15, 19], cooldown: 1.5, range: 430, targets: 'both', speed: 1100, effects: [slow(0.35, 2)] },
  }],
  glacier_spike: ['Glacier Spike', {
    line: 'a', tier: 3, price: 210, role: 'A heavy bolt that slows by almost half; one in five hits twice as hard',
    attack: {
      type: 'frost', damage: [60, 70], cooldown: 1.8, range: 480, targets: 'both', speed: 1200,
      effects: [slow(0.45, 2.5), { kind: 'crit', chance: 0.2, multiplier: 2 }],
    },
  }],
  hailcaller: ['Hailcaller', {
    line: 'a', tier: 3, price: 210, role: 'Four bolts at once, each slowing what it hits',
    attack: {
      type: 'frost', damage: [16, 20], cooldown: 1.4, range: 450, targets: 'both', speed: 1100,
      effects: [{ kind: 'multishot', count: 4 }, slow(0.35, 2)],
    },
  }],
  chill_totem: ['Chill Totem', {
    line: 'b', tier: 1, price: 50, next: ['rime_totem'], role: 'Slows every creep near it; a weak Magic bolt',
    attack: { type: 'magic', damage: [4, 6], cooldown: 1.5, range: 300, targets: 'both', speed: 900 },
    auras: [{ kind: 'slow', to: 'creeps', radius: 220, value: 0.2, key: SLOW_KEY }],
  }],
  rime_totem: ['Rime Totem', {
    line: 'b', tier: 2, price: 100, next: ['blizzard_totem', 'shatter_totem'], role: 'A wider, deeper chill',
    attack: { type: 'magic', damage: [9, 11], cooldown: 1.5, range: 320, targets: 'both', speed: 900 },
    auras: [{ kind: 'slow', to: 'creeps', radius: 260, value: 0.3, key: SLOW_KEY }],
  }],
  blizzard_totem: ['Blizzard Totem', {
    line: 'b', tier: 3, price: 220, role: 'The deepest chill, and Magic hail that splashes',
    attack: { type: 'magic', damage: [22, 26], cooldown: 2, range: 340, targets: 'both', speed: 900, effects: [splash(90, 160)] },
    auras: [{ kind: 'slow', to: 'creeps', radius: 300, value: 0.4, key: SLOW_KEY }],
  }],
  shatter_totem: ['Shatter Totem', {
    line: 'b', tier: 3, price: 220, role: 'Cold that cracks armor: creeps near it lose 5 armor and are slowed',
    attack: { type: 'magic', damage: [30, 36], cooldown: 1.5, range: 340, targets: 'both', speed: 900 },
    auras: [
      { kind: 'slow', to: 'creeps', radius: 300, value: 0.3, key: SLOW_KEY },
      { kind: 'armor', to: 'creeps', radius: 300, value: 5, key: SHATTER_KEY },
    ],
  }],
});

// --- Mirefolk: poisoned darts and spore clouds ----------------------------------

const MIREFOLK = race('mirefolk', {
  bramble: ['Bramble', {
    line: 'wall', tier: 0, price: 10, next: ['dart_tower', 'spore_pod'], role: 'A cheap knot of thorns to shape the maze, with a weak Pierce dart',
    attack: wallAttack('pierce'),
  }],
  dart_tower: ['Dart Tower', {
    line: 'a', tier: 1, price: 40, next: ['viper_tower'], role: 'Pierce darts that poison, at ground and air',
    attack: { type: 'pierce', damage: [3, 4], cooldown: 1.2, range: 400, targets: 'both', speed: 1300, effects: [venom(3, 4)] },
  }],
  viper_tower: ['Viper Tower', {
    line: 'a', tier: 2, price: 90, next: ['asp_spire', 'spitter'], role: 'Stronger venom: poison ignores armor',
    attack: { type: 'pierce', damage: [8, 10], cooldown: 1.2, range: 420, targets: 'both', speed: 1300, effects: [venom(7, 4)] },
  }],
  asp_spire: ['Asp Spire', {
    line: 'a', tier: 3, price: 200, role: 'Deadly venom on one creep at a time: bosses melt',
    attack: { type: 'pierce', damage: [18, 22], cooldown: 1.2, range: 450, targets: 'both', speed: 1400, effects: [venom(18, 5)] },
  }],
  spitter: ['Spitter', {
    line: 'a', tier: 3, price: 200, role: 'Four darts at once, poisoning a crowd',
    attack: {
      type: 'pierce', damage: [6, 8], cooldown: 1.2, range: 430, targets: 'both', speed: 1300,
      effects: [{ kind: 'multishot', count: 4 }, venom(10, 4)],
    },
  }],
  spore_pod: ['Spore Pod', {
    line: 'b', tier: 1, price: 50, next: ['plague_pod'], role: 'Lobs spores that poison every ground creep where they burst',
    attack: {
      type: 'chaos', damage: [2, 2], cooldown: 2, range: 420, targets: 'ground', speed: 650,
      effects: [{ kind: 'maul.spread', radius: 110, dps: 2.5, duration: 4, key: SPORE_KEY }],
    },
  }],
  plague_pod: ['Plague Pod', {
    line: 'b', tier: 2, price: 100, next: ['blight_pod', 'rot_bloom'], role: 'Thicker spores over a wider cloud',
    attack: {
      type: 'chaos', damage: [4, 4], cooldown: 2, range: 440, targets: 'ground', speed: 650,
      effects: [{ kind: 'maul.spread', radius: 130, dps: 6.5, duration: 5, key: SPORE_KEY }],
    },
  }],
  blight_pod: ['Blight Pod', {
    line: 'b', tier: 3, price: 220, role: 'Spores that also eat 4 armor from everything they touch',
    attack: {
      type: 'chaos', damage: [8, 8], cooldown: 2, range: 460, targets: 'ground', speed: 650,
      effects: [{ kind: 'maul.spread', radius: 150, dps: 15, duration: 5, key: SPORE_KEY, armor: 4, armorKey: BLIGHT_KEY }],
    },
  }],
  rot_bloom: ['Rot Bloom', {
    line: 'b', tier: 3, price: 220, role: 'No shots: every ground creep near it rots, all the time',
    auras: [{ kind: 'poison', to: 'creeps', radius: 260, value: 16, targets: 'ground', key: ROT_KEY }],
  }],
});

// --- Runecasters: Magic bolts and bursts, and Chaos at the top -----------------

const RUNECASTERS = race('runecasters', {
  runestone: ['Runestone', {
    line: 'wall', tier: 0, price: 10, next: ['spark_rune', 'glyph'], role: 'A cheap carved stone to shape the maze, with a weak Magic bolt',
    attack: wallAttack('magic'),
  }],
  spark_rune: ['Spark Rune', {
    line: 'a', tier: 1, price: 40, next: ['storm_rune'], role: 'Magic bolts at ground and air',
    attack: { type: 'magic', damage: [9, 11], cooldown: 2, range: 440, targets: 'both', speed: 1100 },
  }],
  storm_rune: ['Storm Rune', {
    line: 'a', tier: 2, price: 90, next: ['chain_rune', 'void_rune'], role: 'Heavier Magic bolts',
    attack: { type: 'magic', damage: [25, 29], cooldown: 2, range: 460, targets: 'both', speed: 1200 },
  }],
  chain_rune: ['Chain Rune', {
    line: 'a', tier: 3, price: 200, role: 'Lightning that jumps to four more creeps, weaker each jump',
    attack: {
      type: 'magic', damage: [50, 56], cooldown: 2, range: 460, targets: 'both', speed: 0,
      effects: [{ kind: 'maul.chain', jumps: 4, falloff: 0.15, radius: 240 }],
    },
  }],
  void_rune: ['Void Rune', {
    line: 'a', tier: 3, price: 200, role: 'Chaos bolts: full damage to every armor type',
    attack: { type: 'chaos', damage: [64, 72], cooldown: 2, range: 500, targets: 'both', speed: 1300 },
  }],
  glyph: ['Glyph', {
    line: 'b', tier: 1, price: 50, next: ['sigil'], role: 'Magic bursts that splash ground and air',
    attack: { type: 'magic', damage: [10, 12], cooldown: 3, range: 400, targets: 'both', speed: 900, effects: [splash(90, 160)] },
  }],
  sigil: ['Sigil', {
    line: 'b', tier: 2, price: 100, next: ['nova_circle', 'ley_shrine'], role: 'Bigger bursts',
    attack: { type: 'magic', damage: [26, 30], cooldown: 3, range: 420, targets: 'both', speed: 900, effects: [splash(100, 180)] },
  }],
  nova_circle: ['Nova Circle', {
    line: 'b', tier: 3, price: 220, role: 'The widest bursts',
    attack: { type: 'magic', damage: [60, 68], cooldown: 3, range: 440, targets: 'both', speed: 900, effects: [splash(120, 220)] },
  }],
  ley_shrine: ['Ley Shrine', {
    line: 'b', tier: 3, price: 220, role: 'Towers near it deal 25% more damage and attack 15% faster',
    attack: { type: 'magic', damage: [20, 24], cooldown: 3, range: 400, targets: 'both', speed: 900, effects: [splash(90, 160)] },
    auras: [
      { kind: 'damage', to: 'towers', radius: 300, value: 0.25, key: 'maul:ley-damage' },
      { kind: 'attackSpeed', to: 'towers', radius: 300, value: 0.15, key: 'maul:ley-speed' },
    ],
  }],
});

export const MAUL_TOWERS: Readonly<Record<string, MaulTowerSpec>> = Object.fromEntries([...IRONCLAD, ...RIMEBORN, ...MIREFOLK, ...RUNECASTERS]);

export const RACE_SPECS: Readonly<Record<RaceId, RaceSpec>> = {
  ironclad: {
    id: 'ironclad', name: 'Ironclad', builds: ['bulwark', 'ballista', 'mortar'],
    about: 'Physical and siege: Pierce bolts for ground and air, Siege shells that splash and stun',
  },
  rimeborn: {
    id: 'rimeborn', name: 'Rimeborn', builds: ['rime_wall', 'frost_spire', 'chill_totem'],
    about: 'Frost and slow: bolts that slow one creep, totems that chill every creep near them',
  },
  mirefolk: {
    id: 'mirefolk', name: 'Mirefolk', builds: ['bramble', 'dart_tower', 'spore_pod'],
    about: 'Poison over time: venom darts and spore clouds that ignore armor',
  },
  runecasters: {
    id: 'runecasters', name: 'Runecasters', builds: ['runestone', 'spark_rune', 'glyph'],
    about: 'Arcane and splash: Magic bursts over ground and air, chain lightning and Chaos at the top',
  },
};

/** The Race whose tree a tower belongs to. */
export function raceOf(spec: string): RaceId | null {
  return Object.hasOwn(MAUL_TOWERS, spec) ? MAUL_TOWERS[spec]!.maul.race : null;
}
