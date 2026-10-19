import { crc32, deflate, fromBase64Url, hex, inflate, toBase64Url } from '../platform/savecode';
import type { Replay } from '../sim';

// The desync report (docs/versus-design.md §4.7): what a player copies after a
// Desync, so the two engines' disagreement can be replayed in Node and WebKit.
// `TTDR1.<crc32 hex>.<base64url of deflate-raw JSON>`, compressed like save codes.

export const REPORT_VERSION = 1;

export interface DesyncReport {
  readonly v: number;
  /** The Side of the device that made it (0 the Host, 1 the Guest). */
  readonly side: 0 | 1;
  /** Side 0's (the Host's) and Side 1's builds and browsers. */
  readonly builds: readonly [string, string];
  readonly browsers: readonly [string, string];
  /** The hash check that differed, and Side 0's and Side 1's hashes there. */
  readonly tick: number;
  readonly hashes: readonly [string, string];
  /** The tick both stopped on to repair it (or ended on, for a second Desync). */
  readonly pauseTick: number;
  /** This device's Run from its start to the pause: seed, options and log. */
  readonly replay: Replay;
  /** snapshot() of this device's own state at the pause, before any resync replaced it. */
  readonly state: string;
}

export class ReportError extends Error {
  override name = 'ReportError';
}

export async function encodeReport(report: DesyncReport): Promise<string> {
  const packed = await deflate(JSON.stringify(report));
  return `TTDR${REPORT_VERSION}.${hex(crc32(packed))}.${toBase64Url(packed)}`;
}

/** A report back from its code, for tools and tests. Throws a ReportError on anything else. */
export async function decodeReport(code: string): Promise<DesyncReport> {
  const m = /^TTDR(\d+)\.([0-9a-f]{8})\.([A-Za-z0-9_-]+)$/i.exec(code.replace(/[\s\u200b-\u200d\ufeff]+/g, ''));
  if (!m) throw new ReportError("That isn't a Tavern TD desync report.");
  if (Number(m[1]) !== REPORT_VERSION) throw new ReportError('This desync report is from another version of Tavern TD.');
  const packed = fromBase64Url(m[3]!);
  if (!packed || hex(crc32(packed)) !== m[2]!.toLowerCase()) throw new ReportError('This desync report is damaged or cut off.');
  try {
    return JSON.parse(await inflate(packed)) as DesyncReport;
  } catch {
    throw new ReportError('This desync report is damaged or cut off.');
  }
}
