import { writeFileSync } from 'node:fs';
import { DIFFICULTIES, type Difficulty } from '../../src/sim';
import { LAST_TICK, SANITY_BOTS, pairingFor, playLw, type LwBot, type LwRunResult } from '../../tests/sim/linewars/bots';

// Line Wars' balance runner (docs/line-wars-design.md §13). The player-side
// bot is the AI itself on the `competent` profile; the scripted sanity bots
// play Normal. Every Run is played in this one process, one at a time, with
// the Race pairings rotated across seeds, so a laptop stays cool.
//
//   pnpm balance linewars                      5 seeds, every Difficulty, the sanity bots and the seat check
//   pnpm balance linewars --seeds 3 --difficulties normal,hard
//   pnpm balance linewars --bots competent     the competent bot only
//   pnpm balance linewars --bots seat          the competent bot against itself, from either Side
//   pnpm balance linewars --json out.json      every Run's outcome as well
//
// It reports win rate, median Run length, the share reaching 19:50, lives
// stolen, income at 5, 10 and 15 min, leaks by Send, refused AI commands (must
// be 0) and the mean and worst tick, then checks the targets.

type Job = 'competent' | 'seat' | LwBot;

interface Args {
  readonly seeds: number;
  readonly difficulties: readonly Difficulty[];
  readonly jobs: readonly Job[];
  readonly json: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const value = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    seeds: Number(value('--seeds') ?? 5),
    difficulties: (value('--difficulties')?.split(',') ?? DIFFICULTIES) as Difficulty[],
    jobs: (value('--bots')?.split(',') ?? ['competent', ...SANITY_BOTS, 'seat']) as Job[],
    json: value('--json') ?? null,
  };
}

interface Row {
  readonly label: string;
  readonly runs: readonly LwRunResult[];
}

const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 === 1 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

function winRate(runs: readonly LwRunResult[]): number {
  return runs.filter((r) => r.won).length / Math.max(1, runs.length);
}

