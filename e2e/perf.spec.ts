import { mkdirSync, writeFileSync } from 'node:fs';
import type { Browser, BrowserContextOptions, CDPSession, Page } from '@playwright/test';
import { writeCode } from '../src/app/saves';
import { createRun, restore, snapshot, step, type Command, type GameState, type Replay, type ReplayEntry } from '../src/sim';
import { talentsFor } from '../tools/balance/jobs';
import { playRun as playElement } from '../tests/sim/element/bot';
import { playRun as playGem } from '../tests/sim/gem/bot';
import { pairingFor, playLw } from '../tests/sim/linewars/bots';
import { playRun as playMaul } from '../tests/sim/maul/bot';
import { playStage } from '../tests/sim/original/bot';
import { expect, test, testContext } from './fixtures';

// Frame times on a phone-sized screen with the CPU slowed 4× (PLAN §2's 60 fps
// budget), during each Game Mode's busiest moment of a bot's whole Run. Run it
// by hand, one Chromium project and one worker, to keep the machine cool:
//
//   TAVERN_PERF=1 pnpm exec playwright test e2e/perf.spec.ts --project=android --workers=1
//
// It skips without TAVERN_PERF, so CI's four projects never run it. CDP's
// throttling is Chromium's, so both phone sizes (the iphone and android
// projects' landscape viewports) are measured in Chromium. The throttle slows
// the page's main thread only, and the GPU is the Mac's, so a phone's fill
// rate isn't measured. It prints each window's numbers and the 3× window's
// hottest functions, and writes the numbers and CPU profiles under
// test-results/perf/. TAVERN_PERF_TRACE=1 adds a trace of the fit 1× window,
// broken down by trace event.

const ON = !!process.env['TAVERN_PERF'];
const THROTTLE = Number(process.env['TAVERN_PERF_THROTTLE'] ?? 4);
/** Each measured window, in real milliseconds. */
const WINDOW_MS = Number(process.env['TAVERN_PERF_MS'] ?? 5000);
const OUT = 'test-results/perf';
/** Also take a Chromium trace of the fit 1× window and break its main thread down by event. */
const TRACE = !!process.env['TAVERN_PERF_TRACE'];

test.skip(!ON, 'set TAVERN_PERF=1 to measure frame times');
test.describe.configure({ mode: 'serial', timeout: 240_000 });
// Headless Chromium draws WebGL with SwiftShader on the CPU, which would bury
// the page's own work under software rasterising; on a Mac this asks for the GPU.
test.use({ launchOptions: { args: ['--use-angle=metal'] } });

