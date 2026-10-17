import type { AttackSpec, EffectSpec, TowerSpec } from '../../sim';
import {
  ELEMENTS,
  type AcidShot, type DamageElement, type Element, type ElementTowerInfo, type ElementTowerSpec, type ShotHit, type TargetMode,
  type TowerAbility, type TowerKind,
} from './types';

// Element TD's 144 towers (docs/research/element-td-rules.md §3), from the port's
// npc_units_custom.txt via element-data.json. Each row is ported as is; the
// family tables below add the ability values from npc_abilities_custom.txt.
// The player-facing names are ours.

/** A creep counts as in range at the attack range plus this (the tower's hull). */
export const HULL = 50;

/** Slow strength by tower level for the four slow families (modifier_slow_adjustment.lua). */
export const SLOW_LEVELS: readonly number[] = [0.12, 0.28, 0.52];

type Row = readonly [
  id: string, kind: TowerKind, family: string, level: number, cost: number, totalCost: number, essence: number,
  damage: number, cooldown: number, range: number, projectileSpeed: number, elements: readonly Element[],
  damageElement: DamageElement, support: boolean, aoeFull: number, aoeHalf: number, ground: boolean,
  buffPriority: number | null, buildTime: number, requires: Readonly<Partial<Record<Element, number>>>, upgrades: readonly string[],
];

