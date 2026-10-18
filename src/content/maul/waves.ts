import type { MaulWave } from './types';

// Maul's 40 Waves (docs/maul-design.md §6). Every Wave sends its creep from
// both gates; a boss Wave sends a boss from each with an escort behind it.
// Air Waves come at uneven gaps, as Wintermaul's did (5, 14, 23, 27 of its 30),
// and a boss every tenth Wave; each kind first comes alone.

export const MAUL_WAVES: readonly MaulWave[] = [
  /* 1 */ { creep: 'raider' },
  /* 2 */ { creep: 'raider' },
  /* 3 */ { creep: 'snowling' },
  /* 4 */ { creep: 'frost_wolf' },
  /* 5 */ { creep: 'harpy' },
  /* 6 */ { creep: 'raider' },
  /* 7 */ { creep: 'brute' },
  /* 8 */ { creep: 'snowling' },
  /* 9 */ { creep: 'golem' },
  /* 10 */ { creep: 'warlord', escort: { creep: 'raider', count: 5 } },
  /* 11 */ { creep: 'frost_wolf' },
  /* 12 */ { creep: 'troll' },
  /* 13 */ { creep: 'raider' },
  /* 14 */ { creep: 'harpy' },
  /* 15 */ { creep: 'brute' },
  /* 16 */ { creep: 'wraith' },
  /* 17 */ { creep: 'golem' },
  /* 18 */ { creep: 'snowling' },
  /* 19 */ { creep: 'troll' },
  /* 20 */ { creep: 'mammoth', escort: { creep: 'brute', count: 3 } },
  /* 21 */ { creep: 'frost_wolf' },
  /* 22 */ { creep: 'wraith' },
  /* 23 */ { creep: 'harpy' },
  /* 24 */ { creep: 'golem' },
  /* 25 */ { creep: 'raider' },
  /* 26 */ { creep: 'brute' },
  /* 27 */ { creep: 'harpy' },
  /* 28 */ { creep: 'troll' },
  /* 29 */ { creep: 'snowling' },
  /* 30 */ { creep: 'colossus', escort: { creep: 'golem', count: 2 } },
  /* 31 */ { creep: 'wraith' },
  /* 32 */ { creep: 'frost_wolf' },
  /* 33 */ { creep: 'brute' },
  /* 34 */ { creep: 'harpy' },
  /* 35 */ { creep: 'golem' },
  /* 36 */ { creep: 'troll' },
  /* 37 */ { creep: 'snowling' },
  /* 38 */ { creep: 'harpy' },
  /* 39 */ { creep: 'wraith' },
  /* 40 */ { creep: 'winter_king', escort: { creep: 'troll', count: 4 } },
];

/** The Wave numbers of the air Waves, for the wave preview's warning. */
export const AIR_WAVES: readonly number[] = MAUL_WAVES.flatMap((w, i) => (w.creep === 'harpy' ? [i + 1] : []));
