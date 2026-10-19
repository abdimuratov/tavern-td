import { useEffect, useRef, useState } from 'preact/hooks';
import { press } from './Hud';
import { SettingsPanel } from './menu/Settings';
import { runMenu, type PlaySession, type RunMenuPage } from './state';

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
  export: 'Export save code',
};

/**
 * The in-Run menu: Resume, Settings, How to play, Export save code (not in
 * Versus), Quit to menu. The Run stays paused while it is open.
 */
export function RunMenu({ s, page }: { s: PlaySession; page: RunMenuPage }) {
  const HowTo = s.ui.HowTo;
  const back = (): void => {
    if (page === 'main') s.closeMenu();
    else runMenu.value = 'main';
  };
  return (
    <div class="screen run-menu interactive" data-testid="run-menu">
      <div class={`sheet${page === 'howto' ? ' wide' : page === 'main' ? ' narrow' : ''}`}>
        <header>
          <button type="button" class="btn icon" aria-label={page === 'main' ? 'Resume' : 'Back'} title="Back (Esc)" onClick={press(s, back)}>
            {page === 'main' ? '×' : '‹'}
          </button>
          <h1>{TITLE[page]}</h1>
        </header>
        <div class="sheet-body">
          {page === 'main' && (
            <nav class="menu-list">
              <button type="button" class="btn primary" data-testid="resume" onClick={press(s, s.closeMenu)}>Resume</button>
              <button type="button" class="btn" onClick={press(s, () => (runMenu.value = 'settings'))}>Settings</button>
              {HowTo && <button type="button" class="btn" onClick={press(s, () => (runMenu.value = 'howto'))}>How to play</button>}
              {s.exportCode && (
                <button type="button" class="btn" data-testid="export" onClick={press(s, () => (runMenu.value = 'export'))}>Export save code</button>
              )}
              <button type="button" class="btn" data-testid="quit" onClick={press(s, s.quit)}>Quit to menu</button>
            </nav>
          )}
          {page === 'settings' && <SettingsPanel />}
          {page === 'howto' && HowTo && <HowTo />}
          {page === 'export' && s.exportCode && <ExportCode s={s} exportCode={s.exportCode} />}
        </div>
      </div>
    </div>
  );
}
