import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { STAGES, challengeOfStage, type Family } from '../../src/content/original';
import { DIFFICULTIES, original, type Difficulty } from '../../src/sim';
import type { Strategy } from './bot';
import type { Job, Outcome } from './jobs';
import { drawStage } from './maps';

// The Original's balance runner (docs/PLAN.md §4). It plays every Stage with
// scripted strategies over many seeds and Difficulties, using the unlocks the
// Campaign has by then (cleared = Stage − 1) and the Talents a decent player
// would hold. It reports the Wave reached, lives, Stars and win rate, then
// checks the targets:
// - the competent bot (balanced) wins Easy ~95%, Normal ~60%, Insane under 10%;
// - no single family clears a Stage from Stage 5 on (td-design-and-balance.md §3).
//
//   pnpm balance                         every Stage, 20 seeds
//   pnpm balance --stages 3-5 --seeds 40
//   pnpm balance --strategies balanced --difficulties normal
//   pnpm balance --json out.json         every Run's outcome as well
//   pnpm balance --stages 7 --scale 0.8  every group 20% smaller, to find a Stage's level
//   pnpm balance --stages 7 --scale 0.8:1.4   80% in Wave 1, rising to 140% in the last
//   pnpm balance --threads 8             more worker threads (4 by default)
//   pnpm balance --challenges            each Stage's Challenge beside the Stage on Normal (§16)
//   pnpm balance --challenges --stages 8 --seeds 5 --threads 2
//   pnpm balance --challenges --stages 8 --seeds 5 --first-seed 6   seeds 6–10, a second sample
//   pnpm balance maps                    each Stage's Map as text
//   pnpm balance linewars                Line Wars instead (tools/balance/linewars.ts), in this one process

interface Args {
  readonly stages: readonly number[];
  readonly seeds: number;
  readonly difficulties: readonly Difficulty[];
  readonly strategies: readonly Strategy[];
  readonly json: string | null;
  /** Scales every non-boss group's count, from Wave 1's share to the last Wave's (a tuning aid). */
  readonly scale: readonly [number, number];
  /** Worker threads; a few by default, so a laptop stays cool. */
  readonly threads: number;
  /** Plays each Stage's Challenge beside the Stage on Normal, instead of the Difficulty table. */
  readonly challenges: boolean;
  /** The first seed of each cell: seeds run from it, `seeds` of them. */
  readonly firstSeed: number;
}

function parseRange(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let n = a!; n <= (b ?? a!); n++) out.push(n);
  }
  return out;
}

/** `1.2`, or `0.8:1.4` for a share that rises from the first Wave to the last. */
function parseScale(text: string): [number, number] {
  const [a, b] = text.split(':').map(Number);
  return [a!, b ?? a!];
}

function parseArgs(argv: readonly string[]): Args {
  const value = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    stages: parseRange(value('--stages') ?? `1-${STAGES.length}`),
    seeds: Number(value('--seeds') ?? 20),
    difficulties: (value('--difficulties')?.split(',') ?? DIFFICULTIES) as Difficulty[],
    strategies: (value('--strategies')?.split(',') ?? (argv.includes('--challenges') ? ['balanced'] : ['balanced', 'greedy', 'single'])) as Strategy[],
    json: value('--json') ?? null,
    scale: parseScale(value('--scale') ?? '1'),
    threads: Math.max(1, Math.min(availableParallelism(), Number(value('--threads') ?? 4))),
    challenges: argv.includes('--challenges'),
    firstSeed: Number(value('--first-seed') ?? 1),
  };
}

/**
 * The Challenge Runs: for each Stage with a Challenge, the Stage on Normal and
 * its Challenge (always Normal), each over the seeds with the balanced bot
 * unless --strategies names others.
 */
function challengeJobs(args: Args): Job[] {
  const jobs: Job[] = [];
  const strategies = args.strategies.filter((s) => s !== 'single');
  for (const stage of args.stages) {
    if (!challengeOfStage(stage)) continue;
    for (const strategy of strategies) {
      for (const challenge of [false, true]) {
        for (let seed = args.firstSeed; seed < args.firstSeed + args.seeds; seed++) {
          jobs.push({ id: jobs.length, stage, difficulty: 'normal', strategy, seed, scale: args.scale, ...(challenge ? { challenge } : {}) });
        }
      }
    }
  }
  return jobs;
}

/**
 * Each Challenge's win rate beside its Stage's on Normal, and the targets:
 * every Challenge 20–60% for the competent bot, and no more often than its
 * Stage on the same seeds (a few seeds can tie by chance; §16 has 20 seeds).
 */
