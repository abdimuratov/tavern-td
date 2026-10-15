# Tavern TD — plan

A single-player collection of tower defense Game Modes, most recreating Warcraft 3 Classics. It runs on Mac, iPhone and Android, and it's for you and your friends, not the stores. Vocabulary follows [CONTEXT.md](../CONTEXT.md). Background is in [docs/research/](research/), and the hard-to-reverse decisions are in [docs/adr/](adr/).

## 0. Status

Planning finished on 2026-10-15. **Next: Phase 0.** The folder isn't a git repo yet and no code exists. Tick a box when its phase meets the exit bar in §3, and keep this list current.

- [ ] Phase 0: foundations
- [ ] Phase 1: engine core + Gem
- [ ] Phase 2: Element
- [ ] Phase 3: Original
- [ ] Phase 4: Maul
- [ ] Phase 5: stretch

## 1. What we agreed

| Topic | Decision |
|---|---|
| Platforms | **Mac:** Safari "Add to Dock" or Chrome "Install app". **iPhone:** Safari "Add to Home Screen". **Android 16+:** APK installed over USB (Galaxy S24 Ultra, One UI 8.5); an AAB isn't needed for sideloading. No app stores. |
| Stack | TypeScript, PixiJS 8 and Vite as an installable web app; Capacitor 8 wraps it as the Android APK ([ADR-0001](adr/0001-typescript-web-app-not-native-engine.md)) |
| Hosting | Public GitHub repo `abdimuratov/tavern-td`, deployed to GitHub Pages |
| Game logic | Deterministic, with no drawing code, ready for versus play later ([ADR-0002](adr/0002-deterministic-simulation-core.md)) |
| Players | Single-player now; versus is a stretch goal |
| Look | 2D top-down, clean geometric shapes drawn in code, **landscape only**. The UI is designed fresh and doesn't copy WC3. |
| Game Modes | **Gem** (Gem TD), **Element** (Element TD), **Original** (our Campaign), **Maul** (Wintermaul), in that build order. Line Wars against an AI is the stretch goal; Legion is parked. |
| Faithfulness | Gem and Element copy the Classic 1:1 from public source code. Maul keeps faithful rules with our own numbers. Classics keep their randomness and have no progression. |
| Progression | Classics keep Records only. The Original has a Campaign, Stars, Talents and Tower Levels. |
| Difficulty | Easy, Normal, Hard and Insane in every mode. Normal uses the Classic's own numbers. |
| Every mode gets | 1×/2×/3× speed and pause; autosave every Wave and when the app is backgrounded; Continue; save export/import; wave preview; path preview while placing; Records |
| Controls | **Mac:** mouse plus WC3-style hotkeys. **Phone:** tap to preview, tap again to confirm, pinch to zoom, drag to pan. Haptics on Android only. |
| Sound | Generated retro sound effects, no music at first. On iPhone, sound plays even with the silent switch on. |
| Language | English UI only |

## 2. Architecture

```
tavern-td/
  src/
    sim/                 deterministic rules: no DOM, no Pixi, no Math.random (ADR-0002)
      core/              tick loop, seeded RNG, state, commands, events, snapshot/restore
      path/              grid flow fields, checkpoints, Block check, fixed routes, air lines
      combat/            targeting, projectiles, damage/armor tables, buffs and debuffs
      economy/           gold, bounty, interest, lives, sell refunds
      modes/             one folder per Game Mode: rules + command handlers
        gem/ element/ original/ maul/
    content/             typed data tables: towers, creeps, Waves, Maps, Recipes, Talents
    render/              PixiJS views over sim state, smoothing between ticks, effects, camera
    ui/                  menus and HUD (Preact + signals, DOM over the canvas)
    platform/            storage (IndexedDB), audio, haptics, app lifecycle, rotate screen
    app/                 boot and screen routing
  tests/                 vitest: unit, scenario, determinism, balance bots
  tools/                 balance runner CLI, Map preview
  android/               Capacitor project (minSdk 36 = Android 16, landscape locked)
```

**The game logic is one plain object plus a step function.**
- `GameState` is a serializable plain object, so an autosave is just `JSON` of the state.
- `step(state, commands)` advances one tick at 30 Hz and returns events (kills, leaks, Wave end) that the renderer and audio react to.
- The player can only change the game through **commands**: `PlaceTower`, `Sell`, `Upgrade`, `KeepGem`, `PickElement`, `StartWave` and so on, each stamped with its tick. A seed plus the command log replays a whole Run exactly. That gives us replay tests now and lockstep versus later.

