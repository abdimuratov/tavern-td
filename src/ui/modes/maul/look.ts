import type { MaulCreepSpec, MaulTowerSpec, RaceId } from '../../../content/maul';
import type { ShootVariant } from '../../../platform/audio';
import type { CreepLook, EffectCue, ModeLook, Shape, TowerLook } from '../../../render/look';
import type { CreepSpec, TowerSpec } from '../../../sim';

// Maul's look. Each Race has a colour, and each of its two lines a shape; a
// Wall is a low block in the Race's colour with no plate, so the maze reads as
// stone. Towers grow a little each Tier and show it in pips, and a Tier 3 fork
// wears a gold crest. Creeps take their kind's colour and silhouette.

export const RACE_COLOR: Readonly<Record<RaceId, number>> = {
  ironclad: 0xd9a35c,
  rimeborn: 0x7fd0ff,
  mirefolk: 0x8bd65a,
  runecasters: 0xb88cff,
};

const LINE_SHAPE: Readonly<Record<RaceId, readonly [a: Shape, b: Shape]>> = {
  ironclad: ['triangle', 'square'],
  rimeborn: ['diamond', 'pillar'],
  mirefolk: ['drop', 'circle'],
  runecasters: ['hexagon', 'pentagon'],
};

const SOUND: Readonly<Record<RaceId, readonly [a: ShootVariant, b: ShootVariant]>> = {
  ironclad: ['arrow', 'cannon'],
  rimeborn: ['frost', 'frost'],
  mirefolk: ['poison', 'poison'],
  runecasters: ['arcane', 'arcane'],
};

const WALL_TINT = 0.55;
const CREST = 0xffd36a;

/** A colour mixed `k` of the way to dark grey, for the Walls' stone. */
function stone(color: number, k: number): number {
  const mix = (c: number, d: number): number => Math.round(c + (d - c) * k);
  const r = mix((color >> 16) & 0xff, 0x5a);
  const g = mix((color >> 8) & 0xff, 0x56);
  const b = mix(color & 0xff, 0x52);
  return (r << 16) | (g << 8) | b;
}

function towerLook(_id: string, spec: TowerSpec): TowerLook {
  const info = (spec as Partial<MaulTowerSpec>).maul;
  if (!info) return { shape: 'square', color: 0x888888, size: 0.5, plate: true, shot: 0xffffff, sound: 'arrow' };
  const color = RACE_COLOR[info.race];
  if (info.line === 'wall') return { shape: 'rock', color: stone(color, WALL_TINT), size: 0.9, plate: false, shot: color, sound: 'arrow' };
  const i = info.line === 'a' ? 0 : 1;
  const splash = spec.attack?.effects?.find((e) => e.kind === 'splash') as { bands?: readonly (readonly [number, number])[] } | undefined;
  const band = splash?.bands?.[splash.bands.length - 1]?.[0];
  return {
    shape: LINE_SHAPE[info.race][i]!, color, size: 0.44 + 0.05 * info.tier, plate: true, pips: info.tier, shot: color,
    sound: SOUND[info.race][i]!,
    ...(info.tier === 3 ? { crest: CREST } : {}),
    ...(band !== undefined ? { splash: band } : {}),
    ...(spec.auras?.length ? { halo: color } : {}),
  };
}

const CREEP: Readonly<Record<string, CreepLook>> = {
  raider: { shape: 'circle', color: 0xd9c7a3, size: 0.4 },
  snowling: { shape: 'circle', color: 0xeef6ff, size: 0.28 },
  frost_wolf: { shape: 'circle', color: 0x9fb8c8, size: 0.36, mark: 'chevron' },
  brute: { shape: 'octagon', color: 0xc0875a, size: 0.54 },
  golem: { shape: 'square', color: 0x8fa3b0, size: 0.6 },
  troll: { shape: 'circle', color: 0x7fb36a, size: 0.46, mark: 'cross' },
  wraith: { shape: 'diamond', color: 0xb9a8e0, size: 0.44 },
  harpy: { shape: 'chevron', color: 0x9fd2ff, size: 0.46 },
  warlord: { shape: 'octagon', color: 0xe08a4c, size: 0.8, mark: 'star' },
  mammoth: { shape: 'octagon', color: 0xa89078, size: 0.86, mark: 'star' },
  colossus: { shape: 'octagon', color: 0x9fc6d9, size: 0.9, mark: 'star' },
  winter_king: { shape: 'octagon', color: 0xe6f2ff, size: 0.95, mark: 'star' },
};

function creepLook(id: string, spec: CreepSpec): CreepLook {
  const own = Object.hasOwn(CREEP, id) ? CREEP[id] : undefined;
  if (own) return own;
  const big = (spec as Partial<MaulCreepSpec>).maul?.kind === 'boss';
  return { shape: big ? 'octagon' : 'circle', color: 0xcccccc, size: big ? 0.8 : 0.4 };
}

const CHAIN = 0xd8c2ff;

export const MAUL_LOOK: Partial<ModeLook> = {
  tower: towerLook,
  creep: creepLook,
  effects(event) {
    if (event.name !== 'maul.chain') return null;
    const points = ((event.data as { points?: [number, number][] } | null)?.points ?? []);
    const cues: EffectCue[] = [];
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i - 1]!;
      const [x2, y2] = points[i]!;
      cues.push({ kind: 'beam', x, y, x2, y2, color: CHAIN, size: 4, ms: 160 });
    }
    return cues;
  },
};
