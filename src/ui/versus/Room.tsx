import { useState } from 'preact/hooks';
import { JoinQr } from './Qr';
import { ShareCopy } from './Share';
import type { RoomSwap, VersusActions, VersusState } from './state';
import { ageText, roomSlow, roomWaitText, ROOM_SLOW_TEXT, WAKING_TEXT } from './text';

// A room on the Relay (docs/versus-design.md §2), as the first connection and
// a Reconnect both show it. The Host's side: its Room code, large, with
// Share, Copy and a QR of the room's link, and whether the Rival is in yet.
// The Guest's: a box for the code, then what the room is doing. Both say when
// the server is waking, and offer the codes passed by hand instead.

/** "Use codes instead", and Back inside a sheet. */
function Fallback({ a, onBack }: { a: VersusActions; onBack?: (() => void) | undefined }) {
  return (
    <div class="buttons vs-fallback">
      <button type="button" class="btn link" data-testid="use-codes" onClick={a.useCodes}>Use codes instead</button>
      {onBack && <button type="button" class="btn" data-testid="swap-back" onClick={onBack}>Back</button>}
    </div>
  );
}

/** What the room is doing, or that the server is waking. */
function Wait({ v, swap }: { v: VersusState; swap: RoomSwap }) {
  const text = swap.step === 'opening' && v.waking ? WAKING_TEXT : roomWaitText(swap);
  return (
    <p class="vs-wait" data-testid="room-wait">
      {text}
      {swap.step === 'connecting' && <span class="note"> {ageText(v.now - swap.since)}</span>}
    </p>
  );
}

function Failed({ swap, a, onBack }: { swap: RoomSwap; a: VersusActions; onBack?: (() => void) | undefined }) {
  return (
    <div class="vs-failed" data-testid="room-failed">
      <h2>{swap.role === 'host' ? "Couldn't make a room." : "Couldn't join the room."}</h2>
      <p data-testid="room-error">{swap.error}</p>
      <div class="buttons">
        <button type="button" class="btn primary" data-testid="room-retry" onClick={a.retry}>
          {swap.role === 'host' ? 'New room' : 'Try again'}
        </button>
        <button type="button" class="btn" data-testid="use-codes" onClick={a.useCodes}>Use codes instead</button>
        {onBack
          ? <button type="button" class="btn" data-testid="swap-back" onClick={onBack}>Back</button>
          : <button type="button" class="btn" data-testid="swap-menu" onClick={a.leave}>Menu</button>}
      </div>
    </div>
  );
}

function HostRoom({ v, swap, a, onBack }: { v: VersusState; swap: RoomSwap; a: VersusActions; onBack?: (() => void) | undefined }) {
  if (swap.step === 'failed') return <Failed swap={swap} a={a} onBack={onBack} />;
  if (!swap.code || !swap.link) {
    return (
      <div class="vs-swap" data-testid="host-room">
        <Wait v={v} swap={swap} />
        <Fallback a={a} onBack={onBack} />
      </div>
    );
  }
  return (
    <div class="vs-swap" data-testid="host-room">
      <div class="vs-offer">
        <div class="vs-offer-main">
          <p class="vs-step">Send the Rival this room code. They tap Versus · Join and type it, or open the link.</p>
          <p class="vs-room-code" data-testid="room-code" aria-label={`Room code ${[...swap.code].join(' ')}`}>{swap.code}</p>
          <ShareCopy text={swap.link} kind="room" a={a} />
          <Wait v={v} swap={swap} />
          {roomSlow(swap, v.now) && <p class="note warn" data-testid="room-slow">{ROOM_SLOW_TEXT}</p>}
        </div>
        <JoinQr link={swap.link} />
      </div>
      <Fallback a={a} onBack={onBack} />
    </div>
  );
}

/** The Guest's box for the Room code: four letters and digits, typed in any case. */
function RoomBox({ v, swap, a, onBack }: { v: VersusState; swap: RoomSwap; a: VersusActions; onBack?: (() => void) | undefined }) {
  const [text, setText] = useState(swap.prefill);
  return (
    <form
      class="vs-paste"
      data-testid="room-box"
      onSubmit={(e) => {
        e.preventDefault();
        a.enter(text);
      }}
    >
      <p class="vs-step">Type the room code the Host gave you.</p>
      <input
        class="vs-room-input"
        type="text"
        maxLength={12}
        placeholder="K7QX"
        spellcheck={false}
        autocomplete="off"
        autocapitalize="characters"
        enterkeyhint="go"
        aria-label="Room code"
        value={text}
        data-testid="room-input"
        onInput={(e) => {
          const t = (e.currentTarget as HTMLInputElement).value;
          setText(t);
          a.typed(t);
        }}
      />
      <div class="buttons">
        <button type="submit" class="btn primary" data-testid="room-join" disabled={text.trim() === ''}>Join</button>
        <button type="button" class="btn link" data-testid="use-codes" onClick={a.useCodes}>Use codes instead</button>
        {onBack && <button type="button" class="btn" data-testid="swap-back" onClick={onBack}>Back</button>}
      </div>
      {swap.error && <p class="error" data-testid="swap-error">{swap.error}</p>}
      {v.waking && <p class="note" data-testid="room-waking">{WAKING_TEXT}</p>}
    </form>
  );
}

function GuestRoom({ v, swap, a, onBack }: { v: VersusState; swap: RoomSwap; a: VersusActions; onBack?: (() => void) | undefined }) {
  // A new link filled in starts the box afresh.
  if (swap.step === 'enter') return <RoomBox key={swap.prefill} v={v} swap={swap} a={a} onBack={onBack} />;
  if (swap.step === 'failed') return <Failed swap={swap} a={a} onBack={onBack} />;
  return (
    <div class="vs-swap" data-testid="guest-room">
      <p class="vs-step">Room <b class="vs-room-tag">{swap.code}</b></p>
      <Wait v={v} swap={swap} />
      {roomSlow(swap, v.now) && <p class="note warn" data-testid="room-slow">{ROOM_SLOW_TEXT}</p>}
      <Fallback a={a} onBack={onBack} />
    </div>
  );
}

/** The room as this device's role shows it. `onBack` closes it inside a sheet, rather than leaving for the menu. */
export function RoomPanel({ v, swap, a, onBack }: { v: VersusState; swap: RoomSwap; a: VersusActions; onBack?: (() => void) | undefined }) {
  return swap.role === 'host' ? <HostRoom v={v} swap={swap} a={a} onBack={onBack} /> : <GuestRoom v={v} swap={swap} a={a} onBack={onBack} />;
}
