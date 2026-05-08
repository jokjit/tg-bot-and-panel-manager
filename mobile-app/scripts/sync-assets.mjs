import { access, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const blake3 = require('blake3-wasm');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(mobileRoot, '..');
const outRoot = path.join(mobileRoot, 'public', 'deploy-assets');
const migrationOutDir = path.join(outRoot, 'migrations');
const panelOutDir = path.join(outRoot, 'admin-panel');

const MAX_PANEL_ASSET_SIZE = 25 * 1024 * 1024;

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function getMimeType(name) {
  const ext = path.extname(name).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function normalizeRelPath(rootDir, absPath) {
  return path.relative(rootDir, absPath).split(path.sep).join('/');
}

function shouldIgnorePanelAsset(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (['_worker.js', '_redirects', '_headers', '_routes.json'].includes(normalized)) return true;
  if (normalized === 'functions' || normalized.startsWith('functions/')) return true;
  if (parts.includes('.DS_Store') || parts.includes('node_modules') || parts.includes('.git') || parts.includes('.wrangler')) return true;
  return false;
}

function hashPagesFileFromBuffer(buffer, filename) {
  const base64Contents = buffer.toString('base64');
  const extension = path.extname(filename).substring(1);
  return blake3.hash(base64Contents + extension).toString('hex').slice(0, 32);
}

async function ensureFileExists(filePath) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`缺少文件: ${filePath}`);
  }
}

async function ensureDirectoryExists(dirPath) {
  const status = await stat(dirPath).catch(() => null);
  if (!status || !status.isDirectory()) {
    throw new Error(`缺少目录: ${dirPath}`);
  }
}

async function copyPanelAssets(panelDistDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      const relPath = normalizeRelPath(panelDistDir, absPath);
      if (shouldIgnorePanelAsset(relPath)) continue;

      if (entry.isDirectory()) {
        await walk(absPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const fileStat = await stat(absPath);
      if (fileStat.size > MAX_PANEL_ASSET_SIZE) {
        throw new Error(`面板资源过大: ${relPath} (${fileStat.size} bytes)`);
      }

      const outPath = path.join(panelOutDir, relPath);
      await mkdir(path.dirname(outPath), { recursive: true });
      await copyFile(absPath, outPath);

      const buffer = await readFile(absPath);
      files.push({
        path: relPath,
        contentType: getMimeType(relPath),
        sizeInBytes: fileStat.size,
        hash: hashPagesFileFromBuffer(buffer, relPath),
      });
    }
  }

  await walk(panelDistDir);
  files.sort((a, b) => a.path.localeCompare(b.path));

  await writeFile(
    path.join(outRoot, 'panel-assets.json'),
    JSON.stringify({ files }, null, 2),
    'utf8',
  );

  return files.length;
}

async function main() {
  const workerSrc = path.join(repoRoot, 'worker.js');
  const wranglerSrc = path.join(repoRoot, 'wrangler.toml');
  const migrationsSrcDir = path.join(repoRoot, 'migrations');
  const panelDistDir = path.join(repoRoot, 'admin-panel', 'dist');

  await ensureFileExists(workerSrc);
  await ensureFileExists(wranglerSrc);
  await ensureDirectoryExists(panelDistDir);

  await rm(outRoot, { recursive: true, force: true });
  await mkdir(migrationOutDir, { recursive: true });

  await copyFile(workerSrc, path.join(outRoot, 'worker.js'));
  await copyFile(wranglerSrc, path.join(outRoot, 'wrangler.toml'));

  let migrationFiles = [];
  try {
    const files = await readdir(migrationsSrcDir, { withFileTypes: true });
    migrationFiles = files
      .filter((item) => item.isFile() && /\.sql$/i.test(item.name))
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    migrationFiles = [];
  }

  for (const filename of migrationFiles) {
    await copyFile(path.join(migrationsSrcDir, filename), path.join(migrationOutDir, filename));
  }

  await writeFile(
    path.join(outRoot, 'migrations.json'),
    JSON.stringify({ files: migrationFiles }, null, 2),
    'utf8',
  );

  const panelCount = await copyPanelAssets(panelDistDir);

  console.log(`sync-assets done: worker.js + wrangler.toml + ${migrationFiles.length} migrations + ${panelCount} panel files`);
}

await main();
