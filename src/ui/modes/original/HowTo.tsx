/** The Original on one screen: the rules a first Stage needs, then the controls. */
export function OriginalHowTo() {
  return (
    <div class="howto" data-testid="howto-original">
      <section>
        <h3>The road</h3>
        <p>The dead walk the road from the spawn to the exit. Fliers cut along the faint dashed air line instead. A creep that gets through costs its lives (big ones cost more) and is gone. You have 20 lives.</p>
      </section>
      <section>
        <h3>Build Spots</h3>
        <p>Towers stand only on the square pads beside the road. Tap an empty one and a ring shows the families you can build there, with their prices. Tap one for its Ghost and range, then tap it again, or the Ghost, to build.</p>
      </section>
      <section>
        <h3>Six families</h3>
        <p>Arrow, the triangle, is cheap, fast and hits air. Cannon, the circle, splashes the ground. Frost, the hexagon, slows. Arcane, the diamond, hits hard. Poison, the drop, hurts over time and skips armor and Shields. Totem, the pillar, lifts the towers around it. Finishing Stages opens more of them.</p>
      </section>
      <section>
        <h3>Tiers and Specialisations</h3>
        <p>Tap a tower to upgrade it through Tiers 1–3 (the pips under it), then pick one of two Specialisations (the gold crest). Selling returns 70%, or everything spent since the current Break began.</p>
      </section>
      <section>
        <h3>Armor</h3>
        <p>Armored creeps halve Pierce and cut Siege; Warded ones halve Magic. Bosses take less from everything but Poison. Nothing is immune, so mix your families.</p>
      </section>
      <section>
        <h3>Targeting</h3>
        <p>Each tower aims at First (nearest its exit), Last, Strong (most HP) or Close. Change it any time, for free.</p>
      </section>
      <section>
        <h3>Tower Levels and Perks</h3>
        <p>Towers gain XP from kills and Assists, up to Level 10: the number on the tower, gold from Level 5. Each Level adds 3% damage, and Levels 5 and 10 bring a Perk. Levels last one Run.</p>
      </section>
      <section>
        <h3>Waves and the early call</h3>
        <p>Wave 1 waits for Send Wave 1. Once a Wave's last creep is on the road, a 30 s Break counts down to the next, so Waves can overlap. Send now ends the Break early and pays gold for the seconds skipped. Clearing a Wave pays a bonus.</p>
      </section>
      <section>
        <h3>Stars and Talents</h3>
        <p>A win pays 3 Stars for 18 or more lives left, 2 for 6 or more, 1 otherwise. Replaying pays only what beats your best. Spend Stars on Talents in each family's tree; resetting them is free.</p>
      </section>
      <section class="controls-help">
        <h3>Controls</h3>
        <p><b>Phone:</b> tap a Build Spot for the ring, tap a family, tap again to build. Tap a tower for its upgrades, targeting and Sell. Pinch to zoom, drag to pan.</p>
        <p><b>Mac:</b> click a Build Spot, then Q W E R T Y pick the ring's families in order; the same key again builds. With a tower selected: Q and W upgrade, T changes targeting, S sells. Space sends the next Wave, P pauses, 1–3 set the speed, Esc steps back.</p>
      </section>
    </div>
  );
}
