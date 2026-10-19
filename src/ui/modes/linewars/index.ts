import { FIELD_WIDTH, LW_SENDS, fieldOfCol, fieldSpawns, isSendId } from '../../../content/linewars';
import { RACE_SPECS, RACES } from '../../../content/maul';
import { footprintAt } from '../../../render/footprint';
import { CELL, cellCol, cellRow, findTower, linewars, TICK_RATE, type GameState, type SimEvent } from '../../../sim';
import type { CueOverride, ModeUi, Placement, RunChoices, RunView, ViewerSide } from '../../mode-ui';
import { LwActions } from './BuildMenu';
import { LwEnd } from './End';
import { LwHowTo } from './HowTo';
import { lwLook } from './look';
import { LwPanel } from './LwPanel';
import { IncomeTick, LwStatus } from './LwStatus';
import { building, lastSend } from './picks';
import { SendMenu } from './SendMenu';
import {
  bestSteal, difficultyText, isRace, leakedText, lwEndText, matchup, progressText, rivalSendText, sendCreep, stolenText,
} from './text';

// Line Wars' play screen: both Fields at fit zoom with yours on the right, the
// HUD's Income tick, the lives as one tug-of-war bar, the Sudden Death clock,
// the build menu with a 2 × 2 Ghost that only your Field takes, the ten Sends
// one tap each, "In your Field" as the wave preview, a read-only panel for
// the Rival's towers, and toasts for what the Rival sends and what leaks.
// "You" is the Viewer Side (`me`): Side 0, or Side 1 on a Versus Guest's
// device, whose board is mirrored so its Field is on the right too.

const FOOTPRINT = 2;
/** "Air in 0:30" comes this many seconds before the Harpies unlock. */
const AIR_WARNING_SECONDS = 30;

const over = (state: GameState): boolean => state.phase === 'won' || state.phase === 'lost';

function placement(view: RunView, p: { x: number; y: number }): Placement | null {
  const spec = building.value;
  const s = view.state;
  if (!spec || over(s)) return null;
  const cells = footprintAt(s.map, p, FOOTPRINT);
  if (!cells) return null;
  const col = cellCol(s.map, cells[0]!);
  const row = cellRow(s.map, cells[0]!);
  const me = view.side;
  const option = linewars.buildOptions(s, me).find((o) => o.spec === spec);
  if (!option) return null;
  const spot = linewars.buildSpot(s, me, col, row);
  return {
    cells: spot.cells,
    spec,
    command: { type: 'lw.build', side: me, spec, col, row },
    error: spot.error ?? option.blocked,
    checked: true,
    label: `${option.name} · ${option.cost} gold`,
    tapSlop: 26,
  };
}