const ROWS: readonly Row[] = [
// [id, kind, family, level, cost, totalCost, essence, damage, cooldown, range, projectileSpeed, elements, damage element, support, aoeFull, aoeHalf, ground, buffPriority, buildTime, requires, upgrades]
  ['periodic_tower', 'periodic', 'periodic', 1, 13000, 13000, 1, 0, 1.0, 1150, 2000, [], 'composite', false, 100, 200, false, 1, 6.0, {}, []],
  ['basic_arrow_tower', 'basic', 'arrow', 1, 100, 100, 0, 70, 0.66, 900, 2500, [], 'composite', true, 0, 0, false, null, 1.0, {}, ['light_arrow_tower', 'dark_arrow_tower', 'water_arrow_tower', 'fire_arrow_tower', 'nature_arrow_tower', 'earth_arrow_tower']],
  ['dark_arrow_tower', 'elementalBasic', 'arrow', 1, 125, 225, 0, 210, 0.66, 900, 2500, ['dark'], 'dark', true, 0, 0, false, null, 1.0, {'dark': 1}, []],
  ['earth_arrow_tower', 'elementalBasic', 'arrow', 1, 125, 225, 0, 210, 0.66, 900, 2500, ['earth'], 'earth', true, 0, 0, false, null, 1.0, {'earth': 1}, []],
  ['fire_arrow_tower', 'elementalBasic', 'arrow', 1, 125, 225, 0, 210, 0.66, 900, 2500, ['fire'], 'fire', true, 0, 0, false, null, 1.0, {'fire': 1}, []],
  ['light_arrow_tower', 'elementalBasic', 'arrow', 1, 125, 225, 0, 210, 0.66, 900, 2500, ['light'], 'light', true, 0, 0, false, null, 1.0, {'light': 1}, []],
  ['nature_arrow_tower', 'elementalBasic', 'arrow', 1, 125, 225, 0, 210, 0.66, 900, 2500, ['nature'], 'nature', true, 0, 0, false, null, 1.0, {'nature': 1}, []],
  ['water_arrow_tower', 'elementalBasic', 'arrow', 1, 125, 225, 0, 210, 0.66, 900, 2500, ['water'], 'water', true, 0, 0, false, null, 1.0, {'water': 1}, []],
  ['basic_cannon_tower', 'basic', 'cannon', 1, 100, 100, 0, 90, 1.5, 700, 2000, [], 'composite', true, 100, 200, true, null, 1.0, {}, ['light_cannon_tower', 'dark_cannon_tower', 'water_cannon_tower', 'fire_cannon_tower', 'nature_cannon_tower', 'earth_cannon_tower']],
  ['dark_cannon_tower', 'elementalBasic', 'cannon', 1, 125, 225, 0, 270, 1.5, 700, 2000, ['dark'], 'dark', true, 100, 200, true, null, 1.0, {'dark': 1}, []],
  ['earth_cannon_tower', 'elementalBasic', 'cannon', 1, 125, 225, 0, 270, 1.5, 700, 2000, ['earth'], 'earth', true, 100, 200, true, null, 1.0, {'earth': 1}, []],
  ['fire_cannon_tower', 'elementalBasic', 'cannon', 1, 125, 225, 0, 270, 1.5, 700, 2000, ['fire'], 'fire', true, 100, 200, true, null, 1.0, {'fire': 1}, []],
  ['light_cannon_tower', 'elementalBasic', 'cannon', 1, 125, 225, 0, 270, 1.5, 700, 2000, ['light'], 'light', true, 100, 200, true, null, 1.0, {'light': 1}, []],
  ['nature_cannon_tower', 'elementalBasic', 'cannon', 1, 125, 225, 0, 270, 1.5, 700, 2000, ['nature'], 'nature', true, 100, 200, true, null, 1.0, {'nature': 1}, []],
  ['water_cannon_tower', 'elementalBasic', 'cannon', 1, 125, 225, 0, 270, 1.5, 700, 2000, ['water'], 'water', true, 100, 200, true, null, 1.0, {'water': 1}, []],
  ['dark_tower', 'single', 'dark', 1, 175, 175, 0, 360, 1.5, 1150, 2500, ['dark'], 'dark', false, 0, 0, false, 11, 1.0, {'dark': 1}, ['focused_dark_tower', 'poison_tower', 'magic_tower', 'disease_tower', 'gunpowder_tower', 'trickery_tower']],
  ['focused_dark_tower', 'single', 'dark', 2, 575, 750, 0, 2500, 1.5, 1150, 2500, ['dark'], 'dark', false, 0, 0, false, 9, 1.0, {'dark': 2}, ['refined_dark_tower']],
  ['pure_dark_tower', 'pure', 'dark', 4, 10000, 13000, 1, 200000, 1.5, 1150, 2500, ['dark'], 'dark', false, 0, 0, false, 1, 3.0, {}, []],
  ['refined_dark_tower', 'single', 'dark', 3, 2250, 3000, 0, 17600, 1.5, 1150, 2500, ['dark'], 'dark', false, 0, 0, false, 5, 1.0, {'dark': 3}, ['pure_dark_tower']],
  ['earth_tower', 'single', 'earth', 1, 175, 175, 0, 55, 1.0, 900, 2000, ['earth'], 'earth', false, 150, 300, false, 11, 1.0, {'earth': 1}, ['focused_earth_tower', 'hydro_tower', 'blacksmith_tower', 'moss_tower', 'quark_tower', 'gunpowder_tower']],
  ['focused_earth_tower', 'single', 'earth', 2, 575, 750, 0, 385, 1.0, 900, 2000, ['earth'], 'earth', false, 150, 300, false, 9, 1.0, {'earth': 2}, ['refined_earth_tower']],
  ['pure_earth_tower', 'pure', 'earth', 4, 10000, 13000, 1, 27000, 1.0, 900, 2000, ['earth'], 'earth', false, 200, 400, false, 1, 3.0, {}, []],
  ['refined_earth_tower', 'single', 'earth', 3, 2250, 3000, 0, 2700, 1.0, 900, 2000, ['earth'], 'earth', false, 150, 300, false, 5, 1.0, {'earth': 3}, ['pure_earth_tower']],
  ['fire_tower', 'single', 'fire', 1, 175, 175, 0, 30, 0.31, 700, 2000, ['fire'], 'fire', false, 200, 400, false, 11, 1.0, {'fire': 1}, ['focused_fire_tower', 'vapor_tower', 'flame_tower', 'blacksmith_tower', 'electricity_tower', 'magic_tower']],
  ['focused_fire_tower', 'single', 'fire', 2, 575, 750, 0, 210, 0.31, 700, 2000, ['fire'], 'fire', false, 200, 400, false, 9, 1.0, {'fire': 2}, ['refined_fire_tower']],
  ['pure_fire_tower', 'pure', 'fire', 4, 10000, 13000, 1, 15000, 0.31, 900, 2500, ['fire'], 'fire', false, 200, 400, false, 1, 3.0, {}, []],
  ['refined_fire_tower', 'single', 'fire', 3, 2250, 3000, 0, 1500, 0.31, 700, 2000, ['fire'], 'fire', false, 200, 400, false, 5, 1.0, {'fire': 3}, ['pure_fire_tower']],
  ['focused_light_tower', 'single', 'light', 2, 575, 750, 0, 840, 0.66, 1500, 2700, ['light'], 'light', false, 0, 0, false, 9, 1.0, {'light': 2}, ['refined_light_tower']],
  ['light_tower', 'single', 'light', 1, 175, 175, 0, 120, 0.66, 1500, 2700, ['light'], 'light', false, 0, 0, false, 11, 1.0, {'light': 1}, ['focused_light_tower', 'ice_tower', 'electricity_tower', 'life_tower', 'quark_tower', 'trickery_tower']],
  ['pure_light_tower', 'pure', 'light', 4, 10000, 13000, 1, 59000, 0.66, 1750, 2700, ['light'], 'light', false, 0, 0, false, 1, 3.0, {'light': 3}, []],
  ['refined_light_tower', 'single', 'light', 3, 2250, 3000, 0, 5900, 0.66, 1500, 2700, ['light'], 'light', false, 0, 0, false, 5, 1.0, {'light': 3}, ['pure_light_tower']],
  ['focused_nature_tower', 'single', 'nature', 2, 575, 750, 0, 560, 0.31, 700, 3000, ['nature'], 'nature', false, 0, 0, false, 9, 1.0, {'nature': 2}, ['refined_nature_tower']],
  ['nature_tower', 'single', 'nature', 1, 175, 175, 0, 80, 0.31, 700, 3000, ['nature'], 'nature', false, 0, 0, false, 11, 1.0, {'nature': 1}, ['focused_nature_tower', 'well_tower', 'flame_tower', 'moss_tower', 'life_tower', 'disease_tower']],
  ['pure_nature_tower', 'pure', 'nature', 4, 10000, 13000, 1, 39000, 0.31, 900, 3000, ['nature'], 'nature', false, 0, 0, false, 1, 3.0, {}, []],
  ['refined_nature_tower', 'single', 'nature', 3, 2250, 3000, 0, 3900, 0.31, 700, 3000, ['nature'], 'nature', false, 0, 0, false, 5, 1.0, {'nature': 3}, ['pure_nature_tower']],
  ['focused_water_tower', 'single', 'water', 2, 575, 750, 0, 630, 0.66, 900, 2500, ['water'], 'water', false, 100, 200, false, 9, 1.0, {'water': 2}, ['refined_water_tower']],
  ['pure_water_tower', 'pure', 'water', 4, 10000, 13000, 1, 44000, 0.66, 900, 2500, ['water'], 'water', false, 100, 200, false, 1, 3.0, {}, []],
  ['refined_water_tower', 'single', 'water', 3, 2250, 3000, 0, 4400, 0.66, 900, 2500, ['water'], 'water', false, 100, 200, false, 5, 1.0, {'water': 3}, ['pure_water_tower']],
  ['water_tower', 'single', 'water', 1, 175, 175, 0, 90, 0.66, 900, 2500, ['water'], 'water', false, 100, 200, false, 11, 1.0, {'water': 1}, ['focused_water_tower', 'vapor_tower', 'well_tower', 'hydro_tower', 'ice_tower', 'poison_tower']],
  ['blacksmith_tower', 'dual', 'blacksmith', 1, 425, 600, 0, 700, 1.0, 900, 2000, ['fire', 'earth'], 'fire', true, 0, 0, false, null, 2.0, {'fire': 1, 'earth': 1}, ['blacksmith_tower_2', 'gold_tower', 'quake_tower', 'haste_tower', 'flamethrower_tower']],
  ['blacksmith_tower_2', 'dual', 'blacksmith', 2, 1150, 1750, 0, 3500, 1.0, 900, 2000, ['fire', 'earth'], 'fire', true, 0, 0, false, null, 2.0, {'fire': 2, 'earth': 2}, ['blacksmith_tower_3']],
  ['blacksmith_tower_3', 'dual', 'blacksmith', 3, 4250, 6000, 0, 17500, 1.0, 900, 2000, ['fire', 'earth'], 'fire', true, 0, 0, false, null, 2.0, {'fire': 3, 'earth': 3}, []],
  ['disease_tower', 'dual', 'disease', 1, 425, 600, 0, 140, 0.31, 700, 3000, ['dark', 'nature'], 'dark', false, 0, 0, false, 10, 2.0, {'dark': 1, 'nature': 1}, ['disease_tower_2', 'flooding_tower', 'obliteration_tower', 'roots_tower', 'jinx_tower']],
  ['disease_tower_2', 'dual', 'disease', 2, 1150, 1750, 0, 700, 0.31, 700, 3000, ['dark', 'nature'], 'dark', false, 0, 0, false, 7, 2.0, {'dark': 2, 'nature': 2}, ['disease_tower_3']],
  ['disease_tower_3', 'dual', 'disease', 3, 2500, 4250, 0, 3500, 0.31, 700, 3000, ['dark', 'nature'], 'dark', false, 0, 0, false, 3, 2.0, {'dark': 3, 'nature': 3}, []],
  ['electricity_tower', 'dual', 'electricity', 1, 425, 600, 0, 0, 1.5, 900, 1000, ['fire', 'light'], 'fire', false, 0, 0, false, 10, 2.0, {'fire': 1, 'light': 1}, ['electricity_tower_2', 'gold_tower', 'windstorm_tower', 'runic_tower', 'nova_tower']],
  ['electricity_tower_2', 'dual', 'electricity', 2, 1150, 1750, 0, 0, 1.5, 900, 1000, ['fire', 'light'], 'fire', false, 0, 0, false, 7, 2.0, {'fire': 2, 'light': 2}, ['electricity_tower_3']],
  ['electricity_tower_3', 'dual', 'electricity', 3, 2500, 4250, 0, 0, 1.5, 900, 1000, ['fire', 'light'], 'fire', false, 0, 0, false, 3, 2.0, {'fire': 3, 'light': 3}, []],
  ['flame_tower', 'dual', 'flame', 1, 425, 600, 0, 300, 0.66, 700, 2000, ['fire', 'nature'], 'fire', false, 0, 0, false, 10, 2.0, {'fire': 1, 'nature': 1}, ['flame_tower_2', 'quake_tower', 'impulse_tower', 'jinx_tower', 'nova_tower']],
  ['flame_tower_2', 'dual', 'flame', 2, 1150, 1750, 0, 1500, 0.66, 700, 2000, ['fire', 'nature'], 'fire', false, 0, 0, false, 7, 2.0, {'fire': 2, 'nature': 2}, ['flame_tower_3']],
  ['flame_tower_3', 'dual', 'flame', 3, 2500, 4250, 0, 7500, 0.66, 700, 2000, ['fire', 'nature'], 'fire', false, 0, 0, false, 3, 2.0, {'fire': 3, 'nature': 3}, []],
  ['gunpowder_tower', 'dual', 'gunpowder', 1, 425, 600, 0, 50, 0.66, 1500, 2000, ['earth', 'dark'], 'earth', false, 0, 0, true, 10, 2.0, {'earth': 1, 'dark': 1}, ['gunpowder_tower_2', 'muck_tower', 'laser_tower', 'flamethrower_tower', 'roots_tower']],
  ['gunpowder_tower_2', 'dual', 'gunpowder', 2, 1150, 1750, 0, 250, 0.66, 1500, 2000, ['earth', 'dark'], 'earth', false, 0, 0, true, 7, 2.0, {'earth': 2, 'dark': 2}, ['gunpowder_tower_3']],
  ['gunpowder_tower_3', 'dual', 'gunpowder', 3, 2500, 4250, 0, 1250, 0.66, 1500, 2000, ['earth', 'dark'], 'earth', false, 0, 0, true, 3, 2.0, {'earth': 3, 'dark': 3}, []],
  ['hydro_tower', 'dual', 'hydro', 1, 425, 600, 0, 700, 0.66, 700, 2000, ['water', 'earth'], 'earth', false, 0, 0, false, 10, 2.0, {'water': 1, 'earth': 1}, ['hydro_tower_2', 'muck_tower', 'ephemeral_tower', 'haste_tower', 'polar_tower']],
  ['hydro_tower_2', 'dual', 'hydro', 2, 1150, 1750, 0, 3500, 0.66, 700, 2000, ['water', 'earth'], 'earth', false, 0, 0, false, 7, 2.0, {'water': 2, 'earth': 2}, ['hydro_tower_3']],
  ['hydro_tower_3', 'dual', 'hydro', 3, 2500, 4250, 0, 17500, 0.66, 700, 2000, ['water', 'earth'], 'earth', false, 0, 0, false, 3, 2.0, {'water': 3, 'earth': 3}, []],
  ['ice_tower', 'dual', 'ice', 1, 425, 600, 0, 800, 1.5, 900, 2500, ['water', 'light'], 'light', false, 100, 200, false, 10, 2.0, {'water': 1, 'light': 1}, ['ice_tower_2', 'windstorm_tower', 'hail_tower', 'tidal_tower', 'polar_tower']],
  ['ice_tower_2', 'dual', 'ice', 2, 1150, 1750, 0, 4000, 1.5, 900, 2500, ['water', 'light'], 'light', false, 100, 200, false, 7, 2.0, {'water': 2, 'light': 2}, ['ice_tower_3']],
  ['ice_tower_3', 'dual', 'ice', 3, 2500, 4250, 0, 20000, 1.5, 900, 2500, ['water', 'light'], 'light', false, 100, 200, false, 3, 2.0, {'water': 3, 'light': 3}, []],
  ['life_tower', 'dual', 'life', 1, 425, 600, 0, 420, 0.66, 1150, 2500, ['light', 'nature'], 'nature', false, 0, 0, false, 10, 2.0, {'light': 1, 'nature': 1}, ['life_tower_2', 'enchantment_tower', 'obliteration_tower', 'tidal_tower', 'nova_tower']],
  ['life_tower_2', 'dual', 'life', 2, 1150, 1750, 0, 2100, 0.66, 1150, 2500, ['light', 'nature'], 'nature', false, 0, 0, false, 7, 2.0, {'light': 2, 'nature': 2}, ['life_tower_3']],
  ['life_tower_3', 'dual', 'life', 3, 2500, 4250, 0, 10500, 0.66, 1150, 2500, ['light', 'nature'], 'nature', false, 0, 0, false, 3, 2.0, {'light': 3, 'nature': 3}, []],
  ['magic_tower', 'dual', 'magic', 1, 425, 600, 0, 300, 0.31, 1500, 3000, ['dark', 'fire'], 'dark', false, 50, 50, false, 10, 2.0, {'dark': 1, 'fire': 1}, ['magic_tower_2', 'runic_tower', 'flamethrower_tower', 'jinx_tower', 'erosion_tower']],
  ['magic_tower_2', 'dual', 'magic', 2, 1150, 1750, 0, 1500, 0.31, 1500, 3000, ['dark', 'fire'], 'dark', false, 50, 50, false, 7, 2.0, {'dark': 2, 'fire': 2}, ['magic_tower_3']],
  ['magic_tower_3', 'dual', 'magic', 3, 2500, 4250, 0, 7500, 0.31, 1500, 3000, ['dark', 'fire'], 'dark', false, 50, 50, false, 3, 2.0, {'dark': 3, 'fire': 3}, []],
  ['moss_tower', 'dual', 'moss', 1, 425, 600, 0, 400, 0.66, 700, 2000, ['nature', 'earth'], 'nature', false, 100, 200, false, 10, 2.0, {'earth': 1, 'nature': 1}, ['moss_tower_2', 'quake_tower', 'enchantment_tower', 'ephemeral_tower', 'roots_tower']],
  ['moss_tower_2', 'dual', 'moss', 2, 1150, 1750, 0, 2000, 0.66, 700, 2000, ['nature', 'earth'], 'nature', false, 100, 200, false, 7, 2.0, {'earth': 2, 'nature': 2}, ['moss_tower_3']],
  ['moss_tower_3', 'dual', 'moss', 3, 2500, 4250, 0, 10000, 0.66, 700, 2000, ['nature', 'earth'], 'nature', false, 100, 200, false, 3, 2.0, {'earth': 3, 'nature': 3}, []],
  ['poison_tower', 'dual', 'poison', 1, 425, 600, 0, 200, 1.0, 900, 2000, ['dark', 'water'], 'dark', false, 150, 300, false, 10, 2.0, {'dark': 1, 'water': 1}, ['poison_tower_2', 'muck_tower', 'flooding_tower', 'hail_tower', 'erosion_tower']],
  ['poison_tower_2', 'dual', 'poison', 2, 1150, 1750, 0, 1000, 1.0, 900, 2000, ['dark', 'water'], 'dark', false, 150, 300, false, 7, 2.0, {'dark': 2, 'water': 2}, ['poison_tower_3']],
  ['poison_tower_3', 'dual', 'poison', 3, 2500, 4250, 0, 5000, 1.0, 900, 2000, ['dark', 'water'], 'dark', false, 150, 300, false, 3, 2.0, {'dark': 3, 'water': 3}, []],
  ['quark_tower', 'dual', 'quark', 1, 425, 600, 0, 300, 0.66, 900, 2000, ['earth', 'light'], 'light', false, 100, 200, false, 10, 2.0, {'earth': 1, 'light': 1}, ['quark_tower_2', 'gold_tower', 'laser_tower', 'enchantment_tower', 'polar_tower']],
  ['quark_tower_2', 'dual', 'quark', 2, 1150, 1750, 0, 1500, 0.66, 900, 2000, ['earth', 'light'], 'light', false, 100, 200, false, 7, 2.0, {'earth': 2, 'light': 2}, ['quark_tower_3']],
  ['quark_tower_3', 'dual', 'quark', 3, 2500, 4250, 0, 7500, 0.66, 900, 2000, ['earth', 'light'], 'light', false, 100, 200, false, 3, 2.0, {'earth': 3, 'light': 3}, []],
  ['trickery_tower', 'dual', 'trickery', 1, 425, 600, 0, 700, 1.0, 900, 2000, ['light', 'dark'], 'light', true, 0, 0, false, null, 2.0, {'light': 1, 'dark': 1}, ['trickery_tower_2', 'laser_tower', 'hail_tower', 'runic_tower', 'obliteration_tower']],
  ['trickery_tower_2', 'dual', 'trickery', 2, 1150, 1750, 0, 3500, 1.0, 900, 2000, ['light', 'dark'], 'light', true, 0, 0, false, null, 2.0, {'light': 2, 'dark': 2}, ['trickery_tower_3']],
  ['trickery_tower_3', 'dual', 'trickery', 3, 4250, 6000, 0, 17500, 1.0, 900, 2000, ['light', 'dark'], 'light', true, 0, 0, false, null, 2.0, {'light': 3, 'dark': 3}, []],
  ['vapor_tower', 'dual', 'vapor', 1, 425, 600, 0, 0, 1.5, 550, 800, ['fire', 'water'], 'water', false, 0, 0, false, 10, 2.0, {'fire': 1, 'water': 1}, ['vapor_tower_2', 'windstorm_tower', 'impulse_tower', 'haste_tower', 'erosion_tower']],
  ['vapor_tower_2', 'dual', 'vapor', 2, 1150, 1750, 0, 0, 1.5, 550, 800, ['fire', 'water'], 'water', false, 0, 0, false, 7, 2.0, {'fire': 2, 'water': 2}, ['vapor_tower_3']],
  ['vapor_tower_3', 'dual', 'vapor', 3, 2500, 4250, 0, 0, 1.5, 550, 0, ['fire', 'water'], 'water', false, 0, 0, false, 3, 2.0, {'fire': 3, 'water': 3}, []],
  ['well_tower', 'dual', 'well', 1, 425, 600, 0, 700, 1.0, 900, 2000, ['nature', 'water'], 'water', true, 0, 0, false, null, 2.0, {'water': 1, 'nature': 1}, ['well_tower_2', 'flooding_tower', 'impulse_tower', 'ephemeral_tower', 'tidal_tower']],
  ['well_tower_2', 'dual', 'well', 2, 1150, 1750, 0, 3500, 1.0, 900, 2000, ['nature', 'water'], 'water', true, 0, 0, false, null, 2.0, {'water': 2, 'nature': 2}, ['well_tower_3']],
  ['well_tower_3', 'dual', 'well', 3, 4250, 6000, 0, 17500, 1.0, 900, 2000, ['nature', 'water'], 'water', true, 0, 0, false, null, 2.0, {'water': 3, 'nature': 3}, []],
  ['enchantment_tower', 'triple', 'enchantment', 1, 900, 1500, 0, 550, 0.31, 900, 3000, ['earth', 'light', 'nature'], 'nature', false, 100, 200, false, 8, 3.0, {'earth': 1, 'light': 1, 'nature': 1}, ['enchantment_tower_2']],
  ['enchantment_tower_2', 'triple', 'enchantment', 2, 3500, 5000, 0, 2750, 0.31, 900, 3000, ['earth', 'light', 'nature'], 'nature', false, 100, 200, false, 4, 3.0, {'earth': 2, 'light': 2, 'nature': 2}, ['enchantment_tower_3']],
  ['enchantment_tower_3', 'triple', 'enchantment', 3, 5000, 10000, 0, 8250, 0.31, 900, 3000, ['earth', 'light', 'nature'], 'nature', false, 100, 200, false, 1, 3.0, {'earth': 3, 'light': 3, 'nature': 3}, []],
  ['ephemeral_tower', 'triple', 'ephemeral', 1, 900, 1500, 0, 2000, 0.31, 900, 3000, ['earth', 'nature', 'water'], 'nature', false, 0, 0, false, 6, 3.0, {'earth': 1, 'nature': 1, 'water': 1}, ['ephemeral_tower_2']],
  ['ephemeral_tower_2', 'triple', 'ephemeral', 2, 3500, 5000, 0, 10000, 0.31, 900, 3000, ['earth', 'nature', 'water'], 'nature', false, 0, 0, false, 2, 3.0, {'earth': 2, 'nature': 2, 'water': 2}, ['ephemeral_tower_3']],
  ['ephemeral_tower_3', 'triple', 'ephemeral', 3, 5000, 10000, 0, 30000, 0.31, 900, 3000, ['earth', 'nature', 'water'], 'nature', false, 0, 0, false, 1, 3.0, {'earth': 3, 'nature': 3, 'water': 3}, []],
  ['erosion_tower', 'triple', 'erosion', 1, 900, 1500, 0, 0, 1.0, 900, 2000, ['dark', 'fire', 'water'], 'fire', false, 400, 400, false, 8, 3.0, {'dark': 1, 'fire': 1, 'water': 1}, ['erosion_tower_2']],
  ['erosion_tower_2', 'triple', 'erosion', 2, 3500, 5000, 0, 0, 1.0, 900, 2000, ['dark', 'fire', 'water'], 'fire', false, 400, 400, false, 4, 3.0, {'dark': 2, 'fire': 2, 'water': 2}, ['erosion_tower_3']],
  ['erosion_tower_3', 'triple', 'erosion', 3, 5000, 10000, 0, 0, 1.0, 900, 2000, ['dark', 'fire', 'water'], 'fire', false, 400, 400, false, 1, 3.0, {'dark': 3, 'fire': 3, 'water': 3}, []],
  ['flamethrower_tower', 'triple', 'flamethrower', 1, 900, 1500, 0, 400, 0.66, 700, 2000, ['dark', 'earth', 'fire'], 'fire', false, 150, 300, false, 6, 3.0, {'dark': 1, 'earth': 1, 'fire': 1}, ['flamethrower_tower_2']],
  ['flamethrower_tower_2', 'triple', 'flamethrower', 2, 3500, 5000, 0, 2000, 0.66, 700, 2500, ['dark', 'earth', 'fire'], 'fire', false, 150, 300, false, 2, 3.0, {'dark': 2, 'earth': 2, 'fire': 2}, ['flamethrower_tower_3']],
  ['flamethrower_tower_3', 'triple', 'flamethrower', 3, 5000, 10000, 0, 8000, 0.66, 700, 2500, ['dark', 'earth', 'fire'], 'fire', false, 150, 300, false, 1, 3.0, {'dark': 3, 'earth': 3, 'fire': 3}, []],
  ['flooding_tower', 'triple', 'flooding', 1, 900, 1500, 0, 0, 1.0, 900, 2000, ['water', 'nature', 'dark'], 'water', false, 0, 0, false, 6, 3.0, {'water': 1, 'nature': 1, 'dark': 1}, ['flooding_tower_2']],
  ['flooding_tower_2', 'triple', 'flooding', 2, 3500, 5000, 0, 0, 1.0, 900, 2000, ['water', 'nature', 'dark'], 'water', false, 0, 0, false, 2, 3.0, {'water': 2, 'nature': 2, 'dark': 2}, ['flooding_tower_3']],
  ['flooding_tower_3', 'triple', 'flooding', 3, 5000, 10000, 0, 0, 1.0, 900, 2000, ['water', 'nature', 'dark'], 'water', false, 0, 0, false, 1, 3.0, {'water': 3, 'nature': 3, 'dark': 3}, []],
  ['gold_tower', 'triple', 'gold', 1, 900, 1500, 0, 6000, 1.5, 1150, 2000, ['fire', 'earth', 'light'], 'earth', false, 0, 0, false, 6, 3.0, {'fire': 1, 'earth': 1, 'light': 1}, ['gold_tower_2']],
  ['gold_tower_2', 'triple', 'gold', 2, 3500, 5000, 0, 30000, 1.5, 1150, 2000, ['fire', 'earth', 'light'], 'earth', false, 0, 0, false, 2, 3.0, {'fire': 2, 'earth': 2, 'light': 2}, ['gold_tower_3']],
  ['gold_tower_3', 'triple', 'gold', 3, 5000, 10000, 0, 100000, 1.5, 1150, 2000, ['fire', 'earth', 'light'], 'earth', false, 0, 0, false, 1, 3.0, {'fire': 3, 'earth': 3, 'light': 3}, []],
  ['hail_tower', 'triple', 'hail', 1, 900, 1500, 0, 900, 0.66, 1500, 3000, ['dark', 'light', 'water'], 'light', false, 0, 0, false, 6, 3.0, {'dark': 1, 'light': 1, 'water': 1}, ['hail_tower_2']],
  ['hail_tower_2', 'triple', 'hail', 2, 3500, 5000, 0, 4500, 0.66, 1500, 3000, ['dark', 'light', 'water'], 'light', false, 0, 0, false, 2, 3.0, {'dark': 2, 'light': 2, 'water': 2}, ['hail_tower_3']],
  ['hail_tower_3', 'triple', 'hail', 3, 5000, 10000, 0, 13500, 0.66, 1750, 3000, ['dark', 'light', 'water'], 'light', false, 0, 0, false, 1, 3.0, {'dark': 3, 'light': 3, 'water': 3}, []],
  ['haste_tower', 'triple', 'haste', 1, 900, 1500, 0, 1600, 0.66, 900, 1000, ['earth', 'fire', 'water'], 'fire', false, 0, 0, false, 5, 3.0, {'earth': 1, 'fire': 1, 'water': 1}, ['haste_tower_2']],
  ['haste_tower_2', 'triple', 'haste', 2, 3500, 5000, 0, 8000, 0.66, 900, 2000, ['earth', 'fire', 'water'], 'fire', false, 0, 0, false, 2, 3.0, {'earth': 2, 'fire': 2, 'water': 2}, ['haste_tower_3']],
  ['haste_tower_3', 'triple', 'haste', 3, 5000, 10000, 0, 24000, 0.66, 900, 4000, ['earth', 'fire', 'water'], 'fire', false, 0, 0, false, 1, 3.0, {'earth': 3, 'fire': 3, 'water': 3}, []],
  ['impulse_tower', 'triple', 'impulse', 1, 900, 1500, 0, 0, 1.0, 1500, 3000, ['nature', 'fire', 'water'], 'nature', false, 0, 0, false, 6, 3.0, {'nature': 1, 'fire': 1, 'water': 1}, ['impulse_tower_2']],
  ['impulse_tower_2', 'triple', 'impulse', 2, 3500, 5000, 0, 0, 1.0, 1500, 3000, ['nature', 'fire', 'water'], 'nature', false, 0, 0, false, 2, 3.0, {'nature': 2, 'fire': 2, 'water': 2}, ['impulse_tower_3']],
  ['impulse_tower_3', 'triple', 'impulse', 3, 5000, 10000, 0, 0, 1.0, 1750, 3000, ['nature', 'fire', 'water'], 'nature', false, 0, 0, false, 1, 3.0, {'nature': 3, 'fire': 3, 'water': 3}, []],
  ['jinx_tower', 'triple', 'jinx', 1, 900, 1500, 0, 3500, 1.0, 900, 2000, ['dark', 'fire', 'nature'], 'dark', false, 0, 0, false, 8, 3.0, {'dark': 1, 'fire': 1, 'nature': 1}, ['jinx_tower_2']],
  ['jinx_tower_2', 'triple', 'jinx', 2, 3500, 5000, 0, 17500, 1.0, 900, 2000, ['dark', 'fire', 'nature'], 'dark', false, 0, 0, false, 4, 3.0, {'dark': 2, 'fire': 2, 'nature': 2}, ['jinx_tower_3']],
  ['jinx_tower_3', 'triple', 'jinx', 3, 5000, 10000, 0, 52500, 1.0, 900, 2000, ['dark', 'fire', 'nature'], 'dark', false, 0, 0, false, 1, 3.0, {'dark': 3, 'fire': 3, 'nature': 3}, []],
  ['laser_tower', 'triple', 'laser', 1, 900, 1500, 0, 6000, 1.0, 900, 2000, ['dark', 'earth', 'light'], 'light', false, 0, 0, false, 6, 3.0, {'dark': 1, 'earth': 1, 'light': 1}, ['laser_tower_2']],
  ['laser_tower_2', 'triple', 'laser', 2, 3500, 5000, 0, 30000, 1.0, 900, 2000, ['dark', 'earth', 'light'], 'light', false, 0, 0, false, 2, 3.0, {'dark': 2, 'earth': 2, 'light': 2}, ['laser_tower_3']],
  ['laser_tower_3', 'triple', 'laser', 3, 5000, 10000, 0, 90000, 1.0, 900, 2000, ['dark', 'earth', 'light'], 'light', false, 0, 0, false, 1, 3.0, {'dark': 3, 'earth': 3, 'light': 3}, []],
  ['muck_tower', 'triple', 'muck', 1, 900, 1500, 0, 1000, 1.0, 900, 2000, ['dark', 'earth', 'water'], 'earth', false, 150, 300, false, 8, 3.0, {'dark': 1, 'earth': 1, 'water': 1}, ['muck_tower_2']],
  ['muck_tower_2', 'triple', 'muck', 2, 3500, 5000, 0, 5000, 1.0, 900, 2000, ['dark', 'earth', 'water'], 'earth', false, 150, 300, false, 4, 3.0, {'dark': 2, 'earth': 2, 'water': 2}, ['muck_tower_3']],
  ['muck_tower_3', 'triple', 'muck', 3, 5000, 10000, 0, 15000, 1.0, 900, 2000, ['dark', 'earth', 'water'], 'earth', false, 150, 300, false, 1, 3.0, {'dark': 3, 'earth': 3, 'water': 3}, []],
  ['nova_tower', 'triple', 'nova', 1, 900, 1500, 0, 0, 1.5, 900, 0, ['fire', 'nature', 'light'], 'light', false, 0, 0, false, 8, 3.0, {'fire': 1, 'nature': 1, 'light': 1}, ['nova_tower_2']],
  ['nova_tower_2', 'triple', 'nova', 2, 3500, 5000, 0, 0, 1.5, 900, 0, ['fire', 'nature', 'light'], 'light', false, 0, 0, false, 4, 3.0, {'fire': 2, 'nature': 2, 'light': 2}, ['nova_tower_3']],
  ['nova_tower_3', 'triple', 'nova', 3, 5000, 10000, 0, 0, 1.5, 900, 0, ['fire', 'nature', 'light'], 'light', false, 0, 0, false, 1, 3.0, {'fire': 3, 'nature': 3, 'light': 3}, []],
  ['obliteration_tower', 'triple', 'obliteration', 1, 900, 1500, 0, 1800, 1.5, 1150, 0, ['dark', 'light', 'nature'], 'dark', false, 0, 0, false, 6, 3.0, {'dark': 1, 'light': 1, 'nature': 1}, ['obliteration_tower_2']],
  ['obliteration_tower_2', 'triple', 'obliteration', 2, 3500, 5000, 0, 9000, 1.5, 1150, 0, ['dark', 'light', 'nature'], 'dark', false, 0, 0, false, 2, 3.0, {'dark': 2, 'light': 2, 'nature': 2}, ['obliteration_tower_3']],
  ['obliteration_tower_3', 'triple', 'obliteration', 3, 5000, 10000, 0, 30000, 1.5, 1150, 0, ['dark', 'light', 'nature'], 'dark', false, 0, 0, false, 1, 3.0, {'dark': 3, 'light': 3, 'nature': 3}, []],
  ['polar_tower', 'triple', 'polar', 1, 900, 1500, 0, 1800, 1.0, 900, 2000, ['water', 'light', 'earth'], 'water', false, 100, 200, false, 8, 3.0, {'water': 1, 'light': 1, 'earth': 1}, ['polar_tower_2']],
  ['polar_tower_2', 'triple', 'polar', 2, 3500, 5000, 0, 9000, 1.0, 900, 2000, ['water', 'light', 'earth'], 'water', false, 100, 200, false, 4, 3.0, {'water': 2, 'light': 2, 'earth': 2}, ['polar_tower_3']],
  ['polar_tower_3', 'triple', 'polar', 3, 5000, 10000, 0, 27000, 1.0, 900, 2000, ['water', 'light', 'earth'], 'water', false, 100, 200, false, 1, 3.0, {'water': 3, 'light': 3, 'earth': 3}, []],
  ['quake_tower', 'triple', 'quake', 1, 900, 1500, 0, 1800, 0.66, 550, 2000, ['fire', 'earth', 'nature'], 'earth', false, 0, 0, false, 6, 3.0, {'fire': 1, 'earth': 1, 'nature': 1}, ['quake_tower_2']],
  ['quake_tower_2', 'triple', 'quake', 2, 3500, 5000, 0, 9000, 0.66, 550, 2000, ['fire', 'earth', 'nature'], 'earth', false, 0, 0, false, 2, 3.0, {'fire': 2, 'earth': 2, 'nature': 2}, ['quake_tower_3']],
  ['quake_tower_3', 'triple', 'quake', 3, 5000, 10000, 0, 27000, 0.66, 550, 2000, ['fire', 'earth', 'nature'], 'earth', false, 0, 0, false, 1, 3.0, {'fire': 3, 'earth': 3, 'nature': 3}, []],
  ['roots_tower', 'triple', 'roots', 1, 900, 1500, 0, 0, 1.0, 900, 2000, ['dark', 'earth', 'nature'], 'nature', false, 0, 0, false, 8, 3.0, {'dark': 1, 'earth': 1, 'nature': 1}, ['roots_tower_2']],
  ['roots_tower_2', 'triple', 'roots', 2, 3500, 5000, 0, 0, 1.0, 900, 2000, ['dark', 'earth', 'nature'], 'nature', false, 0, 0, false, 4, 3.0, {'dark': 2, 'earth': 2, 'nature': 2}, ['roots_tower_3']],
  ['roots_tower_3', 'triple', 'roots', 3, 5000, 10000, 0, 0, 1.0, 900, 2000, ['dark', 'earth', 'nature'], 'nature', false, 0, 0, false, 1, 3.0, {'dark': 3, 'earth': 3, 'nature': 3}, []],
  ['runic_tower', 'triple', 'runic', 1, 900, 1500, 0, 1500, 1.0, 1150, 2000, ['dark', 'fire', 'light'], 'dark', false, 100, 200, false, 6, 3.0, {'dark': 1, 'fire': 1, 'light': 1}, ['runic_tower_2']],
  ['runic_tower_2', 'triple', 'runic', 2, 3500, 5000, 0, 7500, 1.0, 1150, 2000, ['dark', 'fire', 'light'], 'dark', false, 100, 200, false, 2, 3.0, {'dark': 2, 'fire': 2, 'light': 2}, ['runic_tower_3']],
  ['runic_tower_3', 'triple', 'runic', 3, 5000, 10000, 0, 22500, 1.0, 1150, 2000, ['dark', 'fire', 'light'], 'dark', false, 100, 200, false, 1, 3.0, {'dark': 3, 'fire': 3, 'light': 3}, []],
  ['tidal_tower', 'triple', 'tidal', 1, 900, 1500, 0, 600, 0.66, 900, 3000, ['water', 'nature', 'light'], 'water', false, 200, 400, false, 6, 3.0, {'water': 1, 'nature': 1, 'light': 1}, ['tidal_tower_2']],
  ['tidal_tower_2', 'triple', 'tidal', 2, 3500, 5000, 0, 3000, 0.66, 900, 3000, ['water', 'nature', 'light'], 'water', false, 200, 400, false, 2, 3.0, {'water': 2, 'nature': 2, 'light': 2}, ['tidal_tower_3']],
  ['tidal_tower_3', 'triple', 'tidal', 3, 5000, 10000, 0, 9000, 0.66, 900, 3000, ['water', 'nature', 'light'], 'water', false, 300, 600, false, 1, 3.0, {'water': 3, 'nature': 3, 'light': 3}, []],
  ['windstorm_tower', 'triple', 'windstorm', 1, 900, 1500, 0, 0, 5.0, 1150, 900, ['fire', 'light', 'water'], 'water', false, 0, 0, false, 8, 3.0, {'fire': 1, 'light': 1, 'water': 1}, ['windstorm_tower_2']],
  ['windstorm_tower_2', 'triple', 'windstorm', 2, 3500, 5000, 0, 0, 5.0, 1150, 900, ['fire', 'light', 'water'], 'water', false, 0, 0, false, 4, 3.0, {'fire': 2, 'light': 2, 'water': 2}, ['windstorm_tower_3']],
  ['windstorm_tower_3', 'triple', 'windstorm', 3, 5000, 10000, 0, 0, 5.0, 1150, 900, ['fire', 'light', 'water'], 'water', false, 0, 0, false, 1, 3.0, {'fire': 3, 'light': 3, 'water': 3}, []],
];

