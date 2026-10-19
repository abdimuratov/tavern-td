import { signal } from '@preact/signals';
import type { RaceId } from '../../content/maul';
import type { RelayUse, Role, SessionStatus } from '../../net';

// What the Versus screens show and ask of the app (src/app/versus.ts writes
// these, the screens in this folder read them). Null while no Versus session
// is alive, so the mirror rehearsal and single-player see nothing of it.

/**
 * One swap of codes by hand (docs/versus-design.md §2): the first connection,
 * or a Reconnect's fresh pair.
 * - Host: `making` its Join code, then `offer` (the link is up and the Answer
 *   box waits), then `connecting` once the Answer is in.
 * - Guest: `paste` (the Join box), `making` its Answer code, then `answer`
 *   (the code is up: "Send this back to the Host", and "Connecting…").
 * - Either: `failed`, the connection couldn't be made (§3).
 */
export type SwapStep = 'paste' | 'making' | 'offer' | 'connecting' | 'answer' | 'failed';

export interface CodeSwap {
  readonly role: Role;
  readonly step: SwapStep;
  /** The Host's Join link, or the Guest's Answer code, once made. */
  readonly code: string | null;
  /** When the code was made, on the app's clock (performance.now()), for its age. */
  readonly madeAt: number | null;
  /** When this device had both codes: "Connecting…" from then, and §3's message 20 s on (Host). */
  readonly connectingAt: number | null;
  /** What's wrong with the last paste (a CodeError's message), or why making a code failed. */
  readonly error: string | null;
  /** The Join box's text, filled in from a link. */
  readonly prefill: string;
  /** A Reconnect during a Run or the lobby, rather than the first connection. */
  readonly reconnect: boolean;
  /** How the Relay stood for this device's code: `unavailable` shows a note under it, and §3's message depends on it. */
  readonly relay: RelayUse;
  /** The Rival's code holds a relay candidate (the Host learns it from the Answer code). */
  readonly rivalRelay: boolean;
}

export interface VersusState {
  readonly role: Role;
  /** The code swap under way; null once connected. */
  readonly swap: CodeSwap | null;
  /** The session as last read (4 times a second, and on each of its events); null before it exists (the Guest's Join box). */
  readonly status: SessionStatus | null;
  /** The app's clock at that read, for code ages and countdowns. */
  readonly now: number;
  /** The play screen is up on a Versus Run. */
  readonly inRun: boolean;
  /** A Desync happened, so its report can be copied. */
  readonly report: boolean;
  /** The Join code pasted is a rejoin's: the Join box offers "Rejoin the Host's Run". */
  readonly rejoin: boolean;
  /** The Reconnect swap is open on the Connection lost sheet. */
  readonly reconnecting: boolean;
}

export interface VersusActions {
  /** Guest: reads a pasted Join code or link and makes the Answer code (a first join, a Reconnect, or a restarted app's rejoin). */
  join(text: string): void;
  /** Host: takes the pasted Answer code. */
  accept(text: string): void;
  /** Host: a fresh Join code. Guest: back to the Join box for a new code. */
  newCode(): void;
  /** The Join box's text changed: says at once whether it's a rejoin's code, and clears the last error. */
  typed(text: string): void;
  share(text: string, kind: 'link' | 'code'): Promise<boolean>;
  copy(text: string): Promise<boolean>;
  pick(race: RaceId | 'random'): void;
  setReady(on: boolean): void;
  /** In a Run. */
  pause(): void;
  ready(on: boolean): void;
  concede(): void;
  claim(): void;
  /** Opens (or closes) the Reconnect swap on the Connection lost sheet. */
  reconnect(open: boolean): void;
  rematch(): void;
  copyReport(): Promise<boolean>;
  /** Closes the session and goes to the main menu. */
  leave(): void;
}

export const versus = signal<VersusState | null>(null);
export const versusActions = signal<VersusActions | null>(null);

/**
 * The connection is down once it has been up: lost, or a Reconnect's new one
 * still connecting (or its swap open). The Connection lost sheet and the
 * Lobby's Reconnect stay up until it opens.
 */
export function linkDown(v: VersusState): boolean {
  const link = v.status?.link;
  return link === 'lost' || (link === 'connecting' && v.status?.phase !== 'connecting') || (v.reconnecting && v.swap !== null);
}

/** A Versus Run is on: the "new version, reload" toast waits until it's over (design §6). */
export function versusRunOn(v: VersusState | null): boolean {
  const phase = v?.status?.phase;
  return phase === 'starting' || phase === 'playing' || phase === 'rejoining';
}
