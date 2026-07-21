import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildImageAssetView,
  detectImageContentType,
  isSafeImageObjectKey,
  normalizeImagePublicBaseUrl,
  prepareImageUpload,
} from '../worker-src/storage/images.js';

function fakeFile(bytes, type = 'image/png', name = 'sample.png') {
  const value = Uint8Array.from(bytes);
  return {
    name,
    type,
    size: value.byteLength,
    async arrayBuffer() {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    },
  };
}

test('image signatures detect supported formats', () => {
  assert.equal(detectImageContentType(Uint8Array.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectImageContentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectImageContentType(new TextEncoder().encode('GIF89a')), 'image/gif');
  assert.equal(detectImageContentType(new TextEncoder().encode('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectImageContentType(new TextEncoder().encode('<svg></svg>')), '');
});

test('image upload preparation creates deterministic metadata and validates content', async () => {
  const file = fakeFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3], 'image/png', '../photo.png');
  const result = await prepareImageUpload(file, {
    id: '12345678-1234-1234-1234-123456789abc',
    now: new Date('2026-07-20T00:00:00.000Z'),
  });
  assert.equal(result.id, '12345678-1234-1234-1234-123456789abc');
  assert.equal(result.objectKey, '2026/07/12345678-1234-1234-1234-123456789abc.png');
  assert.equal(result.originalName, '.._photo.png');
  assert.equal(result.contentType, 'image/png');
  assert.equal(result.sizeBytes, 11);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);

  await assert.rejects(
    prepareImageUpload(fakeFile([0xff, 0xd8, 0xff], 'image/png'), {
      id: '12345678-1234-1234-1234-123456789abc',
    }),
    /image_signature_mismatch/,
  );
});

test('image asset views encode public URLs and reject unsafe keys', () => {
  const view = buildImageAssetView({
    id: 'asset-id',
    objectKey: '2026/07/photo name.png',
    originalName: 'photo.png',
  }, 'https://bot.example.com/');
  assert.equal(view.url, 'https://bot.example.com/media/2026/07/photo%20name.png');
  const directView = buildImageAssetView({
    id: 'asset-id',
    objectKey: '2026/07/photo name.png',
  }, 'https://bot.example.com', { imagePublicBaseUrl: 'img.example.com/' });
  assert.equal(directView.url, 'https://img.example.com/2026/07/photo%20name.png');
  assert.equal(normalizeImagePublicBaseUrl('javascript:alert(1)'), '');
  assert.equal(isSafeImageObjectKey('2026/07/photo.png'), true);
  assert.equal(isSafeImageObjectKey('../secret.png'), false);
  assert.equal(isSafeImageObjectKey('2026//photo.png'), false);
});