function challengeReport(args: Args, jobs: readonly Job[], outcomes: readonly Outcome[]): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  const cell = (stage: number, strategy: Strategy, challenge: boolean): Cell =>
    summarise(jobs.filter((j) => j.stage === stage && j.strategy === strategy && !!j.challenge === challenge).map((j) => outcomes[j.id]!));
  const strategies = [...new Set(jobs.map((j) => j.strategy))];
  const seeds = args.firstSeed === 1 ? `${args.seeds} seeds` : `seeds ${args.firstSeed}–${args.firstSeed + args.seeds - 1}`;
  lines.push(`The Original's Challenges: ${seeds} a cell, on Normal. Each cell: win rate, mean Wave reached, then the wins' mean lives.`);
  lines.push('A Challenge plays with its Stage finished (cleared = Stage) and a decent player\'s Talents from the Stages\' Stars alone.');
  let ok = true;
  const misses: string[] = [];
  for (const stage of args.stages) {
    const c = challengeOfStage(stage);
    if (!c) continue;
    const spec = STAGES[stage - 1]!;
    lines.push('');
    lines.push(`Stage ${stage}, ${spec.name}: Challenge "${c.name}": ${c.rule}`);
    for (const strategy of strategies) {
      const plain = cell(stage, strategy, false);
      const hard = cell(stage, strategy, true);
      const text = (x: Cell): string => `${pct(x.winRate)} W${x.reached.toFixed(1).padStart(4)}${x.winRate > 0 ? ` L${x.lives.toFixed(0).padStart(2)}` : ''}`;
      lines.push(`  ${strategy.padEnd(10)} Stage ${text(plain).padEnd(18)} Challenge ${text(hard)}`);
      if (strategy !== 'balanced') continue;
      const inRange = hard.winRate >= 0.2 && hard.winRate <= 0.6;
      if (!inRange || hard.winRate > plain.winRate) {
        ok = false;
        misses.push(`Stage ${stage} "${c.name}": ${pct(hard.winRate).trim()} against the Stage's ${pct(plain.winRate).trim()}`);
      }
    }
  }
  lines.push('');
  lines.push('Targets');
  lines.push(`  ${ok ? 'ok  ' : 'MISS'} the balanced bot wins every Challenge 20–60%, and no more often than its Stage on Normal${misses.length ? `: ${misses.join('; ')}` : ''}`);
  return { lines, ok };
}

/** The Runs to play. Single-family Runs play Normal only, one per family the Stage has unlocked. */
function jobsFor(args: Args): Job[] {
  const jobs: Job[] = [];
  for (const stage of args.stages) {
    const families = original.unlocksFor(stage - 1).families;
    for (const strategy of args.strategies) {
      const variants: (Family | undefined)[] = strategy === 'single' ? [...families] : [undefined];
      const difficulties = strategy === 'single' ? args.difficulties.filter((d) => d === 'normal') : args.difficulties;
      for (const family of variants) {
        for (const difficulty of difficulties) {
          for (let seed = args.firstSeed; seed < args.firstSeed + args.seeds; seed++) {
            jobs.push({ id: jobs.length, stage, difficulty, strategy, ...(family ? { family } : {}), seed, scale: args.scale });
          }
        }
      }
    }
  }
  return jobs;
}

async function runAll(jobs: readonly Job[], threadCount: number): Promise<Outcome[]> {
  const results: Outcome[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const threads = Math.max(1, Math.min(jobs.length, threadCount));
  await Promise.all(Array.from({ length: threads }, () => new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('./thread.mjs', import.meta.url));
    const feed = (): void => {
      if (next >= jobs.length) {
        void worker.terminate().then(() => resolve());
        return;
      }
      worker.postMessage(jobs[next++]);
    };
    worker.on('message', (o: Outcome) => {
      results[o.id] = o;
      done++;
      if (done % 200 === 0) process.stderr.write(`  ${done}/${jobs.length} Runs\r`);
      feed();
    });
    worker.on('error', reject);
    feed();
  })));
  process.stderr.write(' '.repeat(30) + '\r');
  return results;
}

interface Cell {
  readonly runs: number;
  readonly winRate: number;
  readonly reached: number;
  /** Mean lives and Stars of the wins. */
  readonly lives: number;
  readonly stars: number;
}

function summarise(outcomes: readonly Outcome[]): Cell {
  const wins = outcomes.filter((o) => o.won);
  const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    runs: outcomes.length,
    winRate: wins.length / Math.max(1, outcomes.length),
    reached: mean(outcomes.map((o) => o.reached)),
    lives: mean(wins.map((o) => o.lives)),
    stars: mean(wins.map((o) => o.stars)),
  };
}

const pct = (x: number): string => `${Math.round(x * 100)}%`.padStart(4);

function cellText(c: Cell | undefined): string {
  if (!c) return ''.padEnd(22);
  const tail = c.winRate > 0 ? ` L${c.lives.toFixed(0).padStart(2)} ★${c.stars.toFixed(1)}` : '';
  return `${pct(c.winRate)} W${c.reached.toFixed(1).padStart(4)}${tail}`.padEnd(22);
}

function label(job: Job): string {
  return job.strategy === 'single' ? `single ${job.family}` : job.strategy;
}

