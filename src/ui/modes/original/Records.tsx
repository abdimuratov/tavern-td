import { CHALLENGES, challengeOfStage, STAGES } from '../../../content/original';
import { DIFFICULTY_NAME } from '../../catalog';
import { clock } from '../../format';
import { campaign, challengeRecord, challengesWon, MOST_STARS, stageRecord, starsEarned } from './campaign';
import { Stars } from './parts';

/**
 * The Original's Records: each Stage's best Stars, the hardest Difficulty won
 * and the fastest win, then its Challenge's fastest win.
 */
export function OriginalRecords() {
  const c = campaign.value;
  return (
    <>
      <p class="muted" data-testid="records-original-total">
        {starsEarned(c)} of {MOST_STARS} Stars earned · {challengesWon(c)} of {CHALLENGES.length} Challenges won
      </p>
      <table class="records" data-testid="records-original">
        <thead>
          <tr><th>Stage</th><th>Stars</th><th>Hardest won</th><th>Fastest win</th><th>Challenge</th></tr>
        </thead>
        <tbody>
          {STAGES.map((st) => {
            const r = stageRecord(c, st.number);
            const ch = challengeRecord(c, st.number);
            const spec = challengeOfStage(st.number);
            return (
              <tr key={st.number} data-testid={`records-stage-${st.number}`}>
                <th>{st.number} · {st.name}</th>
                <td><Stars n={r?.stars ?? 0} /></td>
                <td>{r?.hardest ? DIFFICULTY_NAME[r.hardest] : '–'}</td>
                <td>{r?.fastest ? clock(r.fastest) : '–'}</td>
                <td title={spec ? `${spec.name}: ${ch ? 'won, fastest win' : 'not won yet'}` : undefined} data-testid={`records-challenge-${st.number}`}>
                  {ch ? (ch.fastest !== null ? clock(ch.fastest) : 'Won') : '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
