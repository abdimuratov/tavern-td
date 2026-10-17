import { FATAL_LEAK_WAVE, GEM_CREEPS, GEM_DAMAGE_TABLE, GEM_MAP, GEM_WAVES, WAVE_COUNT } from '../../../content/gem';
import { intArg, reject, stringArg, type Command } from '../../core/commands';
import type { SimEvent } from '../../core/events';
import type { GameModeRules } from '../../core/mode';
import { earnGold } from '../../economy';
import { setMap } from '../../path/grid';
import { regenMana, runBarrages, runBlasts, runBurns, runKillBuffs } from './abilities';
import {
  choosing, downgradeResult, draftComboSlate, draftRecipe, draftSlate, finalizeDraft, inDraft, mergeResult,
  placeDraftGem, type MergeCount,
} from './draft';
import { scheduleBlast } from './effects';
import {
  buyQuality, combineField, extraChanceError, fieldRecipeError, moveSlate, qualityError, removeRock, rockError,
  setExtraChance, slateMoveError, swapError, swapTowers, towerById, upgradeError, upgradeSpecial,
} from './field';
import { GEM_MODE_ID, GEM_TOWERS, START_GOLD, SWAP_MANA, gemState, makeSim, type GemState } from './state';

// The Gem Game Mode: Gem TD+ (nvs/gem 1.6.14) as Tavern TD rules. Commands are
// `gem.*`; each checks its arguments and the moment, and on refusal emits
// `rejected` with a one-line reason.

/** Gem's commands. Tower arguments are tower ids; (col, row) is a footprint's top-left cell. */
export type GemCommand =
  /** Build phase: place the next of five Draft gems. */
  | { readonly type: 'gem.placeDraft'; readonly col: number; readonly row: number }
  /** After the fifth: keep this Draft gem as it is. */
  | { readonly type: 'gem.keep'; readonly tower: number }
  /** …keep it one quality lower. */
  | { readonly type: 'gem.downgrade'; readonly tower: number }
  /** …merge `count` identical Draft gems into it. */
  | { readonly type: 'gem.merge'; readonly tower: number; readonly count: MergeCount }
  /** …turn it into the special the Draft's Recipe makes; or, during a Wave, fuse this tower's field Recipe. */
  | { readonly type: 'gem.combineRecipe'; readonly tower: number }
  /** …keep this Normal gem as its base slate. */
  | { readonly type: 'gem.keepSlate'; readonly tower: number }
  /** …turn it into the combination slate when the Draft makes both base slates. */
  | { readonly type: 'gem.combineSlate'; readonly tower: number }
  /** Any time: remove a Rock (free, one per 2 s). */
  | { readonly type: 'gem.removeRock'; readonly tower: number }
  /** During a Wave: upgrade a special to its next tier. */
  | { readonly type: 'gem.upgradeSpecial'; readonly tower: number }
  /** Any time: research the next Gem Quality. */
  | { readonly type: 'gem.buyQuality' }
  /** Before a round's first Draft gem, at Gem Quality 8: target a gem type or base slate; '' clears it. */
  | { readonly type: 'gem.extraChance'; readonly target: string }
  /** Spend all builder mana to swap two structures: Draft gems and Rocks between Waves, towers and Rocks during one. */
  | { readonly type: 'gem.swap'; readonly a: number; readonly b: number }
  /** During a Wave: teleport a slate once. */
  | { readonly type: 'gem.moveSlate'; readonly tower: number; readonly col: number; readonly row: number };

export const GEM_COMMANDS: readonly GemCommand['type'][] = [
  'gem.placeDraft', 'gem.keep', 'gem.downgrade', 'gem.merge', 'gem.combineRecipe', 'gem.keepSlate', 'gem.combineSlate',
  'gem.removeRock', 'gem.upgradeSpecial', 'gem.buyQuality', 'gem.extraChance', 'gem.swap', 'gem.moveSlate',
];

type State = Parameters<NonNullable<GameModeRules<GemState>['handleCommand']>>[0];

function newState(): GemState {
  return {
    draft: [],
    quality: 0,
    mana: SWAP_MANA,
    extra: { target: '', bonus: 0, previous: '', previousBonus: 0, rolls: [] },
    parts: {},
    towers: {},
    blasts: [],
    waveDamage: 0,
    startTick: -1,
    wonTick: -1,
    starting: false,
  };
}

/** A Draft-choice command's tower, or a reason it can't be chosen now. */
function draftTower(state: State, command: Command): ReturnType<typeof towerById> | string {
  const tower = towerById(state, intArg(command, 'tower'));
  if (!tower || !inDraft(state, tower.id)) return 'pick one of this round\'s Draft gems';
  if (!choosing(state)) return 'place all five Draft gems first';
  return tower;
}

