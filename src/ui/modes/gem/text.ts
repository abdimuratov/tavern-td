import {
  SPECIAL_LINES,
  type GemBounceEffect, type GemFireMarkEffect, type GemFrostEffect, type GemGrabEffect, type GemIncinerateEffect,
  type GemKillCritEffect, type GemLightningEffect, type GemLuckyEffect, type GemNovaEffect, type GemPermaSlowEffect,
  type GemPoisonEffect, type GemShadowStrikeEffect, type GemSpellsEffect, type GemStrikeEffect, type GemStunHitEffect,
  type GemTowerSpec,
} from '../../../content/gem';
import { gem, type AuraSpec, type CritEffect, type EffectSpec, type ArmorEffect } from '../../../sim';
import { num } from '../../format';

export { num };

// Player-facing words for Gem's structures, written from their specs so the
// numbers can't drift from the rules. Short and plain: they fit a phone HUD.

export function specOf(id: string): GemTowerSpec | undefined {
  return Object.hasOwn(gem.GEM_TOWERS, id) ? gem.GEM_TOWERS[id] : undefined;
}

export function specName(id: string): string {
  return specOf(id)?.name ?? id;
}


function pct(fraction: number): string {
  return `${num(Math.round(fraction * 1000) / 10)}%`;
}

function seconds(s: number): string {
  return `${num(s)} s`;
}

/** Attacks per second, as a player compares towers. */
export function rate(cooldown: number): string {
  return `${num(Math.round((1 / cooldown) * 100) / 100)}/s`;
}

export function damageText(spec: GemTowerSpec): string | null {
  const a = spec.attack;
  if (!a) return null;
  const [lo, hi] = a.damage;
  return lo === hi ? num(lo) : `${num(lo)}–${num(hi)}`;
}

export function hitsText(spec: GemTowerSpec): string | null {
  const t = spec.attack?.targets;
  return t === 'air' ? 'Air only' : t === 'ground' ? 'Ground only' : t === 'both' ? 'Ground and air' : null;
}

interface Ability {
  /** One or two words, for the compact stat line. */
  readonly tag: string;
  /** One short sentence, for the selected panel. */
  readonly text: string;
}

function effectAbility(e: EffectSpec): Ability | null {
  switch (e.kind) {
    case 'crit': {
      const c = e as CritEffect;
      return { tag: 'Crit', text: `${pct(c.chance)} chance to hit ×${num(c.multiplier)}` };
    }
    case 'splash': return { tag: 'Splash', text: 'Splash damage on the ground' };
    case 'armor': {
      const a = e as ArmorEffect;
      return { tag: 'Armor break', text: `Hits cut armor by ${num(a.amount)} for ${seconds(a.duration)}` };
    }
    case 'gem.poison': {
      const p = e as GemPoisonEffect;
      return { tag: 'Poison', text: `Poison ${num(p.dps)}/s for ${seconds(p.duration)}, slows ${pct(p.slow)}` };
    }
    case 'gem.frost': {
      const f = e as GemFrostEffect;
      return { tag: 'Frost', text: `Frost slows ${pct(f.amount)} for ${seconds(f.duration)}${f.radius ? ' in an area' : ''}` };
    }
    case 'gem.bounce': {
      const b = e as GemBounceEffect;
      return { tag: 'Bounce', text: `Bounces to one more target per ${specName(b.family)} you own` };
    }
    case 'gem.stunHit': {
      const st = e as GemStunHitEffect;
      return { tag: 'Stun', text: `${pct(st.chance)} chance to stun ${seconds(st.duration)}; stunned creeps take +${pct(st.damageTaken)}` };
    }
    case 'gem.nova': {
      const n = e as GemNovaEffect;
      return { tag: 'Frost Nova', text: `${pct(n.chance)} chance of a Frost Nova: ${num(n.targetDamage)} + ${num(n.areaDamage)} nearby` };
    }
    case 'gem.lightning': {
      const l = e as GemLightningEffect;
      return { tag: 'Lightning', text: `${pct(l.chance)} chance of lightning to ${l.maxTargets} creeps, more with Kill Step` };
    }
    case 'gem.lucky': {
      const l = e as GemLuckyEffect;
      return { tag: 'Lucky', text: `${pct(l.goldChance)} chance of gold and ${pct(l.stunChance)} to stun per hit` };
    }
    case 'gem.fireMark': {
      const f = e as GemFireMarkEffect;
      return { tag: 'Fire mark', text: `Marked creeps burn ${num(f.dps)}/s and nearby ones for ${seconds(f.duration)}` };
    }
    case 'gem.grab': {
      const g = e as GemGrabEffect;
      const stun = g.stun[0] === g.stun[1] ? seconds(g.stun[0]) : `${num(g.stun[0])}–${seconds(g.stun[1])}`;
      return { tag: 'Grab', text: `Grabs a creep: ${stun} stun and ${num(g.damage)} + ${num(g.perKill)} per kill, then rests ${seconds(g.disarm)}` };
    }
    case 'gem.strike': {
      const st = e as GemStrikeEffect;
      return { tag: 'Strike', text: `Strikes for ${num(st.damage)} + ${num(st.perKill)} per kill, then rests ${seconds(st.disarm)}` };
    }
    case 'gem.shadowStrike': {
      const sh = e as GemShadowStrikeEffect;
      return { tag: 'Shadow Strike', text: `Shadow Strike: ${num(sh.byKillStep[0]!)} now and every ${seconds(sh.interval)}, slows ${pct(sh.slow)}` };
    }
    case 'gem.spells': {
      const sp = e as GemSpellsEffect;
      return { tag: 'Spells', text: `${pct(sp.chance)} chance to cast one of ${sp.spells.length} spells` };
    }
    case 'gem.incinerate': {
      const i = e as GemIncinerateEffect;
      return { tag: 'Incinerate', text: `Each hit adds +${num(i.perStack)}; burning creeps explode on death` };
    }
    case 'gem.permaSlow': {
      const p = e as GemPermaSlowEffect;
      return { tag: 'Slow', text: `Slows creeps to ${pct(p.factor)} speed for good` };
    }
    case 'gem.killCrit': {
      const k = e as GemKillCritEffect;
      return { tag: 'Crit', text: `${pct(k.chance)} chance to crit ×${num(k.byKillStep[0]!)}, more with Kill Step` };
    }
    default:
      return null;
  }
}

