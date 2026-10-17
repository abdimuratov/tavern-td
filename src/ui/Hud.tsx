import { useEffect, useRef } from 'preact/hooks';
import { findTower, getMode, type GameState, type Tower } from '../sim';
import { upcomingWaves, type UiAction } from './mode-ui';
import {
  gold, hint, lives, paused, phase, revision, selected, speed, waveNumber, waveTotal, type PlaySession,
} from './state';

/** WC3 shows hotkeys as the letter on the button; we show it as a small badge. */
function keyLabel(key: string): string {
  return key === 'space' ? 'Space' : key === 'escape' ? 'Esc' : key.toUpperCase();
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Blurs after a press, so Space for "start Wave" never re-clicks the last button pressed. */
function press(s: PlaySession, run: () => void) {
  return (e: Event): void => {
    (e.currentTarget as HTMLElement).blur();
    s.tap();
    run();
  };
}

function ActionButton({ s, action }: { s: PlaySession; action: UiAction }) {
  const run = useRef(action.run);
  run.current = action.run;
  const disabled = action.disabled !== undefined && action.disabled !== false;
  useEffect(() => {
    if (!action.key || disabled) return;
    return s.hotkeys.bind(action.key, action.label, () => run.current());
  }, [s, action.key, action.label, disabled]);
  const cls = ['btn', 'action', action.active && 'active', action.dim && 'dim', action.tone].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      class={cls}
      disabled={disabled}
      title={typeof action.disabled === 'string' ? action.disabled : action.key ? `${action.label} (${keyLabel(action.key)})` : action.label}
      aria-pressed={action.active ?? undefined}
      data-action={action.id}
      onClick={press(s, () => run.current())}
    >
      {action.swatch !== undefined && <span class="swatch" style={{ background: hex(action.swatch) }} />}
      <span class="label">{action.label}</span>
      {action.detail && <span class="detail">{action.detail}</span>}
      {action.key && <span class="key">{keyLabel(action.key)}</span>}
    </button>
  );
}

function Stats({ s }: { s: PlaySession }) {
  return (
    <div class="stats">
      <span class="stat" title="Gold">
        <span class="coin" aria-hidden="true" />
        <span data-testid="gold">{gold}</span>
      </span>
      {s.ui.showLives !== false && (
        <span class="stat" title="Lives">
          <span class="heart" aria-hidden="true">♥</span>
          <span data-testid="lives">{lives}</span>
        </span>
      )}
      <span class="stat" title="Wave">
        <span class="muted">Wave</span>
        <span data-testid="wave">{waveNumber.value}/{waveTotal.value}</span>
      </span>
    </div>
  );
}

function Controls({ s }: { s: PlaySession }) {
  const isPaused = paused.value;
  return (
    <div class="controls">
      <button
        type="button"
        class={`btn icon${isPaused ? ' active' : ''}`}
        aria-pressed={isPaused}
        aria-label={isPaused ? 'Resume' : 'Pause'}
        title={isPaused ? 'Resume (P)' : 'Pause (P)'}
        data-testid="pause"
        onClick={press(s, s.togglePause)}
      >
        {isPaused ? <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>}
      </button>
      <div class="seg" role="group" aria-label="Speed">
        {([1, 2, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            class={`btn${speed.value === n ? ' active' : ''}`}
            aria-pressed={speed.value === n}
            title={`Speed ${n}× (${n})`}
            data-testid={`speed-${n}`}
            onClick={press(s, () => s.setSpeed(n))}
          >
            {n}×
          </button>
        ))}
      </div>
    </div>
  );
}

