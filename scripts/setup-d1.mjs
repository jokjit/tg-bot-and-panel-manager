import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const wranglerPath = resolve(cwd, 'wrangler.toml');
const localWranglerPath = resolve(cwd, 'wrangler.local.toml');
const migrationsDir = resolve(cwd, 'migrations');

function parseArgs(argv) {
  const args = {
    databaseName: process.env.D1_DATABASE_NAME || 'tg-bot-history',
    binding: process.env.D1_BINDING || 'DB',
    target: 'local',
    skipMigrate: false,
    remote: false,
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
      args.remote = true;
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
      throw new Error(`不支持的参数：${current}`);
    }
  }

  if (!['local', 'public'].includes(args.target)) {
    throw new Error(`--target 仅支持 local 或 public，当前值：${args.target}`);
  }

  return args;
}

function printHelp() {
  console.log(`
用法：
  npm run setup:d1 -- [可选参数]

示例：
  npm run setup:d1 -- --database-name tg-bot-history --binding DB --remote
  npm run setup:d1 -- --database-name tg-bot-history --binding DB --target public

参数：
  --database-name   D1 数据库名，默认：tg-bot-history
  --binding         Wrangler 绑定名，默认：DB
  --target          回填目标：local / public，默认：local
  --remote          创建后立即应用远程迁移
  --skip-migrate    只创建数据库并回填配置，不执行迁移
  --dry-run         仅打印步骤，不真正执行
  --help            查看帮助

说明：
  - 运行前请先完成 wrangler login，或已配置 Cloudflare 相关环境变量。
  - 默认会把真实 D1 database_id 写入 wrangler.local.toml，避免泄露到公开仓库。
  - 如果数据库已存在，脚本会自动复用并继续回填绑定。
`);
}

function runCommand(command, args, options = {}) {
  const rendered = [command, ...args].join(' ');
  console.log(`\n> ${rendered}`);

  if (options.dryRun) {
    return { stdout: '', stderr: '' };
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd || cwd,
    env: options.env || process.env,
    shell: process.platform === 'win32',
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr || '';
    const stdout = result.stdout || '';
    throw new Error(`命令执行失败：${rendered}\n${stdout}${stderr}`.trim());
  }

  return result;
}

function ensureMigrationsDir() {
  if (!existsSync(migrationsDir)) {
    mkdirSync(migrationsDir, { recursive: true });
  }
}

function ensureWranglerFile() {
  if (!existsSync(wranglerPath)) {
    throw new Error(`未找到 wrangler.toml：${wranglerPath}`);
  }
}

function ensureLocalWranglerFile() {
  if (existsSync(localWranglerPath)) {
    return;
  }

  const template = [
    '# 本地私有部署配置',
    '# 该文件不会提交到 Git。',
    '',
    '[vars]',
    'PUBLIC_BASE_URL = "https://your-worker.example.com"',
    'ADMIN_PANEL_URL = "https://your-pages-panel.example.com"',
    '',
  ].join('\n');

  writeFileSync(localWranglerPath, template, 'utf8');
}

function parseDatabaseId(output) {
  const text = String(output || '');
  const direct = text.match(/database_id\s*=\s*"([^"]+)"/i);
  if (direct) return direct[1].trim();

  const idLine = text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  if (idLine) return idLine[1].trim();

  try {
    const parsed = JSON.parse(text);
    return parsed?.result?.uuid || parsed?.uuid || parsed?.database_id || '';
  } catch {
    return '';
  }
}

function findExistingDatabase(databaseName) {
  const result = runCommand('npx', ['wrangler', 'd1', 'list', '--json'], { capture: true });
  const list = JSON.parse(result.stdout || '[]');
  if (!Array.isArray(list)) return null;
  return list.find((item) => item?.name === databaseName) || null;
}

function upsertD1Binding(content, binding, databaseName, databaseId) {
  const block = `[[d1_databases]]\nbinding = "${binding}"\ndatabase_name = "${databaseName}"\ndatabase_id = "${databaseId}"`;
  const existingBlock = /\[\[d1_databases\]\][\s\S]*?(?=\n\[\[|\n\[|$)/g;
  const matches = [...content.matchAll(existingBlock)];

  for (const match of matches) {
    if (match[0].includes(`binding = "${binding}"`)) {
      return content.replace(match[0], block);
    }
  }

  const trimmed = content.replace(/\s+$/, '');
  if (!trimmed) {
    return `${block}\n`;
  }
  return `${trimmed}\n\n${block}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  ensureWranglerFile();
  if (args.target === 'local') {
    ensureLocalWranglerFile();
  }
  ensureMigrationsDir();

  console.log('开始初始化 D1...');
  console.log(`数据库名：${args.databaseName}`);
  console.log(`绑定名：${args.binding}`);
  console.log(`回填目标：${args.target === 'local' ? 'wrangler.local.toml' : 'wrangler.toml'}`);
  if (args.remote) console.log('迁移模式：远程');
  if (args.dryRun) console.log('当前为 dry-run，不会真正执行命令。');

  const targetPath = args.target === 'public' ? wranglerPath : localWranglerPath;
  let databaseId = '';

  if (!args.dryRun) {
    try {
      const createResult = runCommand('npx', ['wrangler', 'd1', 'create', args.databaseName], { capture: true });
      const output = `${createResult.stdout || ''}${createResult.stderr || ''}`;
      databaseId = parseDatabaseId(output);
    } catch (error) {
      if (String(error.message || '').includes('A database with that name already exists')) {
        const existing = findExistingDatabase(args.databaseName);
        databaseId = existing?.uuid || '';
        console.log(`检测到同名数据库已存在，已复用：${args.databaseName}`);
      } else {
        throw error;
      }
    }

    if (!databaseId) {
      throw new Error('无法解析或复用 D1 database_id。');
    }

    const targetContent = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';
    const nextContent = upsertD1Binding(targetContent, args.binding, args.databaseName, databaseId);
    writeFileSync(targetPath, nextContent, 'utf8');
    console.log(`已写入 D1 绑定到：${targetPath}`);
    console.log(`database_id：${databaseId}`);
  } else {
    console.log(`将会把 [[d1_databases]] 写入 ${targetPath}`);
    console.log(`\n> npx wrangler d1 create ${args.databaseName}`);
  }

  if (!args.skipMigrate) {
    const migrateArgs = ['wrangler', 'd1', 'migrations', 'apply', args.databaseName];
    if (args.remote) {
      migrateArgs.push('--remote');
    }

    if (args.dryRun) {
      console.log(`\n> npx ${migrateArgs.join(' ')}`);
    } else {
      runCommand('npx', migrateArgs);
    }
  }

  console.log('\nD1 初始化完成。');
}

main().catch((error) => {
  console.error(`\n初始化失败：${error.message}`);
  process.exit(1);
});
