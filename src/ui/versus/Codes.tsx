import { useRef, useState } from 'preact/hooks';
import { isIos } from '../../app/versus-link';
import { isNative } from '../../platform/native';
import { JoinQr } from './Qr';
import { RoomPanel } from './Room';
import { ShareCopy } from './Share';
import type { CodeSwap, Swap, VersusActions, VersusState } from './state';
import { CONNECT_TIMEOUT_MS } from '../../net';
import { ageText, ANDROID_JOIN_NOTE, failText, FAIL_TITLE, iosJoinNote, swapStale } from './text';

// The code swap (docs/versus-design.md §2–§3), the fallback to a room, as the
// first connection and a Reconnect both show it. The Host's side: its Join
// link with Share, Copy and a QR, how long it has waited, and a box for the
// Answer code. The Guest's: a box for the Join code or link, then its Answer
// code with Share and Copy. With a Relay set up, either offers a room instead.

/** A code to copy by hand: read-only, and selected whole on focus (select() alone doesn't on iOS). */
function CodeBox({ value, testid, rows = 3 }: { value: string; testid: string; rows?: number }) {
  return (
    <textarea
      class="code"
      readOnly
      rows={rows}
      value={value}
      data-testid={testid}
      onFocus={(e) => {
        const el = e.currentTarget as HTMLTextAreaElement;
        el.select();
        el.setSelectionRange(0, el.value.length);
      }}
    />
  );
}

/** "Use a room code instead", when a Relay is set up. */
function UseRoom({ v, a }: { v: VersusState; a: VersusActions }) {
  return v.relay ? <button type="button" class="btn link" data-testid="use-room" onClick={a.useRoom}>Use a room code instead</button> : null;
}

/** §3: no connection 20 s after both codes were in hand, or the connection failed outright. */
function Failed({ v, swap, a, onBack }: { v: VersusState; swap: CodeSwap; a: VersusActions; onBack?: () => void }) {
  return (
    <div class="vs-failed" data-testid="swap-failed">
      <h2>{FAIL_TITLE}</h2>
      <p data-testid="fail-text">{failText(v.relay)}</p>
      {swap.error && <p class="error">{swap.error}</p>}
      <div class="buttons">
        <button type="button" class="btn primary" data-testid="new-code" onClick={a.newCode}>
          {swap.role === 'host' ? 'New code' : 'Paste a new code'}
        </button>
        {onBack
          ? <button type="button" class="btn" data-testid="swap-back" onClick={onBack}>Back</button>
          : <button type="button" class="btn" data-testid="swap-menu" onClick={a.leave}>Menu</button>}
        <UseRoom v={v} a={a} />
      </div>
    </div>
  );
}

function HostSwap({ v, swap, a, onBack }: { v: VersusState; swap: CodeSwap; a: VersusActions; onBack?: () => void }) {
  const [answer, setAnswer] = useState('');
  if (swap.step === 'making') return <p class="vs-wait" data-testid="making-code">Making a code…</p>;
  if (swap.step === 'failed' || !swap.code) return <Failed v={v} swap={swap} a={a} {...(onBack ? { onBack } : {})} />;
  const stale = swapStale(swap, v.now);
  const connecting = swap.step === 'connecting';
  return (
    <div class="vs-swap" data-testid="host-swap">
      <div class="vs-offer">
        <div class="vs-offer-main">
          <p class="vs-step"><b>1</b> Send the Rival this link. They open it, or paste it into Join.</p>
          <CodeBox value={swap.code} testid="join-link" />
          <ShareCopy text={swap.code} kind="link" a={a} />
          <p class="note" data-testid="code-age">
            Made {ageText(v.now - (swap.madeAt ?? v.now))} ago
            {stale && <span class="warn"> · Over 2 minutes old, so it may not connect</span>}
          </p>
          {stale && !connecting && (
            <button type="button" class="btn" data-testid="new-code" onClick={a.newCode}>New code</button>
          )}
        </div>
        <JoinQr link={swap.code} />
      </div>
      {connecting ? (
        <p class="vs-wait" data-testid="connecting">
          Connecting… {ageText(v.now - (swap.connectingAt ?? v.now))}
          <span class="note"> · Keep Tavern TD open on both devices</span>
        </p>
      ) : (
        <div class="vs-paste">
          <p class="vs-step"><b>2</b> Paste the Answer code the Rival sends back.</p>
          <textarea
            class="code"
            rows={2}
            placeholder="TTDA1…"
            spellcheck={false}
            autocomplete="off"
            value={answer}
            data-testid="answer-paste"
            onInput={(e) => setAnswer((e.currentTarget as HTMLTextAreaElement).value)}
          />
          <div class="buttons">
            <button type="button" class="btn primary" data-testid="answer-accept" disabled={answer.trim() === ''} onClick={() => a.accept(answer)}>
              Connect
            </button>
            {onBack && <button type="button" class="btn" data-testid="swap-back" onClick={onBack}>Back</button>}
            <UseRoom v={v} a={a} />
          </div>
          {swap.error && <p class="error" data-testid="swap-error">{swap.error}</p>}
        </div>
      )}
    </div>
  );
}