function WavePreviewList({ s }: { s: PlaySession }) {
  void revision.value;
  void waveNumber.value;
  const waves = upcomingWaves(s.ui, s.view, 3);
  if (waves.length === 0) return null;
  const running = phase.value === 'wave';
  return (
    <section class="waves" data-testid="wave-preview">
      <h2>{running ? 'Coming up' : 'Next'}</h2>
      <ol>
        {waves.map((w) => (
          <li key={w.number}>
            <span class="num">{w.number}</span>
            <span class="groups">
              {w.groups.map((g, i) => (
                <span key={i} class="group">
                  {g.name} <span class="muted">×{g.count}</span>
                  {g.air && <span class="tag air">Air</span>}
                  {g.boss && <span class="tag boss">Boss</span>}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function towerRows(state: GameState, t: Tower): [string, string][] {
  const spec = getMode(state.modeId).towers[t.spec];
  const rows: [string, string][] = [];
  const atk = spec?.attack;
  if (atk) {
    const [lo, hi] = atk.damage;
    rows.push(['Damage', lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`]);
    rows.push(['Speed', `${fmt(1 / atk.cooldown)}/s`]);
    rows.push(['Range', fmt(atk.range)]);
    rows.push(['Hits', atk.targets === 'both' ? 'Ground & air' : atk.targets === 'air' ? 'Air' : 'Ground']);
    const effects = (atk.effects ?? []).map((e) => e.kind);
    if (effects.length) rows.push(['Effects', effects.join(', ')]);
    rows.push(['Kills', String(t.kills)]);
  }
  for (const a of spec?.auras ?? []) rows.push(['Aura', `${a.kind} ${a.to === 'towers' ? 'for towers' : 'on creeps'}`]);
  return rows;
}

function TowerPanel({ s }: { s: PlaySession }) {
  void revision.value;
  const id = selected.value;
  const state = s.view.state;
  const t = id === 0 ? undefined : findTower(state, id);
  if (!t) return null;
  const spec = getMode(state.modeId).towers[t.spec];
  const rows = [...towerRows(state, t), ...(s.ui.towerInfo?.(s.view, t) ?? [])];
  const actions = s.ui.towerActions?.(s.view, t) ?? [];
  return (
    <section class="panel" data-testid="tower-panel">
      <header>
        <h2>{spec?.name ?? t.spec}</h2>
        <button type="button" class="btn icon close" aria-label="Deselect" title="Deselect (Esc)" onClick={press(s, () => s.view.select(0))}>×</button>
      </header>
      {actions.length > 0 && (
        <div class="grid">
          {actions.map((a) => <ActionButton key={a.id} s={s} action={a} />)}
        </div>
      )}
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} class="row"><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function ModeActions({ s }: { s: PlaySession }) {
  void revision.value;
  const actions = s.ui.actions?.(s.view) ?? [];
  if (actions.length === 0) return null;
  return (
    <section class="actions grid" data-testid="mode-actions">
      {actions.map((a) => <ActionButton key={a.id} s={s} action={a} />)}
    </section>
  );
}

function StartWave({ s }: { s: PlaySession }) {
  void revision.value;
  if (s.ui.showStartWave === false) return null;
  const state = s.view.state;
  const p = phase.value;
  if (p === 'won' || p === 'lost') return null;
  const next = waveNumber.value + 1;
  if (next > waveTotal.value) return null;
  const rules = getMode(state.modeId);
  const running = p === 'wave' && !rules.overlapWaves;
  const refused = running ? null : rules.canStartWave?.(state) ?? null;
  return (
    <button
      type="button"
      class="btn primary start"
      disabled={running || refused !== null}
      title={refused ?? 'Start the next Wave (Space)'}
      data-testid="start-wave"
      onClick={press(s, s.startWave)}
    >
      {running ? `Wave ${waveNumber.value} running` : refused ?? `Start Wave ${next}`}
      {!running && refused === null && <span class="key">Space</span>}
    </button>
  );
}

/** The sidebar: gold, lives, Wave, speed, the wave preview, the mode's buttons and the selected structure. */
export function Hud({ s }: { s: PlaySession }) {
  return (
    <aside class={`hud interactive${selected.value ? ' has-selection' : ''}`} data-testid="hud">
      <Stats s={s} />
      <Controls s={s} />
      <WavePreviewList s={s} />
      <div class="middle">
        <TowerPanel s={s} />
        <ModeActions s={s} />
      </div>
      <StartWave s={s} />
    </aside>
  );
}

/** Over the board: the placement hint, the paused banner and the end of the Run. */
export function BoardOverlay({ s }: { s: PlaySession }) {
  const h = hint.value;
  const p = phase.value;
  const over = p === 'won' || p === 'lost';
  return (
    <div class="board-overlay">
      <div class="banners">
        {paused.value && !over && (
          <button type="button" class="pill paused interactive" data-testid="paused" onClick={press(s, s.togglePause)}>
            Paused · tap to resume
          </button>
        )}
        {h && !over && <div class={`pill hint ${h.tone}`} data-testid="hint">{h.text}</div>}
      </div>
      {over && (
        <div class="run-over interactive" data-testid="run-over">
          <div class="card">
            <h1>{p === 'won' ? 'Victory' : 'Defeat'}</h1>
            <p>
              {p === 'won' ? `All ${waveTotal.value} Waves cleared` : `Fell on Wave ${waveNumber.value} of ${waveTotal.value}`}
              {s.ui.showLives !== false && p === 'won' && ` with ${lives.value} lives left`}.
            </p>
            <button type="button" class="btn primary" data-testid="play-again" onClick={press(s, s.restart)}>Play again</button>
          </div>
        </div>
      )}
    </div>
  );
}
