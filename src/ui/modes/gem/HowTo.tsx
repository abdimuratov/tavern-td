/** Gem in our own words, on one screen: the rules a first Run needs, then the controls. */
export function GemHowTo() {
  return (
    <div class="howto" data-testid="howto">
      <section>
        <h3>The Draft</h3>
        <p>Each round, place 5 gems anywhere on the field. Each is rolled as it lands: a random type, at a quality your Gem Quality sets.</p>
      </section>
      <section>
        <h3>Keep one</h3>
        <p>Then pick one of the five to keep as a tower. The other four turn into Rocks, and the Wave starts at once.</p>
      </section>
      <section>
        <h3>Rocks make the maze</h3>
        <p>Creeps walk around Rocks and towers, so place gems to make their path long. You can remove a Rock for free at any time.</p>
      </section>
      <section>
        <h3>Merging</h3>
        <p>Two identical gems in one Draft merge into one quality up. Three or four go up two. Chipped is lowest, then Flawed, Normal, Flawless, Perfect, Great.</p>
      </section>
      <section>
        <h3>Recipes and slates</h3>
        <p>Some sets of gems fuse into a Special. A full set in one Draft offers Recipe; a set you kept over time fuses later, and a pulsing ring shows it's ready. Gold upgrades Specials. A Normal gem with the right Flawed gem can become a Slate, a tile creeps walk over.</p>
      </section>
      <section>
        <h3>Gem Quality</h3>
        <p>Spend gold to raise Gem Quality from 0 to 8 for better gems. At 8, Extra Chance aims a Draft at one gem type or slate. Every 10 Waves you can swap two structures.</p>
      </section>
      <section>
        <h3>Checkpoints and leaks</h3>
        <p>Creeps walk to checkpoints 1 to 7 in order, then the exit. Leaks are free until Wave 10; after that, one leak ends the Run. Wave 50 brings the Damage Test, and the damage it takes is your score.</p>
      </section>
      <section class="controls-help">
        <h3>Controls</h3>
        <p><b>Phone:</b> tap the field to see where a gem would go, tap again to place it. Tap a gem to select it. Pinch to zoom, drag to pan.</p>
        <p><b>Mac:</b> click to place, scroll to zoom, drag to pan. K keep, M merge, Q Gem Quality, U upgrade, S swap, R remove Rock, Tab next Draft gem, P pause, 1–3 speed, Esc menu.</p>
      </section>
    </div>
  );
}