/** Your Race and the Rival's, as the Viewer Side sees them. */
function choicesOf(state: GameState, me: ViewerSide = 0): RunChoices {
  const ms = linewars.lwState(state);
  return { race: ms.sides[me].race, rivalRace: ms.sides[linewars.other(me)].race };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

const SIDE_NUMBERS = [
  'gold', 'income', 'lives', 'live', 'sent', 'stolen', 'killed', 'bounty', 'turned', 'juggles', 'earned', 'spent',
  'leaked', 'lost', 'airLeaks', 'leakTick', 'version',
];

/** Line Wars' own state in a loaded save: every field this build reads, with values it knows. */
export function validLwSave(state: GameState): boolean {
  const m = state.mode as unknown;
  if (!isObj(m) || !Array.isArray(m.sides) || m.sides.length !== 2 || !Array.isArray(m.ai) || m.ai.length !== 2) return false;
  const sidesOk = m.sides.every((x: unknown) => isObj(x) && (x.driver === 'human' || x.driver === 'ai') && isRace(x.race)
    && SIDE_NUMBERS.every((k) => isNum(x[k])) && isObj(x.stock) && isObj(x.restock) && Array.isArray(x.inbound));
  if (!sidesOk || !isObj(m.towers) || !Object.values(m.towers).every(isNum)) return false;
  if (!['playing', 'side0', 'side1', 'draw'].includes(m.result as string) || typeof m.why !== 'string') return false;
  return isNum(m.endTick) && isNum(m.score) && m.ai.every((a: unknown) => a === null || isObj(a));
}

const SILENT: CueOverride = { sound: null, haptic: null };

/** The Field a world x is in. */
function fieldAtX(x: number): -1 | 0 | 1 {
  return fieldOfCol(Math.floor(x / CELL));
}

function rivalTower(state: GameState, id: number, me: ViewerSide): boolean {
  const t = findTower(state, id);
  return t !== undefined && linewars.towerSide(state, t) === linewars.other(me);
}

const WIN: CueOverride = { sound: 'win', haptic: null };
const LOSE: CueOverride = { sound: 'lose', haptic: 'error' };

/**
 * Sounds and haptics as the Viewer Side hears them: the Rival's builds,
 * upgrades, shots and kills are silent; its creeps arriving in your Field are
 * not. The core's `won` is Side 0's win, so the end plays from your result.
 */
function feedback(e: SimEvent, state: GameState, me: ViewerSide = 0): CueOverride | undefined {
  const them = linewars.other(me);
  switch (e.type) {
    case 'fire': return rivalTower(state, e.tower, me) ? SILENT : undefined;
    case 'kill': return fieldAtX(e.x) === them ? SILENT : undefined;
    case 'placed': return fieldOfCol(cellCol(state.map, e.cell)) === them ? SILENT : undefined;
    case 'changed': return rivalTower(state, e.tower, me) ? SILENT : undefined;
    // A sale plays its own chime; the Rival's are silent.
    case 'removed': return fieldOfCol(cellCol(state.map, e.cell)) === them ? SILENT : { sound: null, haptic: 'tap' };
    // lw.leak says which way the lives went.
    case 'leak': return SILENT;
    case 'rejected': return (e.command as { side?: unknown } | null)?.side === them ? SILENT : undefined;
    case 'won':
    case 'lost': return linewars.lwRecord(state, me).won ? WIN : LOSE;
    case 'mode': break;
    default: return undefined;
  }
  const d = (e.data ?? {}) as { side?: number; send?: string; from?: number; to?: number; tower?: number };
  switch (e.name) {
    case 'lw.sent': {
      if (d.side === me) return { sound: 'click', haptic: 'tap' };
      if (!isSendId(d.send)) return SILENT;
      const c = sendCreep(d.send);
      return { sound: c.flying || c.maul.kind === 'boss' ? 'horn' : 'arrive', haptic: null };
    }
    case 'lw.leak': return d.to === me ? { sound: 'resource', haptic: null } : { sound: 'leak', haptic: 'leak' };
    case 'lw.juggle': return d.side === me ? { sound: 'resource', haptic: 'tap' } : SILENT;
    case 'lw.sold': return d.side === me ? { sound: 'resource', haptic: null } : SILENT;
    case 'lw.unlock': return { sound: 'resource', haptic: null };
    case 'lw.sudden': return { sound: 'horn', haptic: 'error' };
    case 'maul.chain': return d.tower !== undefined && rivalTower(state, d.tower, me) ? SILENT : { sound: 'splash', haptic: null };
    default: return undefined;
  }
}

/** The tick "Air in 0:30" is called on. */
const AIR_WARNING_TICK = Math.round((LW_SENDS.harpies.unlock - AIR_WARNING_SECONDS) * TICK_RATE);

function onEvents(view: RunView, events: readonly SimEvent[]): void {
  const s = view.state;
  const me = view.side;
  // The tick just stepped is the one before state.tick.
  if (s.tick - 1 === AIR_WARNING_TICK) view.say('Air in 0:30: Harpies fly straight over the maze', 'info', 3600);
  let stolen = 0;
  let lost = 0;
  const through: string[] = [];
  for (const e of events) {
    if (e.type !== 'mode') continue;
    const d = (e.data ?? {}) as { side?: number; send?: string; from?: number; to?: number; lives?: number; turned?: number };
    switch (e.name) {
      case 'lw.sent':
        if (!isSendId(d.send)) break;
        if (d.side === me) {
          lastSend.value = { seed: s.seed, send: d.send };
        } else {
          const text = rivalSendText(d.send);
          if (text) view.say(text, 'error', 3200);
        }
        break;
      case 'lw.leak':
        if (d.to === me) stolen += d.lives ?? 0;
        else if (d.from === me) {
          lost += d.lives ?? 0;
          if (isSendId(d.send)) through.push(sendCreep(d.send).name);
        }
        break;
      case 'lw.juggle':
        if (d.side === me) view.say(`Juggled: ${d.turned ?? 0} creep${d.turned === 1 ? '' : 's'} turned back`, 'ok', 1800);
        break;
      case 'lw.unlock':
        if (isSendId(d.send)) view.say(`${LW_SENDS[d.send].name} unlocked`, 'ok', 2000);
        break;
      case 'lw.sudden':
        view.say('Sudden Death: Income is frozen, every Income tick takes a life from both Sides, and Leaks steal double', 'error', 5000);
        break;
      default:
        break;
    }
  }
  if (stolen > 0) view.say(stolenText(stolen), 'ok', 1800);
  if (lost > 0) view.say(leakedText(lost, through), 'error', 2400);
}

/** Each Side's route is drawn from the middle of its Field's spawn strip. */
const midSpawn = (side: ViewerSide): number => fieldSpawns(side)[0] + FIELD_WIDTH / 2;
/** Your Field's route live; the Rival's, fainter, shows where your Sends will walk. */
const ROUTES = [
  { live: [midSpawn(0)], faint: [midSpawn(1)] },
  { live: [midSpawn(1)], faint: [midSpawn(0)] },
] as const;

export const LINEWARS_UI: ModeUi = {
  modeId: linewars.LW_MODE_ID,
  look: lwLook,
  showLives: false,
  showStartWave: false,
  Stats: IncomeTick,
  Status: LwStatus,
  Actions: LwActions,
  Panel: LwPanel,
  Footer: SendMenu,
  HowTo: LwHowTo,
  End: LwEnd,

  runOptions: [
    {
      id: 'race', label: 'Your Race', default: 'ironclad',
      choices: RACES.map((r) => ({ id: r, label: RACE_SPECS[r].name, about: RACE_SPECS[r].about })),
    },
    {
      id: 'rivalRace', label: 'Rival', default: 'random',
      choices: [
        { id: 'random', label: 'Random', about: 'The Rival\'s Race is drawn as the Run starts' },
        ...RACES.map((r) => ({ id: r, label: RACE_SPECS[r].name, about: RACE_SPECS[r].about })),
      ],
    },
  ],
  difficultyAbout: difficultyText,
  optionsOf: choicesOf,
  optionsText: matchup,
  progressText,
  recordWave: { heading: 'Best steal', best: bestSteal },
  routes: (_state, side = 0) => ROUTES[side],

  // No Waves: no Wave readout, no lives (both Sides' are in the status) and no preview but "In your Field".
  waveLabel: () => null,
  wavePreview: () => null,

  placement,

  // Esc drops a build choice before it opens the menu.
  pending: () => building.value !== null,

  cancel() {
    building.value = null;
  },

  hint(view) {
    const s = view.state;
    if (over(s)) return null;
    if (building.value) return { text: 'Tap open ground in your Field, on the right, to place it', tone: 'info' };
    if (!s.towers.some((t) => linewars.towerSide(s, t) === view.side)) return { text: 'Pick a Wall or a tower, then tap your Field on the right', tone: 'info' };
    return null;
  },

  feedback,
  onEvents,
  validSave: validLwSave,

  /** The Viewer Side's Record entry: a Versus Guest records Side 1's steal, score and result. */
  result(state, side = 0) {
    const r = linewars.lwRecord(state, side);
    return { wave: r.wave, score: r.score, won: r.won, seconds: r.seconds ?? state.tick / TICK_RATE };
  },

  endText: lwEndText,

  // Versus: a build marks its footprint, an upgrade or sale its tower, until the tick lands.
  pendingMark(state, command) {
    const c = command as { type: string; col?: unknown; row?: unknown; tower?: unknown };
    if (c.type === 'lw.build' && typeof c.col === 'number' && typeof c.row === 'number') {
      return { x: (c.col + 1) * CELL, y: (c.row + 1) * CELL, span: FOOTPRINT * CELL };
    }
    if ((c.type === 'lw.upgrade' || c.type === 'lw.sell') && typeof c.tower === 'number') {
      const t = findTower(state, c.tower);
      return t ? { x: t.x, y: t.y, span: FOOTPRINT * CELL } : null;
    }
    return null;
  },
  versus: true,

  // The core's gold is Side 0's copy; a Versus Guest sees its own purse.
  gold: (state, side = 0) => linewars.sideOf(state, side).gold,

  // A Versus Run's own board: each device records its own Side's result, always on Normal.
  recordBoards: [{ id: 'versus', name: 'Versus', only: 'normal' }],
};
