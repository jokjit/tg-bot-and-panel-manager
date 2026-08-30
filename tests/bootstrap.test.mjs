import assert from 'node:assert/strict';
import test from 'node:test';

import { readDeployBootstrapToken, withDeployBootstrapLock } from '../worker-src/auth/bootstrap.js';

test('bootstrap token reader prefers the dedicated header and ignores query strings', async () => {
  const request = new Request('https://bot.example.com/deploy/bootstrap?token=query-token', {
    method: 'POST',
    headers: {
      authorization: 'Bearer bearer-token',
      'content-type': 'application/json',
      'x-deploy-bootstrap-token': 'header-token',
    },
    body: JSON.stringify({ token: 'body-token' }),
  });

  assert.equal(await readDeployBootstrapToken(request), 'header-token');
});

test('bootstrap token reader supports bearer and JSON body fallback without a URL token', async () => {
  const bearerRequest = new Request('https://bot.example.com/deploy/bootstrap?token=query-token', {
    method: 'POST',
    headers: { authorization: 'Bearer bearer-token' },
  });
  assert.equal(await readDeployBootstrapToken(bearerRequest), 'bearer-token');

  const bodyRequest = new Request('https://bot.example.com/deploy/bootstrap?token=query-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'body-token' }),
  });
  assert.equal(await readDeployBootstrapToken(bodyRequest), 'body-token');
});

test('bootstrap lock serializes same-token requests and releases after failure', async () => {
  const events = [];
  const first = withDeployBootstrapLock('same-token', async () => {
    events.push('first-start');
    await new Promise((resolve) => setTimeout(resolve, 15));
    events.push('first-end');
    return 'first';
  });
  const second = withDeployBootstrapLock('same-token', async () => {
    events.push('second-start');
    events.push('second-end');
    return 'second';
  });

  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(events, ['first-start', 'first-end', 'second-start', 'second-end']);

  await assert.rejects(
    withDeployBootstrapLock('retry-token', async () => {
      throw new Error('bootstrap failed');
    }),
    /bootstrap failed/,
  );
  assert.equal(await withDeployBootstrapLock('retry-token', async () => 'retry-ok'), 'retry-ok');
});