/** The iphone and android projects' landscape screens (playwright.config.ts), as Chromium contexts. */
const SCREENS: Record<string, BrowserContextOptions> = {
  iphone: { viewport: { width: 659, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  android: { viewport: { width: 839, height: 412 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
};

// --- Busy states from the bots' Runs ----------------------------------------------

/** Replays `r` to 5 s before its most crowded tick at or after `from`, as a fresh JSON state. */
function nearPeak(r: Replay, until: number, from: number): GameState {
  const byTick = new Map<number, Command[]>();
  for (const e of r.log) byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e.command as Command]);
  const s = createRun(r);
  let peak = { tick: from, creeps: -1 };
  while (s.tick < until && s.phase !== 'won' && s.phase !== 'lost') {
    step(s, byTick.get(s.tick) ?? []);
    if (s.tick >= from && s.creeps.length > peak.creeps) peak = { tick: s.tick, creeps: s.creeps.length };
  }
  const at = Math.max(from, peak.tick - 150);
  const t = createRun(r);
  while (t.tick < at) step(t, byTick.get(t.tick) ?? []);
  return restore(snapshot(t));
}

const BUSY: Record<string, () => GameState> = {
  gem() {
    const log: ReplayEntry[] = [];
    const b = playGem(1, 'normal', undefined, { record: log });
    return nearPeak({ mode: 'gem', seed: 1, difficulty: 'normal', log }, b.ticks, Math.floor(b.ticks / 2));
  },
  element() {
    const log: ReplayEntry[] = [];
    const b = playElement(1, 'normal', { length: 'full', record: log });
    return nearPeak({ mode: 'element', seed: 1, difficulty: 'normal', options: { picks: 'allPick', length: 'full' }, log }, b.ticks, Math.floor(b.ticks * 0.7));
  },
  original() {
    const log: ReplayEntry[] = [];
    const talents = talentsFor({ stage: 6, strategy: 'balanced' });
    const b = playStage(1, 'normal', { stage: 6, cleared: 5, strategy: 'balanced', style: 1, talents, record: log });
    return nearPeak({ mode: 'original', seed: 1, difficulty: 'normal', options: { stage: 6, talents: [...talents], cleared: 5 }, log }, b.ticks, Math.floor(b.ticks / 2));
  },
  maul() {
    const log: ReplayEntry[] = [];
    const b = playMaul(1, 'normal', { race: 'ironclad', record: log });
    return nearPeak({ mode: 'maul', seed: 1, difficulty: 'normal', options: { race: 'ironclad' }, log }, b.ticks, Math.floor(b.ticks * 0.7));
  },
  linewars() {
    // Both Sides played by the AI to the busiest moment, then Side 0 handed to a person, as in a real Run.
    const seed = 1;
    const [race, rivalRace] = pairingFor(seed);
    const b = playLw(seed, 'insane');
    const r: Replay = { mode: 'linewars', seed, difficulty: 'insane', options: { race, rivalRace, drivers: ['ai', 'ai'], skills: ['competent', null] }, log: [] };
    const s = nearPeak(r, b.ticks, Math.floor(b.ticks / 2));
    const ms = s.mode as { sides: { driver: string }[]; ai: unknown[] };
    ms.sides[0]!.driver = 'human';
    ms.ai[0] = null;
    return s;
  },
};

// --- Measuring in the page ---------------------------------------------------------

/**
 * Times every requestAnimationFrame callback: the frame's timestamp, the
 * script time in the callbacks (the sim's ticks and the board), and the main
 * thread's whole frame up to the first task after it, which also covers the
 * HUD's Preact renders (microtasks), style, layout and paint.
 */
function recordFrames(): void {
  const raf = window.requestAnimationFrame.bind(window);
  const rec = { on: false, frames: [] as [number, number, number][] };
  (window as unknown as { __frames: typeof rec }).__frames = rec;
  let open: { ts: number; t0: number; script: number } | null = null;
  const after = new MessageChannel();
  after.port1.onmessage = () => {
    if (open && rec.on) rec.frames.push([open.ts, open.script, performance.now() - open.t0]);
    open = null;
  };
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const t0 = performance.now();
    try {
      cb(ts);
    } finally {
      const ms = performance.now() - t0;
      if (open && open.ts === ts) {
        open.script += ms;
      } else {
        open = { ts, t0, script: ms };
        after.port2.postMessage(0);
      }
    }
  });
}

interface FrameStats {
  readonly frames: number;
  /** Intervals between frames, ms. */
  readonly mean: number;
  readonly p95: number;
  readonly worst: number;
  /** Share of intervals over 16.7 ms (a missed 60 Hz frame). */
  readonly over: number;
  /** Script time inside the frame callbacks (the sim's ticks and the board), ms. */
  readonly work: number;
  readonly workP95: number;
  readonly workWorst: number;
  /** The main thread's frame: callbacks, then microtasks (the HUD), style, layout and paint, ms. */
  readonly main: number;
  readonly mainP95: number;
  readonly mainWorst: number;
}