// --- Names (ours) -------------------------------------------------------------

const ELEMENT_NAME: Readonly<Record<Element, string>> = {
  water: 'Water', fire: 'Fire', nature: 'Nature', earth: 'Earth', light: 'Light', dark: 'Dark',
};

/** Single-element lines, levels 1–3 and Pure. */
const LINE_NAME: Readonly<Record<Element, string>> = {
  water: 'Tidecaller', fire: 'Brazier', nature: 'Thornwood', earth: 'Menhir', light: 'Beacon', dark: 'Shade',
};

const FAMILY_NAME: Readonly<Record<string, string>> = {
  blacksmith: 'Anvil', disease: 'Blight', electricity: 'Storm Coil', flame: 'Pyre', gunpowder: 'Mortar', hydro: 'Mudburst',
  ice: 'Frost Lens', life: 'Grove Shrine', magic: 'Hex Eye', moss: 'Sporecap', poison: 'Venom Vat', quark: 'Prism',
  trickery: 'Mirror', vapor: 'Steam Vent', well: 'Fountain',
  enchantment: 'Glimmer', ephemeral: 'Mirage', erosion: 'Acid Font', flamethrower: 'Inferno', flooding: 'Deluge',
  gold: 'Coin Forge', hail: 'Sleet', haste: 'Rapids', impulse: 'Longshot', jinx: 'Curse Totem', laser: 'Searing Ray',
  muck: 'Bog', nova: 'Sunflare', obliteration: 'Annihilator', polar: 'Glacier', quake: 'Tremor', roots: 'Bramble',
  runic: 'Rune Stone', tidal: 'Wave Crest', windstorm: 'Cyclone', periodic: 'Sixfold Core',
};

