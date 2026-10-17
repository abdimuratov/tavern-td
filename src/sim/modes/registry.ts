import '../combat/effects';
import { effectHandler } from '../combat/registry';
import type { GameModeRules } from '../core/mode';
import type { AttackSpec, AuraSpec, CreepSpec, TowerSpec, WaveSpec } from '../core/specs';

// Game Modes register by id. Content is checked once here, so the tick can
// trust it and a bad table fails loudly at startup rather than mid-Run.

const modes = new Map<string, GameModeRules>();

/** Registers (or replaces) a Game Mode. Register custom effect kinds first. Throws on bad content. */
export function registerMode<M>(rules: GameModeRules<M>): void {
  const problems = contentProblems(rules as GameModeRules);
  if (problems.length > 0) throw new Error(`Game Mode ${rules.id}: ${problems.join('; ')}`);
  modes.set(rules.id, rules as GameModeRules);
}

export function getMode(id: string): GameModeRules {
  const rules = modes.get(id);
  if (!rules) throw new Error(`Unknown Game Mode: ${id}`);
  return rules;
}

export function hasMode(id: string): boolean {
  return modes.has(id);
}

export function listModes(): string[] {
  return [...modes.keys()];
}

const LAYERS = ['ground', 'air', 'both'];

function finite(v: unknown, min: number): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= min;
}

function attackProblems(name: string, a: AttackSpec): string[] {
  const out: string[] = [];
  const [min, max] = a.damage;
  if (!finite(min, 0) || !finite(max, min)) out.push(`${name}: damage must be [min, max] with 0 ≤ min ≤ max`);
  if (!finite(a.cooldown, 0) || a.cooldown <= 0) out.push(`${name}: cooldown must be positive`);
  if (!finite(a.range, 0)) out.push(`${name}: range must be 0 or more`);
  if (!finite(a.projectileSpeed, 0)) out.push(`${name}: projectileSpeed must be 0 or more`);
  if (!LAYERS.includes(a.targets)) out.push(`${name}: targets must be ground, air or both`);
  for (const e of a.effects ?? []) {
    const h = effectHandler(e.kind);
    if (!h) out.push(`${name}: unknown effect kind ${e.kind}`);
    else if (!h.onAttack && !h.onLaunch && !h.onImpact) out.push(`${name}: effect kind ${e.kind} does nothing on an attack`);
    const problem = h?.validate?.(e) ?? null;
    if (problem) out.push(`${name}: ${problem}`);
  }
  return out;
}

function auraProblems(name: string, a: AuraSpec): string[] {
  const h = effectHandler(a.kind);
  if (!h) return [`${name}: unknown aura kind ${a.kind}`];
  const out: string[] = [];
  if (a.to === 'towers' && !h.towerMods) out.push(`${name}: aura kind ${a.kind} has no effect on towers`);
  if (a.to === 'creeps' && !h.creepMods && !h.tickCreep) out.push(`${name}: aura kind ${a.kind} has no effect on creeps`);
  if (a.to !== 'towers' && a.to !== 'creeps') out.push(`${name}: aura must go to towers or creeps`);
  if (!finite(a.radius, 0) || !finite(a.value, -Infinity)) out.push(`${name}: aura radius and value must be numbers`);
  if (a.targets !== undefined && !LAYERS.includes(a.targets)) out.push(`${name}: aura targets must be ground, air or both`);
  return out;
}

function creepProblems(name: string, c: CreepSpec): string[] {
  const ok = finite(c.hp, 0) && c.hp > 0 && finite(c.armor, -Infinity) && finite(c.speed, 0) && finite(c.bounty, -Infinity)
    && typeof c.flying === 'boolean' && typeof c.armorType === 'string'
    && (c.leakCost === undefined || finite(c.leakCost, 0)) && (c.regen === undefined || finite(c.regen, 0));
  return ok ? [] : [`creep ${name}: hp, armor, armorType, speed, flying, bounty, leakCost or regen is malformed`];
}

export function waveProblems(rules: GameModeRules, wave: WaveSpec, label: string): string[] {
  const out: string[] = [];
  for (const g of wave.groups) {
    if (!Object.hasOwn(rules.creeps, g.creep)) out.push(`${label}: unknown creep ${g.creep}`);
    if (!Number.isInteger(g.count) || g.count < 0) out.push(`${label}: count must be a whole number`);
    if (!finite(g.interval, 0) || (g.delay !== undefined && !finite(g.delay, 0))) out.push(`${label}: interval and delay must be 0 or more`);
  }
  return out;
}

function contentProblems(rules: GameModeRules): string[] {
  const out: string[] = [];
  for (const [id, t] of Object.entries(rules.towers) as [string, TowerSpec][]) {
    if (t.attack) out.push(...attackProblems(`tower ${id}`, t.attack));
    for (const a of t.auras ?? []) out.push(...auraProblems(`tower ${id}`, a));
  }
  for (const [id, c] of Object.entries(rules.creeps) as [string, CreepSpec][]) out.push(...creepProblems(id, c));
  rules.waves?.forEach((w, i) => out.push(...waveProblems(rules, w, `Wave ${i + 1}`)));
  return out;
}
