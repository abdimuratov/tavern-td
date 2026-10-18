import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { loadRecords, type ModeRecord } from '../../platform/storage';
import { DIFFICULTIES, type Difficulty } from '../../sim';
import { CATALOG, catalogEntry, DIFFICULTY_NAME, difficultyAbout, type CatalogEntry } from '../catalog';
import { ago, clock, num } from '../format';
import type { ConfirmSpec, RecordBoard, RunChoices } from '../mode-ui';
import { appActions, savedRuns, type CodeCheck, type SavedRunInfo } from '../state';
import { SettingsPanel } from './Settings';
import { Sheet } from './Sheet';

/** The New Run choices last picked per Game Mode, so a second Run starts from them. */
const lastChoices = signal<Readonly<Record<string, RunChoices>>>({});

function choicesFor(entry: CatalogEntry | undefined): RunChoices {
  const specs = entry?.ui?.runOptions ?? [];
  const last = entry ? lastChoices.value[entry.id] : undefined;
  return Object.fromEntries(specs.map((o) => [o.id, last?.[o.id] ?? o.default]));
}

type Page =
  | { readonly name: 'main' }
  | { readonly name: 'difficulty'; readonly modeId: string }
  /** A Game Mode's own page (the Original's Stage select) and its sub-page. */
  | { readonly name: 'mode'; readonly modeId: string; readonly view: string }
  | { readonly name: 'records' }
  | { readonly name: 'settings' }
  | { readonly name: 'howto'; readonly modeId: string }
  | { readonly name: 'import' };

function savedLine(info: SavedRunInfo & { ok: true }): string {
  return [info.progress, info.options, DIFFICULTY_NAME[info.difficulty], ago(info.savedAt)].filter(Boolean).join(' · ');
}

function ModeCard({ entry, go }: { entry: CatalogEntry; go(page: Page): void }) {
  const saved = savedRuns.value[entry.id];
  const own = entry.ui?.MenuPage;
  return (
    <section class="mode-card" data-testid={`mode-${entry.id}`}>
      <div class="mode-title">
        <span class={`mode-icon ${entry.id}`} aria-hidden="true" />
        <div>
          <h2>{entry.name}</h2>
          <div class="muted">{entry.origin}</div>
        </div>
      </div>
      <p>{entry.blurb}</p>
      <div class="buttons">
        {saved?.ok && (
          <button type="button" class="btn primary continue" data-testid="continue" onClick={() => appActions.value?.continueRun(entry.id)}>
            <span>Continue</span>
            <span class="detail">{savedLine(saved)}</span>
          </button>
        )}
        {own ? (
          <button type="button" class={`btn${saved?.ok ? '' : ' primary'}`} data-testid="mode-page" onClick={() => go({ name: 'mode', modeId: entry.id, view: '' })}>
            {own.label}
          </button>
        ) : (
          <button type="button" class={`btn${saved?.ok ? '' : ' primary'}`} data-testid="new-run" onClick={() => go({ name: 'difficulty', modeId: entry.id })}>
            New Run
          </button>
        )}
      </div>
      {saved && !saved.ok && <p class="note">{saved.problem}</p>}
    </section>
  );
}

function MainPage({ go }: { go(page: Page): void }) {
  const playable = CATALOG.filter((e) => e.ui);
  const later = CATALOG.filter((e) => !e.ui);
  return (
    <div class="menu-main">
      <header class="menu-head">
        <h1>Tavern TD</h1>
        <span class="muted">A tower defense collection</span>
      </header>
      <div class="menu-cols">
        <div class="modes">
          {playable.map((e) => <ModeCard key={e.id} entry={e} go={go} />)}
          <ul class="later">
            {later.map((e) => (
              <li key={e.id} data-testid={`mode-${e.id}`}>
                <span><b>{e.name}</b> <span class="muted">{e.origin}</span></span>
                <span class="tag soon">Coming later</span>
              </li>
            ))}
          </ul>
        </div>
        <nav class="menu-list side">
          <button type="button" class="btn" data-testid="records" onClick={() => go({ name: 'records' })}>Records</button>
          <button type="button" class="btn" data-testid="settings-button" onClick={() => go({ name: 'settings' })}>Settings</button>
          <button type="button" class="btn" data-testid="howto-button" onClick={() => go({ name: 'howto', modeId: playable[0]?.id ?? 'gem' })}>How to play</button>
          <button type="button" class="btn" data-testid="import" onClick={() => go({ name: 'import' })}>Import save code</button>
        </nav>
      </div>
    </div>
  );
}

function useRecords(modeId: string, board?: string): Record<Difficulty, ModeRecord> | null {
  const [records, setRecords] = useState<Record<Difficulty, ModeRecord> | null>(null);
  useEffect(() => {
    let live = true;
    setRecords(null);
    void loadRecords(modeId, board).then((r) => live && setRecords(r));
    return () => {
      live = false;
    };
  }, [modeId, board]);
  return records;
}

