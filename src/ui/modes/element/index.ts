import { DRAW_POOL, ELEMENTS, FULL_WAVES, MAX_ELEMENT_LEVEL, elementName, type Element } from '../../../content/element';
import { snapSquare } from '../../../render/footprint';
import { element, TICK_RATE, type GameState, type Point, type SimEvent } from '../../../sim';
import { DIFFICULTY_NAME } from '../../catalog';
import type { ModeUi, Placement, RunChoices, RunView, StructureMark } from '../../mode-ui';
import { BuildMenu } from './BuildMenu';
import { ElementPanel } from './ElementPanel';
import { ElementStatus } from './ElementStatus';
import { ElementHowTo } from './HowTo';
import { ELEMENT_COLOR, ELEMENT_LOOK } from './look';
import { building, elementsOpen } from './picks';
import { SendNow } from './SendNow';
import { damageName, TRAIT_ABOUT, TRAIT_NAME, towerName } from './text';

// Element's play screen: the build menu and a 2 × 2 Ghost on the plots, the
// selected tower's upgrades, the Elements panel for Lumber, the Break with
// Send now, interest, and Records kept apart for Full and Express.

type ElementState = element.ElementState;

function elState(state: GameState): ElementState {
  return state.mode as ElementState;
}

/**
 * The 2 × 2 spot for the pointer at `p`, snapped onto a narrow plot instead of
 * hanging off its edge (snapSquare), with its cells and the reason it can't
 * be built, if any.
 */
export function spotAt(state: GameState, p: Point): { col: number; row: number; cells: number[]; error: string | null } | null {
  const pick = snapSquare(state.map, p, (col, row) => element.buildSpot(state, col, row).error === null);
  if (!pick) return null;
  const spot = element.buildSpot(state, pick.col, pick.row);
  return { col: pick.col, row: pick.row, cells: spot.cells, error: spot.error };
}

function placement(view: RunView, p: Point): Placement | null {
  const spec = building.value;
  if (!spec || elementsOpen.value) return null;
  const s = view.state;
  const spot = spotAt(s, p);
  if (!spot || spot.cells.length === 0) return null;
  const option = element.buildOptions(s).find((o) => o.spec === spec);
  if (!option) return null;
  return {
    cells: spot.cells,
    spec,
    command: { type: 'element.build', spec, col: spot.col, row: spot.row },
    error: spot.error ?? option.blocked,
    checked: true,
    route: false,
    label: `${option.name} · ${option.cost} gold${option.essence ? ' and a Pure Essence' : ''}`,
    tapSlop: 26,
  };
}

const MARK = { building: 0xffe7a8, copy: 0xb98cff } as const;

/** Brackets on towers still building, a ring on Trickery's copies. */
function marks(state: GameState): StructureMark[] {
  const towers = elState(state).towers;
  const out: StructureMark[] = [];
  for (const t of state.towers) {
    const ts = Object.hasOwn(towers, String(t.id)) ? towers[String(t.id)] : undefined;
    if (!ts) continue;
    if (ts.clone) out.push({ tower: t.id, color: MARK.copy, style: 'ring' });
    else if (ts.ready > state.tick) out.push({ tower: t.id, color: MARK.building, style: 'brackets', pulse: true });
  }
  return out;
}

function onEvents(view: RunView, events: readonly SimEvent[]): void {
  for (const e of events) {
    if (e.type !== 'mode') continue;
    const d = (e.data ?? {}) as { element?: Element; level?: number; wave?: number; bought?: boolean; creep?: number };
    switch (e.name) {
      case 'element.levelUp':
        if (d.element) view.say(`${elementName(d.element)} is now level ${d.level ?? 1}`, 'ok', 2600);
        break;
      case 'element.summoned':
        if (d.element) view.say(`Kill the ${elementName(d.element)} Elemental for ${elementName(d.element)} ${d.level ?? 1}`, 'info', 3200);
        break;
      case 'element.essence':
        if (!d.bought) view.say('A Pure Essence arrived', 'ok', 2600);
        break;
      case 'element.lumber':
        if (elState(view.state).picks === 'allPick') view.say('A Lumber arrived: spend it in Elements', 'ok', 3000);
        break;
      case 'element.cleared':
        if (d.wave === FULL_WAVES && elState(view.state).length === 'full') {
          view.say(`All ${FULL_WAVES} Waves cleared! Boss Waves from here only add score`, 'ok', 6000);
        }
        break;
      default:
        break;
    }
  }
}

