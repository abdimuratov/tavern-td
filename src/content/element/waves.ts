import type { Difficulty } from '../../sim';
import { ELEMENTS, type DamageElement, type Element, type ElementCreepSpec, type ElementWave, type Trait } from './types';

// Element TD's Waves (docs/research/element-td-rules.md §5–6), from the port's
// waves.kv and wavedata.lua via element-data.json: Full is 55 Waves then endless
// boss Waves, Express its own 30. Every Wave is 30 creeps of one kind, one per
// 0.5 s from 0.5 s in; a bulky creep counts as two, so 15 spawn 1 s apart. HP is
// the port's rounded WAVE_HEALTH × Difficulty, floored; bulky doubles it after.
// The creep names are ours.

/** Every creep walks at this speed (MovementSpeed; modifier_slow_adjustment.lua). */
export const CREEP_SPEED = 300;
/** No slow pushes a creep below this (min_ms, assumed to be the effective floor). */
export const MIN_SPEED = 50;
/** A fast creep's burst speed; it ignores slows meanwhile. */
export const HASTE_SPEED = 750;
export const CREEPS_PER_WAVE = 30;
/** Seconds from a Wave's start to its first spawn. */
export const FIRST_SPAWN = 0.5;

export const FULL_WAVES = 55;
export const EXPRESS_WAVES = 30;
/** HP of the first boss Wave before ×1.3 per boss Wave (wave 56 on the HP curve). */
export const BOSS_HP_BASE = 384076;
export const BOSS_HP_GROWTH = 1.3;
/** Each boss creep gets the next trait of this cycle (boss.lua GetAbilityList). */
export const BOSS_TRAITS: readonly Trait[] = ['bulky', 'heal', 'vengeance', 'undead', 'regen', 'mechanical', 'time_lapse'];
/** Boss Waves run until the Run ends; this caps them so a Full Run stays finite (assumed: nobody survives ×1.3¹⁰⁰). */
export const MAX_BOSS_WAVES = 100;

/** Creep HP multiplier per Difficulty: the port's Normal, Hard and Insane; Easy is ours (assumed, PLAN's ×0.75). */
export const DIFFICULTY_HP: Readonly<Record<Difficulty, number>> = { easy: 0.75, normal: 1, hard: 1.3, insane: 2 };

const UNIT_NAME: Readonly<Record<string, string>> = {
  stoneboar: 'Rock Hog', flying_imp: 'Puddle Imp', lava_spawn: 'Cinder Whelp', shroomling: 'Toadstool', snowy_owl: 'Pale Owl',
  earth_walker: 'Mud Strider', zombie: 'Shambler', water_dragon: 'Brook Drake', blazing_axman: 'Ember Brute',
  ivory_beast: 'Bone Ox', skeleton: 'Rattler', shifting_treant: 'Drifting Sapling', satyr: 'Goat Runner',
  radiant_golem: 'Glow Golem', rock_monster: 'Boulder Hulk', fire_acolyte: 'Ash Novice', mummy: 'Wrapped One',
  treant: 'Old Oak', battleship: 'Iron Barge', nether_spider: 'Gloom Spider', crimson_demon: 'Red Fiend',
  solar_hellion: 'Sun Wyrm', tribal_priest: 'Grove Mender', necro_archer: 'Grave Archer', dust_fiend: 'Dust Devil',
  murloc: 'Reed Lurker', goblin_shredder: 'Saw Cart', otter_dragon: 'Fat Otter', ember_spirit: 'Flicker',
  black_wyvern: 'Night Wyvern', sea_phantom: 'Brine Wraith', holy_bomber: 'Gleam Glider', ghost: 'Haunt',
  wolf: 'Crag Wolf', elf_soldier: 'Thicket Scout', turtle_rider: 'Shell Rider', abomination: 'Patchwork Horror',
  desert_rogue: 'Dune Bandit', lightning_angel: 'Bolt Seraph', clock_wanderer: 'Gear Walker', inferno_golem: 'Magma Colossus',
  storm_spirit: 'Squall', immortal: 'Undying Knight', faceless: 'Blank Stranger', gaias_titan: 'Moss Titan',
  spirit_bear: 'Ghost Bear', torchbearer: 'Lamp Runner', phantom_lancer: 'Echo Lancer', death_gazer: 'Doom Eye',
  swamp_witch: 'Bog Hag', void_incarnate: 'Hollow Lord', chaos_beast: 'Wild Ravager', dreadlord: 'Night Baron',
  centaur_warchief: 'Hoof Chief', roshan_custom: 'Ancient Brute', icefrog: 'The Endless', timber_wolf: 'Forest Wolf',
};

