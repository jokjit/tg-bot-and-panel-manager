export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = Object.freeze({
  'image/jpeg': { extension: 'jpg' },
  'image/png': { extension: 'png' },
  'image/webp': { extension: 'webp' },
  'image/gif': { extension: 'gif' },
});

export const IMAGE_CONTENT_TYPES = Object.freeze(Object.keys(IMAGE_TYPES));

function bytesStartWith(bytes, signature, offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

export function normalizeImageContentType(value) {
  const type = String(value || '').split(';', 1)[0].trim().toLowerCase();
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

export function detectImageContentType(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
      || bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'image/gif';
  if (bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46])
      && bytesStartWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return '';
}

function sanitizeOriginalName(value) {
  const normalized = String(value || 'image')
    .replace(/[\\/]+/g, '_')
    .replace(/[\u0000-\u001f\u007f]+/g, '')
    .trim();
  return normalized.slice(0, 180) || 'image';
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function prepareImageUpload(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('image_file_required');
  }

  const maxBytes = Math.max(1, Number(options.maxBytes || IMAGE_MAX_BYTES));
  const declaredType = normalizeImageContentType(file.type);
  if (!IMAGE_TYPES[declaredType]) throw new Error('image_type_not_allowed');
  const declaredSize = Number(file.size || 0);
  if (declaredSize <= 0) throw new Error('image_file_empty');
  if (declaredSize > maxBytes) throw new Error('image_file_too_large');

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength <= 0) throw new Error('image_file_empty');
  if (arrayBuffer.byteLength > maxBytes) throw new Error('image_file_too_large');
  const bytes = new Uint8Array(arrayBuffer);
  const detectedType = detectImageContentType(bytes);
  if (!detectedType || detectedType !== declaredType) throw new Error('image_signature_mismatch');

  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const id = String(options.id || options.randomUUID?.() || crypto.randomUUID()).toLowerCase();
  if (!/^[a-f0-9-]{20,64}$/.test(id)) throw new Error('image_id_invalid');
  const extension = IMAGE_TYPES[detectedType].extension;
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const objectKey = `${year}/${month}/${id}.${extension}`;
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);

  return {
    id,
    objectKey,
    originalName: sanitizeOriginalName(file.name),
    contentType: detectedType,
    sizeBytes: arrayBuffer.byteLength,
    sha256: bytesToHex(new Uint8Array(digest)),
    createdAt: now.toISOString(),
    bytes: arrayBuffer,
  };
}

function normalizeAssetRow(row = {}) {
  return {
    id: String(row.id || ''),
    objectKey: String(row.objectKey || row.object_key || ''),
    originalName: String(row.originalName || row.original_name || ''),
    contentType: String(row.contentType || row.content_type || ''),
    sizeBytes: Number(row.sizeBytes ?? row.size_bytes ?? 0) || 0,
    sha256: String(row.sha256 || ''),
    createdAt: String(row.createdAt || row.created_at || ''),
    createdBy: String(row.createdBy || row.created_by || ''),
  };
}

export function encodeImageObjectKey(objectKey) {
  return String(objectKey || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function normalizeImagePublicBaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function buildImageAssetView(asset, publicBaseUrl = '', options = {}) {
  const normalized = normalizeAssetRow(asset);
  const directBase = normalizeImagePublicBaseUrl(options.imagePublicBaseUrl);
  const workerBase = normalizeImagePublicBaseUrl(publicBaseUrl);
  const mediaBase = directBase || (workerBase ? `${workerBase}/media` : '');
  return {
    ...normalized,
    url: normalized.objectKey && mediaBase ? `${mediaBase}/${encodeImageObjectKey(normalized.objectKey)}` : '',
  };
}

export async function insertImageAsset(db, asset) {
  const value = normalizeAssetRow(asset);
  await db.prepare(
    `INSERT INTO image_assets
      (id, object_key, original_name, content_type, size_bytes, sha256, created_at, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(
    value.id,
    value.objectKey,
    value.originalName,
    value.contentType,
    value.sizeBytes,
    value.sha256,
    value.createdAt,
    value.createdBy,
  ).run();
  return value;
}

export async function getImageAsset(db, id) {
  const row = await db.prepare(
    `SELECT id, object_key AS objectKey, original_name AS originalName,
            content_type AS contentType, size_bytes AS sizeBytes, sha256,
            created_at AS createdAt, created_by AS createdBy
     FROM image_assets WHERE id = ?1`,
  ).bind(String(id || '')).first();
  return row ? normalizeAssetRow(row) : null;
}

export async function listImageAssetsPage(db, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 24)));
  const offset = Math.max(0, Number(options.offset || 0));
  const result = await db.prepare(
    `SELECT id, object_key AS objectKey, original_name AS originalName,
            content_type AS contentType, size_bytes AS sizeBytes, sha256,
            created_at AS createdAt, created_by AS createdBy
     FROM image_assets
     ORDER BY created_at DESC, id DESC
     LIMIT ?1 OFFSET ?2`,
  ).bind(limit, offset).all();
  const count = await db.prepare('SELECT COUNT(*) AS total FROM image_assets').first();
  const items = (Array.isArray(result?.results) ? result.results : []).map(normalizeAssetRow);
  const total = Number(count?.total || 0);
  const nextOffset = offset + items.length < total ? offset + items.length : null;
  return {
    items,
    total,
    limit,
    offset,
    nextOffset,
    prevOffset: offset > 0 ? Math.max(0, offset - limit) : null,
    hasMore: nextOffset !== null,
  };
}

export async function deleteImageAsset(db, id) {
  await db.prepare('DELETE FROM image_assets WHERE id = ?1').bind(String(id || '')).run();
}

export async function storeImageAsset(context = {}) {
  const prepared = await prepareImageUpload(context.file, context);
  const asset = { ...prepared, createdBy: String(context.createdBy || '') };
  await context.bucket.put(prepared.objectKey, prepared.bytes, {
    httpMetadata: {
      contentType: prepared.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      id: prepared.id,
      originalName: prepared.originalName,
      sha256: prepared.sha256,
    },
  });

  try {
    return await insertImageAsset(context.db, asset);
  } catch (error) {
    await context.bucket.delete(prepared.objectKey).catch(() => {});
    throw error;
  }
}

export async function removeImageAsset(context = {}) {
  const asset = await getImageAsset(context.db, context.id);
  if (!asset) return null;
  await context.bucket.delete(asset.objectKey);
  await deleteImageAsset(context.db, asset.id);
  return asset;
}

export function isSafeImageObjectKey(value) {
  const key = String(value || '');
  if (!key || key.length > 300 || key.startsWith('/') || key.endsWith('/')) return false;
  if (!/^[a-z0-9._/-]+$/i.test(key)) return false;
  return key.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}
