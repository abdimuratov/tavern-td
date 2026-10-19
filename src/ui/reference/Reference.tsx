import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { hex } from '../Hud';
import { Sheet } from '../menu/Sheet';
import type {
  ModeReference, ReferenceContext, ReferenceCurrent, ReferenceFilter, ReferenceRank, ReferenceRow, ReferenceSection, ReferenceTabId,
  ReferenceTag, ReferenceValues,
} from './types';

// The Waves & Towers sheet, one for every Game Mode: a Waves tab (Line Wars'
// Sends) and a Towers tab over the mode's own rows (ModeUi.reference), with
// its filters in one short row. Rows are one line each and expand on a tap,
// Enter or Space; ← and → switch the tabs, and Esc is the host's Back (the
// main menu's, or the in-Run menu's, which keeps the Run paused).

const NO_CURRENT: ReferenceCurrent = { now: null, next: null };

/** Typing in a select or a text box keeps its arrow keys. */
function typing(target: EventTarget | null): boolean {
  const el = target as { tagName?: string } | null;
  return !!el && (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

function Tags({ tags }: { tags: readonly ReferenceTag[] | undefined }) {
  if (!tags || tags.length === 0) return null;
  return <>{tags.map((t, i) => <span key={i} class={`tag ${t.tone ?? 'trait'}`} title={t.about}>{t.text}</span>)}</>;
}

function Dot({ color }: { color: number | undefined }) {
  return color === undefined ? null : <span class="dot" style={{ background: hex(color) }} aria-hidden="true" />;
}

function Rank({ r }: { r: ReferenceRank }) {
  const whys = r.items.filter((i) => i.why && i.why.length > 0);
  return (
    <div class="ref-rank" data-testid="ref-rank">
      <span class="label">{r.label}</span>
      <ol>
        {r.items.map((item, i) => (
          <li key={i} class={item.rank === 1 ? 'best' : ''} data-rank={item.rank} title={item.why?.join('; ')}>
            {item.text}{item.value && <span class="value"> {item.value}</span>}
          </li>
        ))}
      </ol>
      {(r.note || whys.length > 0) && (
        <p class="ref-why">
          {[...whys.map((i) => `${i.text}: ${i.why!.join('; ')}`), ...(r.note ? [r.note] : [])].join(' · ')}
        </p>
      )}
    </div>
  );
}

function Section({ s }: { s: ReferenceSection }) {
  return (
    <section class="ref-sec">
      {(s.title || s.tags) && (
        <h4><Dot color={s.swatch} />{s.title && <span class="title">{s.title}</span>}<Tags tags={s.tags} /></h4>
      )}
      {s.facts && s.facts.length > 0 && (
        <dl class="ref-facts">
          {s.facts.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {s.lines && s.lines.length > 0 && <ul class="ref-lines">{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {s.ranks?.map((r, i) => <Rank key={i} r={r} />)}
    </section>
  );
}

const MARK_TEXT = { now: 'Now', next: 'Next' } as const;

function Row({ row, open, toggle, mark, head }: {
  row: ReferenceRow; open: boolean; toggle(): void; mark: 'now' | 'next' | null; head?: boolean;
}) {
  const expandable = row.sections.length > 0;
  const cls = ['ref-item', head ? 'head' : '', mark ?? '', row.off ? 'off' : '', open ? 'open' : ''].filter(Boolean).join(' ');
  return (
    <div class={cls} data-row={row.id}>
      <button
        type="button"
        class="btn ref-row"
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable ? `ref-detail-${row.id}` : undefined}
        disabled={!expandable}
        title={row.off}
        data-testid={`ref-row-${row.id}`}
        data-mark={mark ?? undefined}
        onClick={toggle}
      >
        {row.lead && <span class="lead">{row.lead}</span>}
        <Dot color={row.swatch} />
        <span class="title">{row.title}</span>
        <Tags tags={row.tags} />
        {mark && <span class="tag mark">{MARK_TEXT[mark]}</span>}
        {row.summary && <span class="summary">{row.summary}</span>}
        {expandable && <span class="chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>}
      </button>
      {open && expandable && (
        <div class="ref-detail" id={`ref-detail-${row.id}`} data-testid={`ref-detail-${row.id}`}>
          {row.off && <p class="ref-off">{row.off}</p>}
          {row.sections.map((s, i) => <Section key={i} s={s} />)}
        </div>
      )}
    </div>
  );
}

function Filter({ f, set }: { f: ReferenceFilter; set(id: string, value: string): void }) {
  const current = f.choices.find((c) => c.id === f.value);
  if (f.locked) {
    return (
      <span class="ref-locked" title={f.locked} data-testid={`ref-filter-${f.id}`} data-locked="true">
        {f.kind === 'toggle' ? f.label : current?.label ?? f.value}
        <span class="why">· {f.locked}</span>
      </span>
    );
  }
  if (f.kind === 'select') {
    return (
      <select
        class="ref-select"
        aria-label={f.label}
        title={current?.about}
        value={f.value}
        data-testid={`ref-filter-${f.id}`}
        onChange={(e) => set(f.id, (e.currentTarget as HTMLSelectElement).value)}
      >
        {f.choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
    );
  }
  if (f.kind === 'toggle') {
    const [off, on] = [f.choices[0]?.id ?? '0', f.choices[1]?.id ?? '1'];
    const pressed = f.value === on;
    return (
      <button
        type="button"
        class={`btn ref-toggle${pressed ? ' active' : ''}`}
        aria-pressed={pressed}
        title={f.choices[1]?.about}
        data-testid={`ref-filter-${f.id}`}
        onClick={() => set(f.id, pressed ? off : on)}
      >
        {f.short ? <><span class="long">{f.label}</span><span class="short">{f.short}</span></> : f.label}
      </button>
    );
  }
  return (
    <div class="seg" role="group" aria-label={f.label}>
      {f.choices.map((c) => (
        <button
          key={c.id}
          type="button"
          class={`btn${f.value === c.id ? ' active' : ''}`}
          aria-pressed={f.value === c.id}
          title={c.about}
          data-testid={`ref-filter-${f.id}-${c.id}`}
          onClick={() => set(f.id, c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The sheet's body: the Waves and Towers tabs, the filter row and the list.
 * In a Run (`ctx.view`) the Waves tab marks the Wave being fought (Now) and the
 * next (Next), opens both and scrolls to them.
 */
export function ReferenceBody({ reference, ctx }: { reference: ModeReference; ctx: ReferenceContext }) {
  const [tab, setTab] = useState<ReferenceTabId>('waves');
  const [values, setValues] = useState<ReferenceValues>(() => reference.defaults(ctx));
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const list = useRef<HTMLDivElement>(null);
  const filters = reference.filters(values, ctx);
  const content = useMemo(() => (tab === 'waves' ? reference.waves(values) : reference.towers(values)), [reference, tab, values]);
  const current = ctx.view && reference.current ? reference.current(ctx.view, values) : NO_CURRENT;

  // Now and Next open, and the list scrolls to them, whenever they come into view.
  const marked = tab === 'waves' ? `${current.now ?? ''}|${current.next ?? ''}` : '';
  useLayoutEffect(() => {
    if (marked === '' || marked === '|') return;
    const ids = [current.now, current.next].filter((x): x is string => x !== null);
    setOpen((o) => new Set([...o, ...ids]));
    const first = ids[0];
    const el = first ? list.current?.querySelector(`[data-row="${CSS.escape(first)}"]`) : null;
    if (el && list.current) list.current.scrollTop = (el as HTMLElement).offsetTop - list.current.offsetTop;
    // `marked` stands for `current`, which is a new object on every render.
  }, [marked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setTab((t) => (t === 'waves' ? 'towers' : 'waves'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const set = (id: string, value: string): void => setValues((v) => ({ ...v, [id]: value }));
  const toggle = (id: string): void => setOpen((o) => {
    const next = new Set(o);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const markOf = (id: string): 'now' | 'next' | null => (tab !== 'waves' ? null : id === current.now ? 'now' : id === current.next ? 'next' : null);
  const tabButton = (id: ReferenceTabId, label: string): ComponentChildren => (
    <button
      type="button"
      role="tab"
      class={`btn${tab === id ? ' active' : ''}`}
      aria-selected={tab === id}
      aria-controls="ref-panel"
      data-testid={`ref-tab-${id}`}
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );
  return (
    <div class="ref" data-testid="reference">
      <div class="ref-bar">
        <div class="seg ref-tabs" role="tablist" aria-label="Waves & Towers">
          {tabButton('waves', reference.wavesLabel ?? 'Waves')}
          {tabButton('towers', 'Towers')}
        </div>
        {filters.filter((f) => !f.tabs || f.tabs.includes(tab)).map((f) => <Filter key={f.id} f={f} set={set} />)}
      </div>
      {(content.intro || content.note) && (
        <div class="ref-intro" data-testid="ref-intro">
          {content.note && <span class="ref-note" data-testid="ref-note">{content.note}</span>}
          <Tags tags={content.intro} />
        </div>
      )}
      <div class="ref-list" id="ref-panel" role="tabpanel" ref={list} data-testid={`ref-${tab}`}>
        {content.groups.map((g) => (
          <div key={g.id} class="ref-group" data-testid={`ref-group-${g.id}`}>
            {g.head && <Row row={g.head} head open={open.has(g.head.id)} toggle={() => toggle(g.head!.id)} mark={null} />}
            {g.rows.map((r) => <Row key={r.id} row={r} open={open.has(r.id)} toggle={() => toggle(r.id)} mark={markOf(r.id)} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A Game Mode that has the sheet, as the main menu's tabs list it. */
export interface ReferenceMode {
  readonly id: string;
  readonly name: string;
  readonly reference: ModeReference;
}

/**
 * The sheet as a main-menu page: Back, its title, a tab per Game Mode when
 * there is a choice (`pick`), and the body.
 */
export function ReferenceSheet({ modes, modeId, pick, ctx = {}, onBack }: {
  modes: readonly ReferenceMode[];
  modeId: string;
  pick?(id: string): void;
  ctx?: ReferenceContext;
  onBack(): void;
}) {
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];
  const tabs = pick && (
    <div class="seg ref-modes" role="tablist" aria-label="Game Mode">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          class={`btn${m.id === mode?.id ? ' active' : ''}`}
          aria-selected={m.id === mode?.id}
          data-testid={`reference-mode-${m.id}`}
          onClick={() => pick(m.id)}
        >
          {m.name}
        </button>
      ))}
    </div>
  );
  return (
    <Sheet title="Waves & Towers" onBack={onBack} wide cls="ref-sheet" actions={tabs}>
      {mode && <ReferenceBody key={mode.id} reference={mode.reference} ctx={ctx} />}
    </Sheet>
  );
}
