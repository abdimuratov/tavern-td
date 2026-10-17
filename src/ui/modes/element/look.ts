import {
  PERIODIC_CYCLE,
  type DamageElement, type Element, type ElementCreepSpec, type ElementTowerSpec, type Trait,
} from '../../../content/element';
import type { ShootVariant } from '../../../platform/audio';
import type { BoardExtra, CreepLook, CreepStatusLook, EffectCue, ModeLook, Shape, TowerLook } from '../../../render/look';
import { CELL, element, findCreep, type Creep, type GameState, type SimEvent, type TowerSpec } from '../../../sim';

// Element's look. A tower's colour is the Element its damage counts as; a ring
// around it shows every Element it is made of, one segment each, so a dual reads
// as two colours and a triple as three. Its shape says what kind it is and pips
// its level; Pure towers and the Sixfold Core glow on a gold plate. Creeps take
// their Element's colour (Composite is pale) with a dark Trait mark inside.

export const ELEMENT_COLOR: Readonly<Record<DamageElement, number>> = {
  water: 0x3d9bff,
  fire: 0xff5a2a,
  nature: 0x48cc4a,
  earth: 0xc08a52,
  light: 0xffd23f,
  dark: 0xa463ff,
  composite: 0xd9d1c3,
};

/** A one-letter sign per Element, for players who can't tell the colours apart. */
export const ELEMENT_LETTER: Readonly<Record<Element, string>> = {
  water: 'W', fire: 'F', nature: 'N', earth: 'E', light: 'L', dark: 'D',
};

const NEUTRAL = 0xd9d1c3;
const GOLD_PLATE = 0x7a5a22;

const SOUND: Readonly<Record<DamageElement, ShootVariant>> = {
  water: 'frost', fire: 'cannon', nature: 'poison', earth: 'cannon', light: 'arcane', dark: 'arcane', composite: 'arrow',
};

/** A Trait's mark inside the creep. Bulky has none: its bigger, eight-sided body says it. */
export const TRAIT_MARK: Readonly<Record<Trait, Shape | null>> = {
  fast: 'chevron', heal: 'cross', mechanical: 'square', undead: 'diamond', regen: 'circle', vengeance: 'triangle',
  time_lapse: 'star', bulky: null,
};

const KIND_SHAPE: Readonly<Record<string, Shape>> = {
  single: 'hexagon', dual: 'diamond', triple: 'pentagon', pure: 'star', periodic: 'burst',
};

/** Projectiles that aren't a tower's own attack (shot:* specs): a small bolt in their Element's colour. */
function shotLook(spec: TowerSpec): TowerLook {
  const color = ELEMENT_COLOR[(spec.attack?.attackType ?? 'composite') as DamageElement] ?? NEUTRAL;
  return { shape: 'circle', color, size: 0.3, plate: false, shot: color, sound: 'arcane' };
}

function towerLook(spec: TowerSpec): TowerLook {
  const info = (spec as Partial<ElementTowerSpec>).element;
  if (!info) return shotLook(spec);
  const color = ELEMENT_COLOR[info.damage];
  const splash = info.splash ? { splash: info.splash.half } : {};
  const sound = info.family === 'cannon' || info.family === 'gunpowder' ? 'cannon' : SOUND[info.damage];
  const shape: Shape = info.family === 'arrow' ? 'triangle' : info.family === 'cannon' ? 'square' : KIND_SHAPE[info.kind] ?? 'circle';
  switch (info.kind) {
    case 'basic':
      return { shape, color: NEUTRAL, size: 0.5, plate: true, shot: 0xfff2d0, sound, ...splash };
    case 'elementalBasic':
      return { shape, color, size: 0.54, plate: true, shot: color, sound, ...splash };
    case 'pure':
      return { shape, color, size: 0.6, plate: true, plateColor: GOLD_PLATE, halo: color, ring: [color], shot: color, sound, ...splash };
    case 'periodic':
      return {
        shape, color: 0xfff6e0, size: 0.6, plate: true, plateColor: GOLD_PLATE, halo: 0xfff2c8,
        ring: PERIODIC_CYCLE.map((e) => ELEMENT_COLOR[e]), shot: 0xffffff, sound: 'arcane', ...splash,
      };
    default:
      // Singles, duals and triples grow a little with each level, and show it in pips.
      return {
        shape, color, size: 0.4 + 0.04 * info.level, plate: true, ring: info.elements.map((e) => ELEMENT_COLOR[e]),
        pips: info.level, shot: color, sound, ...splash,
      };
  }
}

const BOSS_COLOR = 0xf0e4cc;

function creepLook(spec: ElementCreepSpec): CreepLook {
  const color = ELEMENT_COLOR[spec.armorType] ?? NEUTRAL;
  if (spec.elemental) return { shape: 'star', color, size: 1 };
  const mark = spec.trait ? TRAIT_MARK[spec.trait] : null;
  const bulky = spec.trait === 'bulky';
  if (spec.boss) return { shape: 'octagon', color: BOSS_COLOR, size: bulky ? 1.25 : 1.05, ...(mark ? { mark } : {}) };
  return { shape: bulky ? 'octagon' : 'circle', color, size: bulky ? 0.92 : 0.66, ...(mark ? { mark } : {}) };
}

