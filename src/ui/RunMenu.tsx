import { useEffect, useRef, useState } from 'preact/hooks';
import { press } from './Hud';
import { SettingsPanel } from './menu/Settings';
import { ReferenceBody } from './reference/Reference';
import { runMenu, type PlaySession, type RunMenuPage } from './state';
import { versus, versusActions } from './versus/state';

/** Copies the code if the browser lets us, and always shows it in a box to select by hand: iOS can refuse the clipboard. */
function ExportCode({ s, exportCode }: { s: PlaySession; exportCode(): Promise<string> }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const copy = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      box.current?.focus();
    }
  };
  useEffect(() => {
    let live = true;
    void exportCode().then((c) => {
      if (!live) return;
      setCode(c);
      void copy(c);
    });
    return () => {
      live = false;
    };
  }, [exportCode]);
  return (
    <>
      <p class="muted">
        {code === null ? 'Making the code…' : copied ? 'Copied. Paste it anywhere to keep it, then use Import save code to load it.' : 'Copy this code to keep the Run. Import save code loads it again.'}
      </p>
      <textarea
        ref={box}
        class="code"
        readOnly
        rows={4}
        value={code ?? ''}
        data-testid="export-code"
        onFocus={(e) => {
          // select() alone doesn't select on iOS; the range does.
          const el = e.currentTarget as HTMLTextAreaElement;
          el.select();
          el.setSelectionRange(0, el.value.length);
        }}
      />
      <div class="buttons">
        <button type="button" class="btn" disabled={code === null} onClick={press(s, () => code && void copy(code))}>Copy</button>
      </div>
    </>
  );
}

const TITLE: Readonly<Record<RunMenuPage, string>> = {
  main: 'Paused',
  settings: 'Settings',
  howto: 'How to play',
  reference: 'Waves & Towers',
  export: 'Export save code',
  concede: 'Concede',
};

/** Copy desync report, saying whether the copy took. */
function CopyReport({ s, copy }: { s: PlaySession; copy(): Promise<boolean> }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <button type="button" class="btn" data-testid="copy-report" onClick={press(s, () => void copy().then(setCopied))}>
      {copied === null ? 'Copy desync report' : copied ? 'Copied the desync report' : "Couldn't copy the report"}
    </button>
  );
}

/**
 * The in-Run menu: Resume, Settings, How to play, Waves & Towers, Export save
 * code (not in Versus), Quit to menu. The Run stays paused while it is open,
 * on every page of it. In a Versus
 * session it doesn't pause, since the Rival plays on (versus-design §5.1):
 * Pause asks both devices to stop, Concede replaces Quit, and Copy desync
 * report appears after a Desync.
 */
export function RunMenu({ s, page }: { s: PlaySession; page: RunMenuPage }) {
  const HowTo = s.ui.HowTo;
  const reference = s.ui.reference;
  const referenceButton = reference && (
    <button type="button" class="btn" data-testid="reference-button" onClick={press(s, () => (runMenu.value = 'reference'))}>Waves &amp; Towers</button>
  );
  // A Versus session's Run; the mirror rehearsal (Versus' display, no session) keeps Resume and Quit.
  const vs = s.versus && versus.value ? versusActions.value : null;
  const report = vs !== null && versus.value?.report === true;
  const back = (): void => {
    if (page === 'main') s.closeMenu();
    else runMenu.value = 'main';
  };
  return (
    <div class="screen run-menu interactive" data-testid="run-menu">
      <div class={`sheet${page === 'howto' ? ' wide' : page === 'reference' ? ' wide ref-sheet' : page === 'main' ? ' narrow' : ''}`}>
        <header>
          <button type="button" class="btn icon" aria-label={page === 'main' ? 'Resume' : 'Back'} title="Back (Esc)" onClick={press(s, back)}>
            {page === 'main' ? '×' : '‹'}
          </button>
          <h1>{page === 'main' && vs ? 'Menu' : TITLE[page]}</h1>
        </header>
        <div class="sheet-body">
          {page === 'main' && vs && (
            <nav class="menu-list">
              <button type="button" class="btn primary" data-testid="resume" onClick={press(s, s.closeMenu)}>Back to the Run</button>
              <button
                type="button"
                class="btn"
                data-testid="versus-menu-pause"
                onClick={press(s, () => {
                  s.closeMenu();
                  vs.pause();
                })}
              >
                Pause
              </button>
              {HowTo && <button type="button" class="btn" onClick={press(s, () => (runMenu.value = 'howto'))}>How to play</button>}
              {referenceButton}
              <button type="button" class="btn" onClick={press(s, () => (runMenu.value = 'settings'))}>Settings</button>
              {report && <CopyReport s={s} copy={vs.copyReport} />}
              <button type="button" class="btn danger" data-testid="concede" onClick={press(s, () => (runMenu.value = 'concede'))}>Concede</button>
            </nav>
          )}
          {page === 'concede' && vs && (
            <>
              <p>Concede this Run? It counts as a loss for you and a win for the Rival, and you go back to the menu.</p>
              <div class="buttons">
                <button type="button" class="btn danger" data-testid="concede-yes" onClick={press(s, vs.concede)}>Concede</button>
                <button type="button" class="btn" onClick={press(s, () => (runMenu.value = 'main'))}>Keep playing</button>
              </div>
            </>
          )}
          {page === 'main' && !vs && (
            <nav class="menu-list">
              <button type="button" class="btn primary" data-testid="resume" onClick={press(s, s.closeMenu)}>Resume</button>
              <button type="button" class="btn" onClick={press(s, () => (runMenu.value = 'settings'))}>Settings</button>
              {HowTo && <button type="button" class="btn" onClick={press(s, () => (runMenu.value = 'howto'))}>How to play</button>}
              {referenceButton}
              {s.exportCode && (
                <button type="button" class="btn" data-testid="export" onClick={press(s, () => (runMenu.value = 'export'))}>Export save code</button>
              )}
              <button type="button" class="btn" data-testid="quit" onClick={press(s, s.quit)}>Quit to menu</button>
            </nav>
          )}
          {page === 'settings' && <SettingsPanel />}
          {page === 'howto' && HowTo && <HowTo />}
          {page === 'reference' && reference && <ReferenceBody reference={reference} ctx={{ view: s.view }} />}
          {page === 'export' && s.exportCode && <ExportCode s={s} exportCode={s.exportCode} />}
        </div>
      </div>
    </div>
  );
}
