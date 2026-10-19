import type { RaceId } from '../../content/maul';
import {
  CONNECT_TIMEOUT_MS, type LobbyStatus, type Mismatch, type Outcome, type PauseStatus, type Route, type SessionStatus, type SideId,
} from '../../net';
import { linewars, type GameState } from '../../sim';
import { raceName } from '../modes/maul/text';
import type { RunEnd } from '../state';
import type { CodeSwap } from './state';

// Versus' words (docs/versus-design.md §2–§6) and the small decisions behind
// them: when a code is stale, when "Connecting…" gives up, what the HUD's
// connection line, the board's banner, the pause and Connection lost sheets
// and the end card say. Pure, so the tests read them in Node. The other
// person is always "the Rival".

/** A code older than this is likely stale: the Host's screen offers a fresh one, the Guest's says to ask for one (§2). */
export const STALE_MS = 120_000;
/** "Waiting for the Rival…" once a Turn has waited this long (§5.3). */
export const WAITING_MS = 1000;
/** Above this ping the lobby warns "Slow connection: expect waits" (§4.3). */
export const SLOW_PING_MS = 800;

/** m:ss, counting whole seconds up. */
export function ageText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 3, 2, 1: whole seconds left of a countdown, rounded up; 0 once it's over. */
export function countdownSeconds(ms: number): number {
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** The code on screen has waited long enough that NAT mappings may be gone (§2). */
export function swapStale(swap: CodeSwap, now: number): boolean {
  return (swap.step === 'offer' || swap.step === 'answer') && swap.madeAt !== null && now - swap.madeAt >= STALE_MS;
}

/** The Host had both codes 20 s ago and still has no connection: §3's message. */
export function swapTimedOut(swap: CodeSwap, now: number): boolean {
  return swap.step === 'connecting' && swap.connectingAt !== null && now - swap.connectingAt >= CONNECT_TIMEOUT_MS;
}

export const FAIL_TITLE = "Couldn't reach the Rival.";
/** §3's words with no Relay set up, as before there was one. */
export const FAIL_TEXT = 'Some networks, often mobile data, block direct connections between two devices, and Tavern TD has no relay server. '
  + "Put both devices on the same Wi-Fi, or on one phone's hotspot, then make a new code.";
/** A Relay is set up, but neither code got a relay candidate: its credentials didn't come, or it couldn't be reached. */
export const FAIL_TEXT_NO_RELAY = "Some networks, often mobile data, block direct connections between two devices, and the relay couldn't be reached this time. "
  + "Put both devices on the same Wi-Fi, or on one phone's hotspot, then make a new code.";
/** A code held a relay candidate, and still nothing connected. */
export const FAIL_TEXT_RELAYED = "Even the relay couldn't link you: a network may block it too, or a code went stale. "
  + "Make a new code and try again, or put both devices on the same Wi-Fi, or on one phone's hotspot.";

/** §3's message for this swap: whether the relay was in either code, and if not, whether one is set up. */
export function failText(swap: Pick<CodeSwap, 'relay' | 'rivalRelay'>): string {
  if (swap.relay === 'offered' || swap.rivalRelay) return FAIL_TEXT_RELAYED;
  return swap.relay === 'none' ? FAIL_TEXT : FAIL_TEXT_NO_RELAY;
}

/** Under a code made without the Relay, though one is set up (§2). */
export const RELAY_NOTE = 'Relay unavailable: only direct connections will work.';

/** The Lobby's word for how the connection runs. */
export function routeText(route: Route): string {
  return route === 'relayed' ? 'Relayed' : 'Direct';
}

/** What the Guest's Join box says on an iPhone: a link opens Safari, whose Records aren't the Home Screen app's (§2). */
export function iosJoinNote(standalone: boolean): string {
  return standalone
    ? 'On an iPhone a link opens Safari, not this app. Copy the link the Host sent instead, and paste it here.'
    : "On an iPhone a link opens Safari, which keeps its own Records. To play from your Home Screen app, copy the Host's link, open Tavern TD and paste it there.";
}

/** The same in the Android app: a link opens the browser, whose Records aren't the app's. */
export const ANDROID_JOIN_NOTE = 'A link opens Chrome, not this app. Copy the link the Host sent instead, and paste it here.';

/** The version message (§4.6), or why a rejoin found nothing. */
export function mismatchText(m: Mismatch): { readonly title: string; readonly text: string } {
  if (m.why === 'gone') {
    return {
      title: "The Host's Run is gone",
      text: "The Host's app restarted, and Versus keeps nothing on disk, so that Run can't go on. Start a new one from the menu.",
    };
  }
  return {
    title: 'Different versions',
    text: `You have different versions of Tavern TD (yours ${m.mine}, the Rival's ${m.rival ?? '?'}). Update both: reload the web app, or reinstall the Android app.`,
  };
}

export type Tone = 'ok' | 'warn' | 'error';

/** The HUD's small connection line: the ping, or what's wrong (§5.3), with "· relayed" while the Relay carries the connection. */
export function connectionLine(st: SessionStatus): { readonly text: string; readonly tone: Tone } {
  if (st.link === 'lost') return { text: 'Connection lost', tone: 'error' };
  if (st.link === 'connecting') return { text: 'Reconnecting…', tone: 'error' };
  const via = st.route === 'relayed' ? ' · relayed' : '';
  if (st.link === 'unstable') return { text: `Connection unstable…${via}`, tone: 'warn' };
  const run = st.run;
  if (run && !run.pause && run.waitingMs >= WAITING_MS) {
    return { text: st.rivalAway ? "The Rival's app is in the background" : `Waiting for the Rival…${via}`, tone: 'warn' };
  }
  if (st.ping === null) return { text: `Ping –${via}`, tone: 'ok' };
  return { text: `Ping ${Math.round(st.ping)} ms${via}`, tone: st.ping > SLOW_PING_MS ? 'warn' : 'ok' };
}

/** The banner over the board while nothing else says it: a Desync being repaired, a pause on its way, a wait (§4.7, §5). */
export function boardBanner(st: SessionStatus): string | null {
  const run = st.run;
  if (!run || run.ended || st.phase !== 'playing') return null;
  if (run.syncing) return 'Out of sync: fixing…';
  if (st.link === 'lost' || st.link === 'connecting' || run.pause) return null;
  if (run.pausing) return 'Pausing…';
  if (run.waitingMs >= WAITING_MS) return st.rivalAway ? "The Rival's app is in the background" : 'Waiting for the Rival…';
  if (st.link === 'unstable') return 'Connection unstable…';
  return null;
}

/** What the pause sheet says: who paused or why both stopped, and each player's Ready (§5.1, §5.2, §5.4). */
export function pauseView(p: PauseStatus, me: SideId, away: readonly [boolean, boolean]): {
  readonly title: string; readonly text: string; readonly mine: boolean; readonly rival: boolean; readonly resumeIn: number | null;
} {
  const them: SideId = me === 0 ? 1 : 0;
  const kind = p.kinds[0] ?? 'pause';
  const mine = p.by.includes(me);
  const theirs = p.by.includes(them);
  let title: string;
  if (kind === 'away') {
    title = away[them] ? "The Rival's app is in the background" : mine && !theirs ? 'Your app was in the background' : 'The Rival is back';
  } else if (kind === 'link') {
    title = 'The connection is back';
  } else {
    title = mine && theirs ? 'You both paused' : mine ? 'You paused' : 'The Rival paused';
  }
  const text = away[them] ? 'Play goes on once the Rival returns and you both press Ready.' : 'Play goes on once you both press Ready.';
  return { title, text, mine: p.ready[me] ?? false, rival: p.ready[them] ?? false, resumeIn: p.resumeInMs };
}

/** The Connection lost sheet's words (§5.3–§5.5). */
export function lostText(st: SessionStatus): { readonly title: string; readonly text: string; readonly claim: string } {
  const text = st.rivalAway
    ? "The Rival's app went to the background, and the connection dropped."
    : 'Nothing has come from the Rival for a while, or the connection dropped.';
  const how = st.role === 'host'
    ? 'Reconnect makes a new code to send the Rival.'
    : 'Reconnect takes a new code from the Host.';
  const claim = st.canClaim
    ? 'The Rival has been gone 2 minutes, so you may claim the win.'
    : 'If the Rival is gone 2 minutes while you stay here, you may claim the win.';
  return { title: 'Connection lost', text: `${text} ${how}`, claim };
}

/** "Ironclad", "Picking…", and Ready or not, for the lobby's line about the Rival. */
export function rivalLobbyText(lobby: LobbyStatus): string {
  const { race, ready, here } = lobby.rival;
  if (!here) return 'Still on the end card';
  const pick = race ? raceName(race) : 'Picking…';
  return ready ? `${pick} · Ready` : pick;
}

/** The lobby's Race choices: Random first, then the four Races. */
export function raceChoices(races: readonly RaceId[]): readonly { readonly id: RaceId | 'random'; readonly label: string }[] {
  return [{ id: 'random', label: 'Random' }, ...races.map((r) => ({ id: r, label: raceName(r) }))];
}

/** The end card's heading and line for a Run the session ended rather than the sim (§5.5, §4.7). */
export function sessionEndText(outcome: Exclude<Outcome, 'run'>): { readonly won: boolean; readonly title: string; readonly summary: string } {
  switch (outcome) {
    case 'rival-conceded': return { won: true, title: 'Victory', summary: 'The Rival conceded' };
    case 'claimed': return { won: true, title: 'Victory', summary: 'You claimed the win: the Rival was gone 2 minutes' };
    case 'conceded': return { won: false, title: 'Defeat', summary: 'You conceded' };
    case 'desync': return { won: false, title: 'Out of sync', summary: "This Run can't go on: your two games disagreed twice. No result is recorded" };
  }
}

/**
 * The end card for a Run the session ended, from the Viewer Side: the score
 * so far and lives stolen, and no fastest time; a Desync shows no result.
 */
export function sessionRunEnd(outcome: Exclude<Outcome, 'run'>, state: GameState, side: SideId, options: string): RunEnd {
  const words = sessionEndText(outcome);
  const r = linewars.lwRecord(state, side);
  return {
    won: words.won,
    title: words.title,
    summary: words.summary,
    wave: String(r.wave),
    score: outcome === 'desync' ? null : r.score,
    // A win the session gave keeps no fastest time; the card shows the Run's length from the state.
    seconds: null,
    difficulty: state.difficulty,
    options,
    update: null,
  };
}
