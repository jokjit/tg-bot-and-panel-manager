import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');

async function loadWorkerModule() {
  const directory = await mkdtemp(resolve(tmpdir(), 'tg-bot-kv-test-'));
  const source = await readFile(resolve(root, 'worker.bundle.js'), 'utf8');
  const modulePath = resolve(directory, 'worker-test.mjs');
  await writeFile(modulePath, source, 'utf8');
  const module = await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
  return { module, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('collectKvKeys follows every KV cursor page without the old 500-key cap', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const calls = [];
    const pages = {
      '': { keys: Array.from({ length: 1000 }, (_, index) => ({ name: `user:${index}` })), list_complete: false, cursor: 'page-2' },
      'page-2': { keys: [{ name: 'user:1000' }, { name: 'user:1001' }], list_complete: true, cursor: '' },
    };
    const kv = {
      async list(options) {
        calls.push(options);
        return pages[options.cursor || ''];
      },
    };

    const names = await module.collectKvKeys(kv, 'user:');
    assert.equal(names.length, 1002);
    assert.equal(names.at(-1), 'user:1001');
    assert.deepEqual(calls.map((call) => call.cursor || null), [null, 'page-2']);
    assert.equal((await module.collectKvKeys(kv, 'user:', 500)).length, 500);
  } finally {
    await cleanup();
  }
});

test('bootstrap consumption keys are stable and never expose the token', async () => {
  const { module, cleanup } = await loadWorkerModule();
  try {
    const token = 'super-secret-bootstrap-token';
    const first = await module.buildDeployBootstrapConsumptionKey(token);
    const second = await module.buildDeployBootstrapConsumptionKey(token);
    assert.equal(first, second);
    assert.match(first, /^sys:deploy_bootstrap_consumed:[a-f0-9]{64}$/);
    assert.equal(first.includes(token), false);
    assert.notEqual(first, await module.buildDeployBootstrapConsumptionKey(`${token}-other`));
  } finally {
    await cleanup();
  }
});
