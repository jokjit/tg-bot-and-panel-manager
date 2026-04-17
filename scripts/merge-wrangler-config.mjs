import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();
const basePath = resolve(cwd, 'wrangler.toml');
const localPath = resolve(cwd, 'wrangler.local.toml');
const outputPath = resolve(cwd, '.wrangler.private.toml');

if (!existsSync(basePath)) {
  throw new Error(`Missing base config: ${basePath}`);
}

const base = readFileSync(basePath, 'utf8').replace(/\s+$/, '');
let merged = `${base}\n`;

if (existsSync(localPath)) {
  const local = readFileSync(localPath, 'utf8').trim();
  if (local) {
    merged += `\n\n# ---- local private overrides ----\n${local}\n`;
  }
}

writeFileSync(outputPath, merged, 'utf8');
console.log(outputPath);
