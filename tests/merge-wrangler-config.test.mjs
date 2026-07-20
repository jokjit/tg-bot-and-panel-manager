import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '..');

test('merges private bindings, vars, account, worker, and main settings', async () => {
  const cwd = await mkdtemp(resolve(tmpdir(), 'tg-bot-wrangler-'));
  await writeFile(resolve(cwd, 'wrangler.toml'), '[vars]\nENV = "base"\n\n[\n');
  await writeFile(resolve(cwd, 'wrangler.local.toml'), [
    '[vars]',
    'ENV = "local"',
    'SECRET = "value"',
    '',
    '[[kv_namespaces]]',
    'binding = "BOT_KV"',
    'id = "kv-id"',
    '',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_id = "db-id"',
  ].join('\n'));

  await execFileAsync(process.execPath, [resolve(root, 'scripts/merge-wrangler-config.mjs')], {
    cwd,
    env: { ...process.env, WORKER_NAME: 'test-worker', CLOUDFLARE_ACCOUNT_ID: 'account-id' },
  });

  const merged = await readFile(resolve(cwd, '.wrangler.private.toml'), 'utf8');
  assert.match(merged, /name = "test-worker"/);
  assert.match(merged, /account_id = "account-id"/);
  assert.match(merged, /main = ".*worker\.bundle\.js"/);
  assert.match(merged, /ENV = "local"/);
  assert.match(merged, /SECRET = "value"/);
  assert.match(merged, /binding = "BOT_KV"[\s\S]*id = "kv-id"/);
  assert.match(merged, /binding = "DB"[\s\S]*database_id = "db-id"/);
});
