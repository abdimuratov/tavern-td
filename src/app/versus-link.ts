import { isRoomCode, readCode } from '../net';

// Versus links and this device's name (docs/versus-design.md §2). The Host's
// Room code, or with codes passed by hand its Join code, goes out as a link
// with the code after `#`; opening it goes straight to Join with the code
// filled in, and the app drops the fragment from the address. Pure, so the
// tests read it in Node.

/** Where GitHub Pages serves the app. The Android app's links point here: its own address is the WebView's. */
export const PAGES_URL = 'https://abdimuratov.github.io/tavern-td/';

/**
 * The address a Join link opens: the web app's own (origin plus Vite's base),
 * so a dev or preview build links to itself, or Pages from the Android app.
 */
export function linkBase(platform: string, origin: string, base: string): string {
  if (platform !== 'web' || !/^https?:/i.test(origin)) return PAGES_URL;
  return new URL(base, `${origin}/`).href;
}

/** The link to a room: the app's address with `#room=` and the code. */
export function roomLink(base: string, code: string): string {
  return `${base}#room=${code}`;
}

/**
 * A Room code from what the Guest typed or pasted: the code in any case, with
 * spaces or a dash, or a whole `#room=` link. Null when it isn't one.
 */
export function readRoomCode(text: string): string | null {
  const m = /[#?&]room=([^&#\s]*)/i.exec(text);
  const code = decoded(m ? m[1]! : text).toUpperCase().replace(/[\s\u200b-\u200d\u2060\ufeff-]+/g, '');
  return isRoomCode(code) ? code : null;
}

/**
 * A Join code (`#join=…`, or `?join=…` if a messenger moved it) or a Room
 * code (`#room=…`) carried by an address, and the address to put back
 * without it, as a path for history.replaceState. Null when the address
 * carries neither.
 */
export function joinInUrl(href: string): { readonly code: string; readonly clean: string } | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (/(^#|&)room=/i.test(url.hash)) {
    const code = readRoomCode(url.hash);
    return code ? { code, clean: url.pathname + url.search } : null;
  }
  // The address percent-encodes what a messenger broke the code with (a space is %20); readCode drops it once decoded.
  if (/(^#|&)join=/i.test(url.hash)) {
    const code = readCode(decoded(url.hash));
    return code ? { code, clean: url.pathname + url.search } : null;
  }
  const parts = url.search.replace(/^\?/, '').split('&').filter((p) => p !== '');
  const at = parts.findIndex((p) => /^join=/i.test(p));
  if (at < 0) return null;
  const code = readCode(`#${decoded(parts[at]!)}`);
  const rest = parts.filter((_, i) => i !== at);
  return code ? { code, clean: url.pathname + (rest.length > 0 ? `?${rest.join('&')}` : '') + url.hash } : null;
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** An iPhone or iPad: iPadOS says Macintosh, so a Mac with touch counts too. */
export function isIos(ua: string, touchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

/**
 * A short name of the browser and system, such as "Chrome 141 · macOS" or
 * "WebView 141 · Android", for Hello and desync reports: which engine drifted.
 */
export function browserName(ua: string, touchPoints = 0): string {
  const system = isIos(ua, touchPoints) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux|X11/.test(ua) ? 'Linux' : 'unknown';
  const version = (re: RegExp): string => re.exec(ua)?.[1] ?? '?';
  let name: string;
  if (/; wv\)/.test(ua)) name = `WebView ${version(/Chrome\/(\d+)/)}`;
  else if (/Edg(?:A|iOS)?\//.test(ua)) name = `Edge ${version(/Edg(?:A|iOS)?\/(\d+)/)}`;
  else if (/CriOS\//.test(ua)) name = `Chrome ${version(/CriOS\/(\d+)/)}`;
  else if (/FxiOS\//.test(ua)) name = `Firefox ${version(/FxiOS\/(\d+)/)}`;
  else if (/Firefox\//.test(ua)) name = `Firefox ${version(/Firefox\/(\d+)/)}`;
  else if (/Chrome\//.test(ua)) name = `Chrome ${version(/Chrome\/(\d+)/)}`;
  else if (/Safari\//.test(ua)) name = `Safari ${version(/Version\/(\d+(?:\.\d+)?)/)}`;
  else name = 'Browser';
  return `${name} · ${system}`;
}
