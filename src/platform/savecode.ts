/**
 * Save export/import as text a player can copy, paste or message to themselves:
 * `TTD1.<crc32 hex>.<base64url of deflate-raw JSON>`. The checksum covers the
 * compressed bytes, so a damaged or cut-off paste is rejected before it is
 * decompressed rather than loading garbage.
 */

const FORMAT = 'TTD';
const VERSION = 1;
/** Refuses codes that would inflate past this, so a hostile paste can't exhaust memory. */
const MAX_JSON_BYTES = 16 * 1024 * 1024;

export type SaveCodeProblem = 'not-a-save' | 'newer-version' | 'damaged';

export class SaveCodeError extends Error {
  override name = 'SaveCodeError';
  constructor(readonly problem: SaveCodeProblem, message: string) {
    super(message);
  }
}

export async function encodeSave(value: unknown): Promise<string> {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('encodeSave needs a JSON value');
  const packed = await deflate(json);
  return `${FORMAT}${VERSION}.${hex(crc32(packed))}.${toBase64Url(packed)}`;
}

/** Text as deflate-raw bytes, the compression save codes use; Versus reuses it for snapshots and desync reports. */
export function deflate(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return transform(new TextEncoder().encode(text), new CompressionStream('deflate-raw'));
}

/** The text deflate() packed. Throws on damaged bytes, invalid UTF-8, or more than `limit` bytes inflated. */
export async function inflate(packed: Uint8Array<ArrayBuffer>, limit = MAX_JSON_BYTES): Promise<string> {
  const bytes = await transform(packed, new DecompressionStream('deflate-raw'), limit);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Throws a SaveCodeError whose message can be shown to the player as is. */
export async function decodeSave<T = unknown>(code: string): Promise<T> {
  // Mail and chat apps wrap long lines and sometimes add zero-width characters.
  const clean = code.replace(/[\s\u200b-\u200d\ufeff]+/g, '');
  const match = /^TTD(\d+)\.([0-9a-f]{8})\.([A-Za-z0-9_-]+)$/i.exec(clean);
  if (!match) {
    if (!/^TTD/i.test(clean)) throw new SaveCodeError('not-a-save', "That isn't a Tavern TD save code.");
    throw damaged();
  }
  const [, version = '', checksum = '', payload = ''] = match;
  if (Number(version) > VERSION) {
    throw new SaveCodeError('newer-version', 'This save code is from a newer version of Tavern TD. Update the app and try again.');
  }
  const packed = fromBase64Url(payload);
  if (!packed || hex(crc32(packed)) !== checksum.toLowerCase()) throw damaged();
  try {
    return JSON.parse(await inflate(packed)) as T;
  } catch {
    throw damaged();
  }
}

function damaged(): SaveCodeError {
  return new SaveCodeError('damaged', 'This save code is damaged or incomplete. Copy the whole code and try again.');
}

async function transform(
  input: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
  limit = Infinity,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([input]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new RangeError('save code inflates past the size limit');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x2000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Bytes from base64url, or undefined when the text can't be whole bytes (a paste that lost characters). */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | undefined {
  // A length of 1 mod 4 can't come from whole bytes: the paste lost characters.
  if (text.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(text)) return undefined;
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function hex(n: number): string {
  return n.toString(16).padStart(8, '0');
}
