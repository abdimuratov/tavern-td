import { Assets, type Texture } from 'pixi.js';

// Painted sprites cut from the art sheets by `pnpm sprites` (docs/art-prompts.md):
// src/assets/art/<folder>/<id>.webp, each 256 × 256 with the item centred in
// ART_UNIT pixels. A look names one by its key, 'original/ghoul'; a Run loads
// its mode's folder before its board draws, and whatever has no sprite stays a shape.

const URLS = import.meta.glob<string>('../assets/art/*/*.webp', { eager: true, query: '?url', import: 'default' });
const PREFIX = '../assets/art/';

/** Art key ('original/ghoul') to its URL. */
const BY_KEY = new Map(Object.entries(URLS).map(([path, url]) => [path.slice(PREFIX.length, -'.webp'.length), url]));

/** The item's size in a sprite, of its 256 pixels: scale a sprite by worldSize / ART_UNIT. */
export const ART_UNIT = 240;

const loaded = new Map<string, Texture>();

/** `key` if a sprite exists for it, so a look can name one only where there is one. */
export function art(key: string): string | undefined {
  return BY_KEY.has(key) ? key : undefined;
}

export function artUrl(key: string): string | undefined {
  return BY_KEY.get(key);
}

/** The sprite once its folder has loaded. */
export function artTexture(key: string | undefined): Texture | undefined {
  return key === undefined ? undefined : loaded.get(key);
}

/** Loads every sprite in a folder, such as 'maul'. Loading twice costs nothing. */
export async function loadArt(folder: string): Promise<void> {
  const keys = [...BY_KEY.keys()].filter((k) => k.startsWith(`${folder}/`) && !loaded.has(k));
  const textures = await Promise.all(
    keys.map((k) => Assets.load<Texture>({ src: BY_KEY.get(k)!, data: { autoGenerateMipmaps: true, scaleMode: 'linear' } })),
  );
  keys.forEach((k, i) => loaded.set(k, textures[i]!));
}
