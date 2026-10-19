// Types for worker.js, so tests/net/turn-worker.test.ts can import it. The
// Worker itself stays one plain JavaScript file, pasted as it is.

export interface TurnEnv {
  readonly TURN_KEY_ID?: string;
  readonly TURN_KEY_API_TOKEN?: string;
}

declare const worker: {
  fetch(request: Request, env: TurnEnv): Promise<Response>;
};

export default worker;
