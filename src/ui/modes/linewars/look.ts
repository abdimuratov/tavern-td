import { FIELD_COLS, LW_CREEPS, LW_SENDS, isSendId } from '../../../content/linewars';
import type { CreepLook, EffectCue, ModeLook, TerrainBanner, TerrainLook } from '../../../render/look';
import { CELL, linewars, type GameState } from '../../../sim';
import type { ViewerSide } from '../../mode-ui';
import { MAUL_LOOK, RACE_COLOR } from '../maul/look';
import { raceName } from '../maul/text';

// Line Wars' look: Maul's towers and creeps as they are (Race colours, line
// shapes, stone Walls, crested forks; the Sends keep Maul's creep ids), on the
// Twin Fields with a band along each spawn strip, an exit box per Field, faint
// air fans, and each Side's Race on a banner hanging over the Divide, "You"
// over the Viewer Side's Field. Every Send throws a small token across the
// Divide: the board draws it, and it never touches the Run.

/** The Divide's middle, in world units. */
const DIVIDE_MID = ((FIELD_COLS[1][1] + 1 + FIELD_COLS[0][0]) / 2) * CELL;
const BANNER_W = 4 * CELL;
const BANNER_GAP = 0.6 * CELL;

function banners(state: GameState, me: ViewerSide): TerrainBanner[] {
  const ms = linewars.lwState(state);
  const at = (x: number, title: string, race: keyof typeof RACE_COLOR): TerrainBanner => ({
    x, y: 2.4 * CELL, width: BANNER_W, height: 15 * CELL, color: RACE_COLOR[race], title, text: raceName(race),
  });
  // Each banner hangs on its own Side's Field's side of the Divide: Side 0's
  // Field is east of it in the world, Side 1's west. A Guest's mirrored board
  // turns that round, so "You" is on the right on every device.
  const by = (side: ViewerSide): number => (side === 0 ? DIVIDE_MID + BANNER_W / 2 + BANNER_GAP : DIVIDE_MID - BANNER_W / 2 - BANNER_GAP);
  const them = linewars.other(me);
  return [at(by(them), 'Rival', ms.sides[them].race), at(by(me), 'You', ms.sides[me].race)];
}

function terrainFor(me: ViewerSide) {
  // The Divide's rock rims are quieter than other Maps' walls: it is a band of rock, not a maze.
  return (state: GameState): TerrainLook => ({ airAlpha: 0.1, spawns: 'strip', splitRegions: true, blockedRim: 0x15110e, banners: banners(state, me) });
}

/** The Maul creep look a Send's creeps wear. */
export function sendLook(creep: string): CreepLook {
  const spec = LW_CREEPS[creep];
  return spec ? MAUL_LOOK.creep!(creep, spec) : { shape: 'circle', color: 0xcccccc, size: 0.4 };
}

/** A Send's token: from the sender's Field edge, bowing down across the Divide, to the other Field's spawn strip. */
function sendArc(data: unknown): EffectCue[] {
  const d = (data ?? {}) as { side?: number; send?: string };
  if (!isSendId(d.send) || (d.side !== 0 && d.side !== 1)) return [];
  const look = sendLook(LW_SENDS[d.send].creep);
  // Side 0's Field's west edge and Side 1's east edge, along the spawn strip.
  const edge0 = FIELD_COLS[0][0] * CELL - CELL * 0.4;
  const edge1 = (FIELD_COLS[1][1] + 1) * CELL + CELL * 0.4;
  const [x, x2] = d.side === 0 ? [edge0, edge1] : [edge1, edge0];
  return [{
    kind: 'arc', x, y: CELL * 1, x2, y2: CELL * 1, color: look.color, shape: look.shape,
    size: Math.max(0.62, look.size) * CELL * 1.25, lift: CELL * 4.5, ms: 700,
  }];
}

function lookFor(me: ViewerSide): Partial<ModeLook> {
  return {
    ...(MAUL_LOOK.tower ? { tower: MAUL_LOOK.tower } : {}),
    ...(MAUL_LOOK.creep ? { creep: MAUL_LOOK.creep } : {}),
    terrain: terrainFor(me),
    effects(event, state) {
      if (event.name === 'lw.sent') return sendArc(event.data);
      return MAUL_LOOK.effects?.(event, state) ?? null;
    },
  };
}

/** The look as Side 0 sees it, and as Side 1 (a Versus Guest) does: only the banners differ. */
const LOOKS = [lookFor(0), lookFor(1)] as const;

export const LW_LOOK: Partial<ModeLook> = LOOKS[0];

/** The look as the Viewer Side sees it. The Send arcs are the world's, so the board's mirror turns them round. */
export function lwLook(side: ViewerSide): Partial<ModeLook> {
  return LOOKS[side];
}
