import { RACE_SPECS, RACES, type RaceId } from '../../../content/maul';
import { footprintAt } from '../../../render/footprint';
import { cellCol, cellRow, maul, TICK_RATE, type GameState, type SimEvent } from '../../../sim';
import { DIFFICULTY_NAME } from '../../catalog';
import type { ModeUi, Placement, RunChoices, RunView } from '../../mode-ui';
import { BuildMenu } from './BuildMenu';
import { MaulHowTo } from './HowTo';
import { MAUL_LOOK } from './look';
import { MaulPanel } from './MaulPanel';
import { MaulStatus } from './MaulStatus';
import { building } from './picks';
import { MAUL_REFERENCE } from './reference';
import { SendNow } from './SendNow';
import { ARMOR_NAME, BEST_AGAINST, KIND_TAG, raceName, racesText } from './text';

// Maul's play screen: the build menu and a 2 × 2 Ghost anywhere on open ground
// with the path it would make from both gates, the selected tower's upgrades
// and forks, the Break with Send now, juggles called out as they happen, a
// wave preview that warns of air and bosses, and the second Race after Wave 15.

type MaulState = maul.MaulState;

function mlState(state: GameState): MaulState {
  return state.mode as MaulState;
}

const over = (state: GameState): boolean => state.phase === 'won' || state.phase === 'lost';

function placement(view: RunView, p: { x: number; y: number }): Placement | null {
  const spec = building.value;
  const s = view.state;
  if (!spec || over(s)) return null;
  const cells = footprintAt(s.map, p, maul.FOOTPRINT);
  if (!cells) return null;
  const col = cellCol(s.map, cells[0]!);
  const row = cellRow(s.map, cells[0]!);
  const option = maul.buildOptions(s).find((o) => o.spec === spec);
  if (!option) return null;
  const spot = maul.buildSpot(s, col, row);
  return {
    cells: spot.cells,
    spec,
    command: { type: 'maul.build', spec, col, row },
    error: spot.error ?? option.blocked,
    checked: true,
    label: `${option.name} · ${option.cost} gold`,
    tapSlop: 26,
  };
}

