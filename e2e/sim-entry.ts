// What the determinism test injects into each browser: the game logic and the
// replay fixture, bundled on their own so the app never ships the test mode.
export { replayHash } from '../src/sim';
export { FIXTURE_REPLAY, ELEMENT_FIXTURE_REPLAY, ORIGINAL_FIXTURE_REPLAY } from '../src/sim/testing';