const NUMERAL = ['', ' II', ' III'] as const;

export function elementName(e: Element): string {
  return ELEMENT_NAME[e];
}

function towerName(row: Row): string {
  const [, kind, family, level, , , , , , , , elements] = row;
  const el = elements[0];
  switch (kind) {
    case 'basic': return family === 'arrow' ? 'Arrow' : 'Cannon';
    case 'elementalBasic': return `${ELEMENT_NAME[el!]} ${family === 'arrow' ? 'Arrow' : 'Cannon'}`;
    case 'single': return `${LINE_NAME[el!]}${NUMERAL[level - 1]}`;
    case 'pure': return `Pure ${LINE_NAME[el!]}`;
    default: return `${FAMILY_NAME[family] ?? family}${NUMERAL[level - 1] ?? ''}`;
  }
}

// --- Abilities by family (npc_abilities_custom.txt; [L1, L2, L3] or [L1, L2, L3, Pure]) ---

/** The level's value of a per-level table; a one-entry table is constant. */
function at<T>(table: readonly T[], level: number): T {
  return table[Math.min(table.length, level) - 1]!;
}

const TARGET: Readonly<Record<string, TargetMode>> = {
  fire: 'highestHp', moss: 'highestHp', quark: 'highestHp', poison: 'highestHp',
  disease: 'lowestHp', hydro: 'lowestHp', life: 'lowestHp', gold: 'lowestHp',
  impulse: 'farthest', obliteration: 'farthest',
};
const KEEP_TARGET: ReadonlySet<string> = new Set(['fire', 'moss', 'quark']);

