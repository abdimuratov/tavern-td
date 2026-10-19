import {
  ELEMENTS, ELEMENT_TOWERS, elementName,
  type DamageElement, type DarkHit, type EarthHit, type Element, type ElectricityHit, type EphemeralHit, type ErosionHit,
  type ElementTowerSpec, type FlameHit, type FlamethrowerHit, type FloodingHit, type GoldHit, type GunpowderHit, type HailHit,
  type HasteHit, type HydroHit, type IceHit, type ImpulseHit, type JinxHit, type LaserHit, type LifeHit, type LightHit,
  type MagicHit, type MuckHit, type NatureHit, type NovaHit, type PeriodicHit, type PoisonHit, type QuakeHit, type QuarkHit,
  type RootsHit, type TargetMode, type TidalHit, type Trait, type WaterHit,
} from '../../../content/element';
import type { EffectSpec } from '../../../sim';
import { num } from '../../format';

// Player-facing words for Element, written from the specs so the numbers can't
// drift from the rules. Short and plain: they fit a phone HUD.

export function specOf(id: string): ElementTowerSpec | undefined {
  return Object.hasOwn(ELEMENT_TOWERS, id) ? ELEMENT_TOWERS[id] : undefined;
}

export function towerName(id: string): string {
  return specOf(id)?.name ?? id;
}

export function damageName(e: DamageElement): string {
  return e === 'composite' ? 'Composite' : elementName(e);
}

export const TRAIT_NAME: Readonly<Record<Trait, string>> = {
  fast: 'Fast', heal: 'Heal', mechanical: 'Mechanical', undead: 'Undead', regen: 'Regen', bulky: 'Bulky',
  vengeance: 'Vengeance', time_lapse: 'Time lapse',
};

export const TRAIT_ABOUT: Readonly<Record<Trait, string>> = {
  fast: 'dashes ahead for a second every few seconds',
  heal: 'heals the creeps around it when it dies',
  mechanical: 'now and then shrugs off slows and can\'t be hit for 2 s',
  undead: 'gets up once, 3 s after its first death, at half HP',
  regen: 'heals itself while hurt',
  bulky: 'half as many, with twice the HP; a Leak costs 2 lives',
  vengeance: 'its death weakens the towers near its killer',
  time_lapse: 'once, when nearly dead, jumps back 5 s in time and HP',
};

/** Attacks per second, as a player compares towers. */
export function rate(cooldown: number): string {
  return `${num(Math.round((1 / cooldown) * 100) / 100)}/s`;
}

/** m:ss, rounding up so a countdown reaches 0:00 as it ends. */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "200%", "12.5%". */
export function pct(fraction: number): string {
  return `${num(Math.round(fraction * 1000) / 10)}%`;
}

/** What kind of tower it is, in a word; its level shows as pips beside it. */
export function kindWord(spec: ElementTowerSpec): string {
  switch (spec.element.kind) {
    case 'basic': return 'Basic';
    case 'elementalBasic': return 'Elemental';
    case 'single': return 'Single';
    case 'pure': return 'Pure';
    case 'dual': return 'Dual';
    case 'triple': return 'Triple';
    case 'periodic': return 'Every Element';
  }
}

/** What the tower is, in a few words: "Dual, level 1 of 3". */
export function kindText(spec: ElementTowerSpec): string {
  const info = spec.element;
  const word = kindWord(spec);
  return info.kind === 'single' || info.kind === 'dual' || info.kind === 'triple' ? `${word}, level ${info.level} of 3` : word;
}

const TARGET_TEXT: Partial<Readonly<Record<TargetMode, string>>> = {
  highestHp: 'Aims at the creep with the most HP',
  lowestHp: 'Aims at the weakest creep',
  farthest: 'Aims at the farthest creep',
};

function hit<T>(spec: ElementTowerSpec): T {
  return spec.attack?.effects?.[0] as EffectSpec as T;
}

