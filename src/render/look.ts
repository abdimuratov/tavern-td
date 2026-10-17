import type { ShootVariant } from '../platform/audio';
import { fnv1a, type Creep, type CreepSpec, type GameModeRules, type GameState, type SimEvent, type TowerSpec } from '../sim';

/** Shapes drawn into the atlas at boot. Each is white with a dark outline, so a tint colours it. */
export type Shape =
  | 'circle' | 'square' | 'diamond' | 'triangle' | 'pentagon' | 'hexagon' | 'octagon'
  | 'star' | 'cross' | 'gem' | 'rock' | 'chevron'
  /** Gem cuts with 3–8 facets seen from above, so a gem's quality reads by its facet count. */
  | 'cut3' | 'cut4' | 'cut5' | 'cut6' | 'cut8'
  /** A flat engraved tile, for structures creeps walk over. */
  | 'tile'
  /** A twelve-point burst, for one-of-a-kind towers. */
  | 'burst';

export const SHAPES: readonly Shape[] = [
  'circle', 'square', 'diamond', 'triangle', 'pentagon', 'hexagon', 'octagon',
  'star', 'cross', 'gem', 'rock', 'chevron',
  'cut3', 'cut4', 'cut5', 'cut6', 'cut8', 'tile', 'burst',
];

export interface TowerLook {
  readonly shape: Shape;
  /** 0xRRGGBB. */
  readonly color: number;
  /** Of the footprint's width, 0–1. */
  readonly size: number;
  /** A dark plate under the shape; off for Rocks and walls. */
  readonly plate: boolean;
  /** The plate's tint, when it should differ from the usual dark one (Gem's specials). */
  readonly plateColor?: number;
  /** A soft glow of this colour under the tower, for the rare ones. */
  readonly halo?: number;
  /** Colour of its projectiles and hit flashes. */
  readonly shot: number;
  /** Its attack sound. */
  readonly sound: ShootVariant;
  /** A ring around the shape split into one segment per colour, such as the Elements a tower is made of. */
  readonly ring?: readonly number[];
  /** Small dots along the footprint's lower edge, such as the tower's level. */
  readonly pips?: number;
  /** Radius of the ring its hits splash, in world units, when its effects don't say. */
  readonly splash?: number;
}

export interface CreepLook {
  readonly shape: Shape;
  readonly color: number;
  /** Of a cell's width. */
  readonly size: number;
  /** A small dark symbol inside the body, such as a Trait's. */
  readonly mark?: Shape;
}

/** How a creep's statuses show. Return the same object for the same look: the renderer compares them by identity. */
export interface CreepStatusLook {
  /** Mixed halfway into the creep's colour; null keeps its own. */
  readonly tint: number | null;
  readonly alpha: number;
  /** Of its usual size. */
  readonly scale: number;
}

/** Something a Game Mode draws on the board besides towers and creeps, such as a tornado. */
export interface BoardExtra {
  readonly x: number;
  readonly y: number;
  /** World units across. */
  readonly size: number;
  readonly glyph: 'ring' | 'glow' | 'swirl' | Shape;
  readonly color: number;
  readonly alpha: number;
  /** Turns per second, for a swirl. */
  readonly spin?: number;
}

/** A short effect for a Game Mode's own event, such as a pulse ring. */
export interface EffectCue {
  readonly kind: 'ring' | 'flash' | 'burst';
  readonly x: number;
  readonly y: number;
  readonly color: number;
  /** World units: a ring's radius, a flash's or burst's size. */
  readonly size: number;
  /** Milliseconds. */
  readonly ms?: number;
  readonly alpha?: number;
}

/** The ground's colours, for a Game Mode whose Map should read differently, such as Element's Lane and plots. */
export interface TerrainLook {
  readonly buildable?: number;
  readonly walkable?: number;
  readonly blocked?: number;
  readonly blockedRim?: number;
  readonly gridLine?: number;
  /** A lighter edge where buildable ground meets anything else, so plots read as raised. */
  readonly plotRim?: number;
  /** False hides the dashed air line, for Maps no creep flies over. */
  readonly airLine?: boolean;
}

/**
 * How a Game Mode's towers and creeps look. A mode's UI passes the parts it
 * wants to decide (Gem colours each gem by type and quality); the rest come
 * from DEFAULT_LOOK. Called once per spec id and cached, never per frame.
 */
export interface ModeLook {
  tower(id: string, spec: TowerSpec): TowerLook;
  creep(id: string, spec: CreepSpec): CreepLook;
  /** A creep's look under its statuses, or null for none. Called after each tick for every creep with a status. */
  creepStatus?(creep: Creep): CreepStatusLook | null;
  /** What to draw besides towers and creeps, re-read after every tick. Return a shared empty list when there's nothing. */
  extras?(state: GameState): readonly BoardExtra[];
  /** Effects for the Game Mode's own events. */
  effects?(event: Extract<SimEvent, { type: 'mode' }>, state: GameState): readonly EffectCue[] | null;
  readonly terrain?: TerrainLook;
}

