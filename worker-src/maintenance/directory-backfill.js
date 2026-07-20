import { writeDirectoryBackfillBatch } from '../storage/directory.js';

export const DIRECTORY_INDEX_BACKFILL_KEY = 'sys:directory_index_backfill';

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;
const PHASES = Object.freeze([
  { name: 'users', prefix: 'user:', kind: 'user' },
  { name: 'blacklist', prefix: 'blacklist:', kind: 'blacklist' },
  { name: 'trust', prefix: 'trust:', kind: 'trust' },
]);

function normalizeBatchSize(value) {
  const parsed = Math.floor(Number(value) || DEFAULT_BATCH_SIZE);
  return Math.min(Math.max(parsed, 1), MAX_BATCH_SIZE);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readJson(kv, key) {
  const raw = await kv.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createDirectoryIndexBackfillState(source = 'unknown') {
  const nowIso = new Date().toISOString();
  return {
    version: 1,
    status: 'running',
    phaseIndex: 0,
    cursors: { users: null, blacklist: null, trust: null },
    processed: { users: 0, blacklist: 0, trust: 0 },
    written: { users: 0, blacklist: 0, trust: 0 },
    skipped: { users: 0, blacklist: 0, trust: 0 },
    startedAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
    lastSource: String(source || 'unknown'),
    lastError: null,
  };
}

export async function runDirectoryIndexBackfill(env, options = {}) {
  if (!env?.BOT_KV) return { ok: false, skipped: 'missing_kv' };
  if (!env?.DB) return { ok: false, skipped: 'missing_d1' };

  const batchSize = normalizeBatchSize(options.batchSize);
  let state = options.reset ? null : await readJson(env.BOT_KV, DIRECTORY_INDEX_BACKFILL_KEY);
  if (!state || state.version !== 1) {
    state = createDirectoryIndexBackfillState(options.source);
  }
  if (state.status === 'complete' && !options.reset) {
    return { ok: true, skipped: 'complete', state };
  }

  state.status = 'running';
  state.lastSource = String(options.source || 'unknown');
  state.lastError = null;
  let remaining = batchSize;
  let processedThisRun = 0;
  let writtenThisRun = 0;

  try {
    while (remaining > 0 && state.phaseIndex < PHASES.length) {
      const phase = PHASES[state.phaseIndex];
      const cursor = state.cursors?.[phase.name] || undefined;
      const page = await env.BOT_KV.list({
        prefix: phase.prefix,
        limit: Math.min(remaining, 1000),
        ...(cursor ? { cursor } : {}),
      });
      const keys = Array.isArray(page?.keys) ? page.keys : [];
      const values = await Promise.all(keys.map((item) => readJson(env.BOT_KV, item.name)));
      const existingValues = values.filter(Boolean);
      const batchResult = await writeDirectoryBackfillBatch(env, phase, existingValues);

      state.processed[phase.name] += keys.length;
      state.written[phase.name] += batchResult.written;
      state.skipped[phase.name] += (keys.length - existingValues.length) + batchResult.skipped;
      processedThisRun += keys.length;
      writtenThisRun += batchResult.written;
      remaining -= keys.length;

      const listComplete = Boolean(page?.list_complete || page?.listComplete || !page?.cursor);
      if (listComplete) {
        state.cursors[phase.name] = null;
        state.phaseIndex += 1;
      } else {
        if (page.cursor === cursor && keys.length === 0) {
          throw new Error(`directory_backfill_cursor_stalled:${phase.name}`);
        }
        state.cursors[phase.name] = page.cursor;
      }
    }

    const nowIso = new Date().toISOString();
    state.updatedAt = nowIso;
    if (state.phaseIndex >= PHASES.length) {
      state.status = 'complete';
      state.completedAt = nowIso;
    }
    await env.BOT_KV.put(DIRECTORY_INDEX_BACKFILL_KEY, JSON.stringify(state));
    return { ok: true, processedThisRun, writtenThisRun, batchSize, state };
  } catch (error) {
    state.status = 'error';
    state.updatedAt = new Date().toISOString();
    state.lastError = formatError(error);
    try {
      await env.BOT_KV.put(DIRECTORY_INDEX_BACKFILL_KEY, JSON.stringify(state));
    } catch {}
    throw error;
  }
}
