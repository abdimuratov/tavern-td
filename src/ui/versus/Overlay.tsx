import type { PauseStatus, SessionStatus } from '../../net';
import type { PlaySession } from '../state';
import { SwapPanel } from './Codes';
import { linkDown, versus, versusActions, type VersusActions, type VersusState } from './state';
import { boardBanner, connectionLine, countdownSeconds, lostText, pauseView } from './text';

// Versus over the board while a Run is on (docs/versus-design.md §4.4, §5):
// the 3-2-1 to Go, a banner for a wait, a pause on its way or a Desync being
// repaired, the pause sheet with each player's Ready, and the Connection lost
// sheet with Reconnect, Concede and, after 2 minutes, Claim the win.

/** A HUD button press: its haptic first, as the HUD's own buttons do. */
function tapped(s: PlaySession, run: () => void) {
  return (e: Event): void => {
    (e.currentTarget as HTMLElement).blur();
    s.tap();
    run();
  };
}

function PauseSheet({ s, st, pause, a }: { s: PlaySession; st: SessionStatus; pause: PauseStatus; a: VersusActions }) {
  const away = st.run?.away ?? [false, false];
  const view = pauseView(pause, st.side, away);
  const resuming = view.resumeIn !== null;
  return (
    <div class="vs-sheet" data-testid="versus-pause">
      <div class="card interactive">
        <h2 data-testid="versus-pause-title">{view.title}</h2>
        <p class="muted" data-testid="versus-pause-text">{resuming ? `Resuming in ${countdownSeconds(view.resumeIn!)}…` : view.text}</p>
        <div class="vs-readies">
          <button
            type="button"
            class={`btn ${view.mine ? 'active' : 'primary'}`}
            aria-pressed={view.mine}
            disabled={resuming || away[st.side] === true}
            data-testid="versus-ready"
            onClick={tapped(s, () => a.ready(!view.mine))}
          >
            {view.mine ? 'You: Ready ✓' : 'Ready'}
          </button>
          <span class={`vs-rival-ready${view.rival ? ' on' : ''}`} data-testid="versus-rival-ready">
            {view.rival ? 'Rival: Ready ✓' : 'Rival: not ready'}
          </span>
        </div>
      </div>
    </div>
  );
}

function LostSheet({ s, v, st, a }: { s: PlaySession; v: VersusState; st: SessionStatus; a: VersusActions }) {
  const words = lostText(st);
  const swapping = v.reconnecting && v.swap !== null;
  return (
    <div class="vs-sheet lost" data-testid="versus-lost">
      <div class={`card interactive${swapping ? ' wide' : ''}`}>
        <h2>{words.title}</h2>
        <p class="muted">{words.text}</p>
        {swapping ? (
          <SwapPanel v={v} swap={v.swap!} a={a} onBack={() => a.reconnect(false)} />
        ) : (
          <div class="buttons">
            <button type="button" class="btn primary" data-testid="versus-reconnect" onClick={tapped(s, () => a.reconnect(true))}>Reconnect</button>
            {st.canClaim && (
              <button type="button" class="btn" data-testid="versus-claim" onClick={tapped(s, a.claim)}>Claim the win</button>
            )}
            <button type="button" class="btn danger" data-testid="versus-concede" onClick={tapped(s, a.concede)}>Concede</button>
          </div>
        )}
        <p class="note">{words.claim}</p>
      </div>
    </div>
  );
}

/** Everything Versus draws over the board; nothing outside a Versus session (the mirror rehearsal). */
export function VersusLayer({ s }: { s: PlaySession }) {
  const v = versus.value;
  const a = versusActions.value;
  const st = v?.status;
  const run = st?.run;
  if (!v || !a || !st || !run || !v.inRun) return null;
  const over = run.ended !== null || st.phase === 'over';
  // Between Start and Go too: a Run that never began goes back to the Lobby once they reconnect.
  // A Reconnect's new connection reads `connecting` until it opens, and the sheet holds its swap till then.
  const lost = !over && linkDown(v) && (st.phase === 'playing' || st.phase === 'starting');
  const pause = !over && !lost && run.pause && !run.pause.kinds.includes('sync') ? run.pause : null;
  const banner = over ? null : boardBanner(st);
  const countdown = countdownSeconds(run.countdownMs);
  return (
    <>
      {banner && <div class="pill vs-banner" data-testid="versus-banner">{banner}</div>}
      {!over && !lost && !pause && countdown > 0 && <div class="vs-countdown" data-testid="versus-countdown">{countdown}</div>}
      {pause && <PauseSheet s={s} st={st} pause={pause} a={a} />}
      {lost && <LostSheet s={s} v={v} st={st} a={a} />}
    </>
  );
}

/** The HUD's connection line: the ping, or "Waiting for the Rival…" and "Connection unstable…" (§5.3). */
export function VersusHudLine() {
  const st = versus.value?.status;
  if (!st?.run) return null;
  const line = connectionLine(st);
  return (
    <div class={`vs-line ${line.tone}`} data-testid="versus-line" title="The connection to the Rival">
      <span class="dot" aria-hidden="true" />
      {line.text}
    </div>
  );
}
