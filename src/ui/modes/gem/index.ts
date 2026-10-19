import { BOSS, ROCK } from '../../../content/gem';
import { footprintAt } from '../../../render/footprint';
import { cellCol, cellRow, findTower, gem, TICK_RATE, type GameState, type SimEvent } from '../../../sim';
import { defaultWavePreview, type ModeUi, type Placement, type RunView, type StructureMark } from '../../mode-ui';
import { GemActions } from './GemActions';
import { GemHowTo } from './HowTo';
import { GemPanel } from './GemPanel';
import { GemStatus } from './GemStatus';
import { DRAFT_GHOST, GEM_LOOK } from './look';
import { extraChanceOpen, movingSlate, swapFrom } from './picks';
import { GEM_REFERENCE } from './reference';
import { specName, specOf } from './text';

// Gem's play screen: Draft placement with a 2×2 ghost, the Draft choice, the
// field actions (upgrade, fuse, swap, move a slate, remove a Rock), Gem Quality
// and Extra Chance, and the marks that say what wants attention.

const MARK = {
  draft: 0xfff0c0,
  merge: 0x7cf29c,
  recipe: 0xffc94a,
  slate: 0x6fd6ff,
} as const;

function gemState(state: GameState): gem.GemState {
  return state.mode as gem.GemState;
}

function slatePlacement(view: RunView, p: { x: number; y: number }): Placement | null {
  const s = view.state;
  const slate = findTower(s, movingSlate.value);
  if (!slate) return null;
  const cells = footprintAt(s.map, p, 2);
  if (!cells) return null;
  const col = cellCol(s.map, cells[0]!);
  const row = cellRow(s.map, cells[0]!);
  return {
    cells,
    spec: slate.spec,
    command: { type: 'gem.moveSlate', tower: slate.id, col, row },
    error: gem.slateMoveError(s, slate, col, row),
    checked: true,
    route: false,
    label: `Move ${specName(slate.spec)} here`,
  };
}

function marks(state: GameState): StructureMark[] {
  const gs = gemState(state);
  const out: StructureMark[] = [];
  if (state.phase === 'build') {
    const hl = gem.draftHighlights(state);
    for (const id of gs.draft) {
      out.push({ tower: id, color: MARK.draft, style: 'brackets' });
      const color = hl.recipe.includes(id) ? MARK.recipe : hl.merge.includes(id) ? MARK.merge : hl.slate.includes(id) ? MARK.slate : null;
      if (color !== null) out.push({ tower: id, color, style: 'ring', pulse: true });
    }
  }
  for (const t of state.towers) {
    const ts = Object.hasOwn(gs.towers, String(t.id)) ? gs.towers[String(t.id)] : undefined;
    if (ts && ts.combine !== '' && !gs.draft.includes(t.id)) out.push({ tower: t.id, color: MARK.recipe, style: 'ring', pulse: true });
  }
  return out;
}

function lastDraftGem(state: GameState): number {
  return gemState(state).draft.at(-1) ?? 0;
}

function onEvents(view: RunView, events: readonly SimEvent[]): void {
  for (const e of events) {
    if (e.type === 'mode') {
      if (e.name === 'gem.draftReady') {
        // The choice panel opens on the gem just placed, so a phone needs one tap less.
        view.select(lastDraftGem(view.state));
      } else if (e.name === 'gem.kept') {
        // The Wave is on; whatever was selected is probably a Rock now.
        view.select(0);
      } else if (e.name === 'gem.recipeReady') {
        const data = e.data as { spec?: string };
        view.say(`Recipe ready: ${specName(data.spec ?? '')}. Fuse it during a Wave`, 'ok');
      } else if (e.name === 'gem.swapped') {
        swapFrom.value = 0;
      } else if (e.name === 'gem.slateMoved') {
        if (!(e.data as { pushed?: boolean }).pushed) movingSlate.value = 0;
      }
    } else if (e.type === 'rejected') {
      if (e.command.type === 'gem.swap') swapFrom.value = 0;
      if (e.command.type === 'gem.moveSlate') movingSlate.value = 0;
    } else if (e.type === 'removed') {
      if (e.tower === swapFrom.value) swapFrom.value = 0;
    }
  }
}