function describe(row: Row): string[] {
  const { runs } = row;
  const leaks: Record<string, number> = {};
  for (const r of runs) for (const [send, n] of Object.entries(r.leaks[0])) leaks[send] = (leaks[send] ?? 0) + n;
  const leaksIn: Record<string, number> = {};
  for (const r of runs) for (const [send, n] of Object.entries(r.leaks[1])) leaksIn[send] = (leaksIn[send] ?? 0) + n;
  const inc = (i: number, side: 0 | 1): number => median(runs.map((r) => r.income[i]![side]));
  const why: Record<string, number> = {};
  for (const r of runs) why[`${r.result}/${r.why}`] = (why[`${r.result}/${r.why}`] ?? 0) + 1;
  return [
    `${row.label}: wins ${pct(winRate(runs))} (${runs.filter((r) => r.won).length}/${runs.length}), draws ${runs.filter((r) => r.result === 'draw').length}, `
      + `median ${clock(median(runs.map((r) => r.seconds)))}, reaching 19:50 ${pct(runs.filter((r) => r.ticks >= LAST_TICK).length / Math.max(1, runs.length))}`,
    `    ends ${Object.entries(why).map(([k, n]) => `${k} ${n}`).join(', ')}`,
    `    lives stolen (mean) you ${mean(runs.map((r) => r.stolen[0])).toFixed(1)}, Rival ${mean(runs.map((r) => r.stolen[1])).toFixed(1)}; `
      + `income at 5/10/15 min you ${inc(0, 0)}/${inc(1, 0)}/${inc(2, 0)}, Rival ${inc(0, 1)}/${inc(1, 1)}/${inc(2, 1)}`,
    `    leaks into you ${Object.entries(leaks).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}; into the Rival ${Object.entries(leaksIn).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
    `    refused AI commands ${runs.reduce((n, r) => n + r.aiRefused.length, 0)}; tick mean ${(mean(runs.map((r) => r.meanStepMs)) * 1000).toFixed(1)} µs, worst ${Math.max(...runs.map((r) => r.maxStepMs)).toFixed(2)} ms`,
  ];
}

/** Runs the matrix and prints the report; true when every target is met. */
export function lineWars(argv: readonly string[]): boolean {
  const args = parseArgs(argv);
  const t0 = performance.now();
  const rows: Row[] = [];
  const all: { job: string; difficulty: Difficulty; seed: number; run: LwRunResult }[] = [];
  const play = (job: string, difficulty: Difficulty, seed: number, f: () => LwRunResult): LwRunResult => {
    const run = f();
    all.push({ job, difficulty, seed, run });
    process.stderr.write(`  ${job} ${difficulty} seed ${seed}: ${run.result} ${run.why} at ${clock(run.seconds)}        \r`);
    return run;
  };
  const seeds = Array.from({ length: args.seeds }, (_, i) => i + 1);
  if (args.jobs.includes('competent')) {
    for (const d of args.difficulties) {
      rows.push({ label: `competent v ${d}`, runs: seeds.map((s) => play('competent', d, s, () => playLw(s, d))) });
    }
  }
  for (const bot of SANITY_BOTS) {
    if (!args.jobs.includes(bot)) continue;
    rows.push({ label: `${bot} v normal`, runs: seeds.map((s) => play(bot, 'normal', s, () => playLw(s, 'normal', { bot }))) });
  }
  if (args.jobs.includes('seat')) {
    // Itself from either Side: each pairing once as given and once swapped, Side 0's win rate both times.
    const runs = seeds.flatMap((s) => {
      const [a, b] = pairingFor(s);
      const skills = ['competent', 'competent'] as const;
      return [
        play('seat', 'normal', s, () => playLw(s, 'normal', { race: a, rivalRace: b, skills })),
        play('seat', 'normal', s, () => playLw(s, 'normal', { race: b, rivalRace: a, skills })),
      ];
    });
    rows.push({ label: 'competent v competent (seat check, Side 0)', runs });
  }
  process.stderr.write(' '.repeat(60) + '\r');
  const lines: string[] = [`Line Wars' balance: ${args.seeds} seeds a row, Race pairings rotated across seeds.`];
  for (const row of rows) lines.push(...describe(row));
  // The targets.
  let ok = true;
  const check = (pass: boolean, text: string): void => {
    ok &&= pass;
    lines.push(`  ${pass ? 'ok  ' : 'MISS'} ${text}`);
  };
  lines.push('', 'Targets');
  const target: Readonly<Record<Difficulty, [number, number]>> = { easy: [0.85, 1], normal: [0.45, 0.75], hard: [0.15, 0.45], insane: [0, 0.1] };
  for (const row of rows) {
    const d = row.label.startsWith('competent v ') && !row.label.includes('seat') ? row.label.slice('competent v '.length) as Difficulty : null;
    if (!d) continue;
    const rate = winRate(row.runs);
    const [lo, hi] = target[d];
    check(rate >= lo && rate <= hi, `competent wins ${d} ${pct(rate)} (aim ~${pct(d === 'easy' ? 0.95 : d === 'normal' ? 0.6 : d === 'hard' ? 0.3 : 0.05)}, ${pct(lo)}–${pct(hi)})`);
  }
  const competent = rows.filter((r) => r.label.startsWith('competent v ') && !r.label.includes('seat')).flatMap((r) => r.runs);
  if (competent.length) {
    const m = median(competent.map((r) => r.seconds));
    check(m >= 12 * 60 && m <= 18 * 60, `median Run ${clock(m)} (aim 12:00–18:00)`);
    for (const row of rows.filter((r) => r.label.startsWith('competent v ') && !r.label.includes('seat'))) {
      const share = row.runs.filter((r) => r.ticks >= LAST_TICK).length / Math.max(1, row.runs.length);
      check(share < 0.1, `${row.label}: ${pct(share)} reach 19:50 (aim under 10%)`);
    }
    const refused = all.reduce((n, r) => n + r.run.aiRefused.length, 0);
    check(refused === 0, `refused AI commands: ${refused} (must be 0)`);
  }
  for (const row of rows) {
    const rate = winRate(row.runs);
    if (row.label.startsWith('turtle') || row.label.startsWith('rusher')) check(rate <= 0.1, `${row.label}: wins ${pct(rate)} (aim 10% or less)`);
    if (row.label.startsWith('flyer')) check(rate <= 0.5, `${row.label}: wins ${pct(rate)} (aim 50% or less)`);
    if (row.label.includes('seat')) check(rate >= 0.3 && rate <= 0.7, `${row.label}: wins ${pct(rate)} (aim ~50%)`);
  }
  console.log(lines.join('\n'));
  console.log(`\n${all.length} Runs in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
  if (args.json) {
    writeFileSync(args.json, JSON.stringify(all.map(({ job, difficulty, seed, run }) => ({
      job, difficulty, seed, result: run.result, why: run.why, seconds: run.seconds, lives: run.lives, stolen: run.stolen,
      income: run.income, leaks: run.leaks, aiRefused: run.aiRefused.length,
    })), null, 1));
  }
  return ok;
}