function standalone(): boolean {
  return (navigator as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
}

function JoinPaste({ v, swap, a, onBack }: { v: VersusState; swap: CodeSwap; a: VersusActions; onBack?: () => void }) {
  const [text, setText] = useState(swap.prefill);
  const ios = useRef(isIos(navigator.userAgent, navigator.maxTouchPoints)).current;
  return (
    <div class="vs-paste" data-testid="join-box">
      <p class="vs-step">Paste the link or Join code the Host sent you.</p>
      {ios && <p class="note" data-testid="ios-note">{iosJoinNote(standalone())}</p>}
      {isNative && <p class="note" data-testid="app-note">{ANDROID_JOIN_NOTE}</p>}
      <textarea
        class="code"
        rows={3}
        placeholder="https://…#join=TTDJ1… or TTDJ1…"
        spellcheck={false}
        autocomplete="off"
        value={text}
        data-testid="join-paste"
        onInput={(e) => {
          const t = (e.currentTarget as HTMLTextAreaElement).value;
          setText(t);
          a.typed(t);
        }}
      />
      <div class="buttons">
        <button type="button" class="btn primary" data-testid="join-go" disabled={text.trim() === ''} onClick={() => a.join(text)}>
          {v.rejoin && !swap.reconnect ? "Rejoin the Host's Run" : 'Join'}
        </button>
        {onBack && <button type="button" class="btn" data-testid="swap-back" onClick={onBack}>Back</button>}
        <UseRoom v={v} a={a} />
      </div>
      {swap.error && <p class="error" data-testid="swap-error">{swap.error}</p>}
    </div>
  );
}

function GuestSwap({ v, swap, a, onBack }: { v: VersusState; swap: CodeSwap; a: VersusActions; onBack?: () => void }) {
  // A new link filled in starts the box afresh.
  if (swap.step === 'paste') return <JoinPaste key={swap.prefill} v={v} swap={swap} a={a} {...(onBack ? { onBack } : {})} />;
  if (swap.step === 'making') return <p class="vs-wait" data-testid="making-code">Making your Answer code…</p>;
  if (swap.step === 'failed' || !swap.code) return <Failed v={v} swap={swap} a={a} {...(onBack ? { onBack } : {})} />;
  const stale = swapStale(swap, v.now);
  const waited = v.now - (swap.connectingAt ?? v.now);
  // The Guest can't tell when the Host pastes its code, so after 20 s it says §3's words but keeps the code up.
  const slow = waited >= CONNECT_TIMEOUT_MS;
  return (
    <div class="vs-swap" data-testid="guest-swap">
      <p class="vs-step">Send this back to the Host.</p>
      <CodeBox value={swap.code} testid="answer-code" rows={2} />
      <ShareCopy text={swap.code} kind="code" a={a} />
      <p class="vs-wait" data-testid="connecting">Connecting… {ageText(waited)}</p>
      {stale && <p class="note warn">This code is over 2 minutes old. If it doesn't connect, ask the Host for a new one.</p>}
      {slow && (
        <div class="vs-failed" data-testid="swap-slow">
          <p class="muted">No connection yet. If the Host has already pasted your code:</p>
          <h2>{FAIL_TITLE}</h2>
          <p data-testid="fail-text">{failText(v.relay)}</p>
        </div>
      )}
      <div class="buttons">
        <button type="button" class={`btn${slow ? ' primary' : ''}`} data-testid="paste-new" onClick={a.newCode}>Paste a new code</button>
        {onBack
          ? <button type="button" class="btn" data-testid="swap-back" onClick={onBack}>Back</button>
          : slow && <button type="button" class="btn" data-testid="swap-menu" onClick={a.leave}>Menu</button>}
      </div>
    </div>
  );
}

/** The swap, through a room or by codes, as this device's role shows it. `onBack` closes it inside a sheet, rather than leaving for the menu. */
export function SwapPanel({ v, swap, a, onBack }: { v: VersusState; swap: Swap; a: VersusActions; onBack?: () => void }) {
  if (swap.kind === 'room') return <RoomPanel v={v} swap={swap} a={a} onBack={onBack} />;
  const back = onBack ? { onBack } : {};
  return swap.role === 'host' ? <HostSwap v={v} swap={swap} a={a} {...back} /> : <GuestSwap v={v} swap={swap} a={a} {...back} />;
}