function auraAbility(a: AuraSpec): Ability | null {
  const where = `within ${num(a.radius)}`;
  switch (a.kind) {
    case 'attackSpeed': return { tag: 'Speed aura', text: `+${pct(a.value)} attack speed to towers ${where}` };
    case 'damage': return { tag: 'Damage aura', text: `+${pct(a.value)} damage to towers ${where}` };
    case 'armor': {
      const who = a.targets === 'air' ? 'air creeps' : a.targets === 'ground' ? 'ground creeps' : 'creeps';
      return { tag: 'Armor aura', text: `−${num(a.value)} armor to ${who} ${where}` };
    }
    case 'slow': return { tag: 'Slow aura', text: `Slows creeps ${where} by ${pct(a.value)}` };
    default: return null;
  }
}

/** Everything a structure does besides its plain attack. */
export function abilities(spec: GemTowerSpec): Ability[] {
  const out: Ability[] = [];
  const g = spec.gem;
  if (g.kind === 'rock') return [{ tag: 'Wall', text: 'Shapes the maze. Remove it for free at any time' }];
  if (g.barrage) {
    const b = g.barrage;
    if (b.damage > 0) {
      const who = b.targets === 0 ? 'every creep' : b.targets === 1 ? '1 creep' : `${b.targets} creeps`;
      out.push({ tag: 'Barrage', text: `Barrage: ${num(b.damage)} to ${who} within ${num(b.radius)} every ${seconds(b.cooldown)}` });
    } else {
      out.push({ tag: 'Barrage', text: `Marks every creep within ${num(b.radius)} every ${seconds(b.cooldown)}` });
    }
  }
  if (g.burn) out.push({ tag: 'Burn', text: `Burns every creep within ${num(g.burn.radius)} for ${num(g.burn.dps)}/s` });
  for (const e of spec.attack?.effects ?? []) {
    const a = effectAbility(e);
    if (a) out.push(a);
  }
  for (const aura of spec.auras ?? []) {
    const a = auraAbility(aura);
    if (a) out.push(a);
  }
  if (g.killAura) {
    out.push({ tag: 'Damage aura', text: `+${pct(g.killAura.byKillStep[0]!)} damage to towers within ${num(g.killAura.radius)}, more with Kill Step` });
  }
  if (spec.walkable) out.push({ tag: 'Walkable', text: 'Creeps walk over it, so it never blocks' });
  return out;
}

/** Damage, speed, range and the main ability on one line, for comparing Draft choices. */
export function statLine(id: string): string {
  const spec = specOf(id);
  if (!spec) return '';
  const parts: string[] = [];
  const dmg = damageText(spec);
  const a = spec.attack;
  if (a && dmg !== null && a.damage[1] > 0) parts.push(dmg, rate(a.cooldown), num(a.range));
  else if (spec.gem.burn) return `Burn ${num(spec.gem.burn.dps)}/s · ${num(spec.gem.burn.radius)}${spec.auras?.length ? ' · Aura' : ''}`;
  const abs = abilities(spec);
  if (abs[0]) parts.push(abs[0].tag);
  else if (a?.targets === 'air') parts.push('Air only');
  else if (a?.targets === 'ground') parts.push('Ground only');
  return parts.join(' · ');
}

/** "Tier 2 of 3" for a special, null for anything else. */
export function tierText(spec: GemTowerSpec): string | null {
  const g = spec.gem;
  if (g.kind !== 'special' || g.tier === undefined) return null;
  const line = SPECIAL_LINES.find((l) => l.id === g.family);
  return line ? `Tier ${g.tier} of ${line.tiers.length}` : `Tier ${g.tier}`;
}

/** What kind of structure it is, in a word or two. */
export function kindText(spec: GemTowerSpec): string {
  switch (spec.gem.kind) {
    case 'gem': return 'Gem';
    case 'special': return 'Special';
    case 'stone': return 'One of a kind';
    case 'slate': return 'Slate';
    case 'rock': return 'Rock';
  }
}
