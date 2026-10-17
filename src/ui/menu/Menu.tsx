import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { loadRecords, type ModeRecord } from '../../platform/storage';
import { DIFFICULTIES, type Difficulty } from '../../sim';
import { CATALOG, catalogEntry, DIFFICULTY_NAME, difficultyAbout, type CatalogEntry } from '../catalog';
import { ago, clock, num } from '../format';
import { appActions, savedRuns, type CodeCheck, type SavedRunInfo } from '../state';
import { SettingsPanel } from './Settings';

type Page =
  | { readonly name: 'main' }
  | { readonly name: 'difficulty'; readonly modeId: string }
  | { readonly name: 'records' }
  | { readonly name: 'settings' }
  | { readonly name: 'howto'; readonly modeId: string }
  | { readonly name: 'import' };

interface Confirm {
  readonly title: string;
  readonly text: string;
  readonly yes: string;
  run(): void;
}

function Sheet({ title, onBack, children, wide }: { title: string; onBack(): void; children: ComponentChildren; wide?: boolean }) {
  return (
    <div class={`sheet${wide ? ' wide' : ''}`}>
      <header>
        <button type="button" class="btn icon" aria-label="Back" title="Back (Esc)" data-testid="back" onClick={onBack}>‹</button>
        <h1>{title}</h1>
      </header>
      <div class="sheet-body">{children}</div>
    </div>
  );
}

function savedLine(info: SavedRunInfo & { ok: true }): string {
  return `Wave ${info.wave} · ${DIFFICULTY_NAME[info.difficulty]} · ${ago(info.savedAt)}`;
}

function ModeCard({ entry, go }: { entry: CatalogEntry; go(page: Page): void }) {
  const saved = savedRuns.value[entry.id];
  return (
    <section class="mode-card" data-testid={`mode-${entry.id}`}>
      <div class="mode-title">
        <span class="gem-icon" aria-hidden="true" />
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
        <button type="button" class={`btn${saved?.ok ? '' : ' primary'}`} data-testid="new-run" onClick={() => go({ name: 'difficulty', modeId: entry.id })}>
          New Run
        </button>
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
          <button type="button" class="btn" data-testid="howto-button" onClick={() => go({ name: 'howto', modeId: 'gem' })}>How to play</button>
          <button type="button" class="btn" data-testid="import" onClick={() => go({ name: 'import' })}>Import save code</button>
        </nav>
      </div>
    </div>
  );
}

function useRecords(modeId: string): Record<Difficulty, ModeRecord> | null {
  const [records, setRecords] = useState<Record<Difficulty, ModeRecord> | null>(null);
  useEffect(() => {
    let live = true;
    void loadRecords(modeId).then((r) => live && setRecords(r));
    return () => {
      live = false;
    };
  }, [modeId]);
  return records;
}

function DifficultyPage({ modeId, back, confirm }: { modeId: string; back(): void; confirm(c: Confirm): void }) {
  const entry = catalogEntry(modeId);
  const records = useRecords(modeId);
  const saved = savedRuns.value[modeId];
  const start = (d: Difficulty): void => {
    const run = (): void => appActions.value?.newRun(modeId, d);
    if (saved?.ok) {
      confirm({
        title: 'Start a new Run?',
        text: `Your saved Run (Wave ${saved.wave}, ${DIFFICULTY_NAME[saved.difficulty]}) will be replaced.`,
        yes: 'Start new Run',
        run,
      });
    } else run();
  };
  return (
    <Sheet title={`New ${entry?.name ?? modeId} Run`} onBack={back}>
      <div class="difficulties">
        {DIFFICULTIES.map((d) => {
          const best = records?.[d].bestWave ?? 0;
          return (
            <button key={d} type="button" class={`btn difficulty${d === 'normal' ? ' primary' : ''}`} data-testid={`difficulty-${d}`} onClick={() => start(d)}>
              <span class="name">{DIFFICULTY_NAME[d]}</span>
              <span class="about">{difficultyAbout(modeId, d)}</span>
              <span class="best-wave">{best > 0 ? `Best: Wave ${best}` : 'Not played yet'}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function RecordsTable({ modeId }: { modeId: string }) {
  const records = useRecords(modeId);
  if (!records) return <p class="muted">Loading…</p>;
  return (
    <table class="records" data-testid={`records-${modeId}`}>
      <thead>
        <tr><th>Difficulty</th><th>Best Wave</th><th>Score</th><th>Fastest win</th><th>Runs</th><th>Won</th></tr>
      </thead>
      <tbody>
        {DIFFICULTIES.map((d) => {
          const r = records[d];
          return (
            <tr key={d}>
              <th>{DIFFICULTY_NAME[d]}</th>
              <td>{r.bestWave > 0 ? r.bestWave : '–'}</td>
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
            {!e.ui?.result && <span class="tag soon">Coming later</span>}
          </h2>
          {e.ui?.result && <RecordsTable modeId={e.id} />}
        </section>
      ))}
    </Sheet>
  );
}

function ImportPage({ back, confirm }: { back(): void; confirm(c: Confirm): void }) {
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
        text: `Your saved ${catalogEntry(c.modeId)?.name ?? ''} Run (Wave ${saved.wave}, ${DIFFICULTY_NAME[saved.difficulty]}) will be replaced.`,
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
            Continue {catalogEntry(check.modeId)?.name} · Wave {check.wave} · {DIFFICULTY_NAME[check.difficulty]}
          </button>
        )}
      </div>
      {check && !check.ok && <p class="error" data-testid="import-error">{check.message}</p>}
    </Sheet>
  );
}

function ConfirmDialog({ c, close }: { c: Confirm; close(): void }) {
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
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const back = (): void => setPage({ name: 'main' });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (confirm) setConfirm(null);
      else setPage({ name: 'main' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm]);
  let body: ComponentChildren;
  switch (page.name) {
    case 'main': body = <MainPage go={setPage} />; break;
    case 'difficulty': body = <DifficultyPage modeId={page.modeId} back={back} confirm={setConfirm} />; break;
    case 'records': body = <RecordsPage back={back} />; break;
    case 'settings': body = <Sheet title="Settings" onBack={back}><SettingsPanel /></Sheet>; break;
    case 'howto': {
      const HowTo = catalogEntry(page.modeId)?.ui?.HowTo;
      body = <Sheet title={`How to play ${catalogEntry(page.modeId)?.name ?? ''}`} onBack={back} wide>{HowTo ? <HowTo /> : null}</Sheet>;
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
