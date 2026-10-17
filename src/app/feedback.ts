import type { PlayOptions, SoundName } from '../platform/audio';
import type { HapticKind } from '../platform/native';
import type { LookCache } from '../render/look';
import { findTower, getMode, type GameState, type SimEvent } from '../sim';
import type { ModeUi } from '../ui/mode-ui';

export interface FeedbackOutputs {
  play(name: SoundName, opts?: PlayOptions): unknown;
  haptic(kind: HapticKind): unknown;
}

export interface Cue {
  readonly sound: SoundName | null;
  readonly haptic: HapticKind | null;
}

const NONE: Cue = { sound: null, haptic: null };

/** The default sound and haptic for an event; a Game Mode's UI can override any of them. */
export function defaultCue(e: SimEvent, state: GameState): Cue {
  switch (e.type) {
    case 'fire': return { sound: 'shoot', haptic: null };
    case 'kill': return { sound: 'kill', haptic: null };
    case 'leak': return { sound: 'leak', haptic: 'leak' };
    case 'waveStart': return { sound: 'waveStart', haptic: null };
    case 'waveEnd': return state.phase === 'won' ? NONE : { sound: 'waveEnd', haptic: null };
    case 'won': return { sound: 'win', haptic: null };
    case 'lost': return { sound: 'lose', haptic: 'error' };
    case 'placed': {
      const spec = getMode(state.modeId).towers[e.spec];
      return { sound: spec?.attack || spec?.auras ? 'place' : 'rock', haptic: 'confirm' };
    }
    case 'changed': return { sound: 'upgrade', haptic: 'confirm' };
    case 'removed': return { sound: 'click', haptic: 'tap' };
    case 'rejected': return { sound: 'error', haptic: 'error' };
    default: return NONE;
  }
}

/** Turns each tick's events into sounds and Android haptics. The voice limiter in audio keeps volleys sane. */
export function createFeedback(out: FeedbackOutputs, looks: () => LookCache, ui: () => ModeUi) {
  return {
    events(state: GameState, events: readonly SimEvent[]): void {
      const mode = ui();
      for (const e of events) {
        const cue = mode.feedback?.(e, state) ?? defaultCue(e, state);
        if (cue.sound) {
          if (cue.sound === 'shoot' && e.type === 'fire') {
            const tower = findTower(state, e.tower);
            out.play('shoot', { variant: tower ? looks().tower(tower.spec).sound : 'arrow' });
          } else {
            out.play(cue.sound);
          }
        }
        if (cue.haptic) out.haptic(cue.haptic);
      }
    },
    /** A placement the UI refused before sending it, such as a red ghost tapped again. */
    refused(): void {
      out.play('error');
      out.haptic('error');
    },
    /** A HUD button or a ghost appearing. */
    tap(): void {
      out.haptic('tap');
    },
  };
}

export type Feedback = ReturnType<typeof createFeedback>;
