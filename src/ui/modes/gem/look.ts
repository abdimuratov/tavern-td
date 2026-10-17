import { BOSS, type GemCreepSpec, type GemTowerSpec, type GemType, type Quality } from '../../../content/gem';
import type { ShootVariant } from '../../../platform/audio';
import type { CreepLook, ModeLook, Shape, TowerLook } from '../../../render/look';

// Gem's look. A gem's colour is its type and its cut is its quality: Chipped is
// a small three-facet chip, Great a large eight-facet brilliant with a glow.
// Specials sit on a gold plate in shapes no gem uses, slates are flat floor
// tiles, Rocks are grey stones, and the Stone of Bryvx is a glowing burst.

export const TYPE_COLOR: Readonly<Record<GemType, number>> = {
  amethyst: 0xa86bff,
  aquamarine: 0x46e2ea,
  diamond: 0xf2f5ff,
  emerald: 0x36d06a,
  opal: 0xffb0d2,
  ruby: 0xff3d50,
  sapphire: 0x3f6dff,
  topaz: 0xffcc33,
};

const CUT: Readonly<Record<Quality, Shape>> = {
  chipped: 'cut3', flawed: 'cut4', normal: 'cut5', flawless: 'cut6', perfect: 'cut8', great: 'cut8',
};

const CUT_SIZE: Readonly<Record<Quality, number>> = {
  chipped: 0.44, flawed: 0.52, normal: 0.6, flawless: 0.68, perfect: 0.76, great: 0.86,
};

const TYPE_SOUND: Readonly<Record<GemType, ShootVariant>> = {
  amethyst: 'arrow', aquamarine: 'arcane', diamond: 'arrow', emerald: 'poison',
  opal: 'arcane', ruby: 'cannon', sapphire: 'frost', topaz: 'arcane',
};

/** Each special line's shape and colour: shapes the gem cuts don't use. */
const SPECIAL: Readonly<Record<string, { readonly shape: Shape; readonly color: number; readonly sound: ShootVariant }>> = {
  malachite: { shape: 'hexagon', color: 0x1fb86e, sound: 'arcane' },
  silver: { shape: 'cross', color: 0xcfd8e3, sound: 'frost' },
  'star-ruby': { shape: 'star', color: 0xff5a46, sound: 'cannon' },
  jade: { shape: 'pentagon', color: 0x7ee0a8, sound: 'poison' },
  'red-crystal': { shape: 'triangle', color: 0xff7896, sound: 'arrow' },
  'dark-emerald': { shape: 'diamond', color: 0x23985a, sound: 'poison' },
  gold: { shape: 'octagon', color: 0xffc233, sound: 'arrow' },
  uranium: { shape: 'circle', color: 0xb4ff3a, sound: 'arcane' },
  'pink-diamond': { shape: 'diamond', color: 0xff8fd2, sound: 'arrow' },
  paraiba: { shape: 'square', color: 0x2fe0d2, sound: 'frost' },
  'black-opal': { shape: 'octagon', color: 0x8a64c8, sound: 'arcane' },
  'blood-stone': { shape: 'square', color: 0xd0263c, sound: 'cannon' },
  'yellow-sapphire': { shape: 'star', color: 0xfff06a, sound: 'frost' },
};

const SLATE_COLOR: Readonly<Record<string, number>> = {
  hold: 0xd9b23a, air: 0xa47cff, ancient: 0xf0d36a,
  'opal-vein': 0xffb3cf, slow: 0x7096ff, wraith: 0xc08ae6,
  poison: 0x5cc77a, spell: 0x5fd8e0, elder: 0x6cc0c4,
  damage: 0xe8ecf5, range: 0xff7a64, viper: 0xa6d84f,
};
const COMBO_SLATES = new Set(['ancient', 'wraith', 'elder', 'viper']);

/** The board's buildable ground, which slate tiles are blended toward so they read as floor. */
const GROUND = 0x2d2620;
const SPECIAL_PLATE = 0x7a5a2a;

/** `a` moved `k` of the way toward `b`, per channel. */
export function blend(a: number, b: number, k: number): number {
  const ch = (shift: number): number => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * k) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

function gemTower(spec: GemTowerSpec): TowerLook {
  const g = spec.gem;
  switch (g.kind) {
    case 'gem': {
      const type = g.type!;
      const quality = g.quality!;
      const color = TYPE_COLOR[type];
      return {
        shape: CUT[quality], color, size: CUT_SIZE[quality], plate: true, shot: color, sound: TYPE_SOUND[type],
        ...(quality === 'great' ? { halo: color } : {}),
      };
    }
    case 'special': {
      const s = SPECIAL[g.family ?? ''] ?? { shape: 'hexagon' as Shape, color: 0xffffff, sound: 'arcane' as ShootVariant };
      return { shape: s.shape, color: s.color, size: 0.56 + 0.08 * ((g.tier ?? 1) - 1), plate: true, plateColor: SPECIAL_PLATE, shot: s.color, sound: s.sound };
    }
    case 'stone':
      return { shape: 'burst', color: 0xf4e8ff, size: 0.9, plate: true, plateColor: 0x9a7a30, halo: 0xd6a8ff, shot: 0xe8c8ff, sound: 'cannon' };
    case 'slate': {
      const family = g.family ?? '';
      const color = SLATE_COLOR[family] ?? 0xcccccc;
      const combo = COMBO_SLATES.has(family);
      return { shape: 'tile', color: blend(color, GROUND, combo ? 0.15 : 0.32), size: combo ? 0.96 : 0.9, plate: false, shot: color, sound: 'arcane' };
    }
    case 'rock':
      return { shape: 'rock', color: 0x8c857b, size: 0.9, plate: false, shot: 0xffffff, sound: 'arrow' };
  }
}

/** Ground creeps take their armor's colour, so a Wave's kind reads at a glance; heroes are pentagons. */
const ARMOR_COLOR: Readonly<Record<string, number>> = {
  normal: 0xe8d6b0, small: 0xe7b65a, medium: 0xd98c5f, large: 0xb9c86e,
  fort: 0xa4adb8, hero: 0xd9a6ff, divine: 0xfff4d6, none: 0xd8a0c8,
};

function gemCreep(id: string, spec: GemCreepSpec): CreepLook {
  if (id === BOSS) return { shape: 'octagon', color: 0xff5a3c, size: 1.25 };
  if (spec.flying) return { shape: 'chevron', color: 0x9fd2ff, size: 0.66 };
  const color = ARMOR_COLOR[spec.armorType] ?? 0xe8d6b0;
  return { shape: spec.armorType === 'hero' ? 'pentagon' : 'circle', color, size: 0.58 };
}

export const GEM_LOOK: ModeLook = {
  tower: (_id, spec) => gemTower(spec as GemTowerSpec),
  creep: (id, spec) => gemCreep(id, spec as GemCreepSpec),
};

/** The Draft ghost: a gem whose type and quality are still unknown, so no cut or colour a real gem has. */
export const DRAFT_GHOST = { shape: 'gem', color: 0xd8f5df, size: 0.6, plate: true } as const;