/** What a tower does besides hitting its target, one short sentence each. */
export function abilityLines(spec: ElementTowerSpec): string[] {
  const info = spec.element;
  const a = info.ability;
  const out: string[] = [];
  switch (info.family) {
    case 'cannon': out.push('Shells land where the target stood'); break;
    case 'dark': out.push(`Overkill damage flies on to a creep within ${num(hit<DarkHit>(spec).radius)}`); break;
    case 'earth': {
      const h = hit<EarthHit>(spec);
      out.push(`An aftershock hits the spot again ${num(h.delay)} s later for ${pct(h.pct)}`);
      break;
    }
    case 'fire': out.push('Its splash widens with every hit on the same creep'); break;
    case 'light': out.push(`+${num(hit<LightHit>(spec).bonus)} damage for each hit in a row on one creep`); break;
    case 'nature': {
      const h = hit<NatureHit>(spec);
      out.push(`+${pct(h.per)} damage for each creep within ${num(h.radius)} of the target`);
      break;
    }
    case 'water': out.push(`Bounces to a nearby creep for ${pct(hit<WaterHit>(spec).pct)}`); break;
    case 'periodic': {
      const h = hit<PeriodicHit>(spec);
      out.push(`Fires ${h.count} shots of ${num(h.damage)}, one of each Element`);
      break;
    }
    case 'disease': out.push('Hits harder the more HP the target has lost'); break;
    case 'electricity': {
      const h = hit<ElectricityHit>(spec);
      out.push(`Lightning for ${num(h.damage)} that jumps ${h.jumps} times, ×${num(h.grow)} each jump`);
      break;
    }
    case 'flame': {
      const h = hit<FlameHit>(spec);
      out.push(`Burns everything within ${num(h.radius)} of the target for ${num(h.burn)}/s for ${num(h.duration)} s`);
      break;
    }
    case 'gunpowder': {
      const h = hit<GunpowderHit>(spec);
      out.push(`Shells burst five times for ${num(h.damage)} within ${num(h.radius)}`);
      break;
    }
    case 'hydro': {
      const h = hit<HydroHit>(spec);
      out.push(`Its kills explode for ${num(h.damage)} within ${num(h.radius)}`);
      break;
    }
    case 'ice': out.push(`Stuns the target for ${num(hit<IceHit>(spec).stun)} s`); break;
    case 'life': {
      const h = hit<LifeHit>(spec);
      out.push(`Kills win back lives, up to ${h.maxLives}`);
      out.push(`+${pct(h.bonus)} damage at ${h.bonusAt} lives or fewer`);
      break;
    }
    case 'magic': {
      const h = hit<MagicHit>(spec);
      out.push(`Range shrinks by ${num(-h.perStack)} with each shot while it keeps firing`);
      break;
    }
    case 'moss': out.push('Hits harder on creeps that still have most of their HP'); break;
    case 'poison': {
      const h = hit<PoisonHit>(spec);
      out.push(`Poisons creeps within ${num(h.full)} for ${num(h.perTick / h.every)}/s for ${num(h.duration)} s, stacking`);
      break;
    }
    case 'quark': {
      const h = hit<QuarkHit>(spec);
      out.push(`×${num(h.factor)} damage for each hit on the same target, up to ${h.max}`);
      break;
    }
    case 'ephemeral': {
      const h = hit<EphemeralHit>(spec);
      out.push(`Loses ${pct(h.per)} damage each second it fires, down to −${pct(h.per * h.maxStacks)}, then resets`);
      break;
    }
    case 'erosion': {
      const h = hit<ErosionHit>(spec);
      out.push(`Acid on creeps within ${num(h.radius)}: +${num(h.amp)}% damage taken and ${num(h.dot)}/s for ${num(h.duration)} s`);
      break;
    }
    case 'flamethrower': {
      const h = hit<FlamethrowerHit>(spec);
      out.push(`Napalm builds up on creeps, then bursts for all of it within ${num(h.radius)}`);
      break;
    }
    case 'flooding': {
      const h = hit<FloodingHit>(spec);
      out.push(`Floods the spot: ${num(h.damage)} within ${num(h.radius)}, ${h.hits} times a second apart`);
      break;
    }
    case 'gold': out.push(`Its kills pay ${num(hit<GoldHit>(spec).pct)}% more gold`); break;
    case 'hail': {
      const h = hit<HailHit>(spec);
      out.push(`${pct(h.chance)} chance to hit ×${num(h.multiplier)}`);
      out.push(`Every ${h.every} attacks, hail on every creep in range`);
      break;
    }
    case 'haste': out.push(`Attacks faster with each shot, up to ${hit<HasteHit>(spec).max} times`); break;
    case 'impulse': out.push(`The farther the target, the harder it hits: ${num(hit<ImpulseHit>(spec).multiplier)} per 1,000`); break;
    case 'jinx': {
      const h = hit<JinxHit>(spec);
      out.push(`Curses creeps within ${num(h.radius)}: every ${num(h.every)} s they lose ${num(h.pct)}% of the HP lost since`);
      break;
    }
    case 'laser': {
      const h = hit<LaserHit>(spec);
      out.push(`Hits at once, ${pct(h.per)} less for each creep near the target`);
      break;
    }
    case 'muck': {
      const h = hit<MuckHit>(spec);
      out.push(`Slows creeps within ${num(h.radius)} by ${pct(h.slow)} for ${num(h.duration)} s`);
      break;
    }
    case 'nova': {
      const h = hit<NovaHit>(spec);
      out.push(`Hits every creep in range for ${num(h.damage)} and slows them ${pct(h.slow)}`);
      break;
    }
    case 'obliteration': out.push('The farther the target, the wider its blast'); break;
    case 'quake': {
      const h = hit<QuakeHit>(spec);
      out.push(`Every ${h.every}th shot shakes creeps within ${num(h.radius)} for ${num(h.damage)} + ${num(h.pct)}% of their HP`);
      break;
    }
    case 'roots': {
      const h = hit<RootsHit>(spec);
      out.push(`A line of roots slows ${pct(h.slow)} and hurts ${num(h.dps)}/s for ${num(h.duration)} s`);
      break;
    }
    case 'tidal': out.push(`Each hit in a row narrows its splash and adds ${num(hit<TidalHit>(spec).bonus)} damage`); break;
    default: break;
  }
  switch (a?.kind) {
    case 'fireUp': out.push(`Every ${num(a.cooldown)} s, +${pct(a.value)} damage to a tower within ${num(a.range)} for ${num(a.duration)} s`); break;
    case 'springForward': out.push(`Every ${num(a.cooldown)} s, +${pct(a.value)} attack speed to a tower within ${num(a.range)} for ${num(a.duration)} s`); break;
    case 'conjure': out.push(`Every ${num(a.cooldown)} s, copies ${a.anyTower ? 'a' : 'an attacking'} tower within ${num(a.range)} for ${num(a.duration)} s`); break;
    case 'faerieFire': out.push(`Marks the strongest creep: +${num(a.base)}% damage taken, +${num(a.max)}% when few are near`); break;
    case 'frostbite': out.push(`Takes ${num(a.pct)}% of the strongest creep's HP; it returns after ${num(a.duration)} s if it lives`); break;
    case 'magicAttack': out.push(`Every ${num(a.cooldown)} s, for ${num(a.duration)} s its shots also hit creeps near the target`); break;
    case 'pulse': out.push(`Pulses every ${num(a.cooldown)} s: ${num(a.base)} + ${num(a.perCreep)} per creep to all within ${num(a.radius)}`); break;
    case 'tornado': out.push(`Every ${num(a.cooldown)} s a tornado chases a creep: ${num(a.damage)}/s within ${num(a.radius)} and a ${pct(a.slow)} slow`); break;
    default: break;
  }
  const aim = TARGET_TEXT[info.target];
  if (aim) out.push(aim);
  return out;
}

/** The Element a branch upgrade adds to the tower (an Arrow's included), or null for a level up the same line. */
export function addedElement(from: ElementTowerSpec, to: ElementTowerSpec): Element | null {
  return ELEMENTS.find((e) => to.element.elements.includes(e) && !from.element.elements.includes(e)) ?? null;
}

/** "needs Water 2 and Earth 2" as [element, level] pairs, for compact chips. */
export function needsOf(spec: ElementTowerSpec, levels: Readonly<Record<Element, number>>): [Element, number][] {
  const out: [Element, number][] = [];
  for (const e of ELEMENTS) {
    const need = spec.element.requires[e] ?? 0;
    if (levels[e] < need) out.push([e, need]);
  }
  if (spec.element.kind === 'periodic') for (const e of ELEMENTS) if (levels[e] < 1) out.push([e, 1]);
  return out;
}
