import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  IMAGE_CACHE_TTL_SECONDS,
  buildImageCacheRule,
  ensureImageDelivery,
  getZoneNameCandidatesForHostname,
} from '../shared/deploy-utils.cjs';

test('builds a host-scoped immutable image cache rule', () => {
  assert.deepEqual(getZoneNameCandidatesForHostname('img.assets.example.com'), [
    'img.assets.example.com',
    'assets.example.com',
    'example.com',
  ]);

  const rule = buildImageCacheRule('IMG.Example.com');
  assert.equal(rule.expression, '(http.host eq "img.example.com")');
  assert.equal(rule.action, 'set_cache_settings');
  assert.equal(rule.action_parameters.cache, true);
  assert.equal(rule.action_parameters.edge_ttl.default, IMAGE_CACHE_TTL_SECONDS);
  assert.equal(rule.ref, 'tg_bot_image_host_img_example_com');
});

test('creates an R2 custom domain, cache ruleset, and waits for activation', async () => {
  const calls = [];
  let statusReads = 0;
  const result = await ensureImageDelivery({
    accountId: 'account-1',
    bucketName: 'bot-images',
    imagePublicBaseUrl: 'https://img.example.com',
    pollDelaysMs: [0, 0],
    sleep: async () => {},
    apiRequest: async (resource, options = {}) => {
      calls.push({ resource, options });
      if (resource.startsWith('/zones?')) {
        const name = new URL(`https://api.test${resource}`).searchParams.get('name');
        return name === 'example.com'
          ? { ok: true, result: [{ id: 'zone-1', name, account: { id: 'account-1' } }] }
          : { ok: true, result: [] };
      }
      if (resource === '/accounts/account-1/r2/buckets/bot-images/domains/custom' && !options.method) {
        return { ok: true, result: { domains: [] } };
      }
      if (resource === '/accounts/account-1/r2/buckets/bot-images/domains/custom' && options.method === 'POST') {
        return { ok: true, result: options.body };
      }
      if (resource === '/zones/zone-1/rulesets?per_page=50') {
        return { ok: true, result: [] };
      }
      if (resource === '/zones/zone-1/rulesets' && options.method === 'POST') {
        return { ok: true, result: { id: 'ruleset-1' } };
      }
      if (resource.endsWith('/domains/custom/img.example.com')) {
        statusReads += 1;
        return {
          ok: true,
          result: {
            domain: 'img.example.com',
            enabled: true,
            status: statusReads === 1
              ? { ownership: 'pending', ssl: 'initializing' }
              : { ownership: 'active', ssl: 'active' },
          },
        };
      }
      throw new Error(`unexpected_request:${options.method || 'GET'}:${resource}`);
    },
  });

  assert.equal(result.active, true);
  assert.equal(result.zoneId, 'zone-1');
  assert.equal(result.domainAction, 'created');
  assert.equal(result.cacheRuleAction, 'ruleset_created');
  const domainCreate = calls.find((call) => call.options.method === 'POST' && call.resource.endsWith('/domains/custom'));
  assert.deepEqual(domainCreate.options.body, {
    domain: 'img.example.com',
    enabled: true,
    zoneId: 'zone-1',
    minTLS: '1.2',
  });
});

test('reuses an active R2 domain and only updates the managed cache rule', async () => {
  const calls = [];
  const managed = buildImageCacheRule('img.example.com');
  const result = await ensureImageDelivery({
    accountId: 'account-1',
    bucketName: 'bot-images',
    imagePublicBaseUrl: 'img.example.com',
    pollDelaysMs: [0],
    apiRequest: async (resource, options = {}) => {
      calls.push({ resource, options });
      if (resource.startsWith('/zones?')) {
        const name = new URL(`https://api.test${resource}`).searchParams.get('name');
        return name === 'example.com'
          ? { ok: true, result: [{ id: 'zone-1', name, account: { id: 'account-1' } }] }
          : { ok: true, result: [] };
      }
      if (resource.endsWith('/domains/custom') && !options.method) {
        return { ok: true, result: { domains: [{ domain: 'img.example.com', enabled: true }] } };
      }
      if (resource === '/zones/zone-1/rulesets?per_page=50') {
        return {
          ok: true,
          result: [{ id: 'ruleset-1', kind: 'zone', phase: 'http_request_cache_settings' }],
        };
      }
      if (resource === '/zones/zone-1/rulesets/ruleset-1') {
        return {
          ok: true,
          result: {
            rules: [
              { id: 'user-rule', description: 'Unrelated rule' },
              { id: 'managed-rule', ref: managed.ref, description: managed.description },
            ],
          },
        };
      }
      if (resource.endsWith('/rules/managed-rule') && options.method === 'PATCH') {
        return { ok: true, result: { id: 'managed-rule' } };
      }
      if (resource.endsWith('/domains/custom/img.example.com')) {
        return {
          ok: true,
          result: {
            domain: 'img.example.com',
            enabled: true,
            status: { ownership: 'active', ssl: 'active' },
          },
        };
      }
      throw new Error(`unexpected_request:${options.method || 'GET'}:${resource}`);
    },
  });

  assert.equal(result.domainAction, 'reused');
  assert.equal(result.cacheRuleAction, 'updated');
  assert.equal(calls.some((call) => call.options.method === 'POST' && call.resource.endsWith('/domains/custom')), false);
  assert.equal(calls.some((call) => call.resource.endsWith('/rules/user-rule')), false);
});

test('reports the Cloudflare token permissions needed for automatic setup', async () => {
  await assert.rejects(
    ensureImageDelivery({
      accountId: 'account-1',
      bucketName: 'bot-images',
      imagePublicBaseUrl: 'img.example.com',
      apiRequest: async () => ({ ok: false, reason: '10000:Authentication error' }),
    }),
    /Zone Cache Rules Edit/,
  );
});