const FALLEN: CreepStatusLook = { tint: 0x5a5248, alpha: 0.6, scale: 0.78 };
const SHIELDED: CreepStatusLook = { tint: 0xf4f8ff, alpha: 1, scale: 1.12 };
const STUNNED: CreepStatusLook = { tint: 0xffe27a, alpha: 1, scale: 1 };
const HASTED: CreepStatusLook = { tint: 0xffb36b, alpha: 1, scale: 1 };
const SLOWED: CreepStatusLook = { tint: 0x8fd0ff, alpha: 1, scale: 1 };

/** Lying dead outranks everything, then a mechanical shield, a stun, a dash and a slow. */
function creepStatus(c: Creep): CreepStatusLook | null {
  let best: CreepStatusLook | null = null;
  let rank = 0;
  for (const s of c.status) {
    if (s.kind === element.STATUS.dead) return FALLEN;
    const r = s.kind === element.STATUS.shield ? 4 : s.kind === element.STATUS.stun ? 3 : s.kind === element.STATUS.haste ? 2 : s.kind === element.STATUS.slow ? 1 : 0;
    if (r > rank) {
      rank = r;
      best = r === 4 ? SHIELDED : r === 3 ? STUNNED : r === 2 ? HASTED : SLOWED;
    }
  }
  return best;
}

const NONE: readonly BoardExtra[] = [];

/** Windstorm's tornadoes: the reach they hit within, faint, and a spinning whirl on the creep they chase. */
function extras(state: GameState): readonly BoardExtra[] {
  const tornadoes = (state.mode as Partial<element.ElementState> | null)?.tornadoes;
  if (!tornadoes || tornadoes.length === 0) return NONE;
  const out: BoardExtra[] = [];
  for (const t of tornadoes) {
    out.push({ x: t.x, y: t.y, size: t.radius * 2, glyph: 'glow', color: 0xbfe6ff, alpha: 0.14 });
    out.push({ x: t.x, y: t.y, size: CELL * 1.7, glyph: 'swirl', color: 0xe4f6ff, alpha: 0.9, spin: -1.6 });
  }
  return out;
}

type ModeEvent = Extract<SimEvent, { type: 'mode' }>;
type At = { x?: number; y?: number; radius?: number; creep?: number; element?: string };

function ring(d: At, color: number, size: number, ms = 360): EffectCue[] {
  return d.x === undefined || d.y === undefined ? [] : [{ kind: 'ring', x: d.x, y: d.y, color, size, ms, alpha: 0.8 }];
}

/** Rings for the area abilities, a grey flash where an undead creep falls, and a mark where things rise, rewind or arrive. */
function effects(e: ModeEvent, state: GameState): readonly EffectCue[] | null {
  const d = (e.data ?? {}) as At;
  switch (e.name) {
    case 'element.pulse':
    case 'element.flood': return ring(d, ELEMENT_COLOR.water, d.radius ?? CELL * 4);
    case 'element.nova': return ring(d, ELEMENT_COLOR.light, d.radius ?? CELL * 4);
    case 'element.quake': return ring(d, ELEMENT_COLOR.earth, d.radius ?? CELL * 4);
    case 'element.obliterate': return ring(d, ELEMENT_COLOR.dark, d.radius ?? CELL * 3);
    case 'element.napalm': return ring(d, ELEMENT_COLOR.fire, 350);
    case 'element.heal': return ring(d, 0x7cf2a0, 300, 420);
    case 'element.vengeance': return ring(d, 0xff5a4a, 250, 420);
    case 'element.timeLapse': return ring(d, 0x8fe6ff, CELL, 500);
    case 'element.rose': return ring(d, 0xcfc2a8, CELL * 0.9, 420);
    case 'element.tornado': return ring(d, 0xbfe6ff, CELL, 300);
    case 'element.fell':
      return d.x === undefined || d.y === undefined ? null : [{ kind: 'flash', x: d.x, y: d.y, color: 0x8a8070, size: CELL * 1.2, ms: 260 }];
    case 'element.summoned': {
      const c = d.creep ? findCreep(state, d.creep) : undefined;
      const color = ELEMENT_COLOR[(d.element ?? 'composite') as DamageElement] ?? NEUTRAL;
      return c ? [{ kind: 'ring', x: c.x, y: c.y, color, size: CELL * 1.6, ms: 600, alpha: 0.9 }] : null;
    }
    default: return null;
  }
}

export const ELEMENT_LOOK: ModeLook = {
  tower: (_id, spec) => towerLook(spec),
  creep: (_id, spec) => creepLook(spec as ElementCreepSpec),
  creepStatus,
  extras,
  effects,
  terrain: {
    buildable: 0x2b2e25,
    walkable: 0x4a3e2e,
    blocked: 0x0d0b09,
    // No inner rim: Element's cliffs are wide, and a rim per cell reads as a grid of holes.
    blockedRim: 0x0d0b09,
    gridLine: 0x3c4032,
    plotRim: 0x56604a,
    airLine: false,
  },
};
