import { stageByNumber, type Family, type OriginalCreepSpec, type OriginalTowerSpec, type Region } from '../../../content/original';
import type { ShootVariant } from '../../../platform/audio';
import type {
  BoardExtra, CreepLook, CreepStatusLook, EffectCue, ModeLook, Shape, TerrainLook, TowerLabel, TowerLook,
} from '../../../render/look';
import { CELL, findCreep, findTower, original, type Creep, type GameState, type SimEvent, type Tower } from '../../../sim';

// The Original's look (docs/original-design.md §2, §6, §12): each Region is a
// palette, each family a shape, each creep a silhouette. A tower grows a
// little with each Tier and shows it in pips; a Specialisation wears a gold
// crest instead. Its Tower Level is a small number that turns gold at 5.

export const FAMILY_COLOR: Readonly<Record<Family, number>> = {
  arrow: 0xb07a46,
  cannon: 0x8e949c,
  frost: 0x7cc8f2,
  arcane: 0xa070e8,
  poison: 0x8fd448,
  totem: 0xc0603a,
};

export const FAMILY_SHAPE: Readonly<Record<Family, Shape>> = {
  arrow: 'triangle', cannon: 'circle', frost: 'hexagon', arcane: 'diamond', poison: 'drop', totem: 'pillar',
};

const SHOT: Readonly<Record<Family, number>> = {
  arrow: 0xffe2a8, cannon: 0xffb070, frost: 0xbfeaff, arcane: 0xd8b0ff, poison: 0xb4f070, totem: 0xcfeeff,
};

const SOUND: Readonly<Record<Family, ShootVariant>> = {
  arrow: 'arrow', cannon: 'cannon', frost: 'frost', arcane: 'arcane', poison: 'poison', totem: 'arcane',
};

const CREST = 0xf2c14e;
const LEVEL_GOLD = 0xffd24a;

function towerLook(spec: OriginalTowerSpec): TowerLook {
  const i = spec.original;
  const special = i.tier === 4;
  return {
    shape: FAMILY_SHAPE[i.family],
    color: FAMILY_COLOR[i.family],
    size: 0.46 + 0.05 * Math.min(i.tier, 3) + (special ? 0.04 : 0),
    plate: true,
    ...(special ? { crest: CREST, halo: FAMILY_COLOR[i.family] } : { pips: i.tier }),
    shot: SHOT[i.family],
    sound: SOUND[i.family],
    ...(i.splash ? { splash: i.splash.half } : {}),
    ...(i.nova ? { nova: true } : {}),
  };
}

/** One silhouette per creep: its shape, colour, size and a dark mark inside. */
const CREEP_LOOK: Readonly<Record<string, CreepLook>> = {
  ghoul: { shape: 'circle', color: 0x9aa58a, size: 0.42 },
  hound: { shape: 'triangle', color: 0xb8673e, size: 0.4, mark: 'chevron' },
  crawler: { shape: 'circle', color: 0xd8cfb4, size: 0.28 },
  bloodbat: { shape: 'chevron', color: 0xc8323c, size: 0.46 },
  revenant: { shape: 'octagon', color: 0x8d9097, size: 0.6, mark: 'square' },
  cultist: { shape: 'pentagon', color: 0x8a52aa, size: 0.48, mark: 'diamond' },
  flesh_golem: { shape: 'rock', color: 0xc98a7a, size: 0.62, mark: 'cross' },
  bloater: { shape: 'circle', color: 0xb4c04a, size: 0.56, mark: 'circle' },
  shieldbearer: { shape: 'square', color: 0x6f8fb0, size: 0.52, mark: 'crest' },
  gargoyle: { shape: 'chevron', color: 0x9a948a, size: 0.62 },
  gravelord: { shape: 'burst', color: 0xe6dcc0, size: 1.1, mark: 'diamond' },
  plague_mother: { shape: 'octagon', color: 0x8fae3c, size: 1.22, mark: 'circle' },
  riftlord: { shape: 'burst', color: 0xff6a2a, size: 1.32, mark: 'star' },
};