export function unitName(unit: string): string {
  return UNIT_NAME[unit] ?? unit;
}

/** [wave, unit, element, trait, hpBase, hp Normal/Hard/Insane, count, interval, bounty Normal/Hard/Insane, break Normal/Hard/Insane, lumber, essence]. */
type Row = readonly [
  wave: number, unit: string, element: DamageElement, trait: Trait | null, hpBase: number, hp: readonly [number, number, number],
  count: number, interval: number, bounty: readonly [number, number, number], breakBefore: readonly [number, number, number],
  lumber: boolean, essence: boolean,
];

const FULL_ROWS: readonly Row[] = [
  [1, 'stoneboar', 'earth', null, 75, [75, 97, 150], 30, 0.5, [1, 1, 1], [30, 30, 30], false, false],
  [2, 'flying_imp', 'water', null, 88, [88, 114, 176], 30, 0.5, [1, 1, 1], [7, 5, 1], false, false],
  [3, 'lava_spawn', 'fire', null, 102, [102, 132, 204], 30, 0.5, [2, 2, 2], [7, 5, 1], false, false],
  [4, 'shroomling', 'nature', 'undead', 120, [120, 156, 240], 30, 0.5, [2, 2, 2], [7, 5, 1], false, false],
  [5, 'snowy_owl', 'light', null, 140, [140, 182, 280], 30, 0.5, [2, 2, 2], [7, 5, 1], false, false],
  [6, 'earth_walker', 'earth', 'time_lapse', 163, [163, 211, 326], 30, 0.5, [2, 2, 2], [30, 30, 30], true, false],
  [7, 'zombie', 'dark', null, 190, [190, 247, 380], 30, 0.5, [2, 2, 3], [7, 5, 1], false, false],
  [8, 'water_dragon', 'water', 'regen', 222, [222, 288, 444], 30, 0.5, [3, 3, 3], [7, 5, 1], false, false],
  [9, 'blazing_axman', 'fire', 'heal', 260, [260, 338, 520], 30, 0.5, [3, 3, 3], [7, 5, 1], false, false],
  [10, 'ivory_beast', 'light', 'vengeance', 303, [303, 393, 606], 30, 0.5, [3, 3, 4], [7, 5, 1], false, false],
  [11, 'skeleton', 'dark', 'undead', 354, [354, 460, 708], 30, 0.5, [4, 4, 4], [30, 30, 30], true, false],
  [12, 'shifting_treant', 'nature', 'time_lapse', 414, [414, 538, 828], 30, 0.5, [4, 4, 4], [8, 6, 1], false, false],
  [13, 'satyr', 'composite', 'fast', 483, [483, 627, 966], 30, 0.5, [4, 5, 5], [8, 6, 1], false, false],
  [14, 'radiant_golem', 'light', 'heal', 565, [565, 734, 1130], 30, 0.5, [5, 5, 6], [8, 6, 1], false, false],
  [15, 'rock_monster', 'earth', 'mechanical', 660, [660, 858, 1320], 30, 0.5, [5, 6, 6], [8, 6, 1], false, false],
  [16, 'fire_acolyte', 'fire', 'undead', 770, [770, 1001, 1540], 30, 0.5, [6, 6, 7], [30, 30, 30], true, false],
  [17, 'mummy', 'composite', 'vengeance', 900, [900, 1170, 1800], 30, 0.5, [7, 7, 7], [8, 6, 1], false, false],
  [18, 'treant', 'nature', 'regen', 1051, [1051, 1366, 2102], 30, 0.5, [7, 8, 8], [8, 6, 1], false, false],
  [19, 'battleship', 'water', 'mechanical', 1228, [1228, 1596, 2456], 30, 0.5, [8, 8, 9], [8, 6, 1], false, false],
  [20, 'nether_spider', 'dark', 'fast', 1434, [1434, 1864, 2868], 30, 0.5, [9, 9, 10], [8, 6, 1], false, false],
  [21, 'crimson_demon', 'fire', 'time_lapse', 1675, [1675, 2177, 3350], 30, 0.5, [10, 10, 11], [30, 30, 30], true, false],
  [22, 'solar_hellion', 'light', 'regen', 1956, [1956, 2542, 3912], 30, 0.5, [11, 11, 12], [8, 6, 1], false, false],
  [23, 'tribal_priest', 'nature', 'heal', 2285, [2285, 2970, 4570], 30, 0.5, [12, 12, 14], [8, 6, 1], false, false],
  [24, 'necro_archer', 'dark', 'vengeance', 2668, [2668, 3468, 5336], 30, 0.5, [13, 13, 15], [8, 6, 1], false, false],
  [25, 'dust_fiend', 'earth', 'undead', 3117, [3117, 4052, 6234], 30, 0.5, [14, 15, 16], [8, 6, 1], false, false],
  [26, 'murloc', 'water', 'fast', 3640, [3640, 4732, 7280], 30, 0.5, [15, 16, 18], [30, 30, 30], true, false],
  [27, 'goblin_shredder', 'composite', 'mechanical', 4252, [4252, 5527, 8504], 30, 0.5, [17, 18, 20], [8, 6, 1], false, false],
  [28, 'otter_dragon', 'nature', 'bulky', 4966, [9932, 12910, 19864], 15, 1.0, [36, 38, 44], [8, 6, 1], false, false],
  [29, 'ember_spirit', 'fire', 'vengeance', 5800, [5800, 7540, 11600], 30, 0.5, [20, 21, 24], [8, 6, 1], false, false],
  [30, 'black_wyvern', 'dark', 'heal', 6775, [6775, 8807, 13550], 30, 0.5, [22, 23, 27], [8, 6, 1], false, false],
  [31, 'sea_phantom', 'water', 'time_lapse', 7913, [7913, 10286, 15826], 30, 0.5, [24, 26, 29], [30, 30, 30], true, false],
  [32, 'holy_bomber', 'light', 'mechanical', 9242, [9242, 12014, 18484], 30, 0.5, [26, 28, 32], [9, 7, 1], false, false],
  [33, 'ghost', 'composite', 'regen', 10795, [10795, 14033, 21590], 30, 0.5, [29, 31, 36], [9, 7, 1], false, false],
  [34, 'wolf', 'earth', 'vengeance', 12609, [12609, 16391, 25218], 30, 0.5, [32, 34, 39], [9, 7, 1], false, false],
  [35, 'elf_soldier', 'nature', 'fast', 14727, [14727, 19145, 29454], 30, 0.5, [35, 37, 43], [9, 7, 1], false, false],
  [36, 'turtle_rider', 'water', 'undead', 17201, [17201, 22361, 34402], 30, 0.5, [38, 41, 47], [30, 30, 30], true, false],
  [37, 'abomination', 'dark', 'regen', 20091, [20091, 26118, 40182], 30, 0.5, [41, 45, 52], [9, 7, 1], false, false],
  [38, 'desert_rogue', 'earth', 'heal', 23466, [23466, 30505, 46932], 30, 0.5, [45, 49, 57], [9, 7, 1], false, false],
  [39, 'lightning_angel', 'light', 'fast', 27409, [27409, 35631, 54818], 30, 0.5, [50, 54, 63], [9, 7, 1], false, false],
  [40, 'clock_wanderer', 'composite', 'time_lapse', 32013, [32013, 41616, 64026], 30, 0.5, [54, 59, 69], [9, 7, 1], false, false],
  [41, 'inferno_golem', 'fire', 'mechanical', 37392, [37392, 48609, 74784], 30, 0.5, [59, 65, 76], [30, 30, 30], true, false],
  [42, 'storm_spirit', 'water', 'bulky', 43673, [87346, 113548, 174692], 15, 1.0, [130, 142, 168], [9, 7, 1], false, false],
  [43, 'immortal', 'light', 'undead', 51011, [51011, 66314, 102022], 30, 0.5, [71, 77, 92], [9, 7, 1], false, false],
  [44, 'faceless', 'dark', 'time_lapse', 59580, [59580, 77454, 119160], 30, 0.5, [78, 85, 102], [9, 7, 1], false, false],
  [45, 'gaias_titan', 'nature', 'mechanical', 69590, [69590, 90467, 139180], 30, 0.5, [85, 93, 112], [9, 7, 1], false, false],
  [46, 'spirit_bear', 'earth', 'regen', 81281, [81281, 105665, 162562], 30, 0.5, [93, 102, 123], [30, 30, 30], true, false],
  [47, 'torchbearer', 'fire', 'fast', 94936, [94936, 123416, 189872], 30, 0.5, [101, 112, 135], [10, 8, 1], false, false],
  [48, 'phantom_lancer', 'light', 'time_lapse', 110886, [110886, 144151, 221772], 30, 0.5, [111, 122, 148], [10, 8, 1], false, false],
  [49, 'death_gazer', 'composite', 'bulky', 129514, [259028, 336736, 518056], 15, 1.0, [242, 268, 326], [10, 8, 1], false, false],
  [50, 'swamp_witch', 'water', 'heal', 151273, [151273, 196654, 302546], 30, 0.5, [133, 147, 179], [10, 8, 1], false, false],
  [51, 'void_incarnate', 'composite', 'undead', 176687, [176687, 229693, 353374], 30, 0.5, [145, 161, 197], [30, 30, 30], true, true],
  [52, 'chaos_beast', 'fire', 'regen', 206370, [206370, 268281, 412740], 30, 0.5, [158, 176, 217], [10, 8, 1], false, false],
  [53, 'dreadlord', 'dark', 'mechanical', 241040, [241040, 313352, 482080], 30, 0.5, [173, 193, 238], [10, 8, 1], false, false],
  [54, 'centaur_warchief', 'earth', 'fast', 281535, [281535, 365995, 563070], 30, 0.5, [189, 211, 262], [10, 8, 1], false, false],
  [55, 'roshan_custom', 'composite', 'heal', 328833, [328833, 427482, 657666], 30, 0.5, [207, 231, 288], [10, 8, 1], false, false],
];

