// Cuts the art sheets in art/sheets/ (made from docs/art-prompts.md) into one
// sprite per item: src/assets/art/<folder>/<id>.webp, 256 × 256 with the item
// centred and the white around it taken away. Run with `pnpm sprites` after
// replacing a sheet; the outputs are committed.
//
// Each sheet is white with items on an invisible grid. Every patch of
// non-white joined to nothing else is one piece; a piece belongs to the cell
// its middle falls in, so a wing reaching into the next cell stays with its
// owner and loose bits (snow, sparks) stay with theirs.
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

/** [sheet, columns, rows, folder, ids in reading order; null is an empty cell]. */
const SHEETS = [
  ['01-arrow', 3, 2, 'original', ['arrow_tower', 'longbow_tower', 'marksman_tower', 'ranger_lodge', 'deadeye_perch', 'emblem_arrow']],
  ['02-cannon', 3, 2, 'original', ['cannon_tower', 'bombard', 'great_bombard', 'thunder_mortar', 'flak_battery', 'emblem_cannon']],
  ['03-frost', 3, 2, 'original', ['frost_tower', 'ice_spire', 'glacier_spire', 'blizzard_spire', 'rime_lance', 'emblem_frost']],
  ['04-arcane', 3, 2, 'original', ['mage_tower', 'sorcerer_tower', 'archmage_tower', 'arcane_lance', 'prism_tower', 'emblem_arcane']],
  ['05-poison', 3, 2, 'original', ['venom_dart', 'venom_spitter', 'venom_spire', 'plague_cauldron', 'widows_fang', 'emblem_poison']],
  ['06-totem', 3, 2, 'original', ['drum_totem', 'spirit_totem', 'ancestor_totem', 'war_totem', 'storm_totem', 'emblem_totem']],
  ['07-original-creeps-1', 4, 2, 'original', ['ghoul', 'hound', 'crawler', 'bloodbat', 'revenant', 'cultist', 'flesh_golem', 'bloater']],
  ['08-original-creeps-2', 3, 2, 'original', ['shieldbearer', 'gargoyle', null, 'gravelord', 'plague_mother', 'riftlord']],
  ['09-ironclad', 3, 3, 'maul', ['bulwark', 'ballista', 'mortar', 'heavy_ballista', 'skypiercer', 'repeater', 'siege_mortar', 'thunder_mortar', 'bombard']],
  ['10-rimeborn', 3, 3, 'maul', ['rime_wall', 'frost_spire', 'chill_totem', 'frost_lance', 'glacier_spike', 'hailcaller', 'rime_totem', 'blizzard_totem', 'shatter_totem']],
  ['11-mirefolk', 3, 3, 'maul', ['bramble', 'dart_tower', 'spore_pod', 'viper_tower', 'asp_spire', 'spitter', 'plague_pod', 'blight_pod', 'rot_bloom']],
  ['12-runecasters', 3, 3, 'maul', ['runestone', 'spark_rune', 'glyph', 'storm_rune', 'chain_rune', 'void_rune', 'sigil', 'nova_circle', 'ley_shrine']],
  // Maul's creep ids are older than their names: raider is the Brawler, frost_wolf the Sleet Hound, golem the Ice Golem, wraith the Hollow.
  ['13-maul-creeps', 4, 2, 'maul', ['raider', 'snowling', 'frost_wolf', 'brute', 'golem', 'troll', 'wraith', 'harpy']],
  ['14-maul-bosses', 2, 2, 'maul', ['warlord', 'mammoth', 'colossus', 'winter_king']],
];

const SIZE = 256;
/** Room round the item, so mipmaps never bleed it into the edge. */
const PAD = 8;
/** At or above this on every channel, a pixel is the sheet's white (it is about 254, with noise). */
const WHITE = 232;
/** The sheet's untouched white, for holes inside a ring of pieces: art's own whites are shaded below it. */
const FLAT = 250;
/** A hole of flat white this big or bigger is background, not a highlight. */
const HOLE = 1500;
/** Sheets whose closed-in white is art: the Snowling's body and the Ice Golem's snow. */
const KEEP_HOLES = new Set(['13-maul-creeps']);
/** Pieces smaller than this many pixels are compression specks. */
const SPECK = 40;

const root = new URL('../', import.meta.url);

