import { RACE_SPECS, type RaceId } from '../../../content/maul';
import { maul } from '../../../sim';
import { hex, keyLabel, press, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, selected, type PlaySession } from '../../state';
import { RACE_COLOR } from './look';
import { building } from './picks';
import { raceName, towerSummary, towerSpecOf } from './text';

/** WC3-style letters along the top row: the Wall, then line A and B of the first Race, then the second Race's. */
const BUILD_KEYS = ['q', 'w', 'e', 'r', 't'] as const;

/** The button's word and its data-action: the Wall is "wall", a tower its own short name. */
function shortName(o: maul.BuildOption): string {
  return o.line === 'wall' ? 'Wall' : o.name;
}

function BuildButton({ s, o, hotkey }: { s: PlaySession; o: maul.BuildOption; hotkey: string | undefined }) {
  const active = building.value === o.spec;
  const run = (): void => {
    building.value = active ? null : o.spec;
    s.view.refresh();
  };
  useHotkey(s, hotkey, `Build ${o.name}`, run, hotkey !== undefined);
  const spec = towerSpecOf(o.spec);
  const cls = ['btn', 'el-build-btn', 'ml-build-btn', active && 'active', o.blocked && 'dim'].filter(Boolean).join(' ');
  const action = o.line === 'wall' ? 'wall' : o.spec.replace(/_/g, '-');
  return (
    <button
      type="button"
      class={cls}
      aria-pressed={active}
      title={`${o.name} · ${o.cost} gold · ${o.role}${spec ? ` · ${towerSummary(spec)}` : ''}${o.blocked ? ` · ${o.blocked}` : ''}${hotkey ? ` (${keyLabel(hotkey)})` : ''}`}
      data-action={`build-${action}`}
      onClick={press(s, run)}
    >
      <span class="swatch" style={{ background: hex(RACE_COLOR[o.race]) }} />
      <span class="label">{shortName(o)}</span>
      <span class="detail">{o.cost}</span>
      {hotkey && <span class="key">{keyLabel(hotkey)}</span>}
    </button>
  );
}

/** Once Wave 15 is cleared: the Races that could join, one tap each. */
function RacePicker({ s, choices }: { s: PlaySession; choices: readonly RaceId[] }) {
  return (
    <div class="ml-races" data-testid="race-picker">
      <span class="muted">A second Race can join</span>
      <div class="ml-race-row">
        {choices.map((r) => (
          <button
            key={r}
            type="button"
            class="btn ml-race"
            title={RACE_SPECS[r].about}
            data-action={`add-race-${r}`}
            onClick={press(s, () => s.view.send({ type: 'maul.addRace', race: r }))}
          >
            <span class="swatch" style={{ background: hex(RACE_COLOR[r]) }} />
            <span class="label">{raceName(r)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The build menu: the Wall and each Race's two Tier 1 towers, with their
 * prices. Its keys step aside while a tower is selected, so Q and W can mean
 * that tower's upgrades.
 */
export function BuildMenu({ s }: ModeHudProps) {
  void revision.value;
  void building.value;
  const state = s.view.state;
  const keys = selected.value === 0;
  const options = maul.buildOptions(state);
  const st = maul.maulStatus(state);
  return (
    <div class="ml-build" data-testid="build-menu">
      <div class={`el-build ml-build-row n${options.length}`} role="group" aria-label="Build">
        {options.map((o, i) => <BuildButton key={o.spec} s={s} o={o} hotkey={keys ? BUILD_KEYS[i] : undefined} />)}
      </div>
      {st.raceChoices.length > 0 && <RacePicker s={s} choices={st.raceChoices} />}
    </div>
  );
}
