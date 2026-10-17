import { PERKS, stageByNumber, TARGETINGS } from '../../../content/original';
import { buildSpotCells, original, routeCount, type GameState, type SimEvent } from '../../../sim';
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
import { buildPicked, closeRing, openRing, ring, spotAtPoint } from './ring';
import { SendNow } from './SendNow';
import { StageSelect } from './StageSelect';
import { BOSS_LINE, creepAbout, creepSpecOf, creepTags, towerSpecOf } from './text';

// The Original's play screen and Campaign: the build ring on Build Spots, the
// selected tower's Tiers, Specialisations, targeting and Perks, the Break with
// the early call, and the Stage select, Talents and Stage Records around it.

type OrState = original.OriginalState;

function orState(state: GameState): OrState {
  return state.mode as OrState;
}

const over = (state: GameState): boolean => state.phase === 'won' || state.phase === 'lost';

/** The picked family's Ghost on the ring's Build Spot, with its price and range; nothing elsewhere. */
function placement(view: RunView, p: { x: number; y: number }): Placement | null {
  const r = ring.value;
  const s = view.state;
  if (!r?.family || spotAtPoint(s, p) !== r.spot) return null;
  const option = original.spotInfo(s, r.spot).options.find((o) => o.family === r.family);
  const spec = option ? towerSpecOf(option.spec) : undefined;
  if (!option || !spec) return null;
  return {
    cells: buildSpotCells(s.map, r.spot),
    spec: option.spec,
    command: { type: 'original.build', spot: r.spot, spec: option.spec },
    error: option.blocked,
    checked: true,
    route: false,
    label: `${option.name} · ${option.price} gold`,
    range: spec.attack ? spec.attack.range : spec.original.auras?.radius ?? 0,
  };
}

/** An empty Build Spot opens the ring; the ring's own Spot builds its pick; anywhere else closes it. */
function tapGround(view: RunView, p: { x: number; y: number }, kind: Parameters<NonNullable<ModeUi['tapGround']>>[2]): boolean {
  const s = view.state;
  if (over(s)) return false;
  const spot = spotAtPoint(s, p);
  const r = ring.value;
  if (spot >= 0 && r?.spot === spot && r.family) {
    buildPicked(view);
    return true;
  }
  if (spot >= 0 && original.spotInfo(s, spot).tower === 0) {
    openRing(view, spot, kind);
    return true;
  }
  if (r) {
    closeRing(view);
    return true;
  }
  return false;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): boolean => Number.isInteger(v);

/** The Original's own state in a loaded save: every field this build reads, with values it knows. */
export function validOriginalSave(state: GameState): boolean {
  const m = state.mode as unknown;
  if (!isObj(m)) return false;
  if (!isInt(m.stage) || !stageByNumber(m.stage as number)) return false;
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

function choicesOf(state: GameState): RunChoices {
  return { stage: String(orState(state).stage) };
}

function stageOf(choices: RunChoices): number {
  const n = Number(choices['stage'] ?? 1);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export const ORIGINAL_UI: ModeUi = {
  modeId: original.ORIGINAL_MODE_ID,
  look: ORIGINAL_LOOK,
  showStartWave: false,
  Status: OriginalStatus,
  Panel: OriginalPanel,
  Footer: SendNow,
  HowTo: OriginalHowTo,
  Board: BuildRing,
  End: OriginalEnd,
  Records: OriginalRecords,
  MenuPage: { label: 'Campaign', Page: StageSelect },

  // A Run takes the Stage chosen, with the Campaign's Talents and Stages finished as they stand when it starts.
  runSettings: (choices) => ({ stage: stageOf(choices), talents: runTalents(campaign.value), cleared: stagesCleared(campaign.value) }),
  loadProgress: loadCampaignProgress,
  optionsOf: choicesOf,
  optionsText: (c) => stageByNumber(stageOf(c))?.name ?? `Stage ${stageOf(c)}`,
  difficultyAbout: (d) => ({
    easy: 'Creeps have 25% less HP',
    normal: 'The Stage as designed',
    hard: 'Creeps have 30% more HP',
    insane: 'Creeps have 60% more HP',
  })[d],

  placement,
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
    if (r && !r.family) return { text: 'Pick a tower family for this Build Spot', tone: 'info' };
    if (r) return null;
    if (s.towers.length === 0) return { text: 'Tap a Build Spot beside the road to build', tone: 'info' };
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
  validSave: validOriginalSave,

  endText(state) {
    const r = original.originalResult(state);
    const name = stageByNumber(r.stage)?.name ?? `Stage ${r.stage}`;
    if (r.won) {
      return {
        won: true,
        summary: `${name} held on ${DIFFICULTY_NAME[state.difficulty]} with ${r.lives} ${r.lives === 1 ? 'life' : 'lives'} left`,
        wave: `${state.wave.total}/${state.wave.total}`,
      };
    }
    return { won: false, summary: `The road fell on Wave ${state.wave.number} of ${state.wave.total}`, wave: `${state.wave.number}/${state.wave.total}` };
  },

  finish: recordRun,
};