/** Families whose attack lands at launch (melee-type units or instant beams). */
const INSTANT: ReadonlySet<string> = new Set(['electricity', 'nova', 'roots', 'laser']);
/** Families with no attack of their own. */
const NO_ATTACK: ReadonlySet<string> = new Set(['vapor', 'windstorm']);

function hitFor(row: Row): EffectSpec {
  const [, , family, level, , , , , , , speed, , , , full, half, ground] = row;
  const radii = { full, half };
  const slow = at(SLOW_LEVELS, level);
  switch (family) {
    case 'arrow': return { kind: 'element.basic', mode: 'single' };
    case 'cannon': return { kind: 'element.basic', mode: ground ? 'ground' : 'splash', ...radii };
    case 'dark': return { kind: 'element.dark', radius: 500, speed: speed * 0.5 };
    case 'earth': return { kind: 'element.earth', ...radii, pct: 0.5, delay: 1 };
    case 'fire': return { kind: 'element.fire', ...radii, grow: 30 };
    case 'light': return { kind: 'element.light', bonus: at([5, 35, 250, 2500], level) };
    case 'nature': return { kind: 'element.nature', radius: 125, per: 0.15 };
    case 'water': return { kind: 'element.water', ...radii, range: 250, pct: 0.25, speed: speed / 3 };
    case 'periodic': return { kind: 'element.periodic', damage: 40000, count: 6, speed: 2000, range: 1150 };
    case 'blacksmith':
    case 'well':
    case 'trickery': return { kind: 'element.basic', mode: 'single' };
    case 'disease': return { kind: 'element.disease' };
    case 'electricity': return { kind: 'element.electricity', damage: at([240, 1200, 6000], level), grow: 1.2, radius: 300, shrink: 0.75, jumps: 7, every: 0.2 };
    case 'flame': return { kind: 'element.flame', burn: at([60, 300, 1500], level), radius: 200, duration: 5 };
    case 'gunpowder': return { kind: 'element.gunpowder', damage: at([50, 250, 1250], level), radius: 200, offset: 100 };
    case 'hydro': return { kind: 'element.hydro', damage: at([700, 3500, 17500], level), radius: 300 };
    case 'ice': return { kind: 'element.ice', ...radii, stun: at([0.15, 0.25, 0.4], level), lockout: 1.2 };
    case 'life': return { kind: 'element.life', points: at([3, 4, 12], level), perLife: 24, maxLives: 70, bonus: 0.5, bonusAt: 50 };
    case 'magic': return { kind: 'element.magic', ...radii, perStack: -25, max: 32, reset: 2 };
    case 'moss': return { kind: 'element.moss', ...radii };
    case 'poison': return { kind: 'element.poison', ...radii, perTick: at([40, 200, 1000], level), every: 0.5, duration: 10 };
    case 'quark': return { kind: 'element.quark', ...radii, factor: 1.15, max: 11 };
    case 'enchantment': return { kind: 'element.enchantment', ...radii };
    case 'ephemeral': return { kind: 'element.ephemeral', per: 0.1, maxStacks: at([6, 4, 2], level), reset: 2 };
    case 'erosion': return { kind: 'element.erosion', radius: 400, speed, ...acid(level) };
    case 'flamethrower': return { kind: 'element.flamethrower', ...radii, napalm: at([180, 900, 2700], level), radius: 350, duration: 5 };
    case 'flooding': return { kind: 'element.flooding', damage: at([220, 1100, 3600], level), radius: 400, hits: 5 };
    case 'gold': return { kind: 'element.gold', pct: 35 };
    case 'hail': return { kind: 'element.hail', chance: at([0.15, 0.2, 0.25], level), multiplier: 5, every: at([14, 13, 12], level), radius: 1750 + HULL };
    case 'haste': return { kind: 'element.haste', step: 0.03, max: 16, reset: 4 };
    case 'impulse': return { kind: 'element.impulse', multiplier: at([3300, 16500, 50000], level) };
    case 'jinx': return { kind: 'element.jinx', pct: at([6, 15, 45], level), radius: 300, every: 2.5, ticks: 3 };
    case 'laser': return { kind: 'element.laser', radius: 100, per: 0.1, cap: 0.5 };
    case 'muck': return { kind: 'element.muck', ...radii, slow, radius: 300, duration: 5 };
    case 'nova': return { kind: 'element.nova', damage: at([300, 1500, 6000], level), radius: 900 + HULL, slowRadius: 900, slow, duration: 3 };
    case 'obliteration': return { kind: 'element.obliteration', base: 200, per: 200 / 1150 };
    case 'polar': return { kind: 'element.polar', ...radii };
    case 'quake': return { kind: 'element.quake', damage: at([1800, 9000, 27000], level), pct: at([1, 2.5, 4], level), radius: 550, every: 5 };
    case 'roots': return { kind: 'element.roots', dps: at([100, 500, 2500], level), slow, radius: 150, first: 92.5, step: 185, count: 6, duration: 5 };
    case 'runic': return { kind: 'element.runic', ...radii };
    case 'tidal': return { kind: 'element.tidal', ...radii, bonus: at([45, 225, 675], level), shrinkHalf: 10, shrinkFull: 5, max: 30, reset: 2 };
    default: throw new Error(`Element tower family ${family} has no hit`);
  }
}

