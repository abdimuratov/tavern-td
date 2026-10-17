// The game logic's public surface. Outer layers (render, ui, app) import from here only.

export { TICK_RATE, CELL, DEFAULT_ARMOR_FACTOR, DEFAULT_DIFFICULTY_HP } from './core/constants';
export type { Json, Cell } from './core/types';
export type {
  GameState, Creep, Tower, Projectile, Status, Difficulty, Phase, WaveState, ActiveWave, SpawnGroup,
} from './core/state';
export { DIFFICULTIES } from './core/state';
export type {
  MapSpec, TowerSpec, AttackSpec, CreepSpec, AuraSpec, EffectSpec, WaveSpec, WaveGroup, DamageTable, TargetLayer,
  SplashEffect, SlowEffect, PoisonEffect, ArmorEffect, StunEffect, CritEffect, MultishotEffect, CustomEffect,
} from './core/specs';
export type { SimEvent, HitKind } from './core/events';
export type { Command, CoreCommand, ModeCommand, StartWaveCommand } from './core/commands';
export { reject, intArg, numberArg, stringArg, hasSpec } from './core/commands';
export type { GameModeRules, RunOptions, LeakOutcome, Sim } from './core/mode';

export { createRun } from './core/run';
export { step, advance } from './core/step';
export { snapshot, restore, hashState, fnv1a } from './core/snapshot';
export { replay, replayHash, type Replay, type ReplayEntry } from './core/replay';
export { startNextWave } from './core/waves';
export { powDet } from './core/math';
export { createRng, nextFloat, nextInt, nextU32, type RngState } from './core/rng';

export { registerMode, getMode, hasMode, listModes } from './modes/registry';

export { setMap, validateMap, cellOf, cellCol, cellRow, cellCentre, type Point } from './path/grid';
export { routeCells, previewRoute, airRoute, pathDistance, nextCell } from './path/flow';
export { placementError, wouldBlock, type PlacementError } from './path/block';

export {
  registerEffect, effectHandler,
  type EffectHandler, type Attack, type Shot, type Impact, type CreepMods, type TowerMods,
} from './combat/registry';
export { rollChance } from './combat/effects';
export { applyStatus, statusTicks } from './combat/status';
export { creepMods, towerMods } from './combat/mods';
export { armorMultiplier, typeMultiplier, damageCreep, killCreep, WC3_DAMAGE_TABLE } from './combat/damage';
export { addTower, removeTower, setTowerSpec, resolveImpact } from './combat/towers';
export { spawnCreep, type SpawnOptions } from './combat/creeps';
export { canHit, findCreep, findTower, closestCreep, nearestCreeps } from './combat/targeting';

export { earnGold, spendGold, canAfford, loseLives, gainLives } from './economy';
