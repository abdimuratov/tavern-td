# Two Sides and an AI in one deterministic sim

Line Wars is the first Game Mode with two players: you, and a Rival played by an AI now and by a remote player in versus later. Both Sides live in the one `GameState`, and the AI is part of the sim. Four rules make that work:

- **One Map holds both Fields,** with no walkable cell between them and a band of rock wider than any tower's reach. The core's flow field, Block check, targeting, splash and auras then serve both Sides unchanged. A tower's Side is the Field it stands in, and a creep's Field is its spawn, so no core entity gains a field.
- **Each Side's gold, income and lives live in `state.mode`.** The core's `gold` is a copy of Side 0's, kept for the shared HUD. Its `lives` stays at 1, so the core's loss check never fires, and the Game Mode ends the Run itself.
- **Every command names its Side, and one handler applies them all,** whoever sent them. On one tick, Side 0's commands apply before Side 1's.
- **The AI is sim code.** It runs inside `step`, after the logged commands. It reads only the state and draws only from a seeded RNG stream kept in the state, and it acts only by passing commands to that same handler. Its commands are never logged. `RunOptions` names who drives each Side, and a Side driven by a person takes its commands from the log.

We chose this because a replay stays what ADR-0002 made it: the seed, the options and the human commands. That replay reproduces every AI action, so the existing replay, snapshot and WebKit-against-Node tests cover the AI for free. Versus then needs no new rules, only a different driver for Side 1 and a lockstep log.

Two alternatives lost:
- An AI outside the sim that logs its commands like a player would make replays depend on the AI's timing and code version. A remote peer could never check them.
- Giving the core players, with per-player gold, lives and ownership on every entity, would touch every Game Mode and every save for the sake of one mode.

## Consequences

- The AI is held to ADR-0002: the lint ban list, `+ − × ÷` and `sqrt` only, and no clocks. Its memory is plain JSON in the state, so autosave, save codes and snapshot tests carry it mid-thought. It may cache only what can be derived from the state, as flow fields are cached.
- The AI's own RNG stream is still a seeded RNG held in the state. It keeps AI variation from shifting combat rolls, so two versions of the AI compare cleanly on one seed.
- Its thinking counts toward the 4 ms tick budget, so it thinks every few ticks rather than every tick.
- A logged command for a Side the AI drives is refused, so a log can't move the AI's pieces. Lockstep versus must apply Side 0's commands before Side 1's on each tick.
- The rock band between the Fields costs board width (12 columns on Line Wars' Map). A content test must keep every range, splash, chain and aura inside it. A future mode with longer reach must widen the band, or move Sides into the core's targeting with a new ADR.
- The core's `gold` and `lives` mean less in this mode: a copy and a sentinel. UI that shows both Sides reads them from the mode's state.
