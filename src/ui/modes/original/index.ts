import { challengeById, challengeOfStage, PERKS, stageByNumber, TARGETINGS, type ChallengeSpec } from '../../../content/original';
import type { PointerKind } from '../../../render/gestures';
import { original, routeCount, type GameState, type Point, type SimEvent } from '../../../sim';
import { DIFFICULTY_NAME } from '../../catalog';
import type { ModeUi, Placement, RunChoices, RunView } from '../../mode-ui';
import { BuildRing } from './BuildRing';
import { campaign, loadCampaignProgress, recordRun, runTalents, stagesCleared } from './campaign';
import { OriginalEnd } from './End';
import { OriginalHowTo } from './HowTo';
import { creepColor, ORIGINAL_LOOK } from './look';
import { OriginalPanel } from './OriginalPanel';
import { OriginalStatus } from './OriginalStatus';
import { OriginalRecords } from './Records';
import { ORIGINAL_REFERENCE } from './reference';
import { buildPicked, cellAtPoint, closeRing, followPlace, groundWhyNot, inPlace, isOpenGround, openRing, placeAt, ring } from './ring';
import { SendNow } from './SendNow';
import { StageSelect } from './StageSelect';
import { BOSS_LINE, creepAbout, creepSpecOf, creepTags, towerSpecOf } from './text';

// The Original's play screen and Campaign: the build ring on Open ground, the
// selected tower's Tiers, Specialisations, targeting and Perks, the Break with
// the early call, and the Stage select, Talents and Stage Records around it.

type OrState = original.OriginalState;

function orState(state: GameState): OrState {
  return state.mode as OrState;
}

const over = (state: GameState): boolean => state.phase === 'won' || state.phase === 'lost';

/**
 * The picked family's Ghost, with its price and range, red with the reason
 * where it can't go. On a phone it stands on the ring's 2 × 2; on the Mac it
 * follows the mouse over the board (followPlace).
 */
function placement(view: RunView, p: Point, kind: PointerKind = 'touch'): Placement | null {
  const r = ring.value;
  const s = view.state;
  const cell = cellAtPoint(s, p);
  if (!r?.family || !cell || over(s)) return null;
  const place = kind === 'mouse' ? followPlace(s, r, p) : inPlace(r.place, cell.col, cell.row) ? r.place : null;
  if (!place) return null;
  const info = original.placeInfo(s, place.col, place.row);
  const option = info.options.find((o) => o.family === r.family);
  const spec = option ? towerSpecOf(option.spec) : undefined;
  if (!option || !spec || info.cells.length === 0) return null;
  return {
    cells: info.cells,
    spec: option.spec,
    command: { type: 'original.build', col: place.col, row: place.row, spec: option.spec },
    error: option.blocked,
    checked: true,
    route: false,
    label: `${option.name} · ${option.price} gold`,
    range: spec.attack ? spec.attack.range : spec.original.auras?.radius ?? 0,
  };
}

/** On the Mac with no family picked: the 2 × 2 of Open ground a click would open the ring on. */
function outline(view: RunView, p: Point): readonly number[] | null {
  const s = view.state;
  const cell = cellAtPoint(s, p);
  const r = ring.value;
  if (r?.family || !cell || !isOpenGround(s, cell.col, cell.row)) return null;
  const at = placeAt(s, p);
  if (!at || (r && at.place.col === r.place.col && at.place.row === r.place.row)) return null;
  return original.placeCells(s, at.place.col, at.place.row);
}

/**
 * Open ground opens the ring on the 2 × 2 a tap snaps to, or moves it there
 * keeping the family. With a family picked, a tap on its Ghost builds, and on
 * the Mac so does a click anywhere on Open ground, where the Ghost follows
 * the pointer. While the ring is up, the road and Scenery close it and say why.
 */
function tapGround(view: RunView, p: Point, kind: PointerKind): boolean {
  const s = view.state;
  if (over(s)) return false;
  const cell = cellAtPoint(s, p);
  if (!cell) return false;
  const r = ring.value;
  const open = isOpenGround(s, cell.col, cell.row);
  if (r?.family) {
    if (inPlace(r.place, cell.col, cell.row)) {
      buildPicked(view, r.place);
      return true;
    }
    if (kind === 'mouse' && open) {
      buildPicked(view, followPlace(s, r, p));
      return true;
    }
  }
  const at = open ? placeAt(s, p) : null;
  if (at) {
    openRing(view, at.place, kind);
    return true;
  }
  if (!r) return false;
  view.say(groundWhyNot(s, cell.col, cell.row) ?? 'Nothing stands there', 'error');
  closeRing(view);
  return true;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): boolean => Number.isInteger(v);

