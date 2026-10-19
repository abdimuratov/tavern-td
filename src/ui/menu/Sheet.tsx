import type { ComponentChildren } from 'preact';

/**
 * A main-menu page: a Back button, a title and its body. `actions` sit at the
 * header's right end, such as the war map's Waves & Towers; `cls` adds classes.
 */
export function Sheet({ title, onBack, children, wide, cls, actions }: {
  title: string; onBack(): void; children: ComponentChildren; wide?: boolean; cls?: string; actions?: ComponentChildren;
}) {
  return (
    <div class={['sheet', wide ? 'wide' : '', cls ?? ''].filter(Boolean).join(' ')}>
      <header>
        <button type="button" class="btn icon" aria-label="Back" title="Back (Esc)" data-testid="back" onClick={onBack}>‹</button>
        <h1>{title}</h1>
        {actions && <div class="sheet-actions">{actions}</div>}
      </header>
      <div class="sheet-body">{children}</div>
    </div>
  );
}
