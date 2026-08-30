import assert from 'node:assert/strict';
import test from 'node:test';

import { createSystemConfigStore } from '../worker-src/config/store.js';

function createHarness(options = {}) {
  let nowMs = 1000;
  let stored = { BOT_TOKEN: 'stored-token' };
  const calls = [];
  const handlers = {
    nowMs: () => nowMs,
    ensureKv: (env) => {
      if (!env?.BOT_KV) throw new Error('missing_kv');
    },
    readConfig: async (_env, key) => {
      calls.push(['read', key]);
      return { ...stored };
    },
    writeConfig: async (_env, key, config) => {
      calls.push(['write', key, { ...config }]);
      if (options.writeError) throw new Error(options.writeError);
      stored = { ...config };
    },
  };
  return {
    calls,
    handlers,
    setNowMs: (value) => { nowMs = value; },
    setStored: (value) => { stored = { ...value }; },
  };
}

test('system config store skips reads without a KV binding', async () => {
  const harness = createHarness();
  const store = createSystemConfigStore({ ttlMs: 5000 }, harness.handlers);
  assert.deepEqual(await store.get({}), {});
  assert.deepEqual(harness.calls, []);
});

test('system config store caches reads and isolates returned objects', async () => {
  const harness = createHarness();
  const store = createSystemConfigStore({ ttlMs: 5000 }, harness.handlers);
  const env = { BOT_KV: {} };

  const first = await store.get(env);
  first.BOT_TOKEN = 'mutated';
  const second = await store.get(env);

  assert.equal(second.BOT_TOKEN, 'stored-token');
  assert.equal(harness.calls.filter(([type]) => type === 'read').length, 1);
});

test('system config store refreshes expired values', async () => {
  const harness = createHarness();
  const store = createSystemConfigStore({ ttlMs: 5000 }, harness.handlers);
  const env = { BOT_KV: {} };
  await store.get(env);

  harness.setStored({ BOT_TOKEN: 'rotated-token' });
  harness.setNowMs(6000);
  assert.equal((await store.get(env)).BOT_TOKEN, 'rotated-token');
  assert.equal(harness.calls.filter(([type]) => type === 'read').length, 2);
});

test('system config store updates cache only after a successful KV write', async () => {
  const harness = createHarness({ writeError: 'write failed' });
  const store = createSystemConfigStore({ ttlMs: 5000 }, harness.handlers);
  const env = { BOT_KV: {} };

  await assert.rejects(store.set(env, { BOT_TOKEN: 'new-token' }), /write failed/);
  assert.equal((await store.get(env)).BOT_TOKEN, 'stored-token');
  assert.equal(harness.calls.filter(([type]) => type === 'read').length, 1);
});

test('system config store writes normalized values and serves them immediately', async () => {
  const harness = createHarness();
  const store = createSystemConfigStore({ ttlMs: 5000 }, harness.handlers);
  const env = { BOT_KV: {} };

  await store.set(env, { TOPIC_MODE: 'false' });
  assert.deepEqual(await store.get(env), { TOPIC_MODE: 'false' });
  assert.equal(harness.calls.filter(([type]) => type === 'read').length, 0);
});
