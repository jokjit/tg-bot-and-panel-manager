import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const cwd = process.cwd();
const wranglerPath = resolve(cwd, 'wrangler.toml');
const localWranglerPath = resolve(cwd, process.env.TG_BOT_LOCAL_WRANGLER || 'wrangler.local.toml');
const migrationsDir = resolve(cwd, 'migrations');

function parseArgs(argv) {
  const args = {
    databaseName: process.env.D1_DATABASE_NAME || 'tg-bot-history',
    binding: process.env.D1_BINDING || 'DB',
    target: 'local',
    skipMigrate: false,
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--help' || current === '-h') {
      args.help = true;
      continue;
    }
    if (current === '--skip-migrate') {
      args.skipMigrate = true;
      continue;
    }
    if (current === '--remote') {
      // Kept for backward compatibility. API flow is always remote.
      continue;
    }
    if (current === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (current === '--database-name' && next) {
      args.databaseName = next.trim();
      index += 1;
      continue;
    }
    if (current === '--binding' && next) {
      args.binding = next.trim();
      index += 1;
      continue;
    }
    if (current === '--target' && next) {
      args.target = next.trim();
      index += 1;
      continue;
    }
    if (current.startsWith('--')) {
      throw new Error(`Unsupported option: ${current}`);
    }
  }

  if (!['local', 'public'].includes(args.target)) {
    throw new Error(`--target must be local or public. Received: ${args.target}`);
  }
  if (!args.databaseName) {
    throw new Error('databaseName must not be empty');
  }
  if (!args.binding) {
    throw new Error('binding must not be empty');
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/setup-d1.mjs [options]

Examples:
  node scripts/setup-d1.mjs --database-name tg-bot-history --binding DB
  node scripts/setup-d1.mjs --target public --skip-migrate

Options:
  --database-name <name>  D1 database name (default: tg-bot-history)
  --binding <name>        binding name (default: DB)
  --target <local|public> write binding to wrangler.local.toml or wrangler.toml (default: local)
  --skip-migrate          skip migrations apply
  --remote                accepted for compatibility; ignored (API is remote)
  --dry-run               print plan only
  --help                  show help
`);
}

function ensureWranglerFile() {
  if (!existsSync(wranglerPath)) {
    throw new Error(`Missing wrangler.toml: ${wranglerPath}`);
  }
}

function ensureLocalWranglerFile() {
  if (existsSync(localWranglerPath)) return;
  mkdirSync(dirname(localWranglerPath), { recursive: true });
  writeFileSync(
    localWranglerPath,
    [
      '# Local private deployment config',
      '# This file is not committed to git.',
      '',
      '[vars]',
      '',
    ].join('\n'),
    'utf8',
  );
}

function getCfEnv() {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '').trim();
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '').trim();
  if (!token || !accountId) {
    throw new Error('Missing CLOUDFLARE_API_TOKEN/CF_API_TOKEN or CLOUDFLARE_ACCOUNT_ID/CF_ACCOUNT_ID');
  }
  return { token, accountId };
}

async function cfApiRequest(path, method = 'GET', body) {
  const { token, accountId } = getCfEnv();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!json?.success) {
    const errors = Array.isArray(json?.errors) ? json.errors : [];
    const reason = errors.length > 0
      ? errors.map((item) => `${item.code || 'unknown'}:${item.message || 'unknown'}`).join('; ')
      : `http_${response.status}`;
    throw new Error(reason);
  }
  return json;
}

async function listD1Databases() {
  const all = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages && page <= 10; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: '100' });
    const data = await cfApiRequest(`/d1/database?${query.toString()}`);
    all.push(...(Array.isArray(data.result) ? data.result : []));
    totalPages = Number(data.result_info?.total_pages || 1);
  }
  return all;
}

function getDatabaseId(item) {
  return String(item?.uuid || item?.id || item?.database_id || '').trim();
}

async function createOrGetDatabase(databaseName) {
  let databases = await listD1Databases();
  let database = databases.find((item) => String(item.name || '') === databaseName);
  if (getDatabaseId(database)) {
    return getDatabaseId(database);
  }

  try {
    const created = await cfApiRequest('/d1/database', 'POST', { name: databaseName });
    database = created.result || null;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!/already exists|10013|10014|7502/i.test(reason)) {
      throw error;
    }
    databases = await listD1Databases();
    database = databases.find((item) => String(item.name || '') === databaseName);
  }

  const id = getDatabaseId(database);
  if (!id) throw new Error(`database_id not found for ${databaseName}`);
  return id;
}

function upsertD1Binding(content, binding, databaseName, databaseId) {
  const block = `[[d1_databases]]\nbinding = "${binding}"\ndatabase_name = "${databaseName}"\ndatabase_id = "${databaseId}"`;
  const pattern = /\[\[d1_databases\]\][\s\S]*?(?=\n\[\[|\n\[|$)/g;
  const matches = [...String(content).matchAll(pattern)];
  for (const match of matches) {
    if (new RegExp(`^\\s*binding\\s*=\\s*"${binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*$`, 'm').test(match[0])) {
      return String(content).replace(match[0], block);
    }
  }
  const trimmed = String(content).replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}

function escapeSqlString(value) {
  return String(value || '').replaceAll("'", "''");
}

async function executeD1Sql(databaseId, sql) {
  const data = await cfApiRequest(`/d1/database/${encodeURIComponent(databaseId)}/query`, 'POST', { sql });
  return data.result;
}

function readMigrationFiles() {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir)
    .filter((name) => /\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function extractQueryRows(result) {
  if (Array.isArray(result?.[0]?.results)) return result[0].results;
  if (Array.isArray(result?.results)) return result.results;
  return [];
}

async function applyMigrations(databaseId) {
  await executeD1Sql(
    databaseId,
    `CREATE TABLE IF NOT EXISTS d1_migrations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );`,
  );

  const existingRows = extractQueryRows(await executeD1Sql(databaseId, 'SELECT name FROM d1_migrations ORDER BY id'));
  const applied = new Set(existingRows.map((row) => String(row.name || '').trim()).filter(Boolean));
  const files = readMigrationFiles();
  const appliedNow = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8').trim();
    if (!sql) continue;
    const mergedSql = `${sql}\n\nINSERT INTO d1_migrations (name) VALUES ('${escapeSqlString(file)}');`;
    await executeD1Sql(databaseId, mergedSql);
    appliedNow.push(file);
    console.log(`Applied migration: ${file}`);
  }

  if (appliedNow.length === 0) {
    console.log('No new migrations to apply.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  ensureWranglerFile();
  if (args.target === 'local') ensureLocalWranglerFile();

  const targetPath = args.target === 'public' ? wranglerPath : localWranglerPath;
  console.log('Initializing D1 via Cloudflare API...');
  console.log(`Database: ${args.databaseName}`);
  console.log(`Binding: ${args.binding}`);
  console.log(`Target config: ${targetPath}`);

  if (args.dryRun) {
    console.log('Dry run enabled.');
    return;
  }

  const databaseId = await createOrGetDatabase(args.databaseName);
  const current = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';
  const next = upsertD1Binding(current, args.binding, args.databaseName, databaseId);
  writeFileSync(targetPath, next, 'utf8');

  console.log(`D1 database_id: ${databaseId}`);
  console.log(`D1 binding written to: ${targetPath}`);

  if (!args.skipMigrate) {
    await applyMigrations(databaseId);
  }

  console.log('D1 initialization complete.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`D1 initialization failed: ${message}`);
  process.exit(1);
});
