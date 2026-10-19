# Versus is lockstep over WebRTC, joined by codes passed by hand

_TURN: since 2026-10-20 Versus has a relay after all. [ADR-0005](0005-a-turn-relay-for-versus.md) records it and supersedes what this ADR says about TURN._

Versus plays Line Wars between two devices. Each runs the whole deterministic sim (ADR-0002) with both Sides driven by people (ADR-0003), and the devices send each other only commands. Every 100 ms Turn, each sends a Batch of its own Side's commands, and a Turn steps only once both Batches are in, Side 0's first. They talk over one reliable, ordered WebRTC DataChannel. There is no server of our own (GitHub Pages only serves files), so WebRTC's offer and answer travel by hand as two short codes, the Join code and the Answer code. Each holds only the ICE credentials, the DTLS fingerprint and a few candidates, and the other end rebuilds the SDP. Public STUN only, no TURN. The net code lives in `src/net` and reaches a Run through one seam in the controller, a tick source. `src/sim` keeps its rules, state and hashes.

We chose this for four reasons:

- **Lockstep needs nothing the sim doesn't already promise.** ADR-0002 makes a seed and a command log a whole Run, so two devices stay equal by sending commands alone: about a kilobyte a second.
- **A TD hides an Input Delay of 200–500 ms,** so lockstep's one cost doesn't matter here.
- **Codes passed by hand need no account and no server,** and no third party sees both players' addresses.
- **A state hash every second catches a desync,** and the replay of seed, options and log shows where it began.

Four alternatives lost:

- **The Host streaming its state** while the Guest only draws: 30 KB snapshots or a delta format, every Guest tap a full round trip late, and ADR-0002's determinism wasted.
- **Rollback, as in GGPO:** it hides latency a TD doesn't feel, at the cost of saving and re-simulating ticks on every late command.
- **A signaling server** (a Worker, Firebase) **or public relays** (Nostr, MQTT, WebTorrent trackers): an account to keep, or a third party that sees the players' addresses and timing.
- **TURN:** a paid or self-run relay, whose credentials can't live in a public repo.

## Consequences

- Without TURN some pairs of networks can't connect: vendors put it at about 15–25% of WebRTC sessions, and two phones on mobile data fare worse. The app says so and suggests one Wi-Fi.
- Joining takes two pastes, and a code goes stale after a couple of minutes.
- Both devices hold the whole state, so nothing is hidden from a peer that looks, and Records are each device's own word.
- Two builds must agree on the sim, not the whole app. A hash of `src/sim` and `src/content`, built in, gates the lobby, so an older APK can still play the newest web build.
- A Versus Run can't be saved or continued. A lost connection is rejoined with a fresh pair of codes, and a restarted Host app ends the Run.
- The UI can no longer assume Side 0 is "you". It gains a Viewer Side, and the Guest's board is drawn mirrored.
- The sim applies a logged command for any human Side, so the lockstep must filter: each device drops from a Side's Batch every command that doesn't name that Side, for both Sides alike, or a peer could move the other's pieces.
