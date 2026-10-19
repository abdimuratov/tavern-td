import { describe, expect, it } from 'vitest';
import { armorProfile, canHitTarget, rankCounters, type CounterCandidate } from '../src/ui/reference/counters';

// Best against, the shared helper every Game Mode's Waves tab uses: a mode
// hands it its own damage-vs-armor table and what its towers can hit.

const TABLE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  blade: { light: 1, heavy: 0.5, warded: 1 },
  hammer: { light: 0.75, heavy: 1.5, warded: 1 },
  spell: { light: 1, heavy: 1, warded: 0.25 },
  venom: { light: 1, heavy: 1, warded: 1 },
};
const share = (d: string, a: string): number => TABLE[d]![a]!;

const C = (id: string, hitsAir: boolean, hitsGround?: boolean): CounterCandidate => ({ id, damage: id, hitsAir, ...(hitsGround === undefined ? {} : { hitsGround }) });
const CANDIDATES = [C('blade', true), C('hammer', false), C('spell', true), C('venom', false)];
const ids = (r: { ranked: readonly { candidate: CounterCandidate }[] }): string[] => r.ranked.map((x) => x.candidate.id);

describe('rankCounters', () => {
  it('ranks by the table\'s share, best first', () => {
    const r = rankCounters({ armor: 'heavy', air: false }, CANDIDATES, { share });
    expect(ids(r)).toEqual(['hammer', 'spell', 'venom', 'blade']);
    expect(r.ranked.map((x) => x.share)).toEqual([1.5, 1, 1, 0.5]);
    expect(r.cannot).toEqual([]);
  });

  it('ties share a rank and keep the order they came in', () => {
    const r = rankCounters({ armor: 'light', air: false }, CANDIDATES, { share });
    expect(ids(r)).toEqual(['blade', 'spell', 'venom', 'hammer']);
    expect(r.ranked.map((x) => x.rank)).toEqual([1, 1, 1, 4]);
  });

  it('puts the weakest last: a warded creep takes a quarter from spells', () => {
    const r = rankCounters({ armor: 'warded', air: false }, CANDIDATES, { share });
    expect(ids(r).at(-1)).toBe('spell');
  });

  it('leaves out what can\'t hit a flyer, and what can\'t hit the ground', () => {
    const r = rankCounters({ armor: 'light', air: true }, CANDIDATES, { share });
    expect(ids(r)).toEqual(['blade', 'spell']);
    expect(r.cannot.map((c) => c.id)).toEqual(['hammer', 'venom']);
    const antiAir = rankCounters({ armor: 'light', air: false }, [C('blade', true), C('flak', true, false)], { share: () => 1 });
    expect(ids(antiAir)).toEqual(['blade']);
    expect(canHitTarget(C('flak', true, false), { armor: 'light', air: true })).toBe(true);
  });

  it('lets the rules\' edges order a tie, never beat the table, and says why', () => {
    const edges = (c: CounterCandidate) => (c.id === 'venom' ? [{ edge: 1 as const, why: 'ignores its Shield' }] : c.id === 'blade' ? [{ edge: -1 as const, why: 'blunted' }] : []);
    const light = rankCounters({ armor: 'light', air: false }, CANDIDATES, { share, edges });
    expect(ids(light)).toEqual(['venom', 'spell', 'blade', 'hammer']);
    expect(light.ranked.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(light.ranked[0]!.why).toEqual(['ignores its Shield']);
    // On heavy armor the hammer's 150% still comes first.
    expect(ids(rankCounters({ armor: 'heavy', air: false }, CANDIDATES, { share, edges }))[0]).toBe('hammer');
  });

  it('takes any mode\'s own table: an Element-style cycle', () => {
    const cycle = ['water', 'fire', 'nature'];
    const elem = (d: string, a: string): number => {
      const i = cycle.indexOf(d);
      const j = cycle.indexOf(a);
      return (i + 1) % 3 === j ? 2 : (j + 1) % 3 === i ? 0.5 : 1;
    };
    const r = rankCounters({ armor: 'nature', air: false }, cycle.map((e) => C(e, true)), { share: elem });
    expect(ids(r)).toEqual(['fire', 'nature', 'water']);
    expect(r.ranked.map((x) => x.share)).toEqual([2, 1, 0.5]);
  });
});

describe('armorProfile', () => {
  const ARMORS = ['light', 'heavy', 'warded'];

  it('is strong where a type does its best and weak where it is cut', () => {
    expect(armorProfile('blade', ARMORS, share)).toEqual({
      strong: [{ armor: 'light', share: 1 }, { armor: 'warded', share: 1 }],
      weak: [{ armor: 'heavy', share: 0.5 }],
      even: false,
    });
    const hammer = armorProfile('hammer', ARMORS, share);
    expect(hammer.strong).toEqual([{ armor: 'heavy', share: 1.5 }]);
    expect(hammer.weak).toEqual([{ armor: 'light', share: 0.75 }]);
  });

  it('is even, neither strong nor weak, when the type deals the same to everything', () => {
    expect(armorProfile('venom', ARMORS, share)).toEqual({ strong: [], weak: [], even: true });
  });
});
