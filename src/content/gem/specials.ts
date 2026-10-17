import type { AttackSpec, AuraSpec, EffectSpec, TargetLayer } from '../../sim';
import { FROST } from './gems';
import type { GemInfo, GemTowerSpec, SpecialLine } from './types';

// The 13 Recipes and their upgrade tiers, plus the Stone of Bryvx
// (docs/research/gem-td-rules.md §6). Stats are war3map.w3u plus the patches in
// share/objects/specials/; `cost` on a tier is the gold to upgrade into it
// (ugol). An upgrade takes 1 s, during which the tower doesn't attack.

interface TierDef {
  readonly id: string;
  readonly name: string;
  readonly cost?: number;
  readonly attack?: AttackSpec;
  readonly auras?: readonly AuraSpec[];
  readonly gem?: Omit<GemInfo, 'kind' | 'family' | 'tier' | 'next'>;
}

function attack(
  damage: readonly [number, number], cooldown: number, range: number, attackType: string, targets: TargetLayer,
  projectileSpeed: number, effects?: readonly EffectSpec[], dice?: readonly [number, number],
): AttackSpec {
  return {
    damage, cooldown, range, attackType, targets, projectileSpeed,
    ...(effects && effects.length > 0 ? { effects } : {}),
    ...(dice ? { dice } : {}),
  };
}

/** Artillery frost: splash at full damage within `radius` on the ground, and frost on everything it hit. */
function frostSplash(radius: number): EffectSpec[] {
  return [{ kind: 'splash', bands: [[radius, 1]], targets: 'ground' }, { ...FROST, radius, targets: 'ground' }];
}

interface LineDef {
  readonly id: string;
  readonly name: string;
  readonly parts: readonly string[];
  readonly tiers: readonly TierDef[];
}