/** A creep's colour, for its dot in the wave preview. */
export function creepColor(id: string): number {
  return CREEP_LOOK[id]?.color ?? 0xb0a890;
}

function creepLook(id: string, spec: OriginalCreepSpec): CreepLook {
  return CREEP_LOOK[id] ?? (spec.flying ? { shape: 'chevron', color: 0x9fd2ff, size: 0.46 } : { shape: 'circle', color: 0xb0a890, size: 0.42 });
}

const FROZEN: CreepStatusLook = { tint: 0xeaf8ff, alpha: 1, scale: 0.94 };
const STUNNED: CreepStatusLook = { tint: 0xffe27a, alpha: 1, scale: 1 };
const ENRAGED: CreepStatusLook = { tint: 0xff3a2a, alpha: 1, scale: 1.12 };
const SLOWED: CreepStatusLook = { tint: 0x8fd0ff, alpha: 1, scale: 1 };
const POISONED: CreepStatusLook = { tint: 0x9de07a, alpha: 1, scale: 1 };

/** A freeze or stun outranks an enrage, then a slow, then poison. */
function creepStatus(c: Creep): CreepStatusLook | null {
  let best: CreepStatusLook | null = null;
  let rank = 0;
  for (const s of c.status) {
    let r = 0;
    let look: CreepStatusLook | null = null;
    if (s.kind === original.STATUS.freeze) {
      r = 4;
      look = s.key === original.KEY.stun ? STUNNED : FROZEN;
    } else if (s.kind === original.STATUS.speed) {
      r = s.value < 0 ? 3 : 2;
      look = s.value < 0 ? ENRAGED : SLOWED;
    } else if (s.kind === original.STATUS.poison) {
      r = 1;
      look = POISONED;
    }
    if (r > rank) {
      rank = r;
      best = look;
    }
  }
  return best;
}

const NONE: readonly BoardExtra[] = [];

/** Plague clouds while they last, and the Riftlord's Shield while it holds. */
function extras(state: GameState): readonly BoardExtra[] {
  const es = state.mode as Partial<original.OriginalState> | null;
  const clouds = es?.clouds ?? [];
  let out: BoardExtra[] | null = null;
  for (const c of clouds) {
    (out ??= []).push({ x: c.x, y: c.y, size: c.radius * 2, glyph: 'glow', color: 0x8fd448, alpha: 0.26 });
  }
  const creeps = es?.creeps;
  if (creeps) {
    for (const c of state.creeps) {
      const cs = Object.hasOwn(creeps, String(c.id)) ? creeps[String(c.id)] : undefined;
      if (!cs || cs.boost <= 0 || cs.boostUntil <= state.tick) continue;
      (out ??= []).push({ x: c.x, y: c.y, size: CELL * 2.1, glyph: 'ring', color: 0xffc070, alpha: 0.85 });
    }
  }
  return out ?? NONE;
}

type ModeEvent = Extract<SimEvent, { type: 'mode' }>;
interface At { x?: number; y?: number; radius?: number; tower?: number; creep?: number; from?: number; to?: number; level?: number }

function at(d: At, kind: EffectCue['kind'], color: number, size: number, ms = 360, alpha = 0.85): EffectCue[] {
  return d.x === undefined || d.y === undefined ? [] : [{ kind, x: d.x, y: d.y, color, size, ms, alpha }];
}

function atTower(state: GameState, id: number | undefined, kind: EffectCue['kind'], color: number, size: (t: Tower) => number, ms = 420): EffectCue[] {
  const t = id ? findTower(state, id) : undefined;
  return t ? [{ kind, x: t.x, y: t.y, color, size: size(t), ms, alpha: 0.8 }] : [];
}

