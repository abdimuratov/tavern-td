import { signal } from '@preact/signals';
import type { RaceId } from '../../content/maul';
import type { Role, SessionStatus } from '../../net';

// What the Versus screens show and ask of the app (src/app/versus.ts writes
// these, the screens in this folder read them). Null while no Versus session
// is alive, so the mirror rehearsal and single-player see nothing of it.

/**
 * One swap of codes by hand (docs/versus-design.md §2), the fallback to a
 * room: the first connection, or a Reconnect's fresh pair.
 * - Host: `making` its Join code, then `offer` (the link is up and the Answer
 *   box waits), then `connecting` once the Answer is in.
 * - Guest: `paste` (the Join box), `making` its Answer code, then `answer`
 *   (the code is up: "Send this back to the Host", and "Connecting…").
 * - Either: `failed`, the connection couldn't be made (§3).
 */
export type SwapStep = 'paste' | 'making' | 'offer' | 'connecting' | 'answer' | 'failed';

export interface CodeSwap {
  readonly kind: 'codes';
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
}

/**
 * Connecting through a room on the Relay (docs/versus-design.md §2):
 * - `enter`: the Guest's box for the Room code.
 * - `opening`: reaching the Relay to make or enter the room; after a moment
 *   the screen says the server is waking.
 * - `waiting`: in the room, but the Rival's app isn't (the Host shares its
 *   code meanwhile), or on a Guest's Reconnect, the Host hasn't offered yet.
 * - `connecting`: both apps are in: Direct first, then the Relay.
 * - `failed`: the Relay couldn't be reached, or the room said no.
 */
export type RoomStep = 'enter' | 'opening' | 'waiting' | 'connecting' | 'failed';

export interface RoomSwap {
  readonly kind: 'room';
  readonly role: Role;
  readonly step: RoomStep;
  /** The Room code: the Host's once the Relay gives it, the Guest's once entered. */
  readonly code: string | null;
  /** The Host's link to the room (`#room=…`), for Share, Copy and the QR. */
  readonly link: string | null;
  /** When this step began, on the app's clock (performance.now()). */
  readonly since: number;
  /** Why it failed, or what's wrong with the code typed. */
  readonly error: string | null;
  /** The Guest's box, filled in from a link. */
  readonly prefill: string;
  /** A Reconnect during a Run or the lobby, rather than the first connection. */
  readonly reconnect: boolean;
}

export type Swap = CodeSwap | RoomSwap;

export interface VersusState {
  readonly role: Role;
  /** The swap under way, through a room or by codes; null once connected. */
  readonly swap: Swap | null;
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
  /** A Relay is set up, so rooms are offered and the codes are the fallback. */
  readonly relay: boolean;
  /** The Room code this session connects through; null with codes passed by hand. */
  readonly room: string | null;
  /** The Relay is taking a while to answer: a free server waking from sleep (up to a minute). */
  readonly waking: boolean;
}

export interface VersusActions {
  /** Guest: enters the room whose Room code (or `#room=` link) was typed. */
  enter(text: string): void;
  /** Leaves the room for the codes passed by hand. */
  useCodes(): void;
  /** Back from the codes to a room. */
  useRoom(): void;
  /** After a room failed: the Host makes a new room, the Guest gets its box back. */
  retry(): void;
  /** Guest: reads a pasted Join code or link and makes the Answer code (a first join, a Reconnect, or a restarted app's rejoin). */
  join(text: string): void;
  /** Host: takes the pasted Answer code. */
  accept(text: string): void;
  /** Host: a fresh Join code. Guest: back to the Join box for a new code. */
  newCode(): void;
  /** The Join box's text changed: says at once whether it's a rejoin's code, and clears the last error. */
  typed(text: string): void;
  /** Shares a Join link or an Answer code, or the room's link (`room`), with words to fit. */
  share(text: string, kind: 'link' | 'code' | 'room'): Promise<boolean>;
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
