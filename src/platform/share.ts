import { isNative } from './native';

// Passing Versus codes on (docs/versus-design.md §2): the share sheet where
// there is one, and Copy everywhere. Android's WebView has no Web Share, so
// the APK shares through @capacitor/share, loaded only when Share is pressed.

export interface ShareContent {
  readonly title?: string;
  readonly text?: string;
  readonly url?: string;
}

/** A share sheet can open here: always in the Android app, and on the web wherever navigator.share exists. */
export function canShare(): boolean {
  return isNative || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
}

/** Opens the share sheet. True once shared; false when the player closed it, or there's no sheet. Never throws. */
export async function shareContent(content: ShareContent): Promise<boolean> {
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ ...content, ...(content.title ? { dialogTitle: content.title } : {}) });
      return true;
    }
    if (typeof navigator.share !== 'function') return false;
    await navigator.share({ ...content });
    return true;
  } catch (err) {
    // An AbortError is the player closing the sheet, not a failure.
    if (!(err instanceof DOMException && err.name === 'AbortError')) console.warn('[share] failed', err);
    return false;
  }
}

/**
 * Copies text. False when the browser refuses (iOS can, outside a tap), so
 * the screen falls back to selecting the code in its box. Never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // An older WebView, or a clipboard the page may not write: the selection fallback.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