/** Saturated enough to read on the dark ground, distinct from the red ghost and the route line. */
const PALETTE = [0x5fb4ff, 0xff8a4c, 0x8be06a, 0xc78bff, 0xffd34d, 0x4de0c8, 0xff6b9a, 0xa0c4ff, 0xe0a64a, 0x9ad94c];
const CREEP_PALETTE = [0xe8d6b0, 0xd98c5f, 0xb5c46b, 0xc9a0d9, 0x8fc3c9, 0xe0b04d];

function pick(palette: readonly number[], key: string): number {
  return palette[parseInt(fnv1a(key), 16) % palette.length]!;
}

function attackSound(spec: TowerSpec): ShootVariant {
  const atk = spec.attack;
  const kinds = new Set((atk?.effects ?? []).map((e) => e.kind));
  if (kinds.has('slow')) return 'frost';
  if (kinds.has('poison')) return 'poison';
  if (kinds.has('splash')) return 'cannon';
  if (atk?.attackType === 'magic' || atk?.attackType === 'chaos') return 'arcane';
  return 'arrow';
}

export const DEFAULT_LOOK: ModeLook = {
  tower(id, spec) {
    const atk = spec.attack;
    // Structures creeps walk over (Gem's slates) lie flat: no plate, so they don't read as walls.
    if (spec.walkable) return { shape: 'diamond', color: pick(PALETTE, id), size: 0.8, plate: false, shot: 0xffffff, sound: 'arcane' };
    if (!atk) {
      // Rocks and other structures that only shape the maze; aura towers still get a plate.
      if (spec.auras?.length) return { shape: 'hexagon', color: pick(PALETTE, id), size: 0.62, plate: true, shot: 0xffffff, sound: 'arcane' };
      return { shape: 'rock', color: 0x8a8278, size: 0.9, plate: false, shot: 0xffffff, sound: 'arrow' };
    }
    const shape: Shape = atk.targets === 'air' ? 'triangle' : atk.targets === 'ground' ? 'square' : 'circle';
    const color = pick(PALETTE, id);
    return { shape, color, size: 0.58, plate: true, shot: color, sound: attackSound(spec) };
  },
  creep(id, spec) {
    // Air creeps are wings with a shadow under them; ground creeps are round. Bigger leaks are bigger bodies.
    const big = (spec.leakCost ?? 1) >= 2;
    if (spec.flying) return { shape: 'chevron', color: 0x9fd2ff, size: big ? 0.6 : 0.46 };
    return { shape: big ? 'octagon' : 'circle', color: pick(CREEP_PALETTE, id), size: big ? 0.56 : 0.4 };
  },
};

const SLOWED: CreepStatusLook = { tint: 0x8fd0ff, alpha: 1, scale: 1 };
const POISONED: CreepStatusLook = { tint: 0x9de07a, alpha: 1, scale: 1 };
const STUNNED: CreepStatusLook = { tint: 0xffe27a, alpha: 1, scale: 1 };

/** The core's statuses: a stunned creep reads yellow, a slowed one blue, a poisoned one green. */
export function defaultCreepStatus(c: Creep): CreepStatusLook | null {
  let out: CreepStatusLook | null = null;
  for (let i = 0; i < c.status.length; i++) {
    const kind = c.status[i]!.kind;
    if (kind === 'stun') return STUNNED;
    if (kind === 'slow') out = SLOWED;
    else if (kind === 'poison' && out === null) out = POISONED;
  }
  return out;
}

const NO_EXTRAS: readonly BoardExtra[] = [];

/** Looks per spec id, resolved on first use. A spec the Game Mode doesn't know gets a plain grey shape. */
export interface LookCache {
  tower(id: string): TowerLook;
  creep(id: string): CreepLook;
  creepStatus(c: Creep): CreepStatusLook | null;
  extras(state: GameState): readonly BoardExtra[];
  effects(event: Extract<SimEvent, { type: 'mode' }>, state: GameState): readonly EffectCue[] | null;
  readonly terrain: TerrainLook;
}

export function createLookCache(rules: GameModeRules, look: Partial<ModeLook> = {}): LookCache {
  const towers = new Map<string, TowerLook>();
  const creeps = new Map<string, CreepLook>();
  const towerLook = look.tower ?? DEFAULT_LOOK.tower;
  const creepLook = look.creep ?? DEFAULT_LOOK.creep;
  return {
    tower(id) {
      let l = towers.get(id);
      if (!l) {
        const spec = Object.hasOwn(rules.towers, id) ? rules.towers[id] : undefined;
        l = spec ? towerLook(id, spec) : { shape: 'square', color: 0x888888, size: 0.5, plate: true, shot: 0xffffff, sound: 'arrow' };
        towers.set(id, l);
      }
      return l;
    },
    creep(id) {
      let l = creeps.get(id);
      if (!l) {
        const spec = Object.hasOwn(rules.creeps, id) ? rules.creeps[id] : undefined;
        l = spec ? creepLook(id, spec) : { shape: 'circle', color: 0x888888, size: 0.4 };
        creeps.set(id, l);
      }
      return l;
    },
    creepStatus: look.creepStatus ?? defaultCreepStatus,
    extras: look.extras ?? (() => NO_EXTRAS),
    effects: look.effects ?? (() => null),
    terrain: look.terrain ?? {},
  };
}
