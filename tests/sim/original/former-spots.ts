// The Build Spots each Stage had before free placement (docs/original-design.md
// §17), by Map id: the top-left cells of their 2 × 2s, in each Stage's old
// order. Older saves stand their towers on them, so no Scenery and no Burnt
// ground a Challenge keeps may cover one (the guard in stages.test.ts). The
// tests also use them as places whose geometry their comments describe
// ("Spot 0 (1280, 320) to Spot 1 is 256").

export type Cell = readonly [col: number, row: number];

export const FORMER_SPOTS: Readonly<Record<string, readonly Cell[]>> = {
  'mill-road': [[19, 4], [23, 4], [19, 6], [23, 6], [7, 10], [11, 10], [7, 12], [11, 12]],
  'greyriver-crossing': [[10, 3], [10, 13], [24, 3], [25, 5], [21, 9], [24, 9], [24, 13], [17, 9], [4, 13]],
  'gallows-hill': [[15, 7], [18, 7], [21, 7], [11, 5], [19, 9], [12, 1], [20, 1], [26, 6], [12, 13], [20, 14]],
  'fort-harrow': [[8, 3], [16, 3], [25, 3], [6, 8], [14, 8], [21, 8], [6, 10], [12, 10], [13, 14], [17, 14]],
  'drowned-causeway': [[7, 6], [9, 6], [13, 9], [15, 9], [19, 6], [21, 6], [25, 9], [27, 9], [3, 8], [13, 0], [19, 16]],
  'sunken-chapel': [[11, 8], [15, 8], [20, 8], [7, 4], [13, 4], [22, 4], [11, 12], [15, 12], [22, 12], [5, 10], [26, 8]],
  'plague-fords': [[6, 6], [11, 6], [6, 10], [11, 10], [15, 8], [9, 2], [9, 14], [20, 6], [23, 4], [21, 10], [25, 10], [27, 5]],
  'blight-pit': [[14, 6], [18, 6], [14, 10], [18, 10], [6, 4], [10, 6], [14, 4], [22, 12], [26, 10], [18, 12], [6, 12], [24, 6]],
  'the-scar': [[8, 13], [12, 13], [16, 13], [20, 13], [8, 9], [12, 9], [16, 9], [20, 9], [10, 5], [14, 5], [18, 5], [22, 5]],
  'black-cliffs': [[5, 4], [8, 4], [6, 0], [4, 8], [4, 12], [9, 12], [13, 4], [14, 12], [16, 12], [20, 8], [24, 12], [25, 8], [22, 4]],
  'three-gates': [
    [3, 6], [7, 6], [7, 2], [12, 6], [16, 6], [8, 10], [12, 10], [14, 10], [10, 14], [21, 3], [27, 3], [24, 6], [22, 11], [26, 12],
  ],
  'riftmaw': [[6, 13], [11, 13], [16, 13], [21, 13], [6, 4], [13, 4], [17, 4], [21, 4], [9, 9], [14, 8], [19, 9], [21, 8], [25, 8], [1, 6]],
  // The tests' own Map (helpers.ts), whose Open ground is just these.
  'two-routes': [[4, 7], [8, 7], [12, 7], [16, 7], [20, 7], [24, 7]],
};

/** The Build Spots each Challenge kept, by index in its Stage's old list: its older saves' towers stand only on these. */
export const KEPT_SPOTS: Readonly<Record<string, readonly number[]>> = {
  'burnt-mill': [0, 1, 2, 3],
  'glass-slope': [0, 1, 2, 3, 8, 9, 10, 11],
};

/** Former Spot `spot` of the Map `mapId`: its top-left cell. Throws on one the Map never had. */
export function formerSpot(mapId: string, spot: number): Cell {
  const cell = FORMER_SPOTS[mapId]?.[spot];
  if (!cell) throw new Error(`${mapId} had no Build Spot ${spot}`);
  return cell;
}