**Each Game Mode plugs into a small interface.** It sets up its Map and Waves, handles its own commands, and hooks the Wave-end and kill events. The core code knows nothing about gems or elements.

**Pathing:**
- **Mazing modes (Gem, Maul):** a flow field built backwards from the exit through each checkpoint, rebuilt only when a tower or Rock appears or disappears. The Block check is a search over the grid run before every placement.
- **Fixed-route modes (Element, Original):** creeps move along polylines and track how far they've travelled.
- **Air creeps:** fly straight from checkpoint to checkpoint.

**Determinism guardrails:**
- An ESLint rule bans `Math.random`, `Math.sin/cos/pow/exp/hypot`, `Date` and `performance` inside `src/sim`.
- A test checks that the same seed and commands produce an identical state hash.
- A test snapshots a Run mid-way, restores it, and checks it continues identically.
- A Playwright test runs the same replay in WebKit and compares its hash with Node, to check Safari and Chrome agree.

**Rendering:**
- Geometric shapes are drawn once at boot into a texture atlas.
- Sprites are reused from pools instead of created and destroyed.
- Positions are smoothed between 30 Hz ticks, so the display runs smoothly at 60 or 120 Hz.

**Platform layer:**
- **Storage:** IndexedDB via `idb-keyval`, calling `navigator.storage.persist()`. Save export/import uses a compressed text code.
- **Lifecycle:** going to the background (`visibilitychange`) pauses and autosaves.
- **Audio:** Web Audio, with `navigator.audioSession.type = 'playback'`.
- **Haptics:** Capacitor's Haptics plugin, Android only.
- **Screen:** canvas size comes from `visualViewport` (iOS has a standalone-app `vh` bug), plus `viewport-fit=cover` and `black-translucent`.
- **Offline:** `vite-plugin-pwa` precaches everything. A "new version, reload" toast appears when an update is deployed.

**Performance budget:** one game-logic tick of 4 ms or less with 300 creeps and 80 towers on an iPhone. A steady 60 fps on the S24 and on an iPhone.

## 3. Phases

Every phase ends the same way. All tests pass, the deterministic replay is green, and a full Run can be played, autosaved and resumed on **Mac, iPhone and the S24**.

### Phase 0: foundations
- Create the repo (Vite, TypeScript strict, ESLint with the sim ban list, vitest, Playwright) and add GitHub Actions to typecheck, test, build and deploy to Pages on every push to `main`.
- Build the installable web app shell: manifest, icons, service worker, black-translucent status bar, rotate screen, an empty Pixi board with pan and zoom.
- Set up the Android pipeline: install JDK 21 and the Android command-line tools via Homebrew, set up Capacitor 8 with landscape locked and `minSdk 36`, write a local signing keystore, and add `pnpm apk` to build and `adb install` it.
- **Exit:** the Tavern TD icon opens the app offline on all three devices, and a tap on the board registers.

