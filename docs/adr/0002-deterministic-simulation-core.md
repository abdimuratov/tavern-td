# Deterministic, render-free simulation core

All game rules live in a simulation module that never touches rendering, wall-clock timers or `Math.random`. It follows three rules:

- **Fixed ticks.** It advances in fixed 30 Hz ticks.
- **Seeded randomness.** It draws all randomness from a seeded RNG whose state is part of the save.
- **Basic arithmetic only.** It uses only `+ − × ÷` and `sqrt`, which IEEE 754 requires to be exactly rounded, so they produce identical results on every JavaScript engine. Engine-dependent functions such as `Math.sin`, `Math.pow`, `Math.exp` and `Math.hypot` are banned; it uses lookup tables or its own approximations instead.

We chose this because it gives us four things for one constraint:

- Autosave becomes a plain snapshot.
- 1×, 2× and 3× speed can't change outcomes.
- The rules can be tested headlessly.
- Versus play can be added later (lockstep, or replay verification between Safari and Chrome) without rewriting the rules.

Without this record, a future change could easily break determinism, for example by calling `Math.random()` or a trig function in a tower ability.
