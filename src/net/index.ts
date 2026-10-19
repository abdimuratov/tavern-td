// Versus' net layer (docs/versus-design.md §8). The app imports from here.

export { browserClock, type Clock } from './clock';
export { canSend, type Route, type Transport, type TransportState } from './transport';
export {
  CodeError, decodeCode, encodeCode, joinLink, readCode, sdpFields, sdpFromCode,
  type CodeContent, type CodeKind, type CodeProblem, type SdpFields,
} from './codes';
export { NET_VERSION, TURN_TICKS, HASH_EVERY, MAX_BATCH, type PauseKind } from './protocol';
export {
  COUNTDOWN_MS, createLockstep, filterBatch, inputDelay,
  type Lockstep, type LockstepEvent, type LockstepStatus, type PauseStatus, type EndReason, type SideId,
} from './lockstep';
export {
  createSession,
  type Session, type SessionEvent, type SessionOptions, type SessionPhase, type SessionStatus, type LinkState, type LobbyStatus,
  type Mismatch, type Outcome, type Role, type VersusRun,
} from './session';
export { decodeReport, encodeReport, ReportError, type DesyncReport } from './report';
export { BUILD, SIM_HASH } from './version';
export {
  CONNECT_TIMEOUT_MS, DEFAULT_ICE_SERVERS, answerJoinCode, makeJoinCode,
  type GuestLink, type HostLink, type RtcOptions,
} from './rtc';
export { RELAY_URL, getRelay, type Relay, type RelayProblem, type RelayServer } from './relay';
export type { CodeRelay, RelayUse } from './ice';
