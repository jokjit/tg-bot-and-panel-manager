import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const cwd = process.cwd();
const wranglerPath = resolve(cwd, 'wrangler.toml');
const localWranglerPath = resolve(cwd, process.env.TG_BOT_LOCAL_WRANGLER || 'wrangler.local.toml');

function parseArgs(argv) {
  const args = {
    namespaceTitle: process.env.KV_NAMESPACE_TITLE || process.env.KV_NAMESPACE_NAME || 'tg-bot-kv',
    binding: process.env.KV_BINDING || 'BOT_KV',
    target: 'local',
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
    if (current === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (current === '--namespace-title' && next) {
      args.namespaceTitle = next.trim();
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
  if (!args.namespaceTitle) {
    throw new Error('KV namespace title 不能为空');
  }
  if (!args.binding) {
    throw new Error('KV binding 不能为空');
  }

  return args;
}

function printHelp() {
  console.log(`
用法：
  node scripts/setup-kv.mjs [可选参数]

示例：
  node scripts/setup-kv.mjs --namespace-title tg-bot-kv --binding BOT_KV

参数：
  --namespace-title  Cloudflare KV namespace 名称，默认：tg-bot-kv
  --binding          Wrangler 绑定名，默认：BOT_KV
  --target           回填目标：local / public，默认：local
  --dry-run          只打印步骤，不真正执行
  --help             查看帮助
`);
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

  mkdirSync(dirname(localWranglerPath), { recursive: true });
  writeFileSync(
    localWranglerPath,
    [
      '# 本地私有部署配置',
      '# 该文件不会提交到 Git。',
      '',
      '[vars]',
      'PUBLIC_BASE_URL = "https://your-worker.example.com"',
      'ADMIN_PANEL_URL = "https://your-pages-panel.example.com"',
      '',
    ].join('\n'),
    'utf8',
  );
}

async function cfApiRequest(path, method = 'GET', body) {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '').trim();
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || '').trim();
  if (!token || !accountId) {
    throw new Error('缺少 CLOUDFLARE_API_TOKEN 或 CLOUDFLARE_ACCOUNT_ID');
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!data?.success) {
    const reason = Array.isArray(data?.errors) && data.errors.length > 0
      ? data.errors.map((item) => `${item.code || 'unknown'}:${item.message || 'unknown'}`).join('; ')
      : `http_${response.status}`;
    throw new Error(reason);
  }
  return data;
}

async function listNamespaces() {
  const data = await cfApiRequest('/storage/kv/namespaces?per_page=100');
  return Array.isArray(data.result) ? data.result : [];
}

async function findExistingNamespace(namespaceTitle) {
  const namespaces = await listNamespaces();
  return namespaces.find((item) => item.title === namespaceTitle) || null;
}

async function createOrGetNamespace(namespaceTitle) {
  const existing = await findExistingNamespace(namespaceTitle);
  if (existing?.id) {
    return existing.id;
  }

  try {
    const data = await cfApiRequest('/storage/kv/namespaces', 'POST', { title: namespaceTitle });
    return data.result?.id || '';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|10014|10013/i.test(message)) {
      const retryExisting = await findExistingNamespace(namespaceTitle);
      if (retryExisting?.id) {
        return retryExisting.id;
      }
    }
    throw error;
  }
}

function upsertKvBinding(content, binding, namespaceId) {
  const block = `[[kv_namespaces]]\nbinding = "${binding}"\nid = "${namespaceId}"`;
  const existingBlock = /\[\[kv_namespaces\]\][\s\S]*?(?=\n\[\[|\n\[|$)/g;
  const matches = [...content.matchAll(existingBlock)];

  for (const match of matches) {
    if (new RegExp(`^\\s*binding\\s*=\\s*"${binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*$`, 'm').test(match[0])) {
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

  const targetPath = args.target === 'public' ? wranglerPath : localWranglerPath;

  console.log('开始初始化 KV...');
  console.log(`命名空间：${args.namespaceTitle}`);
  console.log(`绑定名：${args.binding}`);
  console.log(`回填目标：${args.target === 'local' ? 'wrangler.local.toml' : 'wrangler.toml'}`);

  if (args.dryRun) {
    console.log(`将会创建/复用 KV namespace：${args.namespaceTitle}`);
    console.log(`将会把 [[kv_namespaces]] 写入：${targetPath}`);
    return;
  }

  const namespaceId = await createOrGetNamespace(args.namespaceTitle);
  if (!namespaceId) {
    throw new Error('无法解析或复用 KV namespace id。');
  }

  const targetContent = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';
  const nextContent = upsertKvBinding(targetContent, args.binding, namespaceId);
  writeFileSync(targetPath, nextContent, 'utf8');

  console.log(`KV namespace_id: ${namespaceId}`);
  console.log(`已写入 KV 绑定到：${targetPath}`);
  console.log('\nKV 初始化完成。');
}

main().catch((error) => {
  console.error(`\nKV 初始化失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