/** The Original's own state in a loaded save: every field this build reads, with values it knows. */
export function validOriginalSave(state: GameState): boolean {
  const m = state.mode as unknown;
  if (!isObj(m)) return false;
  if (!isInt(m.stage) || !stageByNumber(m.stage as number)) return false;
  // Saves from before Challenges have no `challenge` and load as the Stage's own Run.
  if (m.challenge !== undefined && original.challengeProblem(m.challenge, m.stage as number, state.difficulty) !== null) return false;
  if (!Array.isArray(m.talents) || original.talentsProblem(m.talents) !== null) return false;
  if (!isInt(m.cleared) || (m.cleared as number) < 0) return false;
  if (m.waves !== null && !Array.isArray(m.waves)) return false;
  const nums = ['threat', 'breakUntil', 'breakTicks', 'breaks', 'breakAfter', 'completed', 'leaks', 'carry', 'earlyGold', 'startTick', 'endTick'];
  if (!nums.every((k) => isNum(m[k]))) return false;
  if (!isObj(m.towers) || !isObj(m.creeps) || !Array.isArray(m.clouds)) return false;
  const towers = Object.values(m.towers);
  if (!towers.every((t) => isObj(t) && (TARGETINGS as readonly unknown[]).includes(t.targeting)
    && ['spent', 'fresh', 'freshBreak', 'xp', 'level', 'shots', 'perkAt', 'beamOn', 'beamSince'].every((k) => isNum(t[k])))) return false;
  const creeps = Object.values(m.creeps);
  return creeps.every((c) => isObj(c) && Array.isArray(c.touched) && ['threat', 'shield', 'boost', 'boostUntil', 'phase', 'next'].every((k) => isNum(c[k])));
}

function onEvents(view: RunView, events: readonly SimEvent[]): void {
  for (const e of events) {
    if (e.type === 'spawn') {
      const line = Object.hasOwn(BOSS_LINE, e.spec) ? BOSS_LINE[e.spec] : undefined;
      if (line) view.say(line, 'error', 4200);
      continue;
    }
    if (e.type !== 'mode') continue;
    const d = (e.data ?? {}) as { tower?: number; level?: number; perks?: number[]; gold?: number };
    switch (e.name) {
      case 'original.levelUp': {
        // Only the Levels that bring a Perk say so; the number on the tower shows the rest.
        const t = d.tower ? view.state.towers.find((x) => x.id === d.tower) : undefined;
        const info = t ? towerSpecOf(t.spec)?.original : undefined;
        const lv = (d.perks ?? []).filter((l) => l === 5 || l === 10).pop();
        if (t && info && lv) view.say(`${towerSpecOf(t.spec)!.name} reached Level ${lv}: ${PERKS[info.family][lv === 5 ? 0 : 1].name}`, 'ok', 2600);
        break;
      }
      case 'original.earlyCall':
        if ((d.gold ?? 0) > 0) view.say(`Early call: +${d.gold} gold`, 'ok', 1600);
        break;
      case 'original.enrage':
        view.say('The Gravelord enrages', 'error', 2400);
        break;
      case 'original.rift':
        view.say('The Riftlord raises a Shield and calls Hounds', 'error', 2600);
        break;
      default:
        break;
    }
  }
}

/** A Run's choices: its Stage, and `challenge: '1'` when it plays the Stage's Challenge, so Play again and Continue keep it one. */
function choicesOf(state: GameState): RunChoices {
  const m = orState(state);
  return m.challenge === undefined ? { stage: String(m.stage) } : { stage: String(m.stage), challenge: '1' };
}