function choicesOf(state: GameState): RunChoices {
  return { race: mlState(state).races[0] ?? 'ironclad' };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

/** Maul's own state in a loaded save: every field this build reads, with values it knows. */
export function validMaulSave(state: GameState): boolean {
  const m = state.mode as unknown;
  if (!isObj(m)) return false;
  const races = m.races;
  if (!Array.isArray(races) || races.length < 1 || races.length > 2 || !races.every((r) => (RACES as readonly unknown[]).includes(r))) return false;
  const nums = ['breakUntil', 'breakTicks', 'completed', 'leaks', 'kills', 'score', 'carry', 'turned', 'juggles', 'interest', 'startTick', 'endTick'];
  if (!nums.every((k) => isNum(m[k]))) return false;
  if (typeof m.refundOpen !== 'boolean' || !isObj(m.bountyRate) || !isObj(m.towers)) return false;
  if (m.waves !== null && !Array.isArray(m.waves)) return false;
  return Object.values(m.towers).every((t) => isObj(t) && isNum(t.paid) && isNum(t.fresh));
}

function onEvents(view: RunView, events: readonly SimEvent[]): void {
  for (const e of events) {
    if (e.type !== 'mode') continue;
    const d = (e.data ?? {}) as { turned?: number; race?: RaceId; wave?: number };
    switch (e.name) {
      case 'maul.juggle':
        view.say(`Juggled: ${d.turned ?? 0} creep${d.turned === 1 ? '' : 's'} turned back`, 'ok', 1800);
        break;
      case 'maul.raceAdded':
        if (d.race) view.say(`The ${raceName(d.race)} join the Run`, 'ok', 2600);
        break;
      case 'maul.cleared':
        if (maul.maulStatus(view.state).raceChoices.length > 0 && d.wave === maul.maulStatus(view.state).secondRaceAfter) {
          view.say('A second Race can join: pick one under Build', 'ok', 4000);
        }
        break;
      case 'maul.break': {
        const next = d.wave ? maul.wavePreview(view.state, d.wave) : null;
        if (next?.air) view.say(`Wave ${next.wave} flies: Harpies go straight over the maze`, 'info', 3600);
        else if (next?.boss) view.say(next.wave === view.state.wave.total ? 'The last boss is next: if it gets through, the Run is lost' : `Wave ${next.wave} is a boss`, 'info', 3600);
        break;
      }
      default:
        break;
    }
  }
}

export const MAUL_UI: ModeUi = {
  modeId: maul.MAUL_MODE_ID,
  look: MAUL_LOOK,
  showStartWave: false,
  Status: MaulStatus,
  Actions: BuildMenu,
  Panel: MaulPanel,
  Footer: SendNow,
  HowTo: MaulHowTo,
  reference: MAUL_REFERENCE,

  runOptions: [
    {
      id: 'race', label: 'Race', default: 'ironclad',
      choices: RACES.map((r) => ({ id: r, label: RACE_SPECS[r].name, about: RACE_SPECS[r].about })),
    },
  ],
  difficultyAbout: (d) => ({
    easy: 'Creeps have 25% less HP',
    normal: 'Creeps at full HP',
    hard: 'Creeps have 30% more HP',
    insane: 'Creeps have 60% more HP',
  })[d],
  optionsOf: choicesOf,
  optionsText: (c) => (c['race'] && (RACES as readonly string[]).includes(c['race']) ? raceName(c['race'] as RaceId) : ''),

  waveLabel(view) {
    const s = view.state;
    return { label: 'Wave', value: `${s.wave.number}/${s.wave.total}` };
  },

  placement,

  // Esc drops a build choice before it opens the menu.
  pending: () => building.value !== null,

  cancel() {
    building.value = null;
  },

  hint(view) {
    const s = view.state;
    if (over(s)) return null;
    const spec = building.value;
    if (spec) return { text: 'Tap open ground to place it', tone: 'info' };
    if (s.towers.length === 0) return { text: 'Pick a Wall or a tower, then tap open ground', tone: 'info' };
    if (maul.maulStatus(s).raceChoices.length > 0) return { text: 'A second Race can join: pick one under Build', tone: 'info' };
    return null;
  },

  wavePreview(view, index) {
    const w = maul.wavePreview(view.state, index + 1);
    if (!w) return null;
    const last = w.wave === view.state.wave.total;
    return {
      number: w.wave,
      groups: w.groups.map((g) => {
        const tag = KIND_TAG[g.kind];
        const traits = tag && g.kind !== 'boss' && g.kind !== 'air' ? [tag] : [];
        const about = [
          `${ARMOR_NAME[g.armorType]} armor ${g.armor}: ${BEST_AGAINST[g.armorType]} hits hardest`,
          `${g.hp.toLocaleString('en-US')} HP each`,
          g.lives > 1 ? `a leak costs ${g.boss && last ? 'the Run' : `${g.lives} lives`}` : '',
          g.hint,
        ].filter(Boolean).join(' · ');
        return {
          creep: g.creep, name: g.name, count: g.count, air: g.flying, boss: g.boss, traits, about,
          ...(g.boss ? { tag: last ? 'Last boss' : 'Boss' } : {}),
        };
      }),
    };
  },

  feedback(e) {
    if (e.type === 'removed') return { sound: null, haptic: 'tap' };
    if (e.type !== 'mode') return undefined;
    switch (e.name) {
      case 'maul.juggle': return { sound: 'resource', haptic: 'tap' };
      case 'maul.raceAdded': return { sound: 'levelUp', haptic: 'confirm' };
      case 'maul.sold': return { sound: 'resource', haptic: null };
      case 'maul.chain': return { sound: 'splash', haptic: null };
      default: return undefined;
    }
  },

  onEvents,

  validSave: validMaulSave,

  result(state) {
    const r = maul.maulRecord(state);
    return { wave: r.wave, score: r.score, won: r.won, seconds: r.seconds ?? state.tick / TICK_RATE };
  },

  endText(state) {
    const r = maul.maulRecord(state);
    const d = DIFFICULTY_NAME[state.difficulty];
    const races = racesText(r.races);
    if (r.won) return { won: true, summary: `All ${state.wave.total} Waves held on ${d} with the ${races}`, wave: String(state.wave.total) };
    const boss = state.wave.number === state.wave.total && state.lives <= 0;
    return {
      won: false,
      summary: boss ? `The last boss got through on ${d}` : `The Run ended on Wave ${state.wave.number} of ${state.wave.total}`,
      wave: String(state.wave.number),
    };
  },
};