function acid(level: number): Omit<AcidShot, 'kind'> {
  return { amp: at([15, 36, 120], level), dot: at([100, 500, 1500], level), duration: 7.5, every: 1 };
}

function abilityFor(row: Row): TowerAbility | undefined {
  const [, , family, level, , , , , cooldown] = row;
  switch (family) {
    case 'blacksmith': return { kind: 'fireUp', value: at([0.15, 0.3, 1], level), duration: 60, cooldown: 15, range: 900 };
    case 'well': return { kind: 'springForward', value: at([0.15, 0.3, 1], level), duration: 60, cooldown: 15, range: 900 };
    case 'trickery': return { kind: 'conjure', duration: at([10, 20, 75], level), cooldown: 15, range: 900, lock: 60, spot: 2000, anyTower: level >= 3 };
    case 'enchantment': return {
      kind: 'faerieFire', base: at([10, 23, 80], level), max: at([18, 42, 140], level), crowd: 150, crowdMax: 3,
      duration: 10, cooldown: 0.5, range: 900,
    };
    case 'polar': return { kind: 'frostbite', pct: at([12, 27, 60], level), duration: 10, cooldown: 0.5, range: 900 };
    case 'runic': return { kind: 'magicAttack', duration: 3, cooldown: 9, radius: 150, pct: 0.5 };
    case 'vapor': return { kind: 'pulse', base: at([60, 300, 1500], level), perCreep: at([30, 150, 750], level), radius: 550 + HULL, cooldown };
    case 'windstorm': return {
      kind: 'tornado', damage: at([600, 3000, 9000], level), radius: 450, duration: 5, speed: 200,
      slow: at(SLOW_LEVELS, level), range: 1150 + HULL, cooldown,
    };
    default: return undefined;
  }
}

