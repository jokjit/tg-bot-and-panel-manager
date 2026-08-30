import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_CONFIG_KEYS,
  buildEffectiveSystemConfig,
  mergeRuntimeEnv,
} from '../worker-src/config/runtime.js';

test('runtime config applies trimmed stored values over deployment bindings', () => {
  const env = {
    BOT_TOKEN: 'binding-token',
    ADMIN_CHAT_ID: '100',
    NON_RUNTIME_BINDING: { get: () => {} },
  };
  const runtime = mergeRuntimeEnv(env, {
    BOT_TOKEN: ' stored-token ',
    ADMIN_CHAT_ID: ' 200 ',
    WEBHOOK_PATH: ' /custom-hook ',
  });

  assert.equal(runtime.BOT_TOKEN, 'stored-token');
  assert.equal(runtime.ADMIN_CHAT_ID, '200');
  assert.equal(runtime.WEBHOOK_PATH, '/custom-hook');
  assert.equal(runtime.NON_RUNTIME_BINDING, env.NON_RUNTIME_BINDING);
});

test('runtime config resolves description fallbacks without replacing explicit values', () => {
  const fallback = mergeRuntimeEnv({}, {
    BOT_DESCRIPTION_DEFAULT: ' Default description ',
    BOT_DESCRIPTION_ZH_CN: 'Chinese description',
    BOT_SHORT_DESCRIPTION_EN_US: ' Short fallback ',
  });
  assert.equal(fallback.BOT_DESCRIPTION, 'Default description');
  assert.equal(fallback.BOT_SHORT_DESCRIPTION, 'Short fallback');

  const explicit = mergeRuntimeEnv({ BOT_DESCRIPTION: 'Binding description' }, {
    BOT_DESCRIPTION_DEFAULT: 'Default description',
  });
  assert.equal(explicit.BOT_DESCRIPTION, 'Binding description');
});

test('effective system config gives stored values precedence and preserves metadata', () => {
  const effective = buildEffectiveSystemConfig(
    { ADMIN_CHAT_ID: ' 100 ', TOPIC_MODE: ' false ', ADMIN_API_KEY: 'runtime-key' },
    { ADMIN_CHAT_ID: ' 200 ', TOPIC_MODE: ' true ', updatedAt: '2026-08-30T00:00:00.000Z' },
  );

  assert.equal(effective.ADMIN_CHAT_ID, '200');
  assert.equal(effective.TOPIC_MODE, 'true');
  assert.equal(effective.ADMIN_API_KEY, 'runtime-key');
  assert.equal(effective.updatedAt, '2026-08-30T00:00:00.000Z');
});

test('runtime config keys are unique', () => {
  assert.equal(new Set(RUNTIME_CONFIG_KEYS).size, RUNTIME_CONFIG_KEYS.length);
});
