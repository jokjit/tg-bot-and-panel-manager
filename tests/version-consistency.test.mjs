import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertReleaseTagVersion,
  assertVersionConsistency,
  parseAndroidVersionConfig,
} from '../scripts/check-version-consistency.mjs';

test('repository application and Android versions are consistent', () => {
  assert.deepEqual(assertVersionConsistency(), { version: '2.6.2', versionCode: 33 });
});

test('release tags must match the application version exactly', () => {
  assert.equal(assertReleaseTagVersion('v2.6.2', '2.6.2'), 'v2.6.2');
  assert.throws(
    () => assertReleaseTagVersion('v2.6.1', '2.6.2'),
    /Release tag v2\.6\.1 differs from application version v2\.6\.2/,
  );
  assert.throws(() => assertReleaseTagVersion('', '2.6.2'), /Release tag is required/);
});

test('Android version parser rejects missing or duplicate declarations', () => {
  assert.deepEqual(parseAndroidVersionConfig('versionCode 10\nversionName "1.2.3"\n'), {
    versionCode: 10,
    versionName: '1.2.3',
  });
  assert.throws(() => parseAndroidVersionConfig('versionCode 10\n'));
  assert.throws(() => parseAndroidVersionConfig('versionCode 10\nversionCode 11\nversionName "1.2.3"\n'));
});