function frameStats(frames: readonly [number, number, number][]): FrameStats {
  const ts = frames.map((f) => f[0]);
  const gaps = ts.slice(1).map((t, i) => t - ts[i]!);
  const work = frames.map((f) => f[1]);
  const main = frames.map((f) => f[2]);
  const p = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? 0;
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return {
    frames: gaps.length, mean: mean(gaps), p95: p(gaps, 0.95), worst: Math.max(0, ...gaps),
    over: gaps.filter((g) => g > 16.7 + 0.5).length / Math.max(1, gaps.length),
    work: mean(work), workP95: p(work, 0.95), workWorst: Math.max(0, ...work),
    main: mean(main), mainP95: p(main, 0.95), mainWorst: Math.max(0, ...main),
  };
}

async function measure(page: Page, ms: number): Promise<FrameStats> {
  await page.evaluate(() => {
    const rec = (window as unknown as { __frames: { on: boolean; frames: unknown[] } }).__frames;
    rec.frames = [];
    rec.on = true;
  });
  await page.waitForTimeout(ms);
  const frames = await page.evaluate(() => {
    const rec = (window as unknown as { __frames: { on: boolean; frames: [number, number, number][] } }).__frames;
    rec.on = false;
    return rec.frames;
  });
  return frameStats(frames);
}

/** Puts the busy state back (the camera returns to fit), unpaused at `speed`. */
async function reset(page: Page, json: string, speed: 1 | 2 | 3): Promise<void> {
  await page.evaluate(([text, sp]) => {
    const c = window.tavern!.controller;
    c.adopt(JSON.parse(text) as never);
    c.setSpeed(sp as 1 | 2 | 3);
    c.setPaused(false);
  }, [json, speed] as const);
  // Let the first frames build the views before measuring.
  await page.waitForTimeout(500);
}

/** Zooms toward where most creeps are, with mouse-wheel notches (×1.15 each), until a cell is ~4× its fit size. */
async function zoomIn(page: Page): Promise<void> {
  const at = await page.evaluate(() => {
    const s = window.tavern!.controller.state;
    const live = s.creeps.filter((c) => c.hp > 0);
    const x = live.length ? live.reduce((a, c) => a + c.x, 0) / live.length : (s.map.cols * 64) / 2;
    const y = live.length ? live.reduce((a, c) => a + c.y, 0) / live.length : (s.map.rows * 64) / 2;
    return window.tavern!.worldToClient(x, y);
  });
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
  await page.waitForTimeout(300);
}

interface ProfileNode { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }

