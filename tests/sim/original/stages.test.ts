import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LENGTH, CHALLENGES, ORIGINAL_CREEPS, STAGES, stageByNumber, type OriginalWave, type StageSpec } from '../../../src/content/original';
import { CELL, airLineData, original, routeCount, routeData, routePoint, validateMap, type MapSpec } from '../../../src/sim';
import { FORMER_SPOTS, KEPT_SPOTS } from './former-spots';

// The Campaign's twelve Stages against docs/original-design.md §11, §17 and
// the Wave recipes of §10, as the balance runner left them.

/** §11 and §17: Open cells, Waves, first Threat and starting gold of each Stage. */
const TABLE: readonly [open: number, waves: number, threat: number, gold: number][] = [
  [376, 12, 1, 250], [356, 12, 2, 270], [422, 14, 3, 300], [296, 15, 4, 330],
  [328, 15, 6, 400], [278, 16, 7, 430], [414, 16, 8, 460], [404, 18, 9, 500],
  [281, 18, 11, 580], [328, 18, 12, 620], [318, 20, 13, 660], [318, 20, 14, 700],
];

const KINDS = ['water', 'building', 'cliff', 'pit'];

/** The creep each Stage brings in (§11), or null; bosses lead the last Wave of Stages 4, 8 and 12. */
const NEW_CREEP: readonly (string | null)[] = [
  'hound', 'crawler', 'bloodbat', 'revenant', 'cultist', 'flesh_golem', 'bloater', null, 'shieldbearer', 'gargoyle', null, null,
];
const BOSSES: Readonly<Record<number, string>> = { 4: 'gravelord', 8: 'plague_mother', 12: 'riftlord' };

const isBoss = (creep: string): boolean => ORIGINAL_CREEPS[creep]?.original.boss !== undefined;

/** A Wave's HP in Ghouls' worth at its Threat: what makes one Wave harder than another. */
function weight(stage: StageSpec, wave: OriginalWave, index: number): number {
  let worth = 0;
  for (const g of wave.groups) worth += g.count * ORIGINAL_CREEPS[g.creep]!.original.hpMult;
  return worth * 1.1 ** (stage.threat + index - 1);
}

function road(map: MapSpec, col: number, row: number): boolean {
  return map.terrain[row]?.[col] === ',';
}

function openCells(map: MapSpec): number {
  return map.terrain.join('').split('').filter((ch) => ch === '.').length;
}

/** The cells of a 2 × 2 with its top-left at (col, row). */
function cellsOf(col: number, row: number): [number, number][] {
  return [[col, row], [col + 1, row], [col, row + 1], [col + 1, row + 1]];
}

/** Units of every route within `range` of the centre of the 2 × 2 at (col, row). */
function covered(map: MapSpec, col: number, row: number, range: number): number {
  const cx = (col + 1) * CELL;
  const cy = (row + 1) * CELL;
  let n = 0;
  for (let r = 0; r < routeCount(map); r++) {
    const route = routeData(map, r)!;
    for (let d = 8; d < route.length; d += 16) {
      const p = routePoint(route, d);
      if ((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy) <= range * range) n += 16;
    }
  }
  return n;
}

/** How many points two routes share at their ends: the road they walk together. */
function sharedTail(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n]![0] === b[b.length - 1 - n]![0] && a[a.length - 1 - n]![1] === b[b.length - 1 - n]![1]) n++;
  return n;
}