/** A New Run choice as a row of buttons, such as All Pick or All Random. */
function OptionRow({ label, choices, value, testid, onPick }: {
  label: string;
  choices: readonly { readonly id: string; readonly label: string; readonly about: string }[];
  value: string;
  testid: string;
  onPick(id: string): void;
}) {
  return (
    <div class="run-option">
      <span class="option-label">{label}</span>
      <div class="seg" role="group" aria-label={label}>
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            class={`btn${value === c.id ? ' active' : ''}`}
            aria-pressed={value === c.id}
            title={c.about}
            data-testid={`${testid}-${c.id}`}
            onClick={() => onPick(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <span class="option-about" data-testid={`${testid}-about`}>{choices.find((c) => c.id === value)?.about ?? ''}</span>
    </div>
  );
}

function DifficultyPage({ modeId, back, confirm }: { modeId: string; back(): void; confirm(c: ConfirmSpec): void }) {
  const entry = catalogEntry(modeId);
  const ui = entry?.ui;
  const choices = choicesFor(entry);
  const boardId = ui?.recordBoard?.(choices);
  const board = ui?.recordBoards?.find((b) => b.id === boardId);
  const records = useRecords(modeId, boardId);
  /** "Best: Wave 12", the board's own words past its fixed Waves, such as "Boss 3", or the mode's own best (Line Wars' steal). */
  const bestText = (n: number): string => {
    if (ui?.recordWave) return ui.recordWave.best(n);
    const w = board?.wave ? board.wave(n) : String(n);
    return `Best: ${/^\d/.test(w) ? `Wave ${w}` : w}`;
  };
  const saved = savedRuns.value[modeId];
  const pick = (id: string, value: string): void => {
    lastChoices.value = { ...lastChoices.value, [modeId]: { ...choices, [id]: value } };
  };
  const start = (d: Difficulty): void => {
    const run = (): void => appActions.value?.newRun(modeId, d, choices);
    if (saved?.ok) {
      confirm({
        title: 'Start a new Run?',
        text: `Your saved Run (${saved.progress}, ${DIFFICULTY_NAME[saved.difficulty]}) will be replaced.`,
        yes: 'Start new Run',
        run,
      });
    } else run();
  };
  const options = ui?.runOptions ?? [];
  return (
    <Sheet title={`New ${entry?.name ?? modeId} Run`} onBack={back}>
      {options.length > 0 && (
        <div class={`run-options mode-${modeId}`} data-testid="run-options">
          {options.map((o) => (
            <OptionRow key={o.id} label={o.label} choices={o.choices} value={choices[o.id] ?? o.default} testid={`option-${o.id}`} onPick={(v) => pick(o.id, v)} />
          ))}
        </div>
      )}
      <div class="difficulties">
        {DIFFICULTIES.map((d) => {
          const best = records?.[d].bestWave ?? 0;
          return (
            <button key={d} type="button" class={`btn difficulty${d === 'normal' ? ' primary' : ''}`} data-testid={`difficulty-${d}`} onClick={() => start(d)}>
              <span class="name">{DIFFICULTY_NAME[d]}</span>
              <span class="about">{difficultyAbout(modeId, d)}</span>
              <span class="best-wave">{best > 0 ? bestText(best) : records && records[d].played > 0 ? `Played ${records[d].played}` : 'Not played yet'}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function RecordsTable({ modeId, board }: { modeId: string; board?: RecordBoard }) {
  const records = useRecords(modeId, board?.id);
  if (!records) return <p class="muted">Loading…</p>;
  const wave = (n: number): string => (board?.wave ? board.wave(n) : String(n));
  const heading = catalogEntry(modeId)?.ui?.recordWave?.heading ?? 'Best Wave';
  return (
    <table class="records" data-testid={board ? `records-${modeId}-${board.id}` : `records-${modeId}`}>
      <thead>
        <tr><th>Difficulty</th><th>{heading}</th><th>Score</th><th>Fastest win</th><th>Runs</th><th>Won</th></tr>
      </thead>
      <tbody>
        {DIFFICULTIES.map((d) => {
          const r = records[d];
          return (
            <tr key={d}>
              <th>{DIFFICULTY_NAME[d]}</th>
              <td>{r.bestWave > 0 ? wave(r.bestWave) : '–'}</td>
              <td>{r.bestScore > 0 ? num(r.bestScore) : '–'}</td>
              <td>{r.fastestWin !== null ? clock(r.fastestWin) : '–'}</td>
              <td>{r.played}</td>
              <td>{r.won}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RecordsPage({ back }: { back(): void }) {
  return (
    <Sheet title="Records" onBack={back} wide>
      {CATALOG.map((e) => (
        <section key={e.id} class="records-mode">
          <h2>
            {e.name} <span class="muted">{e.origin}</span>
            {!e.ui?.result && !e.ui?.Records && <span class="tag soon">Coming later</span>}
          </h2>
          {e.ui?.Records && <e.ui.Records />}
          {e.ui?.result && !e.ui.Records && !e.ui.recordBoards && <RecordsTable modeId={e.id} />}
          {e.ui?.result && e.ui.recordBoards?.map((b) => (
            <div key={b.id} class="records-board">
              <h3>{b.name}</h3>
              <RecordsTable modeId={e.id} board={b} />
            </div>
          ))}
        </section>
      ))}
    </Sheet>
  );
}

function ImportPage({ back, confirm }: { back(): void; confirm(c: ConfirmSpec): void }) {
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<CodeCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (): Promise<void> => {
    const actions = appActions.value;
    if (!actions || code.trim() === '') return;
    setBusy(true);
    setCheck(await actions.checkCode(code));
    setBusy(false);
  };
  const go = (c: CodeCheck & { ok: true }): void => {
    const saved = savedRuns.value[c.modeId];
    if (saved?.ok) {
      confirm({
        title: 'Replace your saved Run?',
        text: `Your saved ${catalogEntry(c.modeId)?.name ?? ''} Run (${saved.progress}, ${DIFFICULTY_NAME[saved.difficulty]}) will be replaced.`,
        yes: 'Replace and continue',
        run: c.start,
      });
    } else c.start();
  };
  return (
    <Sheet title="Import save code" onBack={back}>
      <p class="muted">Paste a code from Export save code.</p>
      <textarea
        class="code"
        rows={3}
        placeholder="TTD1…"
        value={code}
        spellcheck={false}
        autocomplete="off"
        data-testid="import-code"
        onInput={(e) => {
          setCode((e.currentTarget as HTMLTextAreaElement).value);
          setCheck(null);
        }}
      />
      <div class="buttons">
        <button type="button" class="btn" disabled={busy || code.trim() === ''} data-testid="import-load" onClick={() => void load()}>Check code</button>
        {check?.ok && (
          <button type="button" class="btn primary" data-testid="import-continue" onClick={() => go(check)}>
            Continue {catalogEntry(check.modeId)?.name} · {check.progress} · {check.options ? `${check.options} · ` : ''}{DIFFICULTY_NAME[check.difficulty]}
          </button>
        )}
      </div>
      {check && !check.ok && <p class="error" data-testid="import-error">{check.message}</p>}
    </Sheet>
  );
}

function ConfirmDialog({ c, close }: { c: ConfirmSpec; close(): void }) {
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal" role="alertdialog" aria-label={c.title} data-testid="confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{c.title}</h2>
        <p>{c.text}</p>
        <div class="buttons">
          <button type="button" class="btn" onClick={close}>Cancel</button>
          <button type="button" class="btn primary" data-testid="confirm-yes" onClick={() => { close(); c.run(); }}>{c.yes}</button>
        </div>
      </div>
    </div>
  );
}

/** The main menu: Game Modes, Continue and New Run, Records, Settings, How to play and Import save code. */
export function Menu() {
  const [page, setPage] = useState<Page>({ name: 'main' });
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const back = (): void => setPage({ name: 'main' });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (confirm) setConfirm(null);
      else if (page.name === 'mode' && page.view !== '') setPage({ ...page, view: '' });
      else setPage({ name: 'main' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, page]);
  let body: ComponentChildren;
  switch (page.name) {
    case 'main': body = <MainPage go={setPage} />; break;
    case 'difficulty': body = <DifficultyPage modeId={page.modeId} back={back} confirm={setConfirm} />; break;
    case 'mode': {
      const Own = catalogEntry(page.modeId)?.ui?.MenuPage?.Page;
      body = Own ? <Own view={page.view} go={(view) => setPage({ ...page, view })} back={back} confirm={setConfirm} /> : null;
      break;
    }
    case 'records': body = <RecordsPage back={back} />; break;
    case 'settings': body = <Sheet title="Settings" onBack={back}><SettingsPanel /></Sheet>; break;
    case 'howto': {
      const HowTo = catalogEntry(page.modeId)?.ui?.HowTo;
      const modes = CATALOG.filter((e) => e.ui?.HowTo);
      body = (
        <Sheet title={`How to play ${catalogEntry(page.modeId)?.name ?? ''}`} onBack={back} wide>
          {modes.length > 1 && (
            <div class="seg howto-modes" role="tablist" aria-label="Game Mode">
              {modes.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="tab"
                  class={`btn${e.id === page.modeId ? ' active' : ''}`}
                  aria-selected={e.id === page.modeId}
                  data-testid={`howto-${e.id}`}
                  onClick={() => setPage({ name: 'howto', modeId: e.id })}
                >
                  {e.name}
                </button>
              ))}
            </div>
          )}
          {HowTo ? <HowTo /> : null}
        </Sheet>
      );
      break;
    }
    case 'import': body = <ImportPage back={back} confirm={setConfirm} />; break;
  }
  return (
    <div class="screen menu interactive" data-testid="menu">
      {body}
      {confirm && <ConfirmDialog c={confirm} close={() => setConfirm(null)} />}
    </div>
  );
}
