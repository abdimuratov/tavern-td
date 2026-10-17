import type { SimEvent } from './events';

// The player changes a Run only through commands. They arrive from the UI or a
// JSON replay, so handlers treat every field as untrusted and reject, never throw.

export interface StartWaveCommand {
  readonly type: 'startWave';
}

export type CoreCommand = StartWaveCommand;

/**
 * A Game Mode's own command. Declare mode commands as `type` aliases, not
 * interfaces, so they fit this index signature.
 */
export type ModeCommand = { readonly type: string; readonly [key: string]: unknown };

export type Command = CoreCommand | ModeCommand;

export function reject(events: SimEvent[], command: Command, reason: string): void {
  events.push({ type: 'rejected', command, reason });
}

function arg(command: Command, key: string): unknown {
  return Object.hasOwn(command, key) ? (command as ModeCommand)[key] : undefined;
}

/** A whole-number field, or null when it is missing or malformed. */
export function intArg(command: Command, key: string): number | null {
  const v = arg(command, key);
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

export function numberArg(command: Command, key: string): number | null {
  const v = arg(command, key);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function stringArg(command: Command, key: string): string | null {
  const v = arg(command, key);
  return typeof v === 'string' ? v : null;
}

/** True when `id` names an own entry of a content table (so "constructor" or "__proto__" never match). */
export function hasSpec(table: Readonly<Record<string, unknown>>, id: string): boolean {
  return Object.hasOwn(table, id);
}
