/** The parts of a KeyboardEvent the registry reads, so tests can pass plain objects. */
export interface KeyLike {
  readonly key: string;
  readonly code: string;
  readonly repeat?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly target?: EventTarget | null;
}

export interface HotkeyBinding {
  readonly key: string;
  readonly label: string;
}

export interface Hotkeys {
  /**
   * Binds a key (a lower-case letter or digit, `space` or `escape`) until the
   * returned function is called. The latest binding of a key wins, so a Game
   * Mode's button can take over a core key while it is on screen.
   */
  bind(key: string, label: string, run: () => void): () => void;
  /** What each key does right now, for a help overlay. */
  list(): HotkeyBinding[];
  /** Runs the binding for a key press; true when one ran. */
  handle(e: KeyLike): boolean;
  /** Listens for key presses on `target` until the returned function is called. */
  attach(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void;
}

/**
 * Letters and digits by physical key, so the WC3 layout works the same with a
 * Russian or Kazakh keyboard layout active; other keys by name.
 */
export function keyName(e: Pick<KeyLike, 'key' | 'code'>): string {
  const code = e.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^(Digit|Numpad)\d$/.test(code)) return code.slice(-1);
  if (code === 'Space' || e.key === ' ') return 'space';
  return e.key.toLowerCase();
}

function typing(target: EventTarget | null | undefined): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null | undefined;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true);
}

interface Entry {
  readonly key: string;
  readonly label: string;
  readonly run: () => void;
}

export function createHotkeys(): Hotkeys {
  const entries: Entry[] = [];

  const handle = (e: KeyLike): boolean => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return false;
    const key = keyName(e);
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;
      if (entry.key !== key) continue;
      entry.run();
      return true;
    }
    return false;
  };

  return {
    bind(key, label, run) {
      const entry: Entry = { key: key.toLowerCase(), label, run };
      entries.push(entry);
      return () => {
        const i = entries.indexOf(entry);
        if (i >= 0) entries.splice(i, 1);
      };
    },
    list() {
      const seen = new Set<string>();
      const out: HotkeyBinding[] = [];
      for (let i = entries.length - 1; i >= 0; i--) {
        const { key, label } = entries[i]!;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ key, label });
      }
      return out.reverse();
    },
    handle,
    attach(target) {
      const onKey = (e: KeyboardEvent): void => {
        if (handle(e)) e.preventDefault();
      };
      target.addEventListener('keydown', onKey);
      return () => target.removeEventListener('keydown', onKey);
    },
  };
}
