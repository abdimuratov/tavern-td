import { useState } from 'preact/hooks';
import { canShare } from '../../platform/share';
import type { VersusActions } from './state';

// Share and Copy under a room's link, a Join link or an Answer code
// (docs/versus-design.md §2).

/** Share (where there's a share sheet) and Copy, saying whether the copy took. */
export function ShareCopy({ text, kind, a }: { text: string; kind: 'link' | 'code' | 'room'; a: VersusActions }) {
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
