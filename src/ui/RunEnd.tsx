import type { GameState } from '../sim';
import { DIFFICULTY_NAME } from './catalog';
import { clock, num } from './format';
import { press } from './Hud';
import type { EndText } from './mode-ui';
import type { PlaySession, RunEnd } from './state';

/** Won when the core says so, with every Wave or the one the Run ended on. */
export function defaultEndText(s: GameState): EndText {
  const won = s.phase === 'won';
  return {
    won,
    summary: won ? `All ${s.wave.total} Waves cleared on ${DIFFICULTY_NAME[s.difficulty]}` : `The Run ended on Wave ${s.wave.number} of ${s.wave.total}`,
    wave: String(s.wave.number),
  };
}

function Best({ on }: { on: boolean | undefined }) {
  return on ? <span class="best">New best</span> : null;
}

/** How far, the score and the time, with "New best" on each Record this Run beat. */
function Results({ end }: { end: RunEnd }) {
  const imp = end.update?.improved;
  return (
    <dl class="results">
      <div>
        <dt>Wave reached</dt>
        <dd data-testid="end-wave">{end.wave}<Best on={imp?.bestWave} /></dd>
      </div>
      {end.score !== null && (
        <div>
          <dt>Score</dt>
          <dd data-testid="end-score">{num(end.score)}<Best on={imp?.bestScore} /></dd>
        </div>
      )}
      {end.won && end.seconds !== null && (
        <div>
          <dt>Time</dt>
          <dd>{clock(end.seconds)}<Best on={imp?.fastestWin} /></dd>
        </div>
      )}
    </dl>
  );
}

/** Won or lost and the results, or the Game Mode's own (the Original's Stars), with Play again and Menu. */
export function RunEndCard({ s, end }: { s: PlaySession; end: RunEnd }) {
  const End = s.ui.End;
  return (
    <div class="run-over interactive" data-testid="run-over">
      <div class="card">
        <h1>{end.won ? 'Victory' : 'Defeat'}</h1>
        <p class="muted" data-testid="end-summary">{end.summary}</p>
        {End ? <End s={s} end={end} /> : <Results end={end} />}
        <div class="buttons">
          <button type="button" class="btn primary" data-testid="play-again" onClick={press(s, s.restart)}>
            {end.won ? 'Play again' : 'Retry'} · {end.options ? `${end.options} · ` : ''}{DIFFICULTY_NAME[end.difficulty]}
          </button>
          <button type="button" class="btn" data-testid="end-menu" onClick={press(s, s.quit)}>Menu</button>
        </div>
      </div>
    </div>
  );
}
