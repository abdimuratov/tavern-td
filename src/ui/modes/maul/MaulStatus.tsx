import { maul } from '../../../sim';
import { num } from '../../format';
import type { ModeHudProps } from '../../mode-ui';
import { revision } from '../../state';
import { racesText } from './text';

/** Under the speed controls: the Races, the interest due at the next clear, and the juggles so far. */
export function MaulStatus({ s }: ModeHudProps) {
  void revision.value;
  const state = s.view.state;
  const st = maul.maulStatus(state);
  if (st.step === 'over') return null;
  // In a Break, a warning when the Wave about to come is air or a boss.
  const next = st.step !== 'wave' ? maul.wavePreview(state, st.wave + 1) : null;
  const warn = next ? (next.boss ? (next.wave === st.total ? 'Last boss next' : 'Boss next') : next.air ? 'Air next' : null) : null;
  return (
    <section class="mode-status ml-status" data-testid="maul-status">
      <div class="step">
        <span class="ml-races-held" data-testid="races">{racesText(st.races)}</span>
        {warn && <span class={`ml-warn${next?.air ? ' air' : ''}`} data-testid="next-warning">{warn}</span>}
      </div>
      <div class="ml-econ">
        <span title="4% of unspent gold, paid with the next end-of-Wave bonus and capped at it" data-testid="interest">+{num(st.interestNow)} interest</span>
        <span class="muted" title="Creeps turned around by builds and sales this Run" data-testid="juggles">Juggled {num(st.turned)}</span>
      </div>
    </section>
  );
}