function report(args: Args, jobs: readonly Job[], outcomes: readonly Outcome[]): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  const cells = new Map<string, Cell>();
  const groups = new Map<string, Outcome[]>();
  for (const job of jobs) {
    const key = `${job.stage}|${label(job)}|${job.difficulty}`;
    const list = groups.get(key) ?? [];
    list.push(outcomes[job.id]!);
    groups.set(key, list);
  }
  for (const [key, list] of groups) cells.set(key, summarise(list));
  lines.push(`The Original's balance: ${args.seeds} seeds a cell. Each cell: win rate, mean Wave reached, then the wins' mean lives and Stars.`);
  if (args.scale[0] !== 1 || args.scale[1] !== 1) lines.push(`Every group's count scaled by ${args.scale.join(' rising to ')}, bosses aside.`);
  for (const stage of args.stages) {
    const spec = STAGES[stage - 1]!;
    const last = spec.threat + spec.waves.length - 1;
    lines.push('');
    lines.push(`Stage ${stage}, ${spec.name}: Threat ${spec.threat}–${last}, ${spec.gold} gold, ${spec.waves.length} Waves, ${spec.map.buildSpots?.length ?? 0} Spots`);
    lines.push(`  ${''.padEnd(15)}${args.difficulties.map((d) => d.padEnd(22)).join('')}`);
    const labels = [...new Set(jobs.filter((j) => j.stage === stage).map(label))];
    for (const l of labels) {
      lines.push(`  ${l.padEnd(15)}${args.difficulties.map((d) => cellText(cells.get(`${stage}|${l}|${d}`))).join('')}`.trimEnd());
    }
  }
  // The targets.
  let ok = true;
  const check = (pass: boolean, text: string): void => {
    ok &&= pass;
    lines.push(`  ${pass ? 'ok  ' : 'MISS'} ${text}`);
  };
  lines.push('');
  lines.push('Targets');
  const rates = (d: Difficulty): { stage: number; rate: number }[] => args.stages
    .map((stage) => ({ stage, rate: cells.get(`${stage}|balanced|${d}`)?.winRate ?? -1 }))
    .filter((r) => r.rate >= 0);
  const span = (rs: { stage: number; rate: number }[]): string => {
    const mean = rs.reduce((a, r) => a + r.rate, 0) / Math.max(1, rs.length);
    const lo = rs.reduce((a, r) => (r.rate < a.rate ? r : a), rs[0]!);
    const hi = rs.reduce((a, r) => (r.rate > a.rate ? r : a), rs[0]!);
    return `mean ${pct(mean).trim()}, lowest ${pct(lo.rate).trim()} (Stage ${lo.stage}), highest ${pct(hi.rate).trim()} (Stage ${hi.stage})`;
  };
  const meanOf = (rs: { rate: number }[]): number => rs.reduce((a, r) => a + r.rate, 0) / Math.max(1, rs.length);
  const easy = rates('easy');
  if (easy.length) check(meanOf(easy) >= 0.9 && easy.every((r) => r.rate >= 0.8), `balanced wins Easy ~95% (every Stage 80% or more): ${span(easy)}`);
  const normal = rates('normal');
  if (normal.length) {
    check(Math.abs(meanOf(normal) - 0.6) <= 0.1 && normal.every((r) => r.rate >= 0.35 && r.rate <= 0.9),
      `balanced wins Normal ~60% (every Stage 35–90%): ${span(normal)}`);
  }
  const insane = rates('insane');
  if (insane.length) check(insane.every((r) => r.rate < 0.1), `balanced wins Insane under 10% on every Stage: ${span(insane)}`);
  const singles = [...cells.entries()]
    .filter(([key]) => key.includes('|single ') && key.endsWith('|normal') && Number(key.split('|')[0]) >= 5)
    .map(([key, c]) => ({ key, rate: c.winRate }));
  if (singles.length) {
    const worst = singles.reduce((a, s) => (s.rate > a.rate ? s : a), singles[0]!);
    check(worst.rate <= 0.1, `no single family clears a Stage from Stage 5 on (Normal, 10% or less): highest ${pct(worst.rate).trim()} (${worst.key.split('|').slice(0, 2).join(', Stage ').replace(/^(\d+), Stage (.*)$/, '$2 on Stage $1')})`);
  }
  return { lines, ok };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === 'maps') {
    for (const stage of STAGES) console.log(drawStage(stage).join('\n') + '\n');
    return;
  }
  if (argv[0] === 'linewars') {
    const { lineWars } = await import('./linewars');
    process.exitCode = lineWars(argv.slice(1)) ? 0 : 1;
    return;
  }
  const args = parseArgs(argv);
  const jobs = args.challenges ? challengeJobs(args) : jobsFor(args);
  const t0 = performance.now();
  const outcomes = await runAll(jobs, args.threads);
  const { lines, ok } = args.challenges ? challengeReport(args, jobs, outcomes) : report(args, jobs, outcomes);
  console.log(lines.join('\n'));
  console.log(`\n${jobs.length} Runs in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
  if (args.json) writeFileSync(args.json, JSON.stringify(jobs.map((j) => ({ ...j, ...outcomes[j.id] })), null, 1));
  process.exitCode = ok ? 0 : 1;
}

await main();
