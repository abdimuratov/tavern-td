// The one thing the Versus net code needs from a connection: text both ways,
// in order, never lost while it is open (docs/versus-design.md §4.5). rtc.ts
// makes one from a WebRTC DataChannel; the tests make one in memory.

/**
 * - `connecting`: not open yet.
 * - `open`: messages flow.
 * - `unstable`: ICE says `disconnected`. It often recovers by itself, so nothing is torn down.
 * - `closed`: ICE `failed`, or the channel closed. It never opens again; a reconnect is a new Transport.
 */
export type TransportState = 'connecting' | 'open' | 'unstable' | 'closed';

/**
 * How an open connection runs: `direct` between the two devices over a
 * DataChannel, or `relayed` through the Relay's WebSocket
 * (docs/versus-design.md §2). Local UI state, never a message.
 */
export type Route = 'direct' | 'relayed';

export interface Transport {
  readonly state: TransportState;
  /** Sends one message. Dropped unless the state is `open` or `unstable`. */
  send(text: string): void;
  /** Every message received, in the order sent. Returns the unsubscribe. */
  onMessage(listener: (text: string) => void): () => void;
  /** Every change of state. Returns the unsubscribe. */
  onState(listener: (state: TransportState) => void): () => void;
  /** Closes it for good; the state becomes `closed`. */
  close(): void;
  /** Once open, how it runs; null until known. A transport that can't tell (the tests' fake) leaves both out. */
  readonly route?: Route | null;
  /** Every change of route. Returns the unsubscribe. */
  onRoute?(listener: (route: Route) => void): () => void;
}

/** True when a message sent now would go out. */
export function canSend(transport: Transport | null): transport is Transport {
  return transport !== null && (transport.state === 'open' || transport.state === 'unstable');
}
