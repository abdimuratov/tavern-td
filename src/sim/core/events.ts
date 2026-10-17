import type { Command } from './commands';
import type { Json } from './types';

/** How a hit was dealt; damage over time from statuses raises no hit event. */
export type HitKind = 'attack' | 'crit' | 'splash' | 'dot';

/** What happened during one tick, for the renderer, audio and HUD to react to. Never stored in the state. */
export type SimEvent =
  | { readonly type: 'spawn'; readonly creep: number; readonly spec: string; readonly wave: number; readonly x: number; readonly y: number }
  /** `projectile` is 0 for an instant hit. */
  | { readonly type: 'fire'; readonly tower: number; readonly target: number; readonly projectile: number }
  | { readonly type: 'impact'; readonly projectile: number; readonly tower: number; readonly x: number; readonly y: number }
  | { readonly type: 'hit'; readonly creep: number; readonly tower: number; readonly damage: number; readonly kind: Exclude<HitKind, 'dot'> }
  | { readonly type: 'kill'; readonly creep: number; readonly tower: number; readonly bounty: number; readonly x: number; readonly y: number }
  /** `lives` is what this leak cost; `restart` means the creep was sent around again. */
  | { readonly type: 'leak'; readonly creep: number; readonly lives: number; readonly restart: boolean }
  | { readonly type: 'waveStart'; readonly wave: number }
  | { readonly type: 'waveEnd'; readonly wave: number }
  | { readonly type: 'won' }
  | { readonly type: 'lost' }
  | { readonly type: 'placed'; readonly tower: number; readonly spec: string; readonly cell: number }
  | { readonly type: 'changed'; readonly tower: number; readonly spec: string; readonly from: string }
  | { readonly type: 'removed'; readonly tower: number; readonly spec: string; readonly cell: number }
  | { readonly type: 'rejected'; readonly command: Command; readonly reason: string }
  | { readonly type: 'goldChanged'; readonly gold: number; readonly delta: number }
  | { readonly type: 'livesChanged'; readonly lives: number; readonly delta: number }
  /** Anything a Game Mode wants to tell its own UI. */
  | { readonly type: 'mode'; readonly name: string; readonly data: Json };