/** Clouds, bolts jumping, splits, shatters, Perks firing and the bosses' turns. */
function effects(e: ModeEvent, state: GameState): readonly EffectCue[] | null {
  const d = (e.data ?? {}) as At;
  switch (e.name) {
    case 'original.cloud': return at(d, 'ring', 0x8fd448, d.radius ?? CELL * 1.75, 420, 0.7);
    case 'original.bounce': {
      const a = d.from ? findCreep(state, d.from) : undefined;
      const b = d.to ? findCreep(state, d.to) : undefined;
      return a && b ? [{ kind: 'beam', x: a.x, y: a.y, x2: b.x, y2: b.y, color: SHOT.arcane, size: 5, ms: 180 }] : null;
    }
    case 'original.split': return at(d, 'burst', 0xb4c04a, CELL * 0.6);
    case 'original.brood': return [...at(d, 'burst', 0x8fae3c, CELL * 0.8), ...at(d, 'ring', 0x8fae3c, CELL * 1.4, 500)];
    case 'original.shatter': return [...at(d, 'burst', 0xeaf8ff, CELL * 0.7), ...at(d, 'ring', 0xbfeaff, 96, 320)];
    case 'original.enrage': return at(d, 'ring', 0xff3a2a, CELL * 2.2, 700, 0.95);
    case 'original.rift': {
      const c = d.creep ? findCreep(state, d.creep) : undefined;
      return c ? [{ kind: 'ring', x: c.x, y: c.y, color: 0xff6a2a, size: CELL * 3, ms: 800, alpha: 0.95 }] : null;
    }
    case 'original.frostNova': return atTower(state, d.tower, 'ring', 0xbfeaff, (t) => original.attackRange(state, t));
    case 'original.warDrums': return atTower(state, d.tower, 'ring', FAMILY_COLOR.totem, (t) => original.auraRadius(state, t), 520);
    case 'original.levelUp': return atTower(state, d.tower, 'flash', LEVEL_GOLD, () => CELL * 1.8, 520);
    default: return null;
  }
}

/** The Tower Level from 2 up: white, then gold once the Level 5 Perk is held. */
function towerLabel(tower: Tower, state: GameState): TowerLabel | null {
  const towers = (state.mode as Partial<original.OriginalState> | null)?.towers;
  const ts = towers && Object.hasOwn(towers, String(tower.id)) ? towers[String(tower.id)] : undefined;
  if (!ts || ts.level < 2) return null;
  return { text: String(ts.level), color: ts.level >= 5 ? LEVEL_GOLD : 0xffffff };
}

/**
 * Each Region's ground: the road, the Open ground beside it in the land's own
 * colour, and Scenery darker, as land nothing stands on.
 */
export const REGION_TERRAIN: Readonly<Record<Region, TerrainLook>> = {
  // Scorched wheat, smoke grey, ember red.
  ashfield: { buildable: 0x231c15, walkable: 0x5a4834, blocked: 0x110d09, blockedRim: 0x1a140f, gridLine: 0x3a3026 },
  // Sick green, bruise violet, black water.
  blightfen: { buildable: 0x121812, walkable: 0x3e4630, blocked: 0x070a07, blockedRim: 0x0d110d, gridLine: 0x283024 },
  // Obsidian, hellfire orange, blood red.
  rift: { buildable: 0x0f0b11, walkable: 0x43241e, blocked: 0x050306, blockedRim: 0x0a070c, gridLine: 0x30222a },
};

export function regionOf(state: GameState): Region {
  const stage = (state.mode as Partial<original.OriginalState> | null)?.stage ?? 1;
  return stageByNumber(stage)?.region ?? 'ashfield';
}

export const ORIGINAL_LOOK: ModeLook = {
  tower: (_id, spec) => ((spec as Partial<OriginalTowerSpec>).original ? towerLook(spec as OriginalTowerSpec)
    : { shape: 'square', color: 0x888888, size: 0.5, plate: true, shot: 0xffffff, sound: 'arrow' }),
  creep: (id, spec) => creepLook(id, spec as OriginalCreepSpec),
  creepStatus,
  extras,
  effects,
  towerLabel,
  terrain: (state) => REGION_TERRAIN[regionOf(state)],
};