function buildSpec(row: Row): ElementTowerSpec {
  const [
    , kind, family, level, cost, totalCost, essence, damage, cooldown, range, speed, elements, damageElement, support,
    full, half, , buffPriority, buildTime, requires, upgrades,
  ] = row;
  const ability = abilityFor(row);
  const info: ElementTowerInfo = {
    kind, family, level, elements, damage: damageElement, totalCost, essence, requires, upgrades, buildTime, support, buffPriority,
    target: TARGET[family] ?? 'closest', keepTarget: KEEP_TARGET.has(family), range, baseDamage: damage, cooldown,
    projectileSpeed: speed, splash: full > 0 ? { full, half } : null,
    ...(ability ? { ability } : {}),
  };
  const spec: ElementTowerSpec = { name: towerName(row), cost, footprint: 2, element: info };
  if (NO_ATTACK.has(family)) return spec;
  const attack: AttackSpec = {
    damage: [damage, damage], cooldown, range: range + HULL, attackType: damageElement, targets: 'ground',
    projectileSpeed: INSTANT.has(family) ? 0 : family === 'obliteration' ? 900 : speed,
    direct: false, effects: [hitFor(row)],
  };
  return { ...spec, attack };
}

/** Every tower a player can stand on the Map, by spec id (the port's unit name). */
export const ELEMENT_TOWERS: Readonly<Record<string, ElementTowerSpec>> = Object.fromEntries(ROWS.map((r) => [r[0], buildSpec(r)]));

