import { DIFFICULTY_NAME } from './catalog';
import { clock, num } from './format';
import { press } from './Hud';
import type { PlaySession, RunEnd } from './state';

function Best({ on }: { on: boolean | undefined }) {
  return on ? <span class="best">New best</span> : null;
}

/** Won or lost, how far, the score and the time, with "New best" on each Record this Run beat. */
export function RunEndCard({ s, end }: { s: PlaySession; end: RunEnd }) {
  const imp = end.update?.improved;
  return (
    <div class="run-over interactive" data-testid="run-over">
      <div class="card">
        <h1>{end.won ? 'Victory' : 'Defeat'}</h1>
        <p class="muted">
          {end.won ? `All ${end.totalWaves} Waves cleared on ${DIFFICULTY_NAME[end.difficulty]}` : `The Run ended on Wave ${end.wave} of ${end.totalWaves}`}
        </p>
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
        <div class="buttons">
          <button type="button" class="btn primary" data-testid="play-again" onClick={press(s, s.restart)}>
            Play again · {DIFFICULTY_NAME[end.difficulty]}
          </button>
          <button type="button" class="btn" data-testid="end-menu" onClick={press(s, s.quit)}>Menu</button>
        </div>
      </div>
    </div>
  );
}