/** Self time by function from a CPU profile, as shares of the busy time (idle left out), the top `n`. */
function hottest(profile: { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] }, n: number): string[] {
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const self = new Map<string, number>();
  let busy = 0;
  profile.samples.forEach((id, i) => {
    const cf = byId.get(id)!.callFrame;
    if (cf.functionName === '(idle)') return;
    const file = cf.url.split('/').pop()?.split('?')[0] ?? '';
    const key = `${cf.functionName || '(anonymous)'} ${file}:${cf.lineNumber + 1}`;
    const dt = profile.timeDeltas[i] ?? 0;
    self.set(key, (self.get(key) ?? 0) + dt);
    busy += dt;
  });
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${((100 * t) / busy).toFixed(1).padStart(5)}%  ${k}`);
}

interface TraceEvent { name: string; ph: string; dur?: number; tid: number; pid: number; args?: { name?: string } }

/** The renderer main thread's self time by trace event name (a parent's time less its children's), per frame. */
function mainThread(trace: { traceEvents: TraceEvent[] }, ms: number): string[] {
  const events = trace.traceEvents;
  const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
  if (!main) return ['no CrRendererMain thread in the trace'];
  const own = events.filter((e) => e.pid === main.pid && e.tid === main.tid && e.ph === 'X' && (e.dur ?? 0) > 0)
    .map((e) => e as TraceEvent & { ts: number; dur: number }).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const self = new Map<string, number>();
  const stack: { end: number; name: string }[] = [];
  for (const e of own) {
    while (stack.length > 0 && stack[stack.length - 1]!.end <= e.ts) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) self.set(parent.name, (self.get(parent.name) ?? 0) - e.dur);
    self.set(e.name, (self.get(e.name) ?? 0) + e.dur);
    stack.push({ end: e.ts + e.dur, name: e.name });
  }
  const frames = (ms / 1000) * 60;
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, t]) => `${(t / 1000 / frames).toFixed(3).padStart(6)} ms/frame  ${k}`);
}

async function openRun(browser: Browser, screen: BrowserContextOptions, code: string): Promise<{ page: Page; cdp: CDPSession; close(): Promise<void> }> {
  const context = await browser.newContext({ ...screen, baseURL: test.info().project.use.baseURL ?? 'http://localhost:4173/tavern-td/' });
  await testContext(context);
  await context.addInitScript(recordFrames);
  const page = await context.newPage();
  await page.goto('./');
  await page.getByTestId('import').click();
  await page.getByTestId('import-code').fill(code);
  await page.getByTestId('import-load').click();
  await page.getByTestId('import-continue').click();
  await page.waitForFunction(() => !!window.tavern);
  const cdp = await context.newCDPSession(page);
  return { page, cdp, close: () => context.close() };
}

const results: Record<string, Record<string, FrameStats>> = {};

for (const mode of Object.keys(BUSY)) {
  test(`frame times in ${mode}'s busiest moment`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CPU throttling is Chromium-only');
    mkdirSync(OUT, { recursive: true });
    const state = BUSY[mode]!();
    const json = snapshot(state);
    const code = await writeCode(JSON.parse(json) as GameState);
    for (const [name, screen] of Object.entries(SCREENS)) {
      const { page, cdp, close } = await openRun(browser, screen, code);
      const renderer = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
      const row: Record<string, FrameStats> = {};
      await reset(page, json, 1);
      const creeps = await page.evaluate(() => window.tavern!.controller.state.creeps.length);
      const towers = await page.evaluate(() => window.tavern!.controller.state.towers.length);
      if (TRACE) await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8'] });
      row['fit 1×'] = await measure(page, WINDOW_MS);
      const trace = TRACE ? mainThread(JSON.parse((await browser.stopTracing()).toString()) as never, WINDOW_MS) : [];
      await reset(page, json, 1);
      await zoomIn(page);
      row['zoomed 1×'] = await measure(page, WINDOW_MS);
      // The profile covers the 3× window, the heaviest the player can ask for. Starting it stalls a frame, so it starts before the reset's settling time.
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
      await cdp.send('Profiler.start');
      await reset(page, json, 3);
      row['fit 3×'] = await measure(page, WINDOW_MS);
      const { profile } = await cdp.send('Profiler.stop');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const key = `${mode} ${name}`;
      results[key] = row;
      writeFileSync(`${OUT}/${mode}-${name}.cpuprofile`, JSON.stringify(profile));
      const top = hottest(profile as never, 15);
      const lines = Object.entries(row).map(([w, f]) => `  ${w.padEnd(10)} frame mean ${f.mean.toFixed(1)} ms, p95 ${f.p95.toFixed(1)}, worst ${f.worst.toFixed(1)}, `
        + `over 16.7 ms ${(f.over * 100).toFixed(1)}% of ${f.frames}; script mean ${f.work.toFixed(2)} ms, p95 ${f.workP95.toFixed(2)}, worst ${f.workWorst.toFixed(2)}; `
        + `main thread mean ${f.main.toFixed(2)} ms, p95 ${f.mainP95.toFixed(2)}, worst ${f.mainWorst.toFixed(2)}`);
      console.log(`${key} (${creeps} creeps, ${towers} towers, ×${THROTTLE} CPU, ${renderer}):\n${lines.join('\n')}\n  hottest in the 3× window (self time, share of busy time):\n    ${top.join('\n    ')}`
        + (TRACE ? `\n  main thread in the fit 1× window, self time by trace event:\n    ${trace.join('\n    ')}` : ''));
      expect(row['fit 1×']!.frames).toBeGreaterThan(0);
      await close();
    }
    writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
  });
}
