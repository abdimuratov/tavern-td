import type { DamageTable } from '../../sim';

// Gem TD+'s attack × armor table (share/constants/gameplay/gem.lua), replacing
// WC3's. Armor types by Gem TD+'s colour names: Red small, Blazed medium, White
// large, Green fortified, Yellow normal, Blue hero, Bryvx divine, Pink none.
// Armor value: WC3's 0.06 per point (the core's default armorFactor; assumed:
// engine formula, gem.lua leaves DefenseArmor alone).

export const ARMOR_TYPES = ['small', 'medium', 'large', 'fort', 'normal', 'hero', 'divine', 'none'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

function row(...v: [number, number, number, number, number, number, number, number]): Readonly<Record<ArmorType, number>> {
  return Object.fromEntries(ARMOR_TYPES.map((a, i) => [a, v[i]!])) as Record<ArmorType, number>;
}

export const GEM_DAMAGE_TABLE: DamageTable = {
  chaos: row(0.5, 1, 0.6, 0.7, 1.6, 1, 0.75, 1.2),
  hero: row(1.8, 0.8, 1, 0.5, 1, 1, 0.75, 0.8),
  magic: row(1, 1.9, 0.8, 0.7, 1, 0.4, 0.75, 1),
  normal: row(1.2, 1, 1.6, 1, 0.6, 1, 0.75, 0.2),
  pierce: row(0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.75, 1.75),
  siege: row(0.7, 0.7, 0.7, 1.7, 0.7, 0.7, 0.75, 1.5),
  spells: row(1, 1, 1, 1, 1, 1.75, 0.75, 1),
};

/**
 * The attack type Gem TD+'s spell damage uses: burns deal ATTACK_TYPE_NORMAL
 * (this table's Spells row) with DAMAGE_TYPE_UNIVERSAL (src/gem/immolation.j).
 * assumed: poison, Frost Nova, lightning and the slate spells do the same, and
 * all of it ignores the armor value (WC3 armor only reduces normal damage types).
 */
export const SPELL_ATTACK_TYPE = 'spells';