const LINES: readonly LineDef[] = [
  {
    id: 'malachite', name: 'Malachite', parts: ['aquamarine-chipped', 'emerald-chipped', 'opal-chipped'],
    tiers: [
      { id: 'malachite', name: 'Malachite', attack: attack([6, 6], 0.45, 800, 'siege', 'both', 1300),
        gem: { barrage: { damage: 6, targets: 0, radius: 750, cooldown: 0.5 } } },
      { id: 'vivid-malachite', name: 'Vivid Malachite', cost: 25, attack: attack([11, 11], 0.45, 800, 'siege', 'both', 1300),
        gem: { barrage: { damage: 11, targets: 0, radius: 800, cooldown: 0.5 } } },
      { id: 'mighty-malachite', name: 'Mighty Malachite', cost: 180, attack: attack([45, 45], 0.45, 800, 'siege', 'both', 1300),
        gem: { barrage: { damage: 45, targets: 0, radius: 800, cooldown: 0.55 } } },
    ],
  },
  {
    id: 'silver', name: 'Silver', parts: ['diamond-chipped', 'sapphire-chipped', 'topaz-chipped'],
    tiers: [
      { id: 'silver', name: 'Silver', attack: attack([26, 27], 1, 550, 'spells', 'both', 1800, frostSplash(350)) },
      { id: 'sterling-silver', name: 'Sterling Silver', cost: 25, attack: attack([51, 51], 1, 650, 'spells', 'both', 1800, frostSplash(350)) },
      { id: 'silver-knight', name: 'Silver Knight', cost: 190, attack: attack([188, 188], 1, 750, 'spells', 'both', 2000, frostSplash(350)) },
    ],
  },
  {
    id: 'star-ruby', name: 'Star Ruby', parts: ['ruby-flawed', 'amethyst-chipped', 'ruby-chipped'],
    tiers: [
      // No attack (uaen 0): it only burns (src/gem/special/star-ruby.j: 7.5 every 0.25 s).
      { id: 'star-ruby', name: 'Star Ruby', gem: { burn: { dps: 30, radius: 265 } } },
      { id: 'blood-star', name: 'Blood Star', cost: 30, gem: { burn: { dps: 40, radius: 500 } } },
      // Hits deal 0 and mark (03-fire-star.j); the Barrage marks every enemy within 600 every 0.5 s.
      { id: 'fire-star', name: 'Fire Star', cost: 190,
        attack: attack([0, 0], 2, 600, 'hero', 'both', 1000, [{ kind: 'gem.fireMark', dps: 60, radius: 192, duration: 6 }]),
        gem: { barrage: { damage: 0, targets: 0, radius: 600, cooldown: 0.5, onHit: [{ kind: 'gem.fireMark', dps: 60, radius: 192, duration: 6 }] } } },
    ],
  },
  {
    id: 'jade', name: 'Jade', parts: ['emerald-normal', 'opal-normal', 'sapphire-flawed'],
    tiers: [
      { id: 'jade', name: 'Jade', attack: attack([30, 35], 0.5, 800, 'magic', 'both', 2000, [{ kind: 'gem.poison', dps: 15, duration: 4, slow: 0.2 }]) },
      { id: 'china-jade', name: 'China Jade', cost: 45, attack: attack([50, 50], 0.5, 800, 'magic', 'both', 2000, [{ kind: 'gem.poison', dps: 30, duration: 4, slow: 0.2 }]) },
      { id: 'lucky-china-jade', name: 'Lucky China Jade', cost: 250, attack: attack([55, 55], 0.35, 850, 'magic', 'both', 2000, [
        { kind: 'gem.poison', dps: 60, duration: 4, slow: 0.2 },
        { kind: 'crit', chance: 0.05, multiplier: 4 },
        { kind: 'gem.lucky', goldChance: 0.01, stunChance: 0.01, stunDuration: 2 },
      ]) },
    ],
  },
  {
    id: 'red-crystal', name: 'Red Crystal', parts: ['emerald-flawless', 'ruby-normal', 'amethyst-flawed'],
    tiers: [
      { id: 'red-crystal', name: 'Red Crystal', attack: attack([50, 75], 0.8, 1300, 'pierce', 'air', 2500),
        auras: [{ kind: 'armor', to: 'creeps', radius: 1300, value: 4, targets: 'air', key: 'gem:red-crystal' }] },
      { id: 'red-facet', name: 'Red Facet', cost: 100, attack: attack([75, 100], 0.8, 1400, 'pierce', 'air', 2500),
        auras: [{ kind: 'armor', to: 'creeps', radius: 1400, value: 5, targets: 'air', key: 'gem:red-facet' }] },
      // The burn hits ground too (src/gem/special/red-crystal.j: 10 every 0.2 s within 1500).
      { id: 'rose-quartz-crystal', name: 'Rose Quartz Crystal', cost: 150, attack: attack([100, 125], 0.8, 1500, 'pierce', 'air', 2600),
        auras: [{ kind: 'armor', to: 'creeps', radius: 1500, value: 6, targets: 'air', key: 'gem:rose-quartz' }],
        gem: { burn: { dps: 50, radius: 1500 } } },
    ],
  },
  {
    id: 'dark-emerald', name: 'Dark Emerald', parts: ['emerald-perfect', 'sapphire-flawless', 'topaz-flawed'],
    tiers: [
      { id: 'dark-emerald', name: 'Dark Emerald', attack: attack([90, 150], 0.8, 550, 'siege', 'both', 2000, [
        { kind: 'gem.bounce', radius: 256, family: 'dark-emerald' },
        { kind: 'gem.stunHit', chance: 0.125, duration: 1.5, damageTaken: 0.2 },
      ]) },
      // 166 + 2d51 (dark-emerald-chain.lua): clusters around the middle.
      { id: 'enchanted-emerald', name: 'Enchanted Emerald', cost: 185, attack: attack([168, 268], 0.7, 700, 'siege', 'both', 2000, [
        { kind: 'gem.bounce', radius: 256, family: 'dark-emerald' },
        { kind: 'gem.stunHit', chance: 0.125, duration: 1.5, damageTaken: 0.2 },
      ], [2, 51]) },
    ],
  },
  {
    id: 'gold', name: 'Gold', parts: ['amethyst-perfect', 'amethyst-flawless', 'diamond-flawed'],
    tiers: [
      // Orb of Corruption (A00M): −4 armor for 5 s per hit.
      { id: 'gold', name: 'Gold', attack: attack([160, 190], 1, 800, 'pierce', 'both', 1500, [
        { kind: 'crit', chance: 0.25, multiplier: 2 },
        { kind: 'armor', amount: 4, duration: 5, key: 'gem:corruption' },
      ]) },
      { id: 'egyptian-gold', name: 'Egyptian Gold', cost: 205, attack: attack([160, 200], 0.75, 800, 'pierce', 'both', 1500, [
        { kind: 'crit', chance: 0.3, multiplier: 2 },
        { kind: 'armor', amount: 8, duration: 5, key: 'gem:corruption' },
      ]) },
    ],
  },
  {
    id: 'uranium', name: 'Uranium 238', parts: ['topaz-perfect', 'sapphire-normal', 'opal-flawed'],
    tiers: [
      // No attack: a −50% move-speed aura (A00W) and a burn of 20 every 0.1 s (src/gem/special/uranium.j).
      { id: 'uranium-238', name: 'Uranium 238',
        auras: [{ kind: 'slow', to: 'creeps', radius: 500, value: 0.5, key: 'gem:uranium' }],
        gem: { burn: { dps: 200, radius: 500 } } },
      // Attack 2 only, plus Barrage 19 on every enemy within 900 every 0.2 s (A016).
      // assumed: Uranium 235's slow aura (A0U0) shares Uranium 238's buff, so two don't stack.
      { id: 'uranium-235', name: 'Uranium 235', cost: 190, attack: attack([20, 20], 0.2, 900, 'chaos', 'both', 2500),
        auras: [{ kind: 'slow', to: 'creeps', radius: 500, value: 0.5, key: 'gem:uranium' }],
        gem: { burn: { dps: 200, radius: 500 }, barrage: { damage: 19, targets: 0, radius: 900, cooldown: 0.2 } } },
    ],
  },
  {
    id: 'pink-diamond', name: 'Pink Diamond', parts: ['diamond-perfect', 'diamond-normal', 'topaz-normal'],
    tiers: [
      { id: 'pink-diamond', name: 'Pink Diamond', attack: attack([150, 175], 0.75, 800, 'normal', 'ground', 1200, [{ kind: 'crit', chance: 0.1, multiplier: 9 }]) },
      { id: 'great-pink-diamond', name: 'Great Pink Diamond', cost: 175, attack: attack([175, 225], 0.65, 850, 'normal', 'ground', 1800, [{ kind: 'crit', chance: 0.1, multiplier: 15 }]) },
    ],
  },
  {
    id: 'paraiba', name: 'Paraiba Tourmaline', parts: ['aquamarine-perfect', 'opal-flawless', 'aquamarine-flawed', 'emerald-flawed'],
    tiers: [
      // 5 + 5d79. Frost Nova (A03J) per hit: 1 in 5, 5 of its 10 mana (regen 2.25/s).
      { id: 'paraiba-tourmaline', name: 'Paraiba Tourmaline',
        attack: attack([10, 400], 0.75, 850, 'magic', 'both', 1750, [
          { kind: 'gem.nova', chance: 0.2, mana: 5, targetDamage: 125, areaDamage: 125, radius: 200, slow: 0.2, slowDuration: 5 },
        ], [5, 79]),
        auras: [{ kind: 'armor', to: 'creeps', radius: 600, value: 4, targets: 'ground', key: 'gem:paraiba' }],
        gem: { mana: { max: 10, regen: 2.25 } } },
      // 25 + 5d79; Nova A03N.
      { id: 'paraiba-tourmaline-facet', name: 'Paraiba Tourmaline Facet', cost: 275,
        attack: attack([30, 420], 0.75, 875, 'magic', 'both', 1750, [
          { kind: 'gem.nova', chance: 0.2, mana: 5, targetDamage: 150, areaDamage: 200, radius: 200, slow: 0.2, slowDuration: 5 },
        ], [5, 79]),
        auras: [{ kind: 'armor', to: 'creeps', radius: 650, value: 6, targets: 'ground', key: 'gem:paraiba' }],
        gem: { mana: { max: 10, regen: 2.75 } } },
    ],
  },
  {
    id: 'black-opal', name: 'Black Opal', parts: ['opal-perfect', 'diamond-flawless', 'aquamarine-normal'],
    tiers: [
      // Command Aura (A00G): % of base attack damage. Each tier has its own buff, so they stack.
      { id: 'black-opal', name: 'Black Opal', attack: attack([25, 25], 1, 800, 'magic', 'both', 800),
        auras: [{ kind: 'damage', to: 'towers', radius: 1000, value: 0.3, key: 'gem:black-opal' }] },
      { id: 'mystic-black-opal', name: 'Mystic Black Opal', cost: 275, attack: attack([50, 50], 1, 1000, 'magic', 'both', 1000),
        auras: [{ kind: 'damage', to: 'towers', radius: 1200, value: 0.4, key: 'gem:mystic-black-opal' }] },
    ],
  },
  {
    id: 'blood-stone', name: 'Blood Stone', parts: ['ruby-perfect', 'aquamarine-flawless', 'amethyst-normal'],
    tiers: [
      // Blood Lightning (GBSB): 24% + 12% per extra Blood Stone, 5 of 10 mana (regen 3.5/s), up to 9 targets.
      { id: 'blood-stone', name: 'Blood Stone', attack: attack([115, 115], 0.8, 700, 'hero', 'both', 1500, [
        { kind: 'gem.lightning', chance: 0.24, chancePerExtra: 0.12, family: 'blood-stone', mana: 5,
          byKillStep: [180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480], maxTargets: 9, range: 600 },
      ]), gem: { mana: { max: 10, regen: 3.5 } } },
      { id: 'ancient-blood-stone', name: 'Ancient Blood Stone', cost: 225, attack: attack([160, 240], 0.8, 700, 'hero', 'both', 1500, [
        { kind: 'gem.killCrit', chance: 0.1, byKillStep: [3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5, 5.25, 5.5] },
        { kind: 'gem.lightning', chance: 0.24, chancePerExtra: 0.12, family: 'blood-stone', mana: 5,
          byKillStep: [350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850], maxTargets: 9, range: 600 },
      ]), gem: { mana: { max: 10, regen: 3.5 } } },
    ],
  },
  {
    id: 'yellow-sapphire', name: 'Yellow Sapphire', parts: ['sapphire-perfect', 'ruby-flawless', 'topaz-flawless'],
    tiers: [
      { id: 'yellow-sapphire', name: 'Yellow Sapphire', attack: attack([100, 100], 0.8, 800, 'spells', 'both', 1500, frostSplash(500)) },
      { id: 'star-yellow-sapphire', name: 'Star Yellow Sapphire', cost: 180, attack: attack([220, 220], 0.8, 850, 'spells', 'both', 1500, frostSplash(500)) },
    ],
  },
];

