import { useState } from 'preact/hooks';
import type { PlaySession, RunEnd } from '../state';
import { versus, versusActions } from './state';

/**
 * A Versus Run's end card (docs/versus-design.md §6): Victory, Defeat or Draw
 * from this device's Side with why, both Sides' lives, lives stolen, score and
 * time. Rematch takes Play again's place while the Rival is connected, and
 * Menu leaves. After a Desync there's no result, only Copy report and Menu.
 */
export function VersusEndCard({ s, end }: { s: PlaySession; end: RunEnd }) {
  const v = versus.value;
  const a = versusActions.value;
  const [copied, setCopied] = useState<boolean | null>(null);
  const st = v?.status;
  const End = s.ui.End;
  const desync = st?.outcome === 'desync';
  const connected = st?.link === 'open' || st?.link === 'unstable';
  const canRematch = a !== null && st?.phase === 'over' && connected && !desync;
  const rivalBack = st?.phase === 'over' && connected && st.lobby.rival.here;
  const leave = (): void => (a ? a.leave() : s.quit());
  return (
    <div class="run-over interactive" data-testid="run-over">
      <div class="card">
        <h1 data-testid="end-title">{end.title ?? (end.won ? 'Victory' : 'Defeat')}</h1>
        <p class="muted" data-testid="end-summary">{end.summary}</p>
        {!desync && End && <End s={s} end={end} />}
        {rivalBack && <p class="note" data-testid="rival-rematch">The Rival is back in the Lobby for a Rematch.</p>}
        {!connected && !desync && <p class="note" data-testid="rival-left">The Rival has left.</p>}
        <div class="buttons">
          {canRematch && (
            <button type="button" class="btn primary" data-testid="rematch" onClick={() => a.rematch()}>Rematch</button>
          )}
          {v?.report && a && (
            <button type="button" class="btn" data-testid="copy-report" onClick={() => void a.copyReport().then(setCopied)}>
              {copied === null ? 'Copy desync report' : copied ? 'Copied' : 'Copy failed'}
            </button>
          )}
          <button type="button" class={`btn${canRematch ? '' : ' primary'}`} data-testid="end-menu" onClick={leave}>Menu</button>
        </div>
      </div>
    </div>
  );
}
