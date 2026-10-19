import { suddenRule } from './text';

/** Line Wars in our own words, on one screen: the rules a first Run needs, then the controls. */
export function LwHowTo() {
  return (
    <div class="howto" data-testid="howto-linewars">
      <section>
        <h3>Two Fields</h3>
        <p>Your Field is on the right, the Rival's on the left, with a band of rock between them. You maze yours and the Rival mazes theirs. Creeps you send walk the Rival's Field, and theirs walk yours. No tower reaches across.</p>
      </section>
      <section>
        <h3>Sends buy Income</h3>
        <p>There are no Waves: every creep is a Send someone bought. Each Send raises your Income at once and for good. Income is paid every 10 s: 10 gold, plus what your Sends added. Cheap Sends grow it fastest; dear ones hit hardest. Kills in your Field pay a little gold too.</p>
      </section>
      <section>
        <h3>Stock and unlocks</h3>
        <p>Sends unlock over time, from Snowlings at 0:20 to the War Mammoth at 10:00. Each starts with 1 in Stock and refills one at a time, up to its cap. At most 40 of your creeps can be out at once.</p>
      </section>
      <section>
        <h3>Leaks steal lives</h3>
        <p>You each start with 30 lives. When your creep reaches the bottom of the Rival's Field, it takes a life from them and gives it to you, then it's gone. A Tusked Warlord takes 2, a War Mammoth 3. Take their last life and you win.</p>
      </section>
      <section>
        <h3>Sudden Death</h3>
        <p>{suddenRule()} If both Sides run out together, the higher Income wins; the same Income is a Draw.</p>
      </section>
      <section>
        <h3>Building</h3>
        <p>Pick a Wall or a tower, then open ground in your Field. Towers are 2×2 and go anywhere in your Field, any time, but never so they shut the creeps off from the exit: that's a Block, and the Ghost turns red. Selling and building to turn creeps back, Juggling, is allowed. Sales return 75%, or everything before 0:20.</p>
      </section>
      <section>
        <h3>Races and armor</h3>
        <p>Your Race fixes your towers for the whole Run: Ironclad bolts and shells, Rimeborn frost and slows, Mirefolk venom and spores, Runecasters magic bursts. A Wall upgrades into either line, and each line forks at Tier 3. Pierce hits Light armor hardest, Frost Medium, Magic Heavy and Siege Fortified. Harpies fly straight over the maze.</p>
      </section>
      <section class="versus-help" data-testid="howto-versus">
        <h3>Versus</h3>
        <p>Play a friend on another device, with no server between you. The Host taps Versus · Host and sends the link it makes; the Rival opens it (on an iPhone, copies it and pastes it into Join) and sends back the Answer code it shows. Put both devices on one Wi-Fi if they can't reach each other.</p>
        <p>You each pick a Race and press Ready. Each of you sees your own Field on the right. A tap lands a moment later on both devices, and a build shows faintly until then. Pause stops you both, and play goes on once you both press Ready; going to the background pauses too. Versus plays at 1× on Normal, keeps no save, and has its own row in Records. Concede counts as a loss, and if the Rival is gone 2 minutes while you stay, you may claim the win.</p>
      </section>
      <section class="controls-help">
        <h3>Controls</h3>
        <p><b>Phone:</b> pick a Wall or tower, tap your Field to see the Ghost and the route it would make, then tap again to build. Tap a Send to buy it; hold one to see what it is, or why it's dim. Tap a tower to upgrade or sell it, or a Rival's to look. Pinch to zoom, drag to pan.</p>
        <p><b>Mac:</b> Q Wall, W and E your lines. With your tower selected: Q W E R pick its upgrades, S sells. Z X C V B and A D F G H send, cheapest first, and Space repeats your last Send. P pause, 1–3 speed, Esc back.</p>
      </section>
    </div>
  );
}
