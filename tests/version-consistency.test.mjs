import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertVersionConsistency,
  parseAndroidVersionConfig,
} from '../scripts/check-version-consistency.mjs';

test('repository application and Android versions are consistent', () => {
  assert.deepEqual(assertVersionConsistency(), { version: '2.5.1', versionCode: 30 });
});

test('Android version parser rejects missing or duplicate declarations', () => {
  assert.deepEqual(parseAndroidVersionConfig('versionCode 10\nversionName "1.2.3"\n'), {
    versionCode: 10,
    versionName: '1.2.3',
  });
  assert.throws(() => parseAndroidVersionConfig('versionCode 10\n'));
  assert.throws(() => parseAndroidVersionConfig('versionCode 10\nversionCode 11\nversionName "1.2.3"\n'));
});
