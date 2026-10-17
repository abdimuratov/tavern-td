import { ELEMENT_TOWERS, type EphemeralHit, type TowerAbility } from '../../../content/element';
import { cooldownTicks, towerMods } from '../../combat/mods';
import { applyStatus } from '../../combat/status';
import { addTower, removeTower } from '../../combat/towers';
import { AURA_TICKS, CELL, TICK_RATE } from '../../core/constants';
import type { Sim } from '../../core/mode';
import type { Creep, GameState, Tower } from '../../core/state';
import { footprintCells, mapData } from '../../path/grid';
import {
  FAERIE, FIRE_UP, LIFE_BONUS, MAGIC_RANGE, PHASING, SPRING, STATUS, abilityDamage, applySlow, blast, creepsInArea, deal,
  distance2, hasStatus, isDead, liveCreep, removeStatus, setStatus, splash, statusValue, targetable,
} from './combat';
import {
  creepState, elState, isBuilt, isClone, modeEvent, newTowerState, peekTower, towerInfoOf, towerState,
  type ElementTimer,
} from './state';

// What Element towers do every tick beyond their attacks (§3.4–3.8): stack
// lapses, Life's bonus, Ephemeral's phasing, support casts, autocasts, Vapor's
// pulse and Windstorm's tornadoes, Trickery copies running out, and the timers
// their hits left behind. Runs from the Game Mode's onTick, before creeps move.

const SECOND = TICK_RATE;
/** The port polls pulses, tornadoes and autocasts every 0.1 s. */
const POLL = 3;

export function runTowerAbilities(sim: Sim): void {
  const { state } = sim;
  const tick = state.tick;
  const expired: Tower[] = [];
  for (const t of state.towers) {
    const info = towerInfoOf(t.spec);
    if (!info) continue;
    const ts = towerState(state, t);
    if (ts.clone && tick >= ts.clone.until) {
      expired.push(t);
      continue;
    }
    if (ts.vengeance.length > 0) ts.vengeance = ts.vengeance.filter((until) => until > tick);
    switch (info.family) {
      case 'magic':
        if (ts.stacks > 0 && tick - ts.lastAt >= 2 * SECOND) {
          ts.stacks = 0;
          removeStatus(t.status, MAGIC_RANGE);
        }
        break;
      case 'tidal':
        if (ts.stacks > 0 && tick - ts.lastAt >= 2 * SECOND) ts.stacks = 0;
        break;
      case 'haste':
        if (ts.stacks > 0 && tick - ts.lastAt >= 4 * SECOND) ts.stacks = 0;
        break;
      case 'life':
        // LifeTower.lua: +50% base damage while lives are at the Map's 50 or fewer.
        if (state.lives <= 50) applyStatus(t.status, 'damage', LIFE_BONUS, 0.5, AURA_TICKS, t.id);
        break;
      case 'ephemeral':
        phasing(state, t);
        break;
    }
    if (!info.ability || tick < ts.ready) continue;
    runAbility(sim, t, info.ability, info.level);
  }
  for (const t of expired) removeClone(sim, t);
}

/** Ephemeral (EphemeralTower.lua): its 1 s timer adds a stack while it keeps firing; the buff lapsing resets it. */
function phasing(state: GameState, t: Tower): void {
  const ts = towerState(state, t);
  const hit = ELEMENT_TOWERS[t.spec]?.attack?.effects?.[0] as EphemeralHit | undefined;
  const max = hit?.maxStacks ?? 0;
  const tick = state.tick;
  if (ts.timer >= 0 && tick >= ts.timer) {
    if (ts.lastAt >= 0 && tick - ts.lastAt <= 2 * SECOND && ts.stacks < max) {
      if (ts.activeUntil < 0) ts.activeUntil = tick + 2 * SECOND;
      ts.stacks++;
    }
    ts.timer += SECOND;
  }
  if (ts.activeUntil >= 0 && tick >= ts.activeUntil) {
    ts.stacks = 0;
    ts.activeUntil = -1;
    ts.timer = -1;
  }
  // assumed: −10% base damage per stack, as the tooltip says (the engine may apply it once).
  if (ts.stacks > 0) setStatus(t.status, 'damage', PHASING, -0.1 * ts.stacks, AURA_TICKS, t.id);
  else removeStatus(t.status, PHASING);
}

