import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Guards the guardrail: the ADR-0002 ban list must keep firing inside src/sim.
const eslint = new ESLint();

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'parse-error');
}

describe('src/sim lint ban list', () => {
  const banned: [string, string][] = [
    ['Math.random()', 'no-restricted-properties'],
    ['Math.sin(1)', 'no-restricted-properties'],
    ['Math.pow(2, 3)', 'no-restricted-properties'],
    ['Math.hypot(3, 4)', 'no-restricted-properties'],
    ['Date.now()', 'no-restricted-globals'],
    ['performance.now()', 'no-restricted-globals'],
    ['2 ** 3', 'no-restricted-syntax'],
  ];

  it.each(banned)('rejects %s in src/sim', async (expr, rule) => {
    expect(await ruleIds(`export const x = ${expr};\n`, 'src/sim/core/probe.ts')).toContain(rule);
  });

  it('rejects importing the renderer into src/sim', async () => {
    const ids = await ruleIds(`import { Application } from 'pixi.js';\nexport const a = Application;\n`, 'src/sim/core/probe.ts');
    expect(ids).toContain('no-restricted-imports');
  });

  it('allows sqrt and the same calls outside src/sim', async () => {
    expect(await ruleIds('export const x = Math.sqrt(2);\n', 'src/sim/core/probe.ts')).toEqual([]);
    expect(await ruleIds('export const x = Math.random() + Math.sin(1);\n', 'src/render/probe.ts')).toEqual([]);
  });
});