### Phase 1: engine core + Gem
1. **Game logic core:** tick loop, RNG, state, commands, events, snapshot; grid, flow fields, checkpoints, the Block check; ground and air creeps; towers with targeting and projectiles; lives; Waves.
2. **Rendering and input:** board, creeps, towers, projectiles, hit effects; tap-preview-confirm and mouse with hotkeys; HUD; speed and pause; live path line; wave preview.
3. **Gem rules, ported from [nvs/gem](https://github.com/nvs/gem) (Gem TD+):**
   - Each build phase places a 5-gem Draft; you keep one and the rest become Rocks.
   - 8 gem types × 6 qualities.
   - Merges, Recipes with their tiers, and slates.
   - Chance levels 0–8 and swap.
   - Gem TD's Map and checkpoints.
   - 50 Waves plus the damage test, with air and summon Waves.
4. **Saving:** autosave, Continue, Records, Difficulty select, save export/import.
5. **Polish:** sound effects, Android haptics, settings, a one-screen "how to play".

### Phase 2: Element
Ported from [MNoya/Element-TD](https://github.com/MNoya/Element-TD) (wavedata, gamesettings, interest, tooltips).
- **Path:** a fixed route, faithful to the WC3 version.
- **Towers:** arrow and cannon to start. Lumber every 5 Waves summons an elemental, and killing it unlocks that element. Element levels 1–3 unlock single, dual and triple towers; Pure Essence and the Periodic tower are included.
- **Combat:** the 6-element damage cycle (200% / 50%) and creep traits: fast, heal, mech, undead, image, regen, swarm, bulky.
- **Economy:** 2% interest every 15 s, 50 lives, a 250-gold start.
- **Modes:** All Pick and All Random elements, 55 Waves or 30-Wave Express.

### Phase 3: Original (the Campaign)
1. **Design doc first** (`docs/original-design.md`): the world and its 3 regions, the creep roster (about 12 types: armoured, magic-resistant, fast, swarm, flying, regenerating, splitting, shielded, bosses), the 30 towers, Talent trees and a rough plan for each of the 12 Stages.
2. **Rules:**
   - **Towers:** 6 Tower Families (Arrow, Cannon, Frost, Arcane, Poison, Totem). Each goes through Tiers 1–3, then picks one of 2 Specialisations, about 30 towers in all. Not every family can hit air.
   - **Maps:** Build Spots only, with no free placement.
   - **Tower Level:** gain XP from kills, up to level 10, with stats every level and a Perk at levels 5 and 10. XP resets every Run.
   - **Stars:** 3 if you keep 18 or more of 20 lives, 2 if you keep 6 or more, 1 otherwise.
   - **Talents:** a Talent tree per family, bought with Stars and reset for free.
   - **Unlocks:** new Tower Families unlock as you finish Stages.
   - **Early call:** calling the next Wave early pays bonus gold.
   - **No hero.** A "hero tower" can be reconsidered later.
3. **Content:** 12 Stages in 3 regions of 4, each with 10–20 Waves (about 8–15 minutes), plus a Stage-select screen.
4. **Later:** challenge versions of Stages that award extra Stars.

### Phase 4: Maul
- **Maps:** open-field mazing reusing Gem's pathing, but without Rocks. One Map with 1–2 spawns and checkpoints.
- **Races:** 4 Races with original names: physical/siege, frost/slow, poison/damage over time, arcane/splash. Each has about 6 towers with branching upgrades.
- **Juggling is allowed;** Blocks are rejected.
- **Waves:** 40, with a boss every 10 and telegraphed air Waves.
- **Numbers:** our own, starting from the research baseline below.

### Phase 5: stretch
- Line Wars against an AI: send creeps to raise your income.
- Then versus over WebRTC, using lockstep on the command log.

## 4. Balance method

- **Gem and Element:** port the tables as-is. Bots replay full Runs to confirm the port behaves like the original, for example that creep HP and wave timing match the source.
- **Original and Maul:** start from the baseline in [td-design-and-balance.md §9](research/td-design-and-balance.md):

  | Setting | Baseline |
  |---|---|
  | Creep HP | `20 × 1.10^(w−1)` |
  | Bounty | a pool of `10 × (1 + floor(w/4))` per Wave |
  | End-of-Wave bonus | `20 + 4w` |
  | Interest | 4%, capped at that Wave's bonus |
  | Sell refund | 70%, or 100% within the same build phase |
  | Basic tower damage | about 0.10 DPS per gold |

- **Difficulty:** creep HP × 0.75 / 1 / 1.3 / 1.6. Element uses its Classic's own Hard and Insane values.
- **Balance bots:** a headless `tools/balance` runner plays scripted strategies (greedy DPS, maze-heavy, single-family) across seeds and Difficulties, and reports Wave reached and win rate. Targets: a competent bot wins Easy ~95%, Normal ~60% and Insane under 10%. CI runs a small sample on every push.

## 5. Risks

| Risk | Mitigation |
|---|---|
| iPhone Safari quirks (viewport bug, muted audio, no orientation lock) | Hit them in Phase 0 on the real phone, not later |
| Pathing slows down with many creeps | Flow fields rebuilt only on placement, pooled entities, the performance budget test |
| Determinism quietly breaks | ADR-0002, the lint ban list, the replay hash test and the WebKit-vs-Node test |
| Classic sources are incomplete (JASS and Lua, some values missing) | Mark filled-in values `assumed` in the content tables; bots sanity-check them |
| Licences of the ported repos | Check nvs/gem and MNoya/Element-TD before porting. Port only rules and numbers; write our own text and draw our own shapes |
| Android sideloading verification (rolling out worldwide in 2027) | `adb install` is exempt; a free Limited Distribution account is the fallback |

## 6. Things only you can do

- **S24:** turn on Developer options and USB debugging, then connect it by cable when installing the APK.
- **iPhone:** open the Pages URL in Safari, then Share → Add to Home Screen.
- **GitHub:** approve creating the public `tavern-td` repo and turning on Pages. I'll ask before each step.
- **Play-test** at the end of each phase and tell me what feels off.

## 7. Parked for later

- Line Wars details and versus networking.
- Challenge Stages, music and more Races.
- A Remix mode (Gem's Draft plus Element's picks) and Legion-style auto-battling.
