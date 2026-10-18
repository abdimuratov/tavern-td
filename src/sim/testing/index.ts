// Test-only content: importing this registers the `test` Game Mode. The app never imports it.

import { registerMode } from '../modes/registry';
import { TEST_MODE } from './test-mode';

registerMode(TEST_MODE);

export * from './test-mode';
export { FIXTURE_REPLAY } from './fixture';
export { ELEMENT_FIXTURE_REPLAY } from './element-fixture';
export { ORIGINAL_FIXTURE_REPLAY } from './original-fixture';
export { MAUL_FIXTURE_REPLAY } from './maul-fixture';
