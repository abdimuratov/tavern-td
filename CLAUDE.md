# Tavern TD

A single-player tower defense collection for Mac, iPhone and Android, built as a TypeScript + PixiJS web app.

- **Before any work:** read [docs/PLAN.md](docs/PLAN.md). Its §0 Status names the current phase, and §3 gives each phase's exit bar. Tick the box in §0 when a phase meets that bar.
- **Naming:** speak and name code in the terms of [CONTEXT.md](CONTEXT.md), e.g. Game Mode, Classic, Run, Wave, Stage, Tower Level. Add a new term there the moment it settles.
- **Changing the stack or the game logic's shape:** read [docs/adr/](docs/adr/) first.
- **Porting a Classic, tuning numbers, or hitting a platform quirk:** check [docs/research/](docs/research/).
- **Determinism (`src/sim`):** all randomness comes from the seeded RNG held in the game state, and math sticks to `+ − × ÷` and `sqrt` ([ADR-0002](docs/adr/0002-deterministic-simulation-core.md)).
- **Git hosting:** this repo lives on the personal GitHub account `abdimuratov` and is driven with `gh`. It has nothing to do with gitlab.bcc.kz.
