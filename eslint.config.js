import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ADR-0002: the simulation must give identical results on every JS engine.
// These are engine-dependent (Math.sin etc.), wall-clock, or unseeded.
const bannedMath = ['random', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'pow', 'exp', 'expm1',
  'log', 'log2', 'log10', 'log1p', 'cbrt', 'hypot'];

export default tseslint.config(
  { ignores: ['dist', 'dist-android', 'dev-dist', 'android', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/sim/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': ['error',
        ...bannedMath.map((property) => ({
          object: 'Math', property,
          message: 'Banned in src/sim (ADR-0002): use the seeded RNG, + − × ÷ and sqrt, or a lookup table.',
        })),
      ],
      'no-restricted-globals': ['error',
        { name: 'Date', message: 'No wall clock in src/sim (ADR-0002).' },
        { name: 'performance', message: 'No wall clock in src/sim (ADR-0002).' },
        { name: 'window', message: 'No DOM in src/sim.' },
        { name: 'document', message: 'No DOM in src/sim.' },
        { name: 'setTimeout', message: 'The sim advances only through step().' },
        { name: 'setInterval', message: 'The sim advances only through step().' },
        { name: 'requestAnimationFrame', message: 'The sim advances only through step().' },
      ],
      'no-restricted-syntax': ['error',
        { selector: 'BinaryExpression[operator="**"]', message: 'Use multiplication instead of ** in src/sim (ADR-0002).' },
      ],
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['pixi.js', 'preact', 'preact/*', '@preact/*', '@capacitor/*', 'idb-keyval'], message: 'src/sim must stay render- and platform-free.' },
          { group: ['**/render/**', '**/ui/**', '**/platform/**', '**/app/**'], message: 'src/sim must not import outer layers.' },
        ],
      }],
    },
  },
  // docs/versus-design.md §8: the net code runs in Node tests on a virtual
  // clock, so only rtc.ts touches WebRTC and only clock.ts reads real time.
  {
    files: ['src/net/**/*.ts'],
    ignores: ['src/net/rtc.ts', 'src/net/clock.ts'],
    rules: {
      'no-restricted-globals': ['error',
        ...['Date', 'performance', 'setTimeout', 'setInterval', 'requestAnimationFrame'].map((name) => ({
          name, message: 'Time comes only from the injected Clock in src/net.',
        })),
        ...['RTCPeerConnection', 'window', 'document', 'navigator'].map((name) => ({
          name, message: 'Only src/net/rtc.ts touches browser APIs.',
        })),
      ],
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/sim/**'], message: 'src/net reaches the sim only through src/sim/index.ts.' },
          { group: ['pixi.js', 'preact', 'preact/*', '@preact/*', '**/render/**', '**/ui/**'], message: 'src/net draws nothing.' },
        ],
      }],
    },
  },
);
