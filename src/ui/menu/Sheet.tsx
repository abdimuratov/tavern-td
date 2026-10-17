import type { ComponentChildren } from 'preact';

/** A main-menu page: a Back button, a title and its body. */
export function Sheet({ title, onBack, children, wide }: { title: string; onBack(): void; children: ComponentChildren; wide?: boolean }) {
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