function handle(state: State, command: Command, events: SimEvent[]): void {
  const no = (reason: string): void => reject(events, command, reason);
  switch (command.type) {
    case 'gem.placeDraft': {
      const col = intArg(command, 'col');
      const row = intArg(command, 'row');
      if (col === null || row === null) return no('placeDraft needs col and row');
      const refused = placeDraftGem(state, col, row, events);
      if (refused) no(refused);
      return;
    }
    case 'gem.keep':
    case 'gem.downgrade':
    case 'gem.merge':
    case 'gem.keepSlate':
    case 'gem.combineSlate': {
      const tower = draftTower(state, command);
      if (typeof tower === 'string' || !tower) return no(typeof tower === 'string' ? tower : 'no such structure');
      let spec: string | null = tower.spec;
      if (command.type === 'gem.downgrade') {
        spec = downgradeResult(tower);
        if (!spec) return no('a Chipped gem can\'t be downgraded');
      } else if (command.type === 'gem.merge') {
        const count = intArg(command, 'count');
        if (count !== 2 && count !== 3 && count !== 4) return no('merge count must be 2, 3 or 4');
        spec = mergeResult(state, tower, count);
        if (!spec) return no(count === 3 ? 'merging ×3 needs exactly 3 identical Draft gems' : `merging ×${count} needs ${count} identical Draft gems`);
      } else if (command.type === 'gem.keepSlate') {
        spec = draftSlate(state, tower)?.id ?? null;
        if (!spec) return no('this Draft can\'t make a slate from that gem');
      } else if (command.type === 'gem.combineSlate') {
        spec = draftComboSlate(state, tower);
        if (!spec) return no('this Draft can\'t make both slates of a pair');
      }
      finalizeDraft(state, tower, spec, command.type.slice(4), events);
      return;
    }
    case 'gem.combineRecipe': {
      const tower = towerById(state, intArg(command, 'tower'));
      if (!tower) return no('no such structure');
      if (inDraft(state, tower.id)) {
        if (!choosing(state)) return no('place all five Draft gems first');
        const special = draftRecipe(state);
        if (!special) return no('this Draft holds no Recipe');
        finalizeDraft(state, tower, special, 'combineRecipe', events);
        return;
      }
      const refused = fieldRecipeError(state, tower);
      if (refused) return no(refused);
      combineField(state, tower, events);
      return;
    }
    case 'gem.removeRock': {
      const tower = towerById(state, intArg(command, 'tower'));
      const refused = rockError(state, tower);
      if (refused || !tower) return no(refused ?? 'not a Rock');
      removeRock(state, tower, events);
      return;
    }
    case 'gem.upgradeSpecial': {
      const tower = towerById(state, intArg(command, 'tower'));
      if (!tower) return no('no such structure');
      const refused = upgradeError(state, tower);
      if (refused) return no(refused);
      upgradeSpecial(state, tower, events);
      return;
    }
    case 'gem.buyQuality': {
      const refused = qualityError(state);
      if (refused) return no(refused);
      buyQuality(state, events);
      return;
    }
    case 'gem.extraChance': {
      const target = stringArg(command, 'target');
      if (target === null) return no('extraChance needs a target (\'\' clears it)');
      const refused = extraChanceError(state, target);
      if (refused) return no(refused);
      setExtraChance(state, target, events);
      return;
    }
    case 'gem.swap': {
      const a = towerById(state, intArg(command, 'a'));
      const b = towerById(state, intArg(command, 'b'));
      const refused = swapError(state, a, b);
      if (refused || !a || !b) return no(refused ?? 'no such structure');
      swapTowers(state, a, b, events);
      return;
    }
    case 'gem.moveSlate': {
      const tower = towerById(state, intArg(command, 'tower'));
      const col = intArg(command, 'col');
      const row = intArg(command, 'row');
      if (col === null || row === null) return no('moveSlate needs col and row');
      const refused = slateMoveError(state, tower, col, row);
      if (refused || !tower) return no(refused ?? 'not a slate');
      moveSlate(state, tower, col, row, events);
      return;
    }
  }
}

function isGemCommand(type: string): type is GemCommand['type'] {
  return (GEM_COMMANDS as readonly string[]).includes(type);
}

/** Damage a creep of the latest Wave has taken so far. */
function damageTaken(creep: { maxHp: number; hp: number }): number {
  return creep.maxHp - Math.max(0, creep.hp);
}

export const GEM_RULES: GameModeRules<GemState> = {
  id: GEM_MODE_ID,
  towers: GEM_TOWERS,
  creeps: GEM_CREEPS,
  damageTable: GEM_DAMAGE_TABLE,
  waves: GEM_WAVES,
  setup(state, opts) {
    setMap(state, typeof opts.map === 'object' ? opts.map : GEM_MAP);
    state.gold = START_GOLD;
    // No lives in Gem TD+: one stands for "the Run goes on", and a leak from Wave 10 on costs it.
    state.lives = 1;
    state.wave.total = WAVE_COUNT;
    state.mode = newState();
  },
  handleCommand(state, command, events) {
    if (!isGemCommand(command.type)) return false;
    handle(state, command, events);
    return true;
  },
  canStartWave: (state) => (gemState(state).starting ? null : 'keep a gem from your Draft to start the Wave'),
  onTick(state, events) {
    const sim = makeSim(state, events);
    regenMana(sim);
    if (state.phase !== 'wave') return;
    runKillBuffs(sim);
    runBlasts(sim);
    runBarrages(sim);
    runBurns(sim);
  },
  onWaveStart(state, wave) {
    const gs = gemState(state);
    gs.waveDamage = 0;
    if (wave === 1) gs.startTick = state.tick;
  },
  onWaveEnd(state, wave, events) {
    const gs = gemState(state);
    earnGold(state, 5 + 2 * wave, events);
    gs.mana = Math.min(SWAP_MANA, gs.mana + 1);
    // Explosions still waiting would otherwise go off in the next Wave.
    gs.blasts = [];
    if (wave >= WAVE_COUNT) gs.wonTick = state.tick;
  },
  onKill(state, creep, _tower, events) {
    const gs = gemState(state);
    if (creep.wave === state.wave.number) gs.waveDamage += creep.maxHp;
    scheduleBlast(makeSim(state, events), creep);
  },
  onLeak(state, creep) {
    const gs = gemState(state);
    if (creep.wave === state.wave.number) gs.waveDamage += damageTaken(creep);
    // Free (bar the lost bounty) before Wave 10; from then on a leak ends the Run.
    return { lives: creep.wave >= FATAL_LEAK_WAVE ? 1 : 0, then: 'remove' };
  },
};
