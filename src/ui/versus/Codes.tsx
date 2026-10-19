import { useRef, useState } from 'preact/hooks';
import { isIos } from '../../app/versus-link';
import { isNative } from '../../platform/native';
import { canShare } from '../../platform/share';
import { JoinQr } from './Qr';
import type { CodeSwap, VersusActions, VersusState } from './state';
import { CONNECT_TIMEOUT_MS } from '../../net';
import { ageText, ANDROID_JOIN_NOTE, failText, FAIL_TITLE, iosJoinNote, RELAY_NOTE, swapStale } from './text';

// The code swap (docs/versus-design.md §2–§3), as the first connection and a
// Reconnect both show it. The Host's side: its Join link with Share, Copy and
// a QR, how long it has waited, and a box for the Answer code. The Guest's: a
// box for the Join code or link, then its Answer code with Share and Copy.
// Either notes a code made without the Relay, when one is set up.

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

/** Share (where there's a share sheet) and Copy, saying whether the copy took. */
function ShareCopy({ text, kind, a }: { text: string; kind: 'link' | 'code'; a: VersusActions }) {
  const [said, setSaid] = useState<string | null>(null);
  const copy = async (): Promise<void> => {
    setSaid((await a.copy(text)) ? 'Copied' : 'Copy failed: select the code above and copy it');
  };
  return (
    <div class="buttons vs-share">
      {canShare() && (
        <button type="button" class="btn primary" data-testid="share" onClick={() => void a.share(text, kind)}>Share</button>
      )}
      <button type="button" class={`btn${canShare() ? '' : ' primary'}`} data-testid="copy" onClick={() => void copy()}>Copy</button>
      {said && <span class="note" data-testid="copied">{said}</span>}
    </div>
  );
}

/** "Relay unavailable" under a code, when a Relay is set up but the code holds no relay candidate (§2). */
function RelayNote({ swap }: { swap: CodeSwap }) {
  return swap.relay === 'unavailable' ? <p class="note" data-testid="relay-note">{RELAY_NOTE}</p> : null;
}

/** §3: no connection 20 s after both codes were in hand, or the connection failed outright. */
function Failed({ swap, a, onBack }: { swap: CodeSwap; a: VersusActions; onBack?: () => void }) {
  return (
    <div class="vs-failed" data-testid="swap-failed">
      <h2>{FAIL_TITLE}</h2>
      <p data-testid="fail-text">{failText(swap)}</p>
      {swap.error && <p class="error">{swap.error}</p>}
      <div class="buttons">
        <button type="button" class="btn primary" data-testid="new-code" onClick={a.newCode}>
          {swap.role === 'host' ? 'New code' : 'Paste a new code'}
        </button>
        {onBack
          ? <button type="button" class="btn" data-testid="swap-back" onClick={onBack}>Back</button>
          : <button type="button" class="btn" data-testid="swap-menu" onClick={a.leave}>Menu</button>}
      </div>
    </div>
  );
}

function HostSwap({ v, swap, a, onBack }: { v: VersusState; swap: CodeSwap; a: VersusActions; onBack?: () => void }) {
  const [answer, setAnswer] = useState('');
  if (swap.step === 'making') return <p class="vs-wait" data-testid="making-code">Making a code…</p>;
  if (swap.step === 'failed' || !swap.code) return <Failed swap={swap} a={a} {...(onBack ? { onBack } : {})} />;
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
          <RelayNote swap={swap} />
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
      </div>
      {swap.error && <p class="error" data-testid="swap-error">{swap.error}</p>}
    </div>
  );
}

function GuestSwap({ v, swap, a, onBack }: { v: VersusState; swap: CodeSwap; a: VersusActions; onBack?: () => void }) {
  // A new link filled in starts the box afresh.
  if (swap.step === 'paste') return <JoinPaste key={swap.prefill} v={v} swap={swap} a={a} {...(onBack ? { onBack } : {})} />;
  if (swap.step === 'making') return <p class="vs-wait" data-testid="making-code">Making your Answer code…</p>;
  if (swap.step === 'failed' || !swap.code) return <Failed swap={swap} a={a} {...(onBack ? { onBack } : {})} />;
  const stale = swapStale(swap, v.now);
  const waited = v.now - (swap.connectingAt ?? v.now);
  // The Guest can't tell when the Host pastes its code, so after 20 s it says §3's words but keeps the code up.
  const slow = waited >= CONNECT_TIMEOUT_MS;
  return (
    <div class="vs-swap" data-testid="guest-swap">
      <p class="vs-step">Send this back to the Host.</p>
      <CodeBox value={swap.code} testid="answer-code" rows={2} />
      <ShareCopy text={swap.code} kind="code" a={a} />
      <RelayNote swap={swap} />
      <p class="vs-wait" data-testid="connecting">Connecting… {ageText(waited)}</p>
      {stale && <p class="note warn">This code is over 2 minutes old. If it doesn't connect, ask the Host for a new one.</p>}
      {slow && (
        <div class="vs-failed" data-testid="swap-slow">
          <p class="muted">No connection yet. If the Host has already pasted your code:</p>
          <h2>{FAIL_TITLE}</h2>
          <p data-testid="fail-text">{failText(swap)}</p>
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

/** The swap as this device's role shows it. `onBack` closes it inside a sheet, rather than leaving for the menu. */
export function SwapPanel({ v, swap, a, onBack }: { v: VersusState; swap: CodeSwap; a: VersusActions; onBack?: () => void }) {
  const back = onBack ? { onBack } : {};
  return swap.role === 'host' ? <HostSwap v={v} swap={swap} a={a} {...back} /> : <GuestSwap v={v} swap={swap} a={a} {...back} />;
}