function runAbility(sim: Sim, t: Tower, a: TowerAbility, level: number): void {
  const { state } = sim;
  const ts = towerState(state, t);
  const tick = state.tick;
  const since = tick - ts.ready;
  switch (a.kind) {
    case 'fireUp':
    case 'springForward':
    case 'conjure':
      // Support towers think once a second after building (the port's first think is 0 or 1 s; assumed 1 s).
      if (since > 0 && since % SECOND === 0 && ts.castAt <= tick) {
        if (a.kind === 'conjure') conjure(sim, t, a);
        else buff(sim, t, a);
      }
      return;
    // assumed: autocasts and pulses are checked every tick or every 0.1 s, and may act as soon as the tower is built.
    case 'faerieFire':
    case 'frostbite': {
      if (ts.castAt > tick) return;
      const target = highestHp(state, t, a.range, (c) => (a.kind === 'faerieFire' ? !hasStatus(c.status, FAERIE) : creepState(state, c).frost === null));
      if (!target) return;
      if (a.kind === 'faerieFire') {
        applyStatus(target.status, STATUS.faerie, FAERIE, level, Math.round(a.duration * SECOND), t.id);
      } else {
        // HP removal, not damage: no element, amplification or kill (PolarTower.lua).
        const amount = Math.floor((target.hp * a.pct) / 100);
        target.hp -= amount;
        creepState(state, target).frost = { amount, until: tick + Math.round(a.duration * SECOND) };
      }
      modeEvent(sim.events, `element.${a.kind}`, { tower: t.id, creep: target.id });
      ts.castAt = tick + Math.round(a.cooldown * SECOND);
      return;
    }
    case 'magicAttack': {
      if (ts.castAt > tick || ts.activeUntil >= tick) return;
      const range = (towerInfoOf(t.spec)?.range ?? 0) + 50;
      if (creepsInArea(state, t.x, t.y, range).length === 0) return;
      ts.activeUntil = tick + Math.round(a.duration * SECOND);
      ts.castAt = tick + Math.round(a.cooldown * SECOND);
      modeEvent(sim.events, 'element.magicAttack', { tower: t.id, until: ts.activeUntil });
      return;
    }
    case 'pulse': {
      if (since % POLL !== 0 || ts.castAt > tick) return;
      const hit = creepsInArea(state, t.x, t.y, a.radius);
      if (hit.length === 0) return;
      // VaporTower.lua; the port counts creeps with `#` on a table with holes, we count them properly.
      const damage = abilityDamage(state, t.id, a.base) + hit.length * abilityDamage(state, t.id, a.perCreep);
      modeEvent(sim.events, 'element.pulse', { tower: t.id, x: t.x, y: t.y, radius: a.radius });
      for (const c of hit) deal(sim, c, damage, t.id, 'water', 'splash');
      ts.castAt = tick + Math.max(1, Math.round(cooldownTicks(a.cooldown, towerMods(t).attackSpeed)));
      return;
    }
    case 'tornado': {
      if (since % POLL !== 0 || ts.castAt > tick) return;
      const target = closest(state, t, a.range);
      if (!target) return;
      const tornado = {
        tower: t.id, x: target.x, y: target.y, target: target.id, damage: abilityDamage(state, t.id, a.damage), radius: a.radius,
        speed: a.speed, slow: a.slow, level, born: tick, end: tick + Math.round(a.duration * SECOND),
      };
      elState(state).tornadoes.push(tornado);
      for (const c of creepsInArea(state, tornado.x, tornado.y, tornado.radius)) applySlow(c, 'tornado', tornado.slow, 1, t.id);
      modeEvent(sim.events, 'element.tornado', { tower: t.id, x: tornado.x, y: tornado.y, target: target.id });
      ts.castAt = tick + Math.max(1, Math.round(cooldownTicks(a.cooldown, towerMods(t).attackSpeed)));
      return;
    }
  }
}

/** The targetable creep with the most HP within `range` of the tower that passes `ok`; the lowest id on a tie. */
function highestHp(state: GameState, t: Tower, range: number, ok: (c: Creep) => boolean): Creep | null {
  let best: Creep | null = null;
  for (const c of creepsInArea(state, t.x, t.y, range)) if (ok(c) && (best === null || c.hp > best.hp)) best = c;
  return best;
}

