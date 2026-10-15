// Rasterises tools/icon.svg into the web app and Android launcher icons.
// Run with `pnpm icons` after editing the SVG; the outputs are committed.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

const svg = await readFile(new URL('./icon.svg', import.meta.url));
const root = new URL('../', import.meta.url);

/** `inset` shrinks the art onto the background colour, for maskable and adaptive icons. */
async function png(path, size, inset = 0) {
  const inner = Math.round(size * (1 - inset * 2));
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  const out = await sharp({ create: { width: size, height: size, channels: 4, background: '#12100e' } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toBuffer();
  const file = new URL(path, root);
  await mkdir(dirname(file.pathname), { recursive: true });
  await writeFile(file, out);
  console.log(path);
}

await writeFile(new URL('public/favicon.svg', root), svg);
await png('public/icons/icon-192.png', 192);
await png('public/icons/icon-512.png', 512);
await png('public/icons/icon-maskable-512.png', 512, 0.1);
await png('public/icons/apple-touch-icon-180.png', 180);

// Android launcher icons, written only once the Capacitor project exists.
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
try {
  await readFile(new URL('android/app/build.gradle', root));
  for (const [d, size] of Object.entries(densities)) {
    const res = `android/app/src/main/res/mipmap-${d}`;
    await png(`${res}/ic_launcher.png`, size);
    await png(`${res}/ic_launcher_round.png`, size);
    // Adaptive foreground is 108dp with a 72dp safe zone: inset by 1/6 per side.
    await png(`${res}/ic_launcher_foreground.png`, Math.round(size * 1.5), 1 / 6);
  }
  // Replace Capacitor's placeholder splash images, keeping each one's size.
  const res = new URL('android/app/src/main/res/', root);
  for (const dir of await readdir(res)) {
    if (!dir.startsWith('drawable')) continue;
    const file = new URL(`${dir}/splash.png`, res);
    let meta;
    try { meta = await sharp(file.pathname).metadata(); } catch { continue; }
    const side = Math.round(Math.min(meta.width, meta.height) * 0.4);
    const art = await sharp(svg, { density: 384 }).resize(side, side).png().toBuffer();
    await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: '#12100e' } })
      .composite([{ input: art, gravity: 'center' }])
      .png()
      .toFile(file.pathname);
    console.log(`android/app/src/main/res/${dir}/splash.png`);
  }
} catch {
  console.log('(no android/ project yet, skipped launcher icons)');
}