/** The white joined to the sheet's edge: true where a pixel is background. */
function background(data, w, h, holes) {
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const white = (i) => data[i * 4] >= WHITE && data[i * 4 + 1] >= WHITE && data[i * 4 + 2] >= WHITE;
  const push = (i) => {
    if (!bg[i] && white(i)) {
      bg[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  const flood = () => {
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < w * (h - 1)) push(i + w);
    }
  };
  flood();
  if (!holes) return bg;
  // White a ring of pieces closes in (Nova Circle's stones) is background too, if it is the sheet's own flat white and big.
  const seen = new Uint8Array(w * h);
  const flat = (i) => data[i * 4] >= FLAT && data[i * 4 + 1] >= FLAT && data[i * 4 + 2] >= FLAT;
  for (let start = 0; start < w * h; start++) {
    if (bg[start] || seen[start] || !flat(start)) continue;
    const hole = [start];
    seen[start] = 1;
    for (let k = 0; k < hole.length; k++) {
      const i = hole[k];
      const x = i % w;
      for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (n >= 0 && n < w * h && !bg[n] && !seen[n] && flat(n)) {
          seen[n] = 1;
          hole.push(n);
        }
      }
    }
    if (hole.length < HOLE) continue;
    console.log(`  hole of ${hole.length} px at ${start % w},${Math.floor(start / w)}`);
    for (const i of hole) push(i);
    flood();
  }
  return bg;
}

/** Labels each joined patch of non-background (8-connected): the label per pixel, and each piece's area, box and middle. */
function pieces(bg, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  const out = [];
  for (let start = 0; start < w * h; start++) {
    if (bg[start] || label[start] >= 0) continue;
    const id = out.length;
    const p = { area: 0, x0: w, y0: h, x1: 0, y1: 0, sx: 0, sy: 0 };
    let head = 0;
    let tail = 0;
    label[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i - x) / w;
      p.area++;
      p.sx += x;
      p.sy += y;
      if (x < p.x0) p.x0 = x;
      if (x > p.x1) p.x1 = x;
      if (y < p.y0) p.y0 = y;
      if (y > p.y1) p.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (!bg[n] && label[n] < 0) {
            label[n] = id;
            queue[tail++] = n;
          }
        }
      }
    }
    out.push(p);
  }
  return { label, list: out };
}

async function cut([sheet, cols, rows, folder, ids]) {
  const { data, info } = await sharp(new URL(`art/sheets/${sheet}.webp`, root).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  console.log(sheet);
  const bg = background(data, w, h, !KEEP_HOLES.has(sheet));
  const { label, list } = pieces(bg, w, h);
  const cellOf = list.map((p) => {
    if (p.area < SPECK) return -1;
    const col = Math.min(cols - 1, Math.floor(p.sx / p.area / (w / cols)));
    const row = Math.min(rows - 1, Math.floor(p.sy / p.area / (h / rows)));
    return row * cols + col;
  });
  await mkdir(new URL(`src/assets/art/${folder}/`, root), { recursive: true });
  for (let cell = 0; cell < ids.length; cell++) {
    const id = ids[cell];
    const mine = list.map((_, k) => cellOf[k] === cell);
    if (!id) {
      if (mine.some(Boolean)) console.warn(`${sheet}: cell ${cell + 1} should be empty`);
      continue;
    }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    list.forEach((p, k) => {
      if (!mine[k]) return;
      x0 = Math.min(x0, p.x0);
      y0 = Math.min(y0, p.y0);
      x1 = Math.max(x1, p.x1);
      y1 = Math.max(y1, p.y1);
    });
    if (x1 < 0) throw new Error(`${sheet}: nothing in cell ${cell + 1} (${id})`);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;
    const crop = Buffer.alloc(cw * ch * 4);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        if (bg[i] || !mine[label[i]]) continue;
        const o = ((y - y0) * cw + (x - x0)) * 4;
        let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        let a = 255;
        // The outline's outermost pixels are blended with the white: take the white back out, so no pale rim shows on dark ground.
        const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
        if (edge) {
          const k = Math.max(255 - r, 255 - g, 255 - b) / 255;
          if (k <= 0) continue;
          r = Math.round((r - 255 * (1 - k)) / k);
          g = Math.round((g - 255 * (1 - k)) / k);
          b = Math.round((b - 255 * (1 - k)) / k);
          a = Math.round(k * 255);
        }
        crop[o] = r;
        crop[o + 1] = g;
        crop[o + 2] = b;
        crop[o + 3] = a;
      }
    }
    const inner = SIZE - PAD * 2;
    const path = `src/assets/art/${folder}/${id}.webp`;
    await sharp(crop, { raw: { width: cw, height: ch, channels: 4 } })
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 88, alphaQuality: 100, effort: 6 })
      .toFile(new URL(path, root).pathname);
    console.log(path);
  }
}

for (const s of SHEETS) await cut(s);
