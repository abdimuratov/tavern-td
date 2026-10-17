/** Element in our own words, on one screen: the rules a first Run needs, then the controls. */
export function ElementHowTo() {
  return (
    <div class="howto" data-testid="howto-element">
      <section>
        <h3>The Lane and Leaks</h3>
        <p>Creeps walk the walled Lane from the spawn to the exit beside it. A creep that gets there is a Leak: it costs a life (big ones cost more) and walks the whole Lane again. You have 50 lives.</p>
      </section>
      <section>
        <h3>Building</h3>
        <p>Pick a tower, then a plot of raised ground beside the Lane. Towers are 2×2 and take a moment to build. Select one to upgrade it or sell it. All of this works mid-Wave too.</p>
      </section>
      <section>
        <h3>Elements</h3>
        <p>Water › Fire › Nature › Earth › Light › Dark › Water. Each Element deals double damage to the next and half to the one before. Arrow and Cannon are Composite: even against all, and Elements deal 90% to Composite creeps.</p>
      </section>
      <section>
        <h3>Lumber and Elementals</h3>
        <p>You get Lumber at the start and every few Waves. In Elements, a Lumber sends that Element's Elemental down the Lane; kill it and the Element goes up a level, to 3. In Express the level comes at once.</p>
      </section>
      <section>
        <h3>Duals and triples</h3>
        <p>Level 1 of an Element unlocks its tower and its Arrow and Cannon. Upgrade that tower with a second Element for a dual, then with a third for a triple. Levels 2 and 3 open each tower's higher levels.</p>
      </section>
      <section>
        <h3>Pure Essence</h3>
        <p>It buys a Pure tower, the top of a single Element's line, or the Sixfold Core once all six Elements are level 1. Two arrive late in a Run; in All Pick you can buy two more with Lumber.</p>
      </section>
      <section>
        <h3>Gold and interest</h3>
        <p>Kills pay gold, and from Wave 1 you earn 2% interest every 15 s. A Leak pauses interest until its Wave is cleared. Clearing a Wave pays nothing, so gold in the bank grows.</p>
      </section>
      <section>
        <h3>Breaks</h3>
        <p>After each Wave a Break counts down, then the next Wave starts on its own. Send now starts it at once, for no bonus.</p>
      </section>
      <section>
        <h3>Traits</h3>
        <p>A Wave's Trait is marked inside its creeps: › Fast, ✚ Heal, ■ Mechanical, ◆ Undead, ● Regen, ▲ Vengeance, ★ Time lapse. Bulky creeps are big and eight-sided. Elementals are stars; boss Waves are pale giants.</p>
      </section>
      <section>
        <h3>Full, Express, All Random</h3>
        <p>Full is 55 Waves, then endless boss Waves that only add score. Express is 30 steeper Waves with more gold and Lumber. All Random picks your Elements in a set order, and selling refunds everything.</p>
      </section>
      <section class="controls-help">
        <h3>Controls</h3>
        <p><b>Phone:</b> pick a tower, tap a plot to see where it goes, tap again to build. Tap a tower to select it. Pinch to zoom in for precise placing, drag to pan.</p>
        <p><b>Mac:</b> click a plot to build, scroll to zoom, drag to pan. A Arrow, C Cannon, W F N E L D an Element's tower, X Sixfold Core. With a tower selected: U levels it up, W F N E L D add that Element, S sells. Q Elements, Space Send now, P pause, 1–3 speed, Esc back.</p>
      </section>
    </div>
  );
}