const EXPRESS_ROWS: readonly Row[] = [
  [1, 'timber_wolf', 'composite', null, 200, [200, 260, 400], 30, 0.5, [5, 5, 5], [45, 45, 45], false, false],
  [2, 'mummy', 'composite', 'vengeance', 259, [259, 336, 518], 30, 0.5, [5, 6, 6], [7, 5, 1], false, false],
  [3, 'immortal', 'light', 'undead', 335, [335, 435, 670], 30, 0.5, [6, 7, 7], [7, 5, 1], false, false],
  [4, 'water_dragon', 'water', 'regen', 434, [434, 564, 868], 30, 0.5, [7, 8, 8], [7, 5, 1], true, false],
  [5, 'blazing_axman', 'fire', 'heal', 562, [562, 730, 1124], 30, 0.5, [9, 9, 10], [7, 5, 1], false, false],
  [6, 'shroomling', 'nature', 'undead', 728, [728, 946, 1456], 30, 0.5, [10, 11, 11], [8, 6, 1], false, false],
  [7, 'radiant_golem', 'light', 'heal', 943, [943, 1225, 1886], 30, 0.5, [12, 12, 14], [8, 6, 1], true, false],
  [8, 'centaur_warchief', 'earth', 'fast', 1222, [1222, 1588, 2444], 30, 0.5, [14, 14, 16], [8, 6, 1], false, false],
  [9, 'abomination', 'dark', 'regen', 1582, [1582, 2056, 3164], 30, 0.5, [16, 17, 19], [8, 6, 1], false, false],
  [10, 'murloc', 'water', 'fast', 2049, [2049, 2663, 4098], 30, 0.5, [19, 20, 22], [8, 6, 1], true, false],
  [11, 'fire_acolyte', 'fire', 'undead', 2653, [2653, 3448, 5306], 30, 0.5, [22, 23, 26], [8, 6, 1], false, false],
  [12, 'spirit_bear', 'earth', 'regen', 3436, [3436, 4466, 6872], 30, 0.5, [25, 27, 30], [8, 6, 1], false, false],
  [13, 'tribal_priest', 'nature', 'heal', 4449, [4449, 5783, 8898], 30, 0.5, [29, 31, 35], [8, 6, 1], true, false],
  [14, 'satyr', 'composite', 'fast', 5762, [5762, 7490, 11524], 30, 0.5, [34, 36, 41], [8, 6, 1], false, false],
  [15, 'dust_fiend', 'earth', 'undead', 7461, [7461, 9699, 14922], 30, 0.5, [40, 42, 48], [8, 6, 1], false, false],
  [16, 'black_wyvern', 'dark', 'heal', 9662, [9662, 12560, 19324], 30, 0.5, [46, 49, 56], [9, 7, 1], true, false],
  [17, 'lightning_angel', 'light', 'fast', 12513, [12513, 16266, 25026], 30, 0.5, [53, 57, 66], [9, 7, 1], false, false],
  [18, 'ghost', 'composite', 'regen', 16204, [16204, 21065, 32408], 30, 0.5, [62, 66, 77], [9, 7, 1], false, false],
  [19, 'turtle_rider', 'water', 'undead', 20984, [20984, 27279, 41968], 30, 0.5, [72, 77, 90], [9, 7, 1], true, false],
  [20, 'treant', 'nature', 'regen', 27174, [27174, 35326, 54348], 30, 0.5, [83, 90, 105], [9, 7, 1], false, false],
  [21, 'desert_rogue', 'earth', 'heal', 35190, [35190, 45747, 70380], 30, 0.5, [96, 105, 123], [9, 7, 1], false, false],
  [22, 'torchbearer', 'fire', 'fast', 45572, [45572, 59243, 91144], 30, 0.5, [112, 122, 143], [9, 7, 1], true, false],
  [23, 'skeleton', 'dark', 'undead', 59015, [59015, 76719, 118030], 30, 0.5, [130, 141, 168], [9, 7, 1], false, false],
  [24, 'elf_soldier', 'nature', 'fast', 76425, [76425, 99352, 152850], 30, 0.5, [150, 164, 196], [9, 7, 1], false, false],
  [25, 'solar_hellion', 'light', 'regen', 98970, [98970, 128661, 197940], 30, 0.5, [174, 191, 229], [9, 7, 1], true, true],
  [26, 'void_incarnate', 'composite', 'undead', 128166, [128166, 166615, 256332], 30, 0.5, [202, 222, 267], [10, 8, 1], false, false],
  [27, 'swamp_witch', 'water', 'heal', 165975, [165975, 215767, 331950], 30, 0.5, [235, 258, 312], [10, 8, 1], false, false],
  [28, 'chaos_beast', 'fire', 'regen', 214938, [214938, 279419, 429876], 30, 0.5, [272, 300, 365], [10, 8, 1], true, true],
  [29, 'nether_spider', 'dark', 'fast', 278345, [278345, 361848, 556690], 30, 0.5, [315, 349, 426], [10, 8, 1], false, false],
  [30, 'roshan_custom', 'composite', 'heal', 360457, [360457, 468594, 720914], 30, 0.5, [365, 405, 498], [10, 8, 1], false, false],
];

