import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const cwd = process.cwd();
const basePath = resolve(cwd, 'wrangler.toml');
const localPath = resolve(cwd, process.env.TG_BOT_LOCAL_WRANGLER || 'wrangler.local.toml');
const outputPath = resolve(cwd, process.env.TG_BOT_PRIVATE_WRANGLER || '.wrangler.private.toml');
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '').trim();
const workerName = String(process.env.WORKER_NAME || '').trim();

if (!existsSync(basePath)) {
  throw new Error(`Missing base config: ${basePath}`);
}

const base = readFileSync(basePath, 'utf8');

let merged = base;
let managedRouteBlock = '';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findBindingBlock(content, tableName, binding) {
  const blockPattern = new RegExp(`\\[\\[${escapeRegExp(tableName)}\\]\\][\\s\\S]*?(?=\\n\\[\\[|\\n\\[|$)`, 'g');
  const matches = [...String(content).matchAll(blockPattern)];
  return matches.find((match) => {
    const block = match[0];
    return new RegExp(`^[ \\t]*binding[ \\t]*=[ \\t]*"${escapeRegExp(binding)}"[ \\t]*$`, 'm').test(block);
  })?.[0] || '';
}

function upsertBindingBlock(content, tableName, binding, block) {
  const blockPattern = new RegExp(`\\[\\[${escapeRegExp(tableName)}\\]\\][\\s\\S]*?(?=\\n\\[\\[|\\n\\[|$)`, 'g');
  const matches = [...String(content).matchAll(blockPattern)];
  for (const match of matches) {
    if (new RegExp(`^[ \\t]*binding[ \\t]*=[ \\t]*"${escapeRegExp(binding)}"[ \\t]*$`, 'm').test(match[0])) {
      return content.replace(match[0], block);
    }
  }

  const commentedPlaceholder = new RegExp(
    `#\\s*\\[\\[${escapeRegExp(tableName)}\\]\\][\\s\\S]*?#\\s*(?:id|database_id)\\s*=\\s*"<YOUR_[^"]+_ID>"`,
  );
  if (commentedPlaceholder.test(content)) {
    return content.replace(commentedPlaceholder, block);
  }

  const varsIndex = content.search(/\n\[vars\]/);
  if (varsIndex >= 0) {
    return `${content.slice(0, varsIndex).replace(/\s+$/, '')}\n\n${block}\n${content.slice(varsIndex)}`;
  }

  return `${content.replace(/\s+$/, '')}\n\n${block}\n`;
}

function findManagedWorkerRouteBlock(content) {
  return String(content || '').match(/# TG_BOT_WORKER_ROUTE_START[\s\S]*?# TG_BOT_WORKER_ROUTE_END/)?.[0] || '';
}

function insertTopLevelBlock(content, block) {
  if (!block) return content;
  const firstTableIndex = content.search(/^[ \t]*\[/m);
  if (firstTableIndex >= 0) {
    return `${content.slice(0, firstTableIndex).replace(/\s+$/, '')}\n\n${block}\n\n${content.slice(firstTableIndex).replace(/^\s+/, '')}`;
  }
  return `${content.replace(/\s+$/, '')}\n\n${block}\n`;
}

if (existsSync(localPath)) {
  const local = readFileSync(localPath, 'utf8').trim();
  if (local) {
    managedRouteBlock = findManagedWorkerRouteBlock(local);

    const kvBlock = findBindingBlock(local, 'kv_namespaces', 'BOT_KV');
    if (kvBlock) {
      merged = upsertBindingBlock(merged, 'kv_namespaces', 'BOT_KV', kvBlock);
    }

    const d1Block = findBindingBlock(local, 'd1_databases', 'DB');
    if (d1Block) {
      merged = upsertBindingBlock(merged, 'd1_databases', 'DB', d1Block);
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

if (workerName) {
  const line = `name = ${JSON.stringify(workerName)}`;
  if (/^[ \t]*name[ \t]*=.*$/m.test(merged)) {
    merged = merged.replace(/^[ \t]*name[ \t]*=.*$/m, line);
  } else if (/^[ \t]*main[ \t]*=.*$/m.test(merged)) {
    merged = merged.replace(/^[ \t]*main[ \t]*=.*$/m, (hit) => `${line}\n${hit}`);
  } else {
    merged = `${line}\n${merged}`;
  }
}

if (accountId) {
  const line = `account_id = "${accountId}"`;
  if (/^[ \t]*account_id[ \t]*=.*$/m.test(merged)) {
    merged = merged.replace(/^[ \t]*account_id[ \t]*=.*$/m, line);
  } else if (/^[ \t]*name[ \t]*=.*$/m.test(merged)) {
    merged = merged.replace(/^[ \t]*name[ \t]*=.*$/m, (hit) => `${hit}\n${line}`);
  } else {
    merged = `${line}\n${merged}`;
  }
}

const workerMainPath = resolve(cwd, 'worker.js').replace(/\\/g, '/');
const mainLine = `main = ${JSON.stringify(workerMainPath)}`;
if (/^[ \t]*main[ \t]*=.*$/m.test(merged)) {
  merged = merged.replace(/^[ \t]*main[ \t]*=.*$/m, mainLine);
} else if (/^[ \t]*name[ \t]*=.*$/m.test(merged)) {
  merged = merged.replace(/^[ \t]*name[ \t]*=.*$/m, (hit) => `${hit}\n${mainLine}`);
} else {
  merged = `${mainLine}\n${merged}`;
}

if (managedRouteBlock) {
  merged = insertTopLevelBlock(merged, managedRouteBlock);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, merged.replace(/\s+$/, '') + '\n', 'utf8');
console.log(outputPath);