export const GEM_UI: ModeUi = {
  modeId: gem.GEM_MODE_ID,
  look: GEM_LOOK,
  showLives: false,
  showStartWave: false,
  Status: GemStatus,
  Actions: GemActions,
  Panel: GemPanel,
  HowTo: GemHowTo,
  reference: GEM_REFERENCE,

  placement(view, p) {
    if (movingSlate.value !== 0) return slatePlacement(view, p);
    if (swapFrom.value !== 0) return null;
    const s = view.state;
    const status = gem.gemStatus(s);
    if (status.step !== 'draft') return null;
    const cells = footprintAt(s.map, p, 2);
    if (!cells) return null;
    const col = cellCol(s.map, cells[0]!);
    const row = cellRow(s.map, cells[0]!);
    const spot = gem.draftSpot(s, col, row);
    return {
      cells: spot.cells,
      command: { type: 'gem.placeDraft', col, row },
      error: spot.error,
      checked: true,
      look: DRAFT_GHOST,
      label: `Place gem ${status.placed + 1} of ${status.draftSize}`,
    };
  },

  tapTower(view, tower) {
    if (movingSlate.value !== 0) {
      movingSlate.value = 0;
      return false;
    }
    const from = swapFrom.value;
    if (from === 0) return false;
    swapFrom.value = 0;
    if (tower.id !== from) {
      view.send({ type: 'gem.swap', a: from, b: tower.id });
      view.select(tower.id);
    }
    return true;
  },

  pending: () => swapFrom.value !== 0 || movingSlate.value !== 0 || extraChanceOpen.value,

  cancel() {
    swapFrom.value = 0;
    movingSlate.value = 0;
    extraChanceOpen.value = false;
  },

  hint(view) {
    const s = view.state;
    if (swapFrom.value !== 0) {
      const t = findTower(s, swapFrom.value);
      return { text: `Pick what to swap with ${t ? specName(t.spec) : 'it'}`, tone: 'info' };
    }
    if (movingSlate.value !== 0) return { text: 'Pick where the slate goes', tone: 'info' };
    const status = gem.gemStatus(s);
    if (status.step === 'choose') return { text: `Pick a Draft gem to keep. That starts Wave ${status.nextWave}`, tone: 'info' };
    if (status.step === 'draft' && status.placed === 0 && status.wave === 0) {
      return { text: 'Place 5 gems on the field to build your maze', tone: 'info' };
    }
    return null;
  },

  marks,

  wavePreview(view, index) {
    const w = defaultWavePreview(view.state, index);
    if (!w) return null;
    return {
      ...w,
      groups: w.groups.map((g) => (g.creep === BOSS ? { ...g, boss: true, tag: 'Damage Test' } : { ...g, boss: false })),
    };
  },

  feedback(e) {
    if (e.type === 'changed') {
      if (e.spec === ROCK) return { sound: 'rock', haptic: null };
      // An upgrade climbs its line; anything else is a Draft choice or a fused Recipe.
      return specOf(e.from)?.gem.next === e.spec ? { sound: 'upgrade', haptic: 'confirm' } : { sound: 'merge', haptic: 'confirm' };
    }
    if (e.type === 'removed') return { sound: 'rock', haptic: 'tap' };
    if (e.type === 'mode') {
      if (e.name === 'gem.quality') return { sound: 'upgrade', haptic: 'confirm' };
      if (e.name === 'gem.swapped') return { sound: 'place', haptic: 'confirm' };
      if (e.name === 'gem.extraChance') return { sound: 'click', haptic: 'tap' };
    }
    return undefined;
  },

  onEvents,

  validSave(state) {
    const m = state.mode as Partial<gem.GemState> | null;
    const isObj = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v);
    return isObj(m) && Array.isArray(m!.draft) && typeof m!.quality === 'number' && typeof m!.mana === 'number'
      && isObj(m!.extra) && Array.isArray(m!.extra!.rolls) && isObj(m!.parts) && isObj(m!.towers) && Array.isArray(m!.blasts)
      && m!.draft.every((id) => state.towers.some((t) => t.id === id));
  },

  result(state) {
    const r = gem.gemRecord(state);
    return { wave: r.wave, score: r.score, won: r.won, seconds: r.clearSeconds ?? state.tick / TICK_RATE };
  },
};
