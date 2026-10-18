// Lets Node run the repo's TypeScript as it is. Node 26 strips types on its
// own; this resolve hook adds what Vite resolves for us elsewhere: imports
// without an extension (`./maps`) and folder imports (`../src/sim`).
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if ((specifier.startsWith('.') || specifier.startsWith('/')) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL) {
      const base = new URL(specifier, context.parentURL).href;
      for (const ext of ['.ts', '/index.ts']) {
        if (existsSync(fileURLToPath(base + ext))) return next(base + ext, context);
      }
    }
    return next(specifier, context);
  },
});
