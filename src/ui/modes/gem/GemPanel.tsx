import type { GemTowerSpec } from '../../../content/gem';
import { gem, type Command, type Tower } from '../../../sim';
import { RowButton } from '../../Hud';
import type { ModePanelProps } from '../../mode-ui';
import { revision, type PlaySession } from '../../state';
import { movingSlate, swapFrom } from './picks';
import { abilities, damageText, hitsText, kindText, num, rate, specName, specOf, statLine, tierText } from './text';

interface Choice {
  readonly id: string;
  readonly label: string;
  readonly key: string;
  readonly spec: string;
  readonly command: Command;
}

/** The Draft choices for one gem, in the order a player weighs them. */
function choicesFor(c: gem.DraftChoice): Choice[] {
  const tower = c.tower;
  const out: Choice[] = [{ id: 'keep', label: 'Keep', key: 'k', spec: c.spec, command: { type: 'gem.keep', tower } }];
  const merges = [[2, 'm'], [3, 't'], [4, 'f']] as const;
  for (const [n, key] of merges) {
    const spec = c.merge[n];
    if (spec) out.push({ id: `merge${n}`, label: `Merge ×${n}`, key, spec, command: { type: 'gem.merge', tower, count: n } });
  }
  if (c.recipe) out.push({ id: 'recipe', label: 'Recipe', key: 'c', spec: c.recipe, command: { type: 'gem.combineRecipe', tower } });
  if (c.slate) out.push({ id: 'slate', label: 'Slate', key: 'l', spec: c.slate, command: { type: 'gem.keepSlate', tower } });
  if (c.comboSlate) out.push({ id: 'combo-slate', label: 'Both slates', key: 'b', spec: c.comboSlate, command: { type: 'gem.combineSlate', tower } });
  if (c.downgrade) out.push({ id: 'downgrade', label: 'Downgrade', key: 'd', spec: c.downgrade, command: { type: 'gem.downgrade', tower } });
  return out;
}

function DraftChoices({ s, choice, wave }: { s: PlaySession; choice: gem.DraftChoice; wave: number }) {
  return (
    <div class="choices" data-testid="draft-choices">
      <p class="lead">Pick one · it starts Wave {wave}</p>
      {choicesFor(choice).map((c) => (
        <RowButton
          key={c.id}
          s={s}
          id={c.id}
          label={c.label}
          detail={specName(c.spec)}
          sub={statLine(c.spec)}
          hotkey={c.key}
          title={`${c.label}: ${specName(c.spec)}, and start Wave ${wave} (${c.key.toUpperCase()})`}
          run={() => {
            s.view.send(c.command);
            s.view.select(0);
          }}
        />
      ))}
    </div>
  );
}

function FieldActions({ s, tower, acts }: { s: PlaySession; tower: Tower; acts: gem.GemTowerActions }) {
  const rows = [];
  const up = acts.upgrade;
  if (up) {
    rows.push(
      <RowButton
        key="upgrade" s={s} id="upgrade" label="Upgrade" hotkey="u"
        detail={<>{specName(up.to)} · <span class="coin" />{up.cost}</>}
        sub={up.blocked === 'not enough gold' ? statLine(up.to) : null}
        blocked={up.blocked === 'not enough gold' ? null : up.blocked}
        dim={up.blocked === 'not enough gold'}
        run={() => s.view.send(up.command)}
      />,
    );
  }
  const fuse = acts.combineRecipe;
  if (fuse && !acts.draft) {
    rows.push(
      <RowButton
        key="fuse" s={s} id="fuse" label="Fuse Recipe" hotkey="c" tone="primary"
        detail={specName(fuse.to)} sub={statLine(fuse.to)} blocked={fuse.blocked}
        run={() => s.view.send(fuse.command)}
      />,
    );
  }
  const rock = acts.removeRock;
  if (rock) {
    rows.push(
      <RowButton
        key="rock" s={s} id="remove-rock" label="Remove Rock" detail="Free" hotkey="r" blocked={rock.blocked}
        run={() => {
          s.view.send(rock.command);
          s.view.select(0);
        }}
      />,
    );
  }
  const swap = acts.swap;
  // Without mana there's nothing to show on every structure; the status block says when it's back.
  if (swap && !swap.blocked?.startsWith('not enough mana')) {
    const picking = swapFrom.value === tower.id;
    rows.push(
      <RowButton
        key="swap" s={s} id="swap" label="Swap" hotkey="s" active={picking}
        detail={picking ? 'Pick the other one' : 'Trade places'}
        blocked={swap.blocked}
        run={() => {
          swapFrom.value = picking ? 0 : tower.id;
          s.view.refresh();
        }}
      />,
    );
  }
  const move = acts.moveSlate;
  if (move) {
    const picking = movingSlate.value === tower.id;
    rows.push(
      <RowButton
        key="move" s={s} id="move-slate" label="Move slate" hotkey="m" active={picking}
        detail={picking ? 'Pick where' : 'Once'}
        blocked={move.blocked}
        run={() => {
          movingSlate.value = picking ? 0 : tower.id;
          s.view.refresh();
        }}
      />,
    );
  }
  return rows.length > 0 ? <div class="field-actions">{rows}</div> : null;
}

