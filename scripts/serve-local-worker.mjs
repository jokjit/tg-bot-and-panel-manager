import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Miniflare } from 'miniflare';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.TG_BOT_LOCAL_WORKER_PORT || 8787);
const previewPassword = String(process.env.TG_BOT_LOCAL_ADMIN_PASSWORD || 'local-preview-password');
const panelOrigin = String(process.env.TG_BOT_LOCAL_PANEL_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, '');
const workerScript = await readFile(resolve(root, 'worker.bundle.js'), 'utf8');

const mf = new Miniflare({
  workers: [{
    config: {
      name: 'tg-bot-local-preview',
      type: 'worker',
      compatibilityDate: '2026-04-16',
      manifest: {
        mainModule: 'worker.bundle.js',
        modulesRoot: root,
        modules: {
          'worker.bundle.js': { type: 'esm', contents: workerScript },
        },
      },
      env: {
        BOT_KV: { type: 'kv' },
        DB: { type: 'd1' },
        IMAGE_BUCKET: { type: 'r2' },
        ADMIN_CHAT_ID: { type: 'text', value: '-100000000001' },
        ADMIN_PANEL_URL: { type: 'text', value: panelOrigin },
        PUBLIC_BASE_URL: { type: 'text', value: `http://127.0.0.1:${port}` },
        TOPIC_MODE: { type: 'text', value: 'false' },
        USER_VERIFICATION: { type: 'text', value: 'false' },
      },
    },
  }],
});

await mf.ready;
const kv = await mf.getKVNamespace('BOT_KV');
const db = await mf.getD1Database('DB');
await kv.put('sys:config', JSON.stringify({
  ADMIN_PANEL_PASSWORD: previewPassword,
  ADMIN_FORCE_PASSWORD_CHANGE: 'false',
  updatedAt: new Date().toISOString(),
}));

const migrationDir = resolve(root, 'migrations');
const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
for (const name of migrations) {
  const sql = (await readFile(resolve(migrationDir, name), 'utf8')).replace(/\s+/g, ' ').trim();
  await db.exec(sql);
}

const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const method = request.method || 'GET';
    const body = ['GET', 'HEAD'].includes(method) ? undefined : Buffer.concat(chunks);
    const result = await mf.dispatchFetch(`http://127.0.0.1:${port}${request.url || '/'}`, {
      method,
      headers: request.headers,
      body,
    });
    response.statusCode = result.status;
    for (const [name, value] of result.headers) response.setHeader(name, value);
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local Worker: http://127.0.0.1:${port}`);
  console.log(`Local admin password: ${previewPassword}`);
});

async function close() {
  await new Promise((resolveClose) => server.close(resolveClose));
  await mf.dispose();
}

process.once('SIGINT', () => close().finally(() => process.exit(0)));
process.once('SIGTERM', () => close().finally(() => process.exit(0)));
