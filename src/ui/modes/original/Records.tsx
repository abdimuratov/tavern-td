import { CAMPAIGN_LENGTH, STAGES } from '../../../content/original';
import { DIFFICULTY_NAME } from '../../catalog';
import { clock } from '../../format';
import { campaign, stageRecord, starsEarned } from './campaign';
import { Stars } from './parts';

/** The Original's Records: each Stage's best Stars, the hardest Difficulty won and the fastest win. */
export function OriginalRecords() {
  const c = campaign.value;
  return (
    <>
      <p class="muted">{starsEarned(c)} of {CAMPAIGN_LENGTH * 3} Stars earned.</p>
      <table class="records" data-testid="records-original">
        <thead>
          <tr><th>Stage</th><th>Stars</th><th>Hardest won</th><th>Fastest win</th></tr>
        </thead>
        <tbody>
          {STAGES.map((st) => {
            const r = stageRecord(c, st.number);
            return (
              <tr key={st.number}>
                <th>{st.number} · {st.name}</th>
                <td><Stars n={r?.stars ?? 0} /></td>
                <td>{r?.hardest ? DIFFICULTY_NAME[r.hardest] : '–'}</td>
                <td>{r?.fastest ? clock(r.fastest) : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
