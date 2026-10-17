import type { Family, TalentSpec } from './types';

// The Talent trees (docs/original-design.md §8): one per Tower Family, 4 rows
// bought in order. Rows 1–3 offer two Talents and you hold one of them; row 4 is
// a single capstone. Talents are fixed for a Run and reset for free between them.

/** Stars each row costs: 8 fill a tree, 48 all six. */
export const ROW_COST: readonly number[] = [1, 2, 2, 3];
export const TALENT_ROWS = 4;

type Row = readonly [id: string, name: string, text: string, effect: TalentSpec['effect']];

function tree(family: Family, rows: readonly (readonly Row[])[]): TalentSpec[] {
  return rows.flatMap((options, i) => options.map(([id, name, text, effect]) => ({ id, family, row: i + 1, name, text, effect })));
}

const TREES: readonly TalentSpec[] = [
  ...tree('arrow', [
    [['fletching', 'Fletching', '+10% damage', { kind: 'damage', value: 0.1 }],
      ['long-draw', 'Long Draw', '+10% range', { kind: 'range', value: 0.1 }]],
    [['quick-nock', 'Quick Nock', '+12% attack speed', { kind: 'attackSpeed', value: 0.12 }],
      ['bodkin-points', 'Bodkin Points', 'Armored takes 70% from Pierce, not 50%', { kind: 'armorType', damage: 'pierce', armor: 'armored', value: 0.7 }]],
    [['woodcutters', 'Woodcutters', 'Arrow towers and upgrades cost 10% less', { kind: 'cost', value: 0.1 }],
      ['eagle-feathers', 'Eagle Feathers', '+25% damage to flying', { kind: 'flyingDamage', value: 0.25 }]],
    [['hawkeye', 'Hawkeye', 'Every Arrow tower crits 10% of the time for ×2.5 (Deadeye: +10%)', { kind: 'crit', chance: 0.1, multiplier: 2.5 }]],
  ]),
  ...tree('cannon', [
    [['black-powder', 'Black Powder', '+10% damage', { kind: 'damage', value: 0.1 }],
      ['wide-shells', 'Wide Shells', '+20% splash radius', { kind: 'splashRadius', value: 0.2 }]],
    [['shrapnel', 'Shrapnel', 'Hits leave −2 armor for 3 s', { kind: 'shrapnel', armor: 2, duration: 3 }],
      ['quick-reload', 'Quick Reload', '+12% attack speed', { kind: 'attackSpeed', value: 0.12 }]],
    [['salvage', 'Salvage', 'Cannon towers sell for 85%', { kind: 'sellShare', value: 0.85 }],
      ['long-barrels', 'Long Barrels', '+10% range', { kind: 'range', value: 0.1 }]],
    [['concussion', 'Concussion', '15% of shots stun everything in the full-damage splash for 0.5 s', { kind: 'concussion', chance: 0.15, duration: 0.5 }]],
  ]),
  ...tree('frost', [
    [['deep-chill', 'Deep Chill', 'Slows last 1 s longer', { kind: 'slowDuration', value: 1 }],
      ['frostbite', 'Frostbite', '+20% damage', { kind: 'damage', value: 0.2 }]],
    [['brittle', 'Brittle', 'Slowed creeps take +10% from Pierce and Siege', { kind: 'brittle', value: 0.1 }],
      ['cold-reach', 'Cold Reach', '+10% range', { kind: 'range', value: 0.1 }]],
    [['hard-frost', 'Hard Frost', 'Slows 5 points stronger', { kind: 'slowStrength', value: 0.05 }],
      ['ice-harvest', 'Ice Harvest', 'Frost kills pay +1 gold', { kind: 'killGold', value: 1 }]],
    [['shatter', 'Shatter', 'A creep that dies slowed by Frost deals 15% of its max HP as Magic to creeps within 96', { kind: 'shatter', share: 0.15, radius: 96 }]],
  ]),
  ...tree('arcane', [
    [['focus', 'Focus', '+10% damage', { kind: 'damage', value: 0.1 }],
      ['far-sight', 'Far Sight', '+10% range', { kind: 'range', value: 0.1 }]],
    [['spellbreaker', 'Spellbreaker', 'Warded takes 70% from Magic, not 50%', { kind: 'armorType', damage: 'magic', armor: 'warded', value: 0.7 }],
      ['mana-flow', 'Mana Flow', '+12% attack speed', { kind: 'attackSpeed', value: 0.12 }]],
    [['echo', 'Echo', '15% of attacks fire a second bolt at another creep', { kind: 'echo', chance: 0.15 }],
      ['apprentices', 'Apprentices', 'Arcane towers and upgrades cost 10% less', { kind: 'cost', value: 0.1 }]],
    [['leyline', 'Leyline', '+10% damage for each other Arcane tower within 192, up to +30%', { kind: 'leyline', per: 0.1, radius: 192, max: 0.3 }]],
  ]),
  ...tree('poison', [
    [['potency', 'Potency', '+15% poison damage', { kind: 'poisonDamage', value: 0.15 }],
      ['lingering', 'Lingering', 'Poison lasts 1 s longer', { kind: 'poisonDuration', value: 1 }]],
    [['contagion', 'Contagion', 'A creep that dies poisoned passes its poison to the nearest creep within 128', { kind: 'contagion', radius: 128 }],
      ['corrode', 'Corrode', 'Poisoned creeps get −2 armor', { kind: 'corrode', armor: 2 }]],
    [['antivenom', 'Antivenom', 'Poisoned creeps don\'t regenerate', { kind: 'antivenom' }],
      ['thick-venom', 'Thick Venom', 'Poison slows 10%', { kind: 'poisonSlow', value: 0.1 }]],
    [['plague-wind', 'Plague Wind', 'Poison towers can hit flying creeps', { kind: 'hitsAir' }]],
  ]),
  ...tree('totem', [
    [['wide-circle', 'Wide Circle', '+15% aura radius', { kind: 'auraRadius', value: 0.15 }],
      ['drumbeat', 'Drumbeat', '+5 points of attack speed', { kind: 'auraAttackSpeed', value: 0.05 }]],
    [['spirit-link', 'Spirit Link', 'Towers in a Totem\'s aura gain 25% more XP', { kind: 'auraXp', value: 0.25 }],
      ['cheap-carving', 'Cheap Carving', 'Totems cost 15% less', { kind: 'cost', value: 0.15 }]],
    [['hex', 'Hex', 'Creeps within a Totem\'s reach take +8% damage', { kind: 'hex', value: 0.08 }],
      ['rally', 'Rally', 'The aura also gives +8% range', { kind: 'auraRange', value: 0.08 }]],
    [['elder-spirits', 'Elder Spirits', 'Totems are built at Tower Level 5, with its Perk', { kind: 'startLevel', level: 5 }]],
  ]),
];

/** Every Talent by id. */
export const TALENTS: Readonly<Record<string, TalentSpec>> = Object.fromEntries(TREES.map((t) => [t.id, t]));

/** A family's tree: its Talents in row order, the two options of a row side by side. */
export function talentTree(family: Family): TalentSpec[] {
  return TREES.filter((t) => t.family === family);
}
