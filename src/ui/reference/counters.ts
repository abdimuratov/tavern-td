// Best against (CONTEXT.md), derived and never written by hand: given what a
// creep is (its armor type and whether it flies) and a Game Mode's own
// damage-vs-armor table, rank damage types, towers or families from best to
// worst, and leave out what can't hit it. Every mode brings its own table: the
// Original's damage types, Element's six-Element cycle, Maul's attack types.

/** What a creep is, as a counter table sees it. */
export interface CounterTarget {
  /** Its armor type, as the table keys it (an Element, in Element). */
  readonly armor: string;
  readonly air: boolean;
}

/** One candidate: a damage type, a tower or a family. */
export interface CounterCandidate {
  readonly id: string;
  /** Its damage type, as the table keys it. */
  readonly damage: string;
  /** False when it can't hit flyers. */
  readonly hitsAir: boolean;
  /** False when it can't hit ground creeps; true when left out. */
  readonly hitsGround?: boolean;
}

/**
 * A rule beyond the table that favours (+1) or hurts (−1) a candidate against
 * one target, such as poison ignoring a Shield. Edges only order candidates
 * the table ties: the table's share always comes first.
 */
export interface CounterEdge {
  readonly edge: 1 | -1;
  readonly why: string;
}

export interface CounterRules<C extends CounterCandidate> {
  /** The share damage type `damage` deals to armor type `armor`: 1 is full, 0.5 half, 2 double. */
  share(damage: string, armor: string): number;
  /** The rules' edges for this candidate against this target; none when left out. */
  edges?(candidate: C, target: CounterTarget): readonly CounterEdge[];
}

export interface Counter<C> {
  readonly candidate: C;
  /** The table's share against the target's armor. */
  readonly share: number;
  /** The sum of its edges. */
  readonly edge: number;
  readonly why: readonly string[];
  /** 1 for the best; candidates with the same share and edge tie. */
  readonly rank: number;
}

export interface CounterRanking<C> {
  /** Best first; ties keep the order the candidates came in. */
  readonly ranked: readonly Counter<C>[];
  /** What can't hit the target at all (ground-only against a flyer), in the order given. */
  readonly cannot: readonly C[];
}

/** Whether a candidate can hit the target's layer. */
export function canHitTarget(candidate: CounterCandidate, target: CounterTarget): boolean {
  return target.air ? candidate.hitsAir : candidate.hitsGround !== false;
}

/** Ranks `candidates` against `target` from best to worst by the table's share, then the rules' edges. */
export function rankCounters<C extends CounterCandidate>(
  target: CounterTarget, candidates: readonly C[], rules: CounterRules<C>,
): CounterRanking<C> {
  const cannot: C[] = [];
  const scored: (Omit<Counter<C>, 'rank'> & { readonly order: number })[] = [];
  candidates.forEach((candidate, order) => {
    if (!canHitTarget(candidate, target)) {
      cannot.push(candidate);
      return;
    }
    const edges = rules.edges?.(candidate, target) ?? [];
    scored.push({
      candidate, order,
      share: rules.share(candidate.damage, target.armor),
      edge: edges.reduce((sum, e) => sum + e.edge, 0),
      why: edges.map((e) => e.why),
    });
  });
  scored.sort((a, b) => b.share - a.share || b.edge - a.edge || a.order - b.order);
  const ranked: Counter<C>[] = [];
  scored.forEach((s, i) => {
    const before = ranked[i - 1];
    const rank = before && before.share === s.share && before.edge === s.edge ? before.rank : i + 1;
    ranked.push({ candidate: s.candidate, share: s.share, edge: s.edge, why: s.why, rank });
  });
  return { ranked, cannot };
}

export interface ArmorShare {
  readonly armor: string;
  readonly share: number;
}

/** What one damage type does to each armor type: its best and its worst. */
export interface ArmorProfile {
  /** More than full damage, or its best where it isn't the same against everything. Best first. */
  readonly strong: readonly ArmorShare[];
  /** Less than full damage, or its worst where it isn't the same against everything. Worst first. */
  readonly weak: readonly ArmorShare[];
  /** The same share against every armor type. */
  readonly even: boolean;
}

/** Strong against / Weak against for damage type `damage`, over the mode's armor types in their table order. */
export function armorProfile(damage: string, armors: readonly string[], share: (damage: string, armor: string) => number): ArmorProfile {
  const rows = armors.map((armor) => ({ armor, share: share(damage, armor) }));
  if (rows.length === 0) return { strong: [], weak: [], even: true };
  const best = Math.max(...rows.map((r) => r.share));
  const worst = Math.min(...rows.map((r) => r.share));
  const even = best === worst;
  const strong = rows.filter((r) => r.share > 1 || (!even && r.share === best && r.share >= 1));
  const weak = rows.filter((r) => r.share < 1 || (!even && r.share === worst && r.share <= 1));
  return {
    strong: [...strong].sort((a, b) => b.share - a.share),
    weak: [...weak].sort((a, b) => a.share - b.share),
    even,
  };
}
