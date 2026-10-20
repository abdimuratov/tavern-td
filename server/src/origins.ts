// The pages that may use the Relay: the GitHub Pages site, the Android app
// (Capacitor serves it from https://localhost; capacitor://localhost is iOS's
// scheme, kept for a future iOS build), and localhost for dev and the tests.
// A script can send any Origin it likes, so this keeps other sites' pages
// out, not people (docs/adr/0006-a-relay-server-on-render.md).

export const ALLOWED_ORIGINS: readonly string[] = ['https://abdimuratov.github.io', 'https://localhost', 'capacitor://localhost'];

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export function allowedOrigin(origin: string | undefined): origin is string {
  return origin !== undefined && (ALLOWED_ORIGINS.includes(origin) || LOCAL.test(origin));
}
