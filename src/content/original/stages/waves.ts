import type { OriginalGroup, OriginalWave } from '../types';

// Shorthand for writing Waves: wave(group('ghoul', 8), group('hound', 6, { at: 3 })).

/** A Wave of these groups. Each starts one gap after the group before ends, unless it sets `at`. */
export function wave(...groups: OriginalGroup[]): OriginalWave {
  return { groups };
}

/** `count` of `creep`; `more` names its route, gap or start. */
export function group(creep: string, count: number, more: Omit<OriginalGroup, 'creep' | 'count'> = {}): OriginalGroup {
  return { creep, count, ...more };
}