function closest(state: GameState, t: Tower, range: number): Creep | null {
  let best: Creep | null = null;
  let bestD = Infinity;
  for (const c of creepsInArea(state, t.x, t.y, range)) {
    const d = distance2(c.x, c.y, t.x, t.y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** Towers a support tower may buff or copy: in range, not support, not a copy; the lowest BuffPriority first, oldest on a tie (assumed). */
function supportCandidates(state: GameState, caster: Tower, range: number): Tower[] {
  const r2 = range * range;
  const out: Tower[] = [];
  for (const t of state.towers) {
    if (t === caster) continue;
    const info = towerInfoOf(t.spec);
    if (!info || info.support || info.buffPriority === null || isClone(state, t)) continue;
    if (distance2(t.x, t.y, caster.x, caster.y) <= r2) out.push(t);
  }
  return out.sort((a, b) => (towerInfoOf(a.spec)!.buffPriority! - towerInfoOf(b.spec)!.buffPriority!) || a.id - b.id);
}

/** Fire Up or Spring Forward on the best tower not already holding one as strong (fire_up.lua, spring_forward.lua). */
function buff(sim: Sim, caster: Tower, a: Extract<TowerAbility, { kind: 'fireUp' | 'springForward' }>): void {
  const { state } = sim;
  const key = a.kind === 'fireUp' ? FIRE_UP : SPRING;
  const kind = a.kind === 'fireUp' ? 'damage' : 'attackSpeed';
  const duration = Math.round(a.duration * SECOND);
  const target = supportCandidates(state, caster, a.range).find((t) => !hasStatus(t.status, key) || statusValue(t.status, key) < a.value);
  if (!target) return;
  // A 1 s lock: another support tower of this kind buffed it this second, so the cast is cancelled and refunded.
  if (target.status.some((s) => s.key === key && s.ticks > duration - SECOND)) return;
  setStatus(target.status, kind, key, a.value, duration, caster.id);
  towerState(state, caster).castAt = state.tick + Math.round(a.cooldown * SECOND);
  modeEvent(sim.events, `element.${a.kind}`, { tower: caster.id, target: target.id, value: a.value });
}

/** Trickery's Conjure: a timed copy of a tower in range on the nearest free spot (conjure.lua). */
function conjure(sim: Sim, caster: Tower, a: Extract<TowerAbility, { kind: 'conjure' }>): void {
  const { state, events } = sim;
  const tick = state.tick;
  const target = supportCandidates(state, caster, a.range).find((t) => {
    const ts = peekTower(state, t);
    return isBuilt(state, t) && tick >= ts.noCloneUntil && (a.anyTower || t.target !== 0);
  });
  if (!target) return;
  towerState(state, caster).castAt = tick + Math.round(a.cooldown * SECOND);
  towerState(state, target).noCloneUntil = tick + Math.round(a.lock * SECOND);
  const cell = freeSpotNear(state, target, a.spot);
  if (cell < 0) return;
  // assumed: the copy stands ready at once.
  const copy = addTower(state, target.spec, cell, events);
  const ts = newTowerState(tick);
  ts.clone = { by: caster.id, until: tick + Math.round(a.duration * SECOND) };
  elState(state).towers[String(copy.id)] = ts;
  // It keeps Fire Up and Spring Forward, at their full duration.
  for (const s of target.status) {
    if (s.key === FIRE_UP || s.key === SPRING) setStatus(copy.status, s.kind, s.key, s.value, 60 * SECOND, s.src);
  }
  modeEvent(events, 'element.clone', { tower: caster.id, of: target.id, copy: copy.id, until: ts.clone.until });
}

/** The 2 × 2 anchor nearest `t` within `max`, scanning columns then rows and keeping the strictly closest (buildinghelper.lua); -1 for none. */
function freeSpotNear(state: GameState, t: Tower, max: number): number {
  const md = mapData(state.map);
  let best = -1;
  let bestD = max * max;
  for (let col = 0; col + 1 < md.cols; col++) {
    for (let row = 0; row + 1 < md.rows; row++) {
      const cx = (col + 1) * CELL;
      const cy = (row + 1) * CELL;
      const d = distance2(cx, cy, t.x, t.y);
      if (d >= bestD) continue;
      const cells = footprintCells(state.map, row * md.cols + col, 2);
      if (cells.length === 4 && cells.every((c) => md.buildable[c] === 1 && state.grid[c] === 0)) {
        best = cells[0]!;
        bestD = d;
      }
    }
  }
  return best;
}

export function removeClone(sim: Sim, copy: Tower): void {
  removeTower(sim.state, copy.id, sim.events);
  delete elState(sim.state).towers[String(copy.id)];
}

/** Selling or upgrading a tower copied in the last 60 s removes one copy of its family: the oldest (assumed; the port picks at random). */
export function dropOneCopy(sim: Sim, original: Tower): void {
  const { state } = sim;
  if (state.tick >= peekTower(state, original).noCloneUntil) return;
  const family = towerInfoOf(original.spec)?.family;
  const copy = state.towers.find((t) => isClone(state, t) && towerInfoOf(t.spec)?.family === family);
  if (copy) removeClone(sim, copy);
}

/** Selling a Trickery removes every copy it made. */
export function dropCopiesBy(sim: Sim, trickery: Tower): void {
  const { state } = sim;
  const copies = state.towers.filter((t) => peekTower(state, t).clone?.by === trickery.id);
  for (const c of copies) removeClone(sim, c);
}

// --- Timers ------------------------------------------------------------------------

/** Runs every timer that is due, in insertion order; a timer added meanwhile waits for its own tick. */
export function runTimers(sim: Sim): void {
  const es = elState(sim.state);
  const timers = es.timers;
  if (timers.length === 0) return;
  const keep: boolean[] = [];
  for (let i = 0; i < timers.length; i++) {
    const t = timers[i]!;
    keep[i] = t.at > sim.state.tick ? pending(t) : runTimer(sim, t);
  }
  es.timers = timers.filter((_, i) => keep[i] !== false);
}

/** A timer bound to a creep that died or was purged is dropped. */
function pending(t: ElementTimer): boolean {
  return !((t.kind === 'dot' || t.kind === 'sunburn') && t.creep === 0);
}

function runTimer(sim: Sim, t: ElementTimer): boolean {
  const { state } = sim;
  switch (t.kind) {
    case 'aftershock':
      splash(sim, t.x, t.y, t.full, t.half, t.damage, t.tower, t.elem);
      return false;
    case 'flood':
      blast(sim, t.x, t.y, t.radius, t.damage, t.tower, t.elem);
      t.left--;
      t.at += SECOND;
      return t.left > 0;
    case 'dot': {
      const c = liveCreep(state, t.creep);
      if (!c || !targetableOrShielded(c)) return false;
      deal(sim, c, t.damage, t.tower, t.elem, 'dot');
      t.left--;
      t.at += t.every;
      return t.left > 0;
    }
    case 'sunburn': {
      const c = liveCreep(state, t.creep);
      if (!c || !targetableOrShielded(c)) return false;
      blast(sim, c.x, c.y, t.radius, abilityDamage(state, t.tower, t.damage), t.tower, t.elem);
      t.at += SECOND;
      return t.at <= t.end;
    }
    case 'remnant':
      blast(sim, t.x, t.y, t.radius, abilityDamage(state, t.tower, t.damage), t.tower, t.elem);
      t.left--;
      t.at += SECOND;
      return t.left > 0;
    case 'chain': {
      // ElectricityTower.lua: the closest creep within the radius of the last strike, not the one just hit.
      let next: Creep | null = null;
      let bestD = t.radius * t.radius;
      for (const c of creepsInArea(state, t.x, t.y, t.radius)) {
        if (c.id === t.last) continue;
        const d = distance2(c.x, c.y, t.x, t.y);
        if (next === null || d < bestD) {
          next = c;
          bestD = d;
        }
      }
      if (!next) return false;
      let grow = 1;
      for (let k = 0; k < t.jump; k++) grow *= t.grow;
      sim.events.push({ type: 'fire', tower: t.tower, target: next.id, projectile: 0 });
      deal(sim, next, abilityDamage(state, t.tower, t.damage * grow), t.tower, t.elem);
      if (t.jump >= t.jumps) return false;
      t.last = next.id;
      t.x = next.x;
      t.y = next.y;
      t.jump++;
      t.radius *= t.shrink;
      t.at += Math.round(0.2 * SECOND);
      return true;
    }
  }
}

/** Damage over time keeps ticking on a shielded creep; a fallen undead one has lost it. */
function targetableOrShielded(c: Creep): boolean {
  return c.hp > 0 && !isDead(c);
}

// --- Tornadoes -----------------------------------------------------------------------

/** Windstorm's tornadoes chase their creep, hit everything near each second and slow it each half second. */
export function runTornadoes(sim: Sim): void {
  const es = elState(sim.state);
  if (es.tornadoes.length === 0) return;
  const tick = sim.state.tick;
  for (const w of es.tornadoes) {
    const age = tick - w.born;
    const target = liveCreep(sim.state, w.target);
    if (!target || !targetable(target)) w.target = 0;
    // assumed: it moves 200 a second straight at its creep (ordered 0.05 s after it appears) and stops once that creep is gone.
    else if (age >= 2) {
      const dx = target.x - w.x;
      const dy = target.y - w.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const step = w.speed / TICK_RATE;
      if (d <= step) {
        w.x = target.x;
        w.y = target.y;
      } else {
        w.x += (dx * step) / d;
        w.y += (dy * step) / d;
      }
    }
    if (age > 0 && age % SECOND === 0) blast(sim, w.x, w.y, w.radius, w.damage, w.tower, 'water');
    if (age > 0 && age % (SECOND / 2) === 0) {
      for (const c of creepsInArea(sim.state, w.x, w.y, w.radius)) applySlow(c, 'tornado', w.slow, 1, w.tower);
    }
  }
  es.tornadoes = es.tornadoes.filter((w) => tick < w.end);
}
