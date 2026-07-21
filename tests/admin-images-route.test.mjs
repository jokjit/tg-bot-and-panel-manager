import assert from 'node:assert/strict';
import test from 'node:test';

import { handleAdminImageRoute } from '../worker-src/routes/admin-images.js';

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function createHandlers(overrides = {}) {
  return {
    getAdminApiPrefix: () => '/admin/api',
    requireAdmin: async () => {},
    ensureBindings: () => {},
    parseLimit: (value, fallback) => Number(value || fallback),
    parseOffset: (value, fallback) => Number(value || fallback),
    listPage: async () => ({ items: [], total: 0, limit: 24, offset: 0, nextOffset: null, prevOffset: null, hasMore: false }),
    buildView: (item, base) => ({ ...item, url: `${base}/media/${item.objectKey}` }),
    getOperator: () => 'admin:test',
    store: async () => ({ id: 'asset-id', objectKey: 'asset.png' }),
    remove: async () => ({ id: 'asset-id', objectKey: 'asset.png' }),
    isValidId: () => true,
    mapUploadError: (error) => error,
    createError: (status, message) => Object.assign(new Error(message), { status }),
    json,
    ...overrides,
  };
}

test('admin image list returns the shared pagination contract', async () => {
  const response = await handleAdminImageRoute({
    request: new Request('https://bot.example.com/admin/api/images?limit=12&offset=24'),
    url: new URL('https://bot.example.com/admin/api/images?limit=12&offset=24'),
    publicBaseUrl: 'https://bot.example.com',
  }, createHandlers({
    listPage: async (options) => ({
      items: [{ id: 'asset-id', objectKey: 'asset.png' }],
      total: 30,
      limit: options.limit,
      offset: options.offset,
      nextOffset: null,
      prevOffset: 12,
      hasMore: false,
    }),
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.images[0].url, 'https://bot.example.com/media/asset.png');
  assert.equal(body.total, 30);
  assert.equal(body.offset, 24);
});

test('admin image upload and delete invoke storage adapters', async () => {
  const calls = [];
  const form = new FormData();
  form.set('file', new Blob(['image'], { type: 'image/png' }), 'sample.png');
  const handlers = createHandlers({
    store: async (file, operator) => {
      calls.push({ action: 'store', name: file.name, operator });
      return { id: 'asset-id', objectKey: 'asset.png' };
    },
    remove: async (id) => {
      calls.push({ action: 'remove', id });
      return { id, objectKey: 'asset.png' };
    },
  });

  const uploadRequest = new Request('https://bot.example.com/admin/api/images', { method: 'POST', body: form });
  const uploaded = await handleAdminImageRoute({
    request: uploadRequest,
    url: new URL(uploadRequest.url),
    publicBaseUrl: 'https://bot.example.com',
  }, handlers);
  assert.equal(uploaded.status, 201);

  const deleteRequest = new Request('https://bot.example.com/admin/api/images/asset-id', { method: 'DELETE' });
  const deleted = await handleAdminImageRoute({
    request: deleteRequest,
    url: new URL(deleteRequest.url),
    publicBaseUrl: 'https://bot.example.com',
  }, handlers);
  assert.equal(deleted.status, 200);
  assert.deepEqual(calls, [
    { action: 'store', name: 'sample.png', operator: 'admin:test' },
    { action: 'remove', id: 'asset-id' },
  ]);
});
