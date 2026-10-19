import { LW_SENDS } from '../../../content/linewars';
import { findTower, linewars, TICK_RATE } from '../../../sim';
import { hex, keyLabel, press, useHotkey } from '../../Hud';
import type { ModeHudProps } from '../../mode-ui';
import { revision, runClock, selected, type PlaySession } from '../../state';
import { RACE_COLOR } from '../maul/look';
import { towerSpecOf, towerSummary } from '../maul/text';
import { CreepIcon } from './CreepIcon';
import { building } from './picks';
import { nextUnlockText, sendAbout, sendCreep, sendTags } from './text';

/** WC3-style letters along the top row: the Wall, then line A and line B. */
const BUILD_KEYS = ['q', 'w', 'e'] as const;

/** The Harpies' unlock is called out this long before it comes. */
const AIR_WARNING_SECONDS = 30;

function BuildButton({ s, o, hotkey, race }: { s: PlaySession; o: linewars.LwBuildOption; hotkey: string | undefined; race: keyof typeof RACE_COLOR }) {
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
      <span class="swatch" style={{ background: hex(RACE_COLOR[race]) }} />
      <span class="label">{o.line === 'wall' ? 'Wall' : o.name}</span>
      <span class="detail">{o.cost}</span>
      {hotkey && <span class="key">{keyLabel(hotkey)}</span>}
    </button>
  );
}

/**
 * The build menu: your Race's Wall and its two Tier 1 towers, with prices. Its
 * keys step aside while one of your towers is selected, so Q W E can mean
 * that tower's upgrades.
 */
function BuildMenu({ s }: ModeHudProps) {
  void revision.value;
  void building.value;
  const state = s.view.state;
  const me = s.view.side;
  const picked = selected.value === 0 ? undefined : findTower(state, selected.value);
  const mine = picked !== undefined && linewars.towerSide(state, picked) === me;
  const options = linewars.buildOptions(state, me);
  const race = linewars.lwState(state).sides[me].race;
  return (
    <div class="ml-build" data-testid="build-menu">
      <div class={`el-build ml-build-row n${options.length}`} role="group" aria-label="Build">
        {options.map((o, i) => <BuildButton key={o.spec} s={s} o={o} race={race} hotkey={mine ? undefined : BUILD_KEYS[i]} />)}
      </div>
    </div>
  );
}

/**
 * "In your Field": the Rival's creeps walking your Field now, grouped by Send
 * with counts and tags, and the next Send to unlock. Line Wars' wave preview.
 */
function InField({ s }: ModeHudProps) {
  void revision.value;
  void runClock.value;
  const state = s.view.state;
  const me = s.view.side;
  const groups = linewars.inField(state, me);
  const next = linewars.nextUnlock(state);
  const air = next !== null && sendCreep(next.send).flying && next.ticksLeft <= AIR_WARNING_SECONDS * TICK_RATE;
  const sent = new Map(linewars.sendOptions(state, linewars.other(me)).map((o) => [o.send, o]));
  return (
    <section class="waves lw-field" data-testid="in-field">
      <h2>In your Field</h2>
      {groups.length === 0 ? (
        <p class="lw-none muted">Nothing yet</p>
      ) : (
        <ul>
          {groups.map((g) => (
            <li key={g.send} class="group rich" title={sendAbout(g.send, sent.get(g.send)?.hp ?? 0, sent.get(g.send)?.steals ?? 0)} data-testid={`in-field-${g.send}`}>
              <CreepIcon creep={LW_SENDS[g.send].creep} />
              <span class="name">{g.name}</span>
              <span class="muted">×{g.count}</span>
              {sendTags(g.send).map((t) => (
                <span key={t} class={`tag ${t === 'Air' ? 'air' : t === 'Boss' ? 'boss' : 'trait'}`}>{t}</span>
              ))}
            </li>
          ))}
        </ul>
      )}
      {next && (
        <p class={`lw-next${air ? ' air' : ''}`} data-testid="next-unlock">
          <span class="muted">Next:</span> {nextUnlockText(next)}
        </p>
      )}
    </section>
  );
}

/** The mode's block in the actions area: the build menu, then "In your Field". */
export function LwActions({ s }: ModeHudProps) {
  return (
    <>
      <BuildMenu s={s} />
      <InField s={s} />
    </>
  );
}
