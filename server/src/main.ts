import { createRelayServer } from './server.ts';

// Starts the Relay. Render sets PORT; locally and in the e2e tests it is 8787.

const relay = createRelayServer({ log: (line) => console.log(line) });
const port = await relay.listen(Number(process.env['PORT'] ?? 8787));
console.log(`Tavern TD relay listening on port ${port}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void relay.close().then(() => process.exit(0));
  });
}
