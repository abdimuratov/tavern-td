import { gem, type GameState } from '../../../sim';
import { useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, selected } from '../../state';

/** Creeps of the Wave being fought that are still to spawn or still alive. */
function creepsLeft(state: GameState): number {
  let n = 0;
  for (const w of state.wave.active) for (const g of w.groups) n += g.count - g.spawned;
  for (const c of state.creeps) if (c.wave === state.wave.number && c.hp > 0) n++;
  return n;
}

/** Where the Run is, the leak rule, and when the next swap is ready: three short lines under the speed controls. */
export function GemStatus({ s }: ModeHudProps) {
  void revision.value;
  const state = s.view.state;
  const st = gem.gemStatus(state);
  let step: string;
  if (st.step === 'draft') step = `Place gem ${st.placed + 1} of ${st.draftSize}`;
  else if (st.step === 'choose') step = 'Pick a gem to keep';
  else if (st.step === 'wave') {
    const left = creepsLeft(state);
    step = `Wave ${st.wave} · ${left} creep${left === 1 ? '' : 's'} left`;
  } else step = state.phase === 'won' ? 'Run won' : 'Run over';
  useHotkey(s, 'tab', 'Next Draft gem', () => {
    const draft = (s.view.state.mode as gem.GemState).draft;
    if (draft.length > 0) s.view.select(draft[(draft.indexOf(selected.value) + 1) % draft.length]!);
  }, st.step === 'choose');
  const swap = st.wavesUntilSwap === 0 ? 'Swap ready' : `Swap in ${st.wavesUntilSwap} Wave${st.wavesUntilSwap === 1 ? '' : 's'}`;
  return (
    <section class="mode-status" data-testid="gem-status">
      <div class="step" data-testid="gem-step">
        {step}
        {st.step === 'draft' && (
          <span class="pips" aria-hidden="true">
            {Array.from({ length: st.draftSize }, (_, i) => <span key={i} class={i < st.placed ? 'on' : ''} />)}
          </span>
        )}
      </div>
      {st.step !== 'over' && (
        <>
          <div class={`leak${st.leaksFree ? '' : ' fatal'}`} data-testid="leak-rule">
            {st.leaksFree ? `Leaks are free until Wave ${st.fatalLeakWave}` : 'From now on a leak ends the Run'}
          </div>
          <div class="muted">{swap}</div>
        </>
      )}
    </section>
  );
}