/** Spec ids in the port's table order. */
export const TOWER_IDS: readonly string[] = ROWS.map((r) => r[0]);

/** What the builder can put down from nothing; everything else is an upgrade. */
export const BUILDABLE: readonly string[] = [
  'basic_arrow_tower', 'basic_cannon_tower', ...ELEMENTS.map((e) => `${e}_tower`), 'periodic_tower',
];

// --- Secondary shots ----------------------------------------------------------
// Projectiles a tower fires besides its attack. They resolve through the core's
// projectile pass, which looks their spec up like a tower's, so they live in the
// Game Mode's tower table without an `element` block (never buildable).

function shot(name: string, attackType: DamageElement, effect: ShotHit | AcidShot): TowerSpec {
  return { name, attack: { damage: [0, 0], cooldown: 1, range: 0, attackType, targets: 'ground', projectileSpeed: 0, direct: false, effects: [effect] } };
}

/** Periodic shot element order (PeriodicTower.lua): the starting element moves on by one each attack. */
export const PERIODIC_CYCLE: readonly Element[] = ['light', 'dark', 'water', 'fire', 'nature', 'earth'];

function periodicShot(e: Element): ShotHit {
  if (e === 'water') return { kind: 'element.shot', mode: 'area', radius: 100 };
  if (e === 'fire' || e === 'earth') return { kind: 'element.shot', mode: 'splash', full: 100, half: 200 };
  return { kind: 'element.shot', mode: 'single' };
}

export const SHOT = {
  overkill: 'shot:overkill',
  bounce: 'shot:bounce',
  hail: 'shot:hail',
  runic: 'shot:runic',
  periodic: (e: Element) => `shot:periodic-${e}`,
  acid: (level: number) => `shot:acid-${level}`,
} as const;

export const ELEMENT_SHOTS: Readonly<Record<string, TowerSpec>> = {
  [SHOT.overkill]: shot('Overkill bolt', 'dark', { kind: 'element.shot', mode: 'pure' }),
  [SHOT.bounce]: shot('Water bounce', 'water', { kind: 'element.shot', mode: 'splash', full: 100, half: 200 }),
  [SHOT.hail]: shot('Hailstone', 'light', { kind: 'element.shot', mode: 'single' }),
  [SHOT.runic]: shot('Rune bolt', 'dark', { kind: 'element.shot', mode: 'splash', full: 100, half: 200 }),
  ...Object.fromEntries(PERIODIC_CYCLE.map((e) => [SHOT.periodic(e), shot(`${ELEMENT_NAME[e]} shard`, e, periodicShot(e))])),
  ...Object.fromEntries([1, 2, 3].map((l) => [SHOT.acid(l), shot('Acid glob', 'fire', { kind: 'element.acid', ...acid(l) })])),
};
