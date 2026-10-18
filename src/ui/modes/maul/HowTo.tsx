/** Maul in our own words, on one screen: the rules a first Run needs, then the controls. */
export function MaulHowTo() {
  return (
    <div class="howto" data-testid="howto-maul">
      <section>
        <h3>The field is the maze</h3>
        <p>Creeps come from the two gates in the top corners, meet at the Ford, then cross the lower field to the West Post, the East Post and the exit. There is no lane: they walk the shortest open way, so the towers you build are the maze. A creep that reaches the exit is a Leak and costs a life, 2 for a Brute or Golem and 5 for a boss. You have 20.</p>
      </section>
      <section>
        <h3>Building</h3>
        <p>Pick a Wall or a tower, then open ground. Towers are 2×2 and can go anywhere, mid-Wave too, but never so they shut a gate, a Checkpoint or a creep off from the exit: that's a Block, and the Ghost turns red. Walls are cheap stone with a weak shot; upgrade one in place into either of your lines.</p>
      </section>
      <section>
        <h3>Races and upgrades</h3>
        <p>Your Race fixes your towers: Ironclad bolts and shells, Rimeborn frost and slows, Mirefolk venom and spores, Runecasters magic bursts. Each line climbs to Tier 2, then forks into one of two Tier 3 towers. Once Wave 15 is cleared, a second Race can join.</p>
      </section>
      <section>
        <h3>Juggling</h3>
        <p>Selling or building mid-Wave re-paths every creep at once. Open a new way behind them and close the one ahead, and they turn back and walk your maze again. It's allowed, and it costs the quarter you lose on each sale.</p>
      </section>
      <section>
        <h3>Armor</h3>
        <p>Pierce hits Light hardest, Frost Medium, Magic Heavy and Siege Fortified; Chaos and poison treat every armor alike. Bosses take every attack alike.</p>
      </section>
      <section>
        <h3>Gold</h3>
        <p>Each Wave's creeps carry a pool of gold between them. Clearing a Wave pays a bonus, plus 4% interest on the gold you didn't spend, up to the bonus. Selling returns 75%, or everything you spent this Break.</p>
      </section>
      <section>
        <h3>Waves</h3>
        <p>40 Waves. After each one is cleared a 30 s Break counts down; Send now starts the next at once, for nothing. Harpy Waves fly straight over the maze: the preview warns of them. A boss comes every tenth Wave, and if the last one gets through, the Run is lost.</p>
      </section>
      <section class="controls-help">
        <h3>Controls</h3>
        <p><b>Phone:</b> pick a Wall or tower, tap open ground to see the Ghost and the path it would make, tap again to build. Tap a tower to upgrade or sell it. Pinch to zoom, drag to pan.</p>
        <p><b>Mac:</b> Q Wall, W and E your lines, R and T the second Race's. With a tower selected: Q W E R pick its upgrades, S sells. Space Send now, P pause, 1–3 speed, Esc back.</p>
      </section>
    </div>
  );
}