function bonus(fraction: number): string {
  return fraction > 0.0005 ? ` (+${num(Math.round(fraction * 100))}%)` : '';
}

function Stats({ spec, info }: { spec: GemTowerSpec; info: gem.GemTowerInfo }) {
  const rows: [string, string][] = [];
  const a = spec.attack;
  const dmg = damageText(spec);
  if (a && dmg !== null && a.damage[1] > 0) {
    rows.push(['Damage', `${dmg}${bonus(info.damageBonus)}`]);
    rows.push(['Speed', `${rate(a.cooldown)}${bonus(info.attackSpeedBonus)}`]);
    rows.push(['Range', num(a.range)]);
  }
  const hits = hitsText(spec);
  if (hits && spec.gem.kind !== 'rock') rows.push(['Hits', hits]);
  if (spec.gem.kind !== 'rock' && !info.inDraft) rows.push(['Kill Step', `${info.killStep} · ${info.kills} kill${info.kills === 1 ? '' : 's'}`]);
  if (info.mana !== null && info.maxMana !== null) rows.push(['Mana', `${Math.floor(info.mana)}/${info.maxMana}`]);
  const abs = abilities(spec);
  return (
    <>
      {rows.length > 0 && (
        <dl class="gem-stats">
          {rows.map(([k, v]) => <div key={k} class="row"><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      )}
      {abs.length > 0 && (
        <ul class="abilities">
          {abs.map((x, i) => <li key={i}>{x.text}</li>)}
        </ul>
      )}
    </>
  );
}

/** The selected structure: Draft choices or field actions, then its stats and abilities. */
export function GemPanel({ s, tower }: ModePanelProps) {
  void revision.value;
  void swapFrom.value;
  void movingSlate.value;
  const state = s.view.state;
  const spec = specOf(tower.spec);
  const info = gem.towerInfo(state, tower.id);
  if (!spec || !info) return null;
  const acts = gem.towerActions(state, tower.id);
  const status = gem.gemStatus(state);
  const draftIndex = (state.mode as gem.GemState).draft.indexOf(tower.id);
  // A gem's name already says what it is; the rest get a word on what they are.
  const kind = draftIndex >= 0 ? `Draft gem ${draftIndex + 1} of ${status.draftSize}` : spec.gem.kind === 'gem' ? null : tierText(spec) ?? kindText(spec);
  return (
    <div class={`gem-panel${acts.draft ? ' choosing' : ''}`}>
      {kind !== null && kind !== spec.name && <div class="kind muted">{kind}</div>}
      {acts.draft && <DraftChoices s={s} choice={acts.draft} wave={status.nextWave} />}
      {info.inDraft && !acts.draft && <p class="note">Place all {status.draftSize} gems, then pick one to keep.</p>}
      <FieldActions s={s} tower={tower} acts={acts} />
      <Stats spec={spec} info={info} />
    </div>
  );
}