/** Every Recipe in the order of src/gem/special/initialize.j. */
export const SPECIAL_LINES: readonly SpecialLine[] = LINES.map((l) => ({
  id: l.id, name: l.name, parts: l.parts, tiers: l.tiers.map((t) => t.id),
}));

export const STONE_OF_BRYVX = 'stone-of-bryvx';

/** Merging above Great (three or four identical Perfects) makes this instead. */
const STONE_SPEC: GemTowerSpec = {
  name: 'Stone of Bryvx',
  footprint: 2,
  attack: attack([500, 500], 0.8, 850, 'siege', 'both', 2000),
  auras: [{ kind: 'damage', to: 'towers', radius: 1500, value: 0.3, key: 'gem:bryvx' }],
  gem: { kind: 'stone' },
};

function tierSpec(line: LineDef, i: number): GemTowerSpec {
  const t = line.tiers[i]!;
  const next = line.tiers[i + 1]?.id;
  return {
    name: t.name,
    footprint: 2,
    ...(t.cost !== undefined ? { cost: t.cost } : {}),
    ...(t.attack ? { attack: t.attack } : {}),
    ...(t.auras ? { auras: t.auras } : {}),
    gem: { ...t.gem, kind: 'special', family: line.id, tier: i + 1, ...(next !== undefined ? { next } : {}) },
  };
}

/** Every special tier and the Stone of Bryvx by spec id. */
export const GEM_SPECIALS: Readonly<Record<string, GemTowerSpec>> = Object.fromEntries([
  ...LINES.flatMap((line) => line.tiers.map((t, i) => [t.id, tierSpec(line, i)] as const)),
  [STONE_OF_BRYVX, STONE_SPEC] as const,
]);