function stageOf(choices: RunChoices): number {
  const n = Number(choices['stage'] ?? 1);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** The Challenge these choices play, if they ask for the Stage's. */
function challengeOf(choices: RunChoices): ChallengeSpec | undefined {
  return choices['challenge'] === '1' ? challengeOfStage(stageOf(choices)) : undefined;
}

/** The choices in a few words: "The Mill Road", or "Challenge: The Burnt Mill · The Mill Road". */
export function originalOptionsText(choices: RunChoices): string {
  const stage = stageByNumber(stageOf(choices))?.name ?? `Stage ${stageOf(choices)}`;
  const challenge = challengeOf(choices);
  return challenge ? `Challenge: ${challenge.name} · ${stage}` : stage;
}

export const ORIGINAL_UI: ModeUi = {
  modeId: original.ORIGINAL_MODE_ID,
  look: ORIGINAL_LOOK,
  showStartWave: false,
  Status: OriginalStatus,
  Panel: OriginalPanel,
  Footer: SendNow,
  HowTo: OriginalHowTo,
  reference: ORIGINAL_REFERENCE,
  Board: BuildRing,
  End: OriginalEnd,
  Records: OriginalRecords,
  MenuPage: { label: 'Campaign', Page: StageSelect },

  // A Run takes the Stage chosen, or its Challenge, with the Campaign's Talents and Stages finished as they stand when it starts.
  runSettings: (choices) => {
    const challenge = challengeOf(choices);
    return {
      stage: stageOf(choices),
      ...(challenge ? { challenge: challenge.id } : {}),
      talents: runTalents(campaign.value),
      cleared: stagesCleared(campaign.value),
    };
  },
  loadProgress: loadCampaignProgress,
  optionsOf: choicesOf,
  optionsText: originalOptionsText,
  difficultyAbout: (d) => ({
    easy: 'Creeps have 25% less HP',
    normal: 'The Stage as designed',
    hard: 'Creeps have 30% more HP',
    insane: 'Creeps have 60% more HP',
  })[d],

  placement,
  outline,
  tapGround,
  // A tap on a tower selects it, so the ring gives way.
  tapTower(view) {
    closeRing(view);
    return false;
  },
  pending: () => ring.value !== null,
  cancel: closeRing,
  towerReach: (state, tower) => (towerSpecOf(tower.spec)?.attack ? original.attackRange(state, tower) : original.auraRadius(state, tower)),

  hint(view) {
    const s = view.state;
    const st = original.originalStatus(s);
    if (st.step === 'over') return null;
    const r = ring.value;
    if (r) {
      // Something in the way of the ring's 2 × 2, or the Tower cap, before any family is picked; the Ghost says its own.
      const blocked = original.placeInfo(s, r.place.col, r.place.row).error;
      if (blocked) return { text: blocked.charAt(0).toUpperCase() + blocked.slice(1), tone: 'error' };
      return r.family ? null : { text: 'Pick a tower family for this place', tone: 'info' };
    }
    if (s.towers.length === 0) return { text: 'Tap the ground beside the road to build', tone: 'info' };
    if (st.step === 'ready') return { text: 'Send Wave 1 when you are ready', tone: 'info' };
    return null;
  },

  wavePreview(view, index) {
    const w = original.wavePreview(view.state, index + 1);
    if (!w) return null;
    const routes = routeCount(view.state.map);
    return {
      number: w.wave,
      groups: w.groups.map((g) => {
        const spec = creepSpecOf(g.creep);
        const traits = [...(spec ? creepTags(spec) : []), ...(routes > 1 ? [`Route ${g.route + 1}`] : [])];
        const about = [spec ? creepAbout(spec) : '', `${g.hp.toLocaleString('en-US')} HP each`, g.bounty > 0 ? `${g.bounty} gold each` : 'no gold'];
        return {
          creep: g.creep,
          name: g.name,
          count: g.count,
          air: g.flying,
          boss: spec?.original.boss !== undefined,
          swatch: creepColor(g.creep),
          ...(traits.length > 0 ? { traits } : {}),
          about: about.filter(Boolean).join(' · '),
        };
      }),
    };
  },

  feedback(e, state) {
    if (e.type === 'fire') {
      // The Arcane Lance's beam fires ten times a second: one sound would be a buzz.
      const t = state.towers.find((x) => x.id === e.tower);
      return t && towerSpecOf(t.spec)?.original.beam ? { sound: null, haptic: null } : undefined;
    }
    if (e.type !== 'mode') return undefined;
    switch (e.name) {
      case 'original.levelUp': return (e.data as { perks?: number[] }).perks?.length ? { sound: 'levelUp', haptic: 'confirm' } : { sound: 'levelUp', haptic: null };
      case 'original.earlyCall':
      case 'original.sold': return { sound: 'resource', haptic: null };
      case 'original.split':
      case 'original.cloud':
      case 'original.shatter': return { sound: 'splash', haptic: null };
      case 'original.enrage':
      case 'original.rift':
      case 'original.brood': return { sound: 'summon', haptic: 'tap' };
      default: return undefined;
    }
  },

  onEvents,
  upgradeSave: original.upgradeSave,
  validSave: validOriginalSave,

  endText(state) {
    const r = original.originalResult(state);
    const name = stageByNumber(r.stage)?.name ?? `Stage ${r.stage}`;
    const challenge = r.challenge === null ? undefined : challengeById(r.challenge);
    const lives = `${r.lives} ${r.lives === 1 ? 'life' : 'lives'} left`;
    if (challenge) {
      return r.won
        ? { won: true, summary: `Challenge won: ${challenge.name}, with ${lives}`, wave: `${state.wave.total}/${state.wave.total}` }
        : { won: false, summary: `The Challenge fell on Wave ${state.wave.number} of ${state.wave.total}`, wave: `${state.wave.number}/${state.wave.total}` };
    }
    if (r.won) {
      return {
        won: true,
        summary: `${name} held on ${DIFFICULTY_NAME[state.difficulty]} with ${lives}`,
        wave: `${state.wave.total}/${state.wave.total}`,
      };
    }
    return { won: false, summary: `The road fell on Wave ${state.wave.number} of ${state.wave.total}`, wave: `${state.wave.number}/${state.wave.total}` };
  },

  finish: recordRun,
};
