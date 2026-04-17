import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();
const basePath = resolve(cwd, 'wrangler.toml');
const localPath = resolve(cwd, 'wrangler.local.toml');
const outputPath = resolve(cwd, '.wrangler.private.toml');

if (!existsSync(basePath)) {
  throw new Error(`Missing base config: ${basePath}`);
}

const base = readFileSync(basePath, 'utf8');

let merged = base;

if (existsSync(localPath)) {
  const local = readFileSync(localPath, 'utf8').trim();
  if (local) {
    const d1BlockMatch = local.match(/\[\[d1_databases\]\][\s\S]*?(?=\n\[|$)/);
    if (d1BlockMatch) {
      merged = merged.replace(
        /# \[\[d1_databases\]\][\s\S]*?# database_id = "<YOUR_D1_DATABASE_ID>"/,
        d1BlockMatch[0],
      );
    }

    const varsMatch = local.match(/\[vars\][\s\S]*?(?=\n\[|$)/);
    if (varsMatch) {
      const privateVars = varsMatch[0]
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean);

      if (privateVars.length > 0) {
        merged = merged.replace(/\[vars\]([\s\S]*?)(?=\n\[|$)/, (full, body) => {
          const existingLines = String(body)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

          const next = [...existingLines];
          for (const line of privateVars) {
            const key = line.split('=')[0]?.trim();
            const index = next.findIndex((item) => item.split('=')[0]?.trim() === key);
            if (index >= 0) {
              next[index] = line;
            } else {
              next.push(line);
            }
          }

          return `[vars]\n${next.join('\n')}`;
        });
      }
    }
  }
}

writeFileSync(outputPath, merged.replace(/\s+$/, '') + '\n', 'utf8');
console.log(outputPath);
