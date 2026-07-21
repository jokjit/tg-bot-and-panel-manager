import assert from 'node:assert/strict';
import test from 'node:test';

import { handlePublicMediaRoute } from '../worker-src/routes/media.js';

function createObject() {
  const bytes = Uint8Array.from([1, 2, 3]);
  return {
    body: bytes,
    size: bytes.byteLength,
    httpEtag: '"etag"',
    writeHttpMetadata(headers) {
      headers.set('content-type', 'image/png');
    },
  };
}

test('public media route serves immutable image responses and supports HEAD', async () => {
  const handlers = {
    getMediaPrefix: () => '/media/',
    ensureBucket: () => {},
    isSafeKey: (key) => key === '2026/07/image.png',
    getObject: async () => createObject(),
  };
  const getRequest = new Request('https://bot.example.com/media/2026/07/image.png');
  const response = await handlePublicMediaRoute({ request: getRequest, url: new URL(getRequest.url) }, handlers);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), Uint8Array.from([1, 2, 3]));

  const headRequest = new Request(getRequest.url, { method: 'HEAD' });
  const head = await handlePublicMediaRoute({ request: headRequest, url: new URL(headRequest.url) }, handlers);
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('public media route rejects unsafe and missing objects', async () => {
  const baseHandlers = {
    getMediaPrefix: () => '/media/',
    ensureBucket: () => {},
    isSafeKey: () => false,
    getObject: async () => null,
  };
  const unsafeRequest = new Request('https://bot.example.com/media/..%2Fsecret');
  assert.equal((await handlePublicMediaRoute({ request: unsafeRequest, url: new URL(unsafeRequest.url) }, baseHandlers)).status, 400);

  const missingRequest = new Request('https://bot.example.com/media/missing.png');
  const missing = await handlePublicMediaRoute({ request: missingRequest, url: new URL(missingRequest.url) }, {
    ...baseHandlers,
    isSafeKey: () => true,
  });
  assert.equal(missing.status, 404);
});