function choicesOf(state: GameState): RunChoices {
  const es = elState(state);
  return { picks: es.picks, length: es.length };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
const TIMERS = new Set(['aftershock', 'flood', 'dot', 'sunburn', 'remnant', 'chain']);

/** Element's own state in a loaded save: every field this build reads, with values it knows. */
export function validElementSave(state: GameState): boolean {
  const m = state.mode as unknown;
  if (!isObj(m)) return false;
  if (m.picks !== 'allPick' && m.picks !== 'allRandom') return false;
  if (m.length !== 'full' && m.length !== 'express') return false;
  const nums = ['lumber', 'essence', 'essenceBought', 'freeElements', 'breakUntil', 'breakTicks', 'completed', 'waveLeaks',
    'score', 'firstSpawn', 'clearTick', 'bossKills', 'lifePoints'];
  if (!nums.every((k) => isNum(m[k]))) return false;
  const levels = m.levels;
  if (!isObj(levels) || !ELEMENTS.every((e) => Number.isInteger(levels[e]) && (levels[e] as number) >= 0 && (levels[e] as number) <= MAX_ELEMENT_LEVEL)) return false;
  const draws = m.draws;
  if (!Array.isArray(draws) || !draws.every((d) => isObj(d) && isNum(d.after) && typeof d.done === 'boolean' && (DRAW_POOL as readonly unknown[]).includes(d.pick))) return false;
  const it = m.interest;
  if (!isObj(it) || !isNum(it.next) || !isNum(it.left) || !Array.isArray(it.locks) || typeof it.stopped !== 'boolean') return false;
  if (!isObj(m.towers) || !isObj(m.creeps) || !Array.isArray(m.tornadoes)) return false;
  if (!Object.values(m.towers).every((t) => isObj(t) && isNum(t.ready) && Array.isArray(t.vengeance))) return false;
  const timers = m.timers;
  return Array.isArray(timers) && timers.every((t) => isObj(t) && typeof t.kind === 'string' && TIMERS.has(t.kind) && isNum(t.at));
}

export const ELEMENT_UI: ModeUi = {
  modeId: element.ELEMENT_MODE_ID,
  look: ELEMENT_LOOK,
  showStartWave: false,
  Status: ElementStatus,
  Actions: BuildMenu,
  Panel: ElementPanel,
  Footer: SendNow,
  HowTo: ElementHowTo,
  marksEvery: 10,

  runOptions: [
    {
      id: 'picks', label: 'Elements', default: 'allPick',
      choices: [
        { id: 'allPick', label: 'All Pick', about: 'You choose which Element each Lumber raises' },
        { id: 'allRandom', label: 'All Random', about: 'Each Lumber raises a random Element, and selling refunds everything' },
      ],
    },
    {
      id: 'length', label: 'Length', default: 'full',
      choices: [
        { id: 'full', label: 'Full · 55', about: '55 Waves, then endless boss Waves for score' },
        { id: 'express', label: 'Express · 30', about: '30 steeper Waves with more gold and Lumber' },
      ],
    },
  ],
  difficultyAbout: (d) => ({
    easy: 'Creeps have 25% less HP',
    normal: "The Classic's own numbers",
    hard: 'Creeps have 30% more HP; shorter Breaks',
    insane: 'Creeps have double HP; 1 s Breaks',
  })[d],
  optionsOf: choicesOf,
  optionsText: (c) => [c['length'] === 'express' ? 'Express' : 'Full', c['picks'] === 'allRandom' ? 'All Random' : ''].filter(Boolean).join(' · '),
  recordBoards: [
    { id: 'full', name: 'Full · 55 Waves', wave: (n) => (n > FULL_WAVES ? `Boss ${n - FULL_WAVES}` : String(n)) },
    { id: 'express', name: 'Express · 30 Waves' },
  ],
  recordBoard: (c) => (c['length'] === 'express' ? 'express' : 'full'),

  waveLabel(view) {
    const st = element.elementStatus(view.state);
    if (st.wave > st.fixedWaves) return { label: 'Boss Wave', value: String(st.wave - st.fixedWaves) };
    return { label: 'Wave', value: `${st.wave}/${st.fixedWaves}` };
  },

  placement,

  // Esc drops a build choice or closes Elements before it opens the menu.
  pending: () => elementsOpen.value || building.value !== null,

  cancel() {
    building.value = null;
    elementsOpen.value = false;
  },

  hint(view) {
    if (elementsOpen.value) return null;
    const s = view.state;
    const st = element.elementStatus(s);
    if (st.step !== 'break') return null;
    const spec = building.value;
    if (spec) return { text: `Pick a plot for the ${towerName(spec)}`, tone: 'info' };
    if (s.towers.length === 0 && st.picks === 'allPick' && st.lumber > 0) return { text: 'Spend your Lumber in Elements, then build', tone: 'info' };
    if (s.towers.length === 0) return { text: 'Pick a tower, then a plot beside the Lane', tone: 'info' };
    if (st.picks === 'allPick' && st.lumber > 0 && st.elemental === 0) return { text: 'You have a Lumber to spend in Elements', tone: 'info' };
    return null;
  },

  marks,

  wavePreview(view, index) {
    const w = element.wavePreview(view.state, index);
    if (!w) return null;
    const fixed = elState(view.state).length === 'full' ? FULL_WAVES : 30;
    const traits = w.boss ? [] : w.traits.map((t) => TRAIT_NAME[t]);
    const about = [
      damageName(w.element),
      ...w.traits.map((t) => `${TRAIT_NAME[t]}: ${TRAIT_ABOUT[t]}`),
      `${w.hp.toLocaleString('en-US')} HP each`,
      w.bounty > 0 ? `${w.bounty} gold each` : 'no gold',
      w.lumber ? 'a Lumber comes first' : '',
      w.essence ? 'a Pure Essence comes first' : '',
    ].filter(Boolean).join(' · ');
    return {
      number: w.wave,
      groups: [{
        creep: '', name: w.name, count: w.count, air: false, boss: w.boss, swatch: ELEMENT_COLOR[w.element], traits, about,
        ...(w.boss ? { tag: `Boss ${w.wave - fixed}` } : {}),
      }],
    };
  },

  feedback(e) {
    if (e.type === 'removed') return { sound: null, haptic: 'tap' };
    if (e.type !== 'mode') return undefined;
    switch (e.name) {
      case 'element.levelUp': return { sound: 'levelUp', haptic: 'confirm' };
      case 'element.summoned': return { sound: 'summon', haptic: 'tap' };
      case 'element.lumber': return { sound: 'resource', haptic: null };
      case 'element.essence': return { sound: 'resource', haptic: (e.data as { bought?: boolean }).bought ? 'confirm' : null };
      case 'element.sold': return { sound: 'resource', haptic: null };
      case 'element.fell': return { sound: 'kill', haptic: null };
      case 'element.rose': return { sound: 'rise', haptic: null };
      case 'element.cleared': return (e.data as { wave?: number }).wave === FULL_WAVES ? { sound: 'win', haptic: 'confirm' } : undefined;
      case 'element.pulse':
      case 'element.nova':
      case 'element.quake':
      case 'element.flood':
      case 'element.napalm': return { sound: 'splash', haptic: null };
      default: return undefined;
    }
  },

  onEvents,

  validSave: validElementSave,

  result(state) {
    const r = element.elementRecord(state);
    return { wave: state.wave.number, score: r.score, won: r.won, seconds: r.clearSeconds ?? state.tick / TICK_RATE };
  },

  endText(state) {
    const r = element.elementRecord(state);
    const es = elState(state);
    const fixed = es.length === 'full' ? FULL_WAVES : 30;
    const d = DIFFICULTY_NAME[state.difficulty];
    const n = state.wave.number;
    if (r.won && n > fixed) {
      return { won: true, summary: `All ${fixed} Waves cleared on ${d}, then Boss Wave ${n - fixed} ended it`, wave: `Boss ${n - fixed}` };
    }
    if (r.won) return { won: true, summary: `All ${fixed} Waves cleared on ${d}`, wave: String(fixed) };
    return { won: false, summary: `The Run ended on Wave ${n} of ${fixed}`, wave: String(n) };
  },
};