function byDifficulty([normal, hard, insane]: readonly [number, number, number], easy: number): Readonly<Record<Difficulty, number>> {
  return { easy, normal, hard, insane };
}

function toWave(prefix: string, row: Row): ElementWave {
  const [wave, unit, element, trait, hpBase, hp, count, interval, bounty, breakBefore, lumber, essence] = row;
  const easyHp = Math.floor(hpBase * DIFFICULTY_HP.easy) * (trait === 'bulky' ? 2 : 1);
  return {
    wave, creep: `${prefix}-${wave}`, unit, element, trait, hpBase,
    hp: byDifficulty(hp, easyHp), count, interval,
    bounty: byDifficulty(bounty, bounty[0]), breakBefore: byDifficulty(breakBefore, breakBefore[0]),
    lumber, essence,
  };
}

export const ELEMENT_FULL_WAVES: readonly ElementWave[] = FULL_ROWS.map((r) => toWave('full', r));
export const ELEMENT_EXPRESS_WAVES: readonly ElementWave[] = EXPRESS_ROWS.map((r) => toWave('express', r));

/** Seconds before the first boss Wave; later boss Waves start the moment the last is cleared. */
export const FIRST_BOSS_BREAK = 60;

/** Elemental HP before growth, by the level being bought (constants.lua ElementalBaseHealth). */
export const ELEMENTAL_HP: readonly number[] = [600, 3000, 15000];
/** Elemental HP grows ×1.5 for every 5 Waves of the Wave the player is waiting for or fighting. */
export const ELEMENTAL_HP_GROWTH = 1.5;

