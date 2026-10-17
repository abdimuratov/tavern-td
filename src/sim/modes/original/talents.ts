import { FAMILIES, TALENTS, type ArmorType, type DamageType, type Family } from '../../../content/original';
import type { GameState } from '../../core/state';
import { orState } from './state';

// Talents are Run settings: the ids held when the Run started. The rules read
// them as numbers per family, folded once from the list and cached by the
// list's identity (a restored save folds them again on first use).

/** What a family's Talents add up to. Zero, false or null where it holds none. */
export interface FamilyTalents {
  damage: number;
  range: number;
  attackSpeed: number;
  /** Share off its towers' and upgrades' prices. */
  cost: number;
  splashRadius: number;
  flyingDamage: number;
  crit: { chance: number; multiplier: number } | null;
  shrapnel: { armor: number; duration: number } | null;
  sellShare: number | null;
  concussion: { chance: number; duration: number } | null;
  slowDuration: number;
  slowStrength: number;
  brittle: number;
  killGold: number;
  shatter: { share: number; radius: number } | null;
  echo: number;
  leyline: { per: number; radius: number; max: number } | null;
  poisonDamage: number;
  poisonDuration: number;
  contagion: number | null;
  corrode: number;
  antivenom: boolean;
  poisonSlow: number;
  hitsAir: boolean;
  auraRadius: number;
  auraAttackSpeed: number;
  auraXp: number;
  hex: number;
  auraRange: number;
  startLevel: number;
}

export interface RunTalents {
  readonly families: Readonly<Record<Family, Readonly<FamilyTalents>>>;
  /** Damage type × armor type shares that Talents replace (Bodkin Points, Spellbreaker). */
  readonly armorTypes: readonly { readonly damage: DamageType; readonly armor: ArmorType; readonly value: number }[];
}

function none(): FamilyTalents {
  return {
    damage: 0, range: 0, attackSpeed: 0, cost: 0, splashRadius: 0, flyingDamage: 0, crit: null, shrapnel: null, sellShare: null,
    concussion: null, slowDuration: 0, slowStrength: 0, brittle: 0, killGold: 0, shatter: null, echo: 0, leyline: null,
    poisonDamage: 0, poisonDuration: 0, contagion: null, corrode: 0, antivenom: false, poisonSlow: 0, hitsAir: false,
    auraRadius: 0, auraAttackSpeed: 0, auraXp: 0, hex: 0, auraRange: 0, startLevel: 1,
  };
}

/** Folds a list of Talent ids into numbers. Unknown ids are ignored (setup refuses them first). */
export function foldTalents(ids: readonly string[]): RunTalents {
  const families = Object.fromEntries(FAMILIES.map((f) => [f, none()])) as Record<Family, FamilyTalents>;
  const armorTypes: { damage: DamageType; armor: ArmorType; value: number }[] = [];
  for (const id of ids) {
    if (!Object.hasOwn(TALENTS, id)) continue;
    const talent = TALENTS[id]!;
    const f = families[talent.family];
    const e = talent.effect;
    switch (e.kind) {
      case 'damage': f.damage += e.value; break;
      case 'range': f.range += e.value; break;
      case 'attackSpeed': f.attackSpeed += e.value; break;
      case 'cost': f.cost += e.value; break;
      case 'splashRadius': f.splashRadius += e.value; break;
      case 'armorType': armorTypes.push({ damage: e.damage, armor: e.armor, value: e.value }); break;
      case 'flyingDamage': f.flyingDamage += e.value; break;
      case 'crit': f.crit = { chance: e.chance, multiplier: e.multiplier }; break;
      case 'shrapnel': f.shrapnel = { armor: e.armor, duration: e.duration }; break;
      case 'sellShare': f.sellShare = e.value; break;
      case 'concussion': f.concussion = { chance: e.chance, duration: e.duration }; break;
      case 'slowDuration': f.slowDuration += e.value; break;
      case 'slowStrength': f.slowStrength += e.value; break;
      case 'brittle': f.brittle += e.value; break;
      case 'killGold': f.killGold += e.value; break;
      case 'shatter': f.shatter = { share: e.share, radius: e.radius }; break;
      case 'echo': f.echo += e.chance; break;
      case 'leyline': f.leyline = { per: e.per, radius: e.radius, max: e.max }; break;
      case 'poisonDamage': f.poisonDamage += e.value; break;
      case 'poisonDuration': f.poisonDuration += e.value; break;
      case 'contagion': f.contagion = e.radius; break;
      case 'corrode': f.corrode += e.armor; break;
      case 'antivenom': f.antivenom = true; break;
      case 'poisonSlow': f.poisonSlow += e.value; break;
      case 'hitsAir': f.hitsAir = true; break;
      case 'auraRadius': f.auraRadius += e.value; break;
      case 'auraAttackSpeed': f.auraAttackSpeed += e.value; break;
      case 'auraXp': f.auraXp += e.value; break;
      case 'hex': f.hex += e.value; break;
      case 'auraRange': f.auraRange += e.value; break;
      case 'startLevel': f.startLevel = Math.max(f.startLevel, e.level); break;
    }
  }
  return { families, armorTypes };
}

const cache = new WeakMap<readonly string[], RunTalents>();

/** The Run's Talents as numbers. */
export function runTalents(state: GameState): RunTalents {
  const ids = orState(state).talents;
  let folded = cache.get(ids);
  if (!folded) {
    folded = foldTalents(ids);
    cache.set(ids, folded);
  }
  return folded;
}

/** One family's Talents in this Run. */
export function familyTalents(state: GameState, family: Family): Readonly<FamilyTalents> {
  return runTalents(state).families[family];
}