describe('the Campaign\'s Stages', () => {
  it('has all twelve, in Campaign order, three Regions of four, as §11 plans them', () => {
    expect(STAGES).toHaveLength(CAMPAIGN_LENGTH);
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(12);
    STAGES.forEach((s, i) => {
      expect(s.number).toBe(i + 1);
      expect(s.region).toBe(['ashfield', 'blightfen', 'rift'][Math.floor(i / 4)]);
      const [open, waves, threat, gold] = TABLE[i]!;
      expect([openCells(s.map), s.waves.length, s.threat, s.gold], s.name).toEqual([open, waves, threat, gold]);
    });
  });

  it('gives each Stage one grim line for the select screen', () => {
    for (const s of STAGES) {
      expect(s.line.length, s.name).toBeGreaterThan(10);
      expect(s.line.length, s.name).toBeLessThanOrEqual(80);
      expect(s.line, s.name).not.toMatch(/[!?\n]/);
    }
  });

  for (const stage of STAGES) {
    describe(`Stage ${stage.number}, ${stage.name}`, () => {
      const map = stage.map;

      it('has a valid 32 × 18 Map whose routes each have an air line', () => {
        expect(validateMap(map)).toBeNull();
        expect([map.cols, map.rows]).toEqual([32, 18]);
        for (let r = 0; r < routeCount(map); r++) {
          const air = map.routes![r]!.air!;
          expect(air.length).toBeGreaterThanOrEqual(2);
          expect(air.length).toBeLessThanOrEqual(4);
          expect(air[0]).toEqual(map.routes![r]!.points[0]);
          expect(airLineData(map, r)!.length).toBeLessThan(routeData(map, r)!.length);
        }
      });

      it('names one or two pieces of Scenery, and every cell nothing stands on is road or one of them', () => {
        const pieces = map.scenery ?? [];
        expect(pieces.length).toBeGreaterThanOrEqual(1);
        expect(pieces.length).toBeLessThanOrEqual(2);
        for (const p of pieces) {
          expect(KINDS, p.name).toContain(p.kind);
          expect(p.name, p.name).toMatch(/^the /);
          expect(p.at, p.name).toMatch(/^(in|on) the /);
        }
        const named = (c: number, r: number): boolean => pieces.some((p) => p.rects.some(([x, y, w, h]) => c >= x && c < x + w && r >= y && r < y + h));
        for (let r = 0; r < map.rows; r++) {
          for (let c = 0; c < map.cols; c++) if (map.terrain[r]![c] === '#') expect(named(c, r), `(${c}, ${r})`).toBe(true);
        }
      });

      it('keeps every Build Spot it had as Open ground beside the road, where a Tier 1 tower sees plenty of it', () => {
        const spots = FORMER_SPOTS[stage.id]!;
        expect(spots.length).toBeGreaterThanOrEqual(8);
        spots.forEach(([col, row], i) => {
          for (const [c, r] of cellsOf(col, row)) expect(map.terrain[r]![c], `Spot ${i} (${col}, ${row})`).toBe('.');
          let near = false;
          // Within two cells of the road: Gallows Hill's hilltop Spots stand two rows from both legs.
          for (let c = col - 3; c <= col + 4; c++) for (let r = row - 3; r <= row + 4; r++) near ||= road(map, c, r);
          expect(near, `Spot ${i} (${col}, ${row})`).toBe(true);
          expect(covered(map, col, row, 320), `Spot ${i} (${col}, ${row})`).toBeGreaterThanOrEqual(448);
        });
      });

      it('sends only creeps the Campaign has met, on routes the Map has', () => {
        const known = new Set(['ghoul', ...NEW_CREEP.slice(0, stage.number).filter((c): c is string => c !== null)]);
        for (const [n, boss] of Object.entries(BOSSES)) if (Number(n) <= stage.number) known.add(boss);
        const routes = new Set<number>();
        for (const w of stage.waves) {
          expect(w.groups.length).toBeGreaterThan(0);
          for (const g of w.groups) {
            expect(known.has(g.creep), `${g.creep} on Stage ${stage.number}`).toBe(true);
            expect(g.count).toBeGreaterThan(0);
            expect(g.route ?? 0).toBeLessThan(routeCount(map));
            routes.add(g.route ?? 0);
          }
        }
        expect(routes.size).toBe(routeCount(map));
      });

      it('brings its new creep alone first, then mixed in, and ends on its hardest Wave', () => {
        const fresh = NEW_CREEP[stage.number - 1];
        if (fresh) {
          const first = stage.waves.findIndex((w) => w.groups.some((g) => g.creep === fresh));
          expect(first).toBeGreaterThan(0);
          expect(stage.waves[first]!.groups.every((g) => g.creep === fresh)).toBe(true);
          const next = stage.waves[first + 1]!.groups.map((g) => g.creep);
          expect(next).toContain(fresh);
          expect(new Set(next).size).toBeGreaterThan(1);
          expect(weight(stage, stage.waves[first]!, first)).toBeLessThan(weight(stage, stage.waves[first + 1]!, first + 1));
        }
        const weights = stage.waves.map((w, i) => weight(stage, w, i));
        expect(Math.max(...weights)).toBe(weights[weights.length - 1]);
      });

      it(BOSSES[stage.number] ? 'closes on its boss with an escort' : 'has no boss', () => {
        const bosses = stage.waves.flatMap((w, i) => w.groups.filter((g) => isBoss(g.creep)).map((g) => ({ wave: i, ...g })));
        const boss = BOSSES[stage.number];
        if (!boss) {
          expect(bosses).toEqual([]);
          return;
        }
        expect(bosses).toEqual([expect.objectContaining({ wave: stage.waves.length - 1, creep: boss, count: 1 })]);
        expect(stage.waves[stage.waves.length - 1]!.groups.length).toBeGreaterThan(1);
      });
    });
  }

  it('lets no Challenge\'s Burnt ground cover a Build Spot it kept, so its older saves load', () => {
    const burnt = CHALLENGES.filter((c) => c.modifiers.burnt);
    expect(burnt.map((c) => c.id).sort()).toEqual(Object.keys(KEPT_SPOTS).sort());
    for (const c of burnt) {
      const map = original.challengeMap(c);
      const stage = stageByNumber(c.stage)!;
      const spots = FORMER_SPOTS[stage.id]!;
      for (const i of KEPT_SPOTS[c.id]!) {
        const [col, row] = spots[i]!;
        for (const [cc, r] of cellsOf(col, row)) expect(map.terrain[r]![cc], `${c.id}: Spot ${i}`).toBe('.');
      }
      // It burns Open ground only: the road and the Stage's own Scenery stay.
      for (let r = 0; r < map.rows; r++) {
        for (let cc = 0; cc < map.cols; cc++) if (stage.map.terrain[r]![cc] !== '.') expect(map.terrain[r]![cc]).toBe(stage.map.terrain[r]![cc]);
      }
    }
  });

  it('joins Plague Fords\' two routes halfway, and Three Gates\' three in two steps', () => {
    const fords = STAGES[6]!.map.routes!;
    expect(fords).toHaveLength(2);
    const joined = sharedTail(fords[0]!.points, fords[1]!.points);
    expect(joined).toBeGreaterThanOrEqual(3);
    const join = fords[0]!.points[fords[0]!.points.length - joined]!;
    expect(join[0]).toBeGreaterThan(2048 * 0.4);
    expect(join[0]).toBeLessThan(2048 * 0.6);
    const gates = STAGES[10]!.map.routes!;
    expect(gates).toHaveLength(3);
    const first = sharedTail(gates[0]!.points, gates[1]!.points);
    const all = Math.min(first, sharedTail(gates[1]!.points, gates[2]!.points), sharedTail(gates[0]!.points, gates[2]!.points));
    expect(first).toBeGreaterThan(all);
    expect(all).toBeGreaterThanOrEqual(3);
  });

  it('flies Black Cliffs\' air line across the gap, and gives Riftmaw the longest road', () => {
    const cliffs = STAGES[9]!.map;
    expect(airLineData(cliffs)!.length).toBeLessThan(routeData(cliffs)!.length * 0.4);
    const longest = (s: StageSpec): number => Math.max(...Array.from({ length: routeCount(s.map) }, (_, r) => routeData(s.map, r)!.length));
    const riftmaw = longest(STAGES[11]!);
    for (const s of STAGES.slice(0, 11)) expect(longest(s), s.name).toBeLessThan(riftmaw);
  });
});