const SPIRIT: Readonly<Record<Element, string>> = {
  water: 'Tide Spirit', fire: 'Flame Spirit', nature: 'Wild Spirit', earth: 'Stone Spirit', light: 'Radiant Spirit', dark: 'Shadow Spirit',
};

export function elementalId(element: Element, level: number): string {
  return `elemental-${element}-${level}`;
}

export function bossId(trait: Trait): string {
  return `boss-${trait}`;
}

function creep(name: string, unit: string, armorType: DamageElement, trait: Trait | null, hp: number, extra: Partial<ElementCreepSpec> = {}): ElementCreepSpec {
  return {
    name, unit, armorType, trait, hp, armor: 0, speed: CREEP_SPEED, flying: false, bounty: 1, minSpeed: MIN_SPEED, ...extra,
  };
}

/** Every creep spec: one per Wave (Full and Express), the boss in each trait, and the 18 Elementals. */
export const ELEMENT_CREEPS: Readonly<Record<string, ElementCreepSpec>> = {
  ...Object.fromEntries([...ELEMENT_FULL_WAVES, ...ELEMENT_EXPRESS_WAVES].map((w) => [
    w.creep, creep(unitName(w.unit), w.unit, w.element, w.trait, w.hp.normal),
  ])),
  ...Object.fromEntries(BOSS_TRAITS.map((t) => [bossId(t), creep(unitName('icefrog'), 'icefrog', 'composite', t, BOSS_HP_BASE, { boss: true })])),
  ...Object.fromEntries(ELEMENTS.flatMap((e) => [1, 2, 3].map((level) => [
    elementalId(e, level),
    creep(`${SPIRIT[e]}${['', ' II', ' III'][level - 1]}`, `${e}_elemental${level}`, e, null, ELEMENTAL_HP[level - 1]!, { elemental: { element: e, level } }),
  ]))),
};
