import { RACE_SPECS, RACES } from '../../content/maul';
import type { SessionStatus } from '../../net';
import { Sheet } from '../menu/Sheet';
import { raceName } from '../modes/maul/text';
import { SwapPanel } from './Codes';
import { linkDown, versus, versusActions, type VersusActions, type VersusState } from './state';
import { lostText, mismatchText, raceChoices, rivalLobbyText } from './text';

// Versus before and between Runs (docs/versus-design.md §2, §4.6): the Host's
// and the Guest's code swaps, the Lobby, and the version message. The play
// screen takes over from Start; Rematch brings the Lobby back.

function Lobby({ v, st, a }: { v: VersusState; st: SessionStatus; a: VersusActions }) {
  const { mine, rival } = st.lobby;
  const lost = linkDown(v);
  const picked = mine.race;
  const about = picked ? `${mine.random ? `Random drew ${raceName(picked)}. ` : ''}${RACE_SPECS[picked].about}` : 'Pick a Race, or Random';
  const note = lost ? 'The connection to the Rival dropped.'
    : mine.ready && rival.ready ? 'Starting…'
      : mine.ready ? 'Waiting for the Rival to press Ready.'
        : 'Press Ready once you have picked. The Run starts when you both are.';
  return (
    <Sheet title="Versus Lobby" onBack={a.leave}>
      <div class="vs-lobby" data-testid="lobby">
        <div class="run-option">
          <span class="option-label">Your Race</span>
          <div class="seg" role="group" aria-label="Your Race">
            {raceChoices(RACES).map((c) => {
              const on = c.id === 'random' ? mine.random : !mine.random && mine.race === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  class={`btn${on ? ' active' : ''}`}
                  aria-pressed={on}
                  disabled={mine.ready}
                  data-testid={`lobby-race-${c.id}`}
                  onClick={() => a.pick(c.id)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <span class="option-about" data-testid="lobby-about">{about}</span>
        </div>
        <div class="vs-lobby-line">
          <span class="option-label">Rival</span>
          <span data-testid="lobby-rival">{rivalLobbyText(st.lobby)}</span>
        </div>
        <div class="vs-lobby-line">
          <span class="option-label">Ping</span>
          <span data-testid="lobby-ping">{st.ping === null ? '–' : `${Math.round(st.ping)} ms`}</span>
          {st.slow && <span class="warn" data-testid="lobby-slow">Slow connection: expect waits</span>}
        </div>
        <div class="buttons">
          <button
            type="button"
            class={`btn ${mine.ready ? 'active' : 'primary'} vs-ready`}
            aria-pressed={mine.ready}
            disabled={!picked || lost}
            data-testid="lobby-ready"
            onClick={() => a.setReady(!mine.ready)}
          >
            {mine.ready ? 'Ready ✓' : 'Ready'}
          </button>
        </div>
        <p class="note" data-testid="lobby-note">{note}</p>
        {lost && <Reconnect v={v} st={st} a={a} />}
      </div>
    </Sheet>
  );
}

/** A lost connection outside a Run: the same fresh swap of codes as in one (§5.4). */
function Reconnect({ v, st, a }: { v: VersusState; st: SessionStatus; a: VersusActions }) {
  if (v.reconnecting && v.swap) return <SwapPanel v={v} swap={v.swap} a={a} onBack={() => a.reconnect(false)} />;
  return (
    <div class="vs-reconnect">
      <p class="muted">{lostText(st).text}</p>
      <div class="buttons">
        <button type="button" class="btn primary" data-testid="versus-reconnect" onClick={() => a.reconnect(true)}>Reconnect</button>
        <button type="button" class="btn" onClick={a.leave}>Menu</button>
      </div>
    </div>
  );
}

function Message({ title, text, a, testid }: { title: string; text: string; a: VersusActions; testid: string }) {
  return (
    <Sheet title={title} onBack={a.leave}>
      <p data-testid={testid}>{text}</p>
      <div class="buttons">
        <button type="button" class="btn primary" data-testid="versus-menu" onClick={a.leave}>Menu</button>
      </div>
    </Sheet>
  );
}

/** Whichever Versus page is up, from the session's phase and the code swap. */
export function VersusScreen() {
  const v = versus.value;
  const a = versusActions.value;
  if (!v || !a) return null;
  const st = v.status;
  let body;
  if (st?.phase === 'mismatch' && st.mismatch) {
    const m = mismatchText(st.mismatch);
    body = <Message title={m.title} text={m.text} a={a} testid="versus-mismatch" />;
  } else if (st?.phase === 'rejoining') {
    body = <Message title="Versus" text="Rejoining the Host's Run…" a={a} testid="versus-rejoining" />;
  } else if (st && (st.phase === 'lobby' || st.phase === 'starting')) {
    body = <Lobby v={v} st={st} a={a} />;
  } else if (st?.phase === 'hello' && !v.swap) {
    body = <Message title="Versus" text="Connected. Saying hello…" a={a} testid="versus-hello" />;
  } else if (v.swap) {
    body = (
      <Sheet title={v.role === 'host' ? 'Host a Versus Run' : 'Join a Versus Run'} onBack={a.leave} wide>
        <SwapPanel v={v} swap={v.swap} a={a} />
      </Sheet>
    );
  } else {
    body = <Message title="Versus" text="Connecting…" a={a} testid="versus-connecting" />;
  }
  return <div class="screen menu interactive versus" data-testid="versus">{body}</div>;
}
