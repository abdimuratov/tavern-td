import { STAR_LIVES, stageByNumber } from '../../../content/original';
import { original } from '../../../sim';
import type { ModeHudProps } from '../../mode-ui';
import { revision } from '../../state';
import { Stars } from './parts';

const STAR_RULE = STAR_LIVES.map((r) => `${r.stars} for ${r.lives} or more`).join(', ');

/** Under the speed controls: the Stage, its Threat, and the Stars a win would bring with the lives left. */
export function OriginalStatus({ s }: ModeHudProps) {
  void revision.value;
  const st = original.originalStatus(s.view.state);
  if (st.step === 'over') return null;
  const stage = stageByNumber(st.stage);
  // Lives that can still leak before these Stars drop to the next row.
  const floor = STAR_LIVES.find((r) => st.lives >= r.lives)?.lives ?? 1;
  const spare = Math.max(0, st.lives - floor);
  return (
    <section class="mode-status or-status" data-testid="original-status">
      <div class="step">
        <span class="or-stage">{stage ? stage.name : `Stage ${st.stage}`}</span>
        <span class="or-threat" title="Threat sets the next Wave's creep HP, bounty and bonus" data-testid="threat">Threat {st.threat}</span>
      </div>
      <div class="or-run-stars" title={`Stars for a win by lives left: ${STAR_RULE}`}>
        <Stars n={st.stars} testid="run-stars" />
        <span class="muted">{spare} {spare === 1 ? 'life' : 'lives'} to spare</span>
      </div>
    </section>
  );
}
