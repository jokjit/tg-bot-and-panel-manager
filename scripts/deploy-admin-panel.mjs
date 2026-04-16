import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const panelDir = resolve(cwd, 'admin-panel');
const envFilePath = resolve(panelDir, '.env.production.local');
const packageLockPath = resolve(panelDir, 'package-lock.json');

function parseArgs(argv) {
  const args = {
    projectName: process.env.PAGES_PROJECT_NAME || 'tg-admin-panel',
    workerBaseUrl: process.env.VITE_WORKER_BASE_URL || '',
    canonicalHost: process.env.VITE_CANONICAL_HOST || '',
    branch: process.env.CF_PAGES_BRANCH || '',
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    skipInstall: false,
    skipBuild: false,
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
    if (current === '--skip-install') {
      args.skipInstall = true;
      continue;
    }
    if (current === '--skip-build') {
      args.skipBuild = true;
      continue;
    }
    if (current === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (current === '--project-name' && next) {
      args.projectName = next.trim();
      index += 1;
      continue;
    }
    if (current === '--worker-base-url' && next) {
      args.workerBaseUrl = next.trim();
      index += 1;
      continue;
    }
    if (current === '--canonical-host' && next) {
      args.canonicalHost = next.trim();
      index += 1;
      continue;
    }
    if (current === '--branch' && next) {
      args.branch = next.trim();
      index += 1;
      continue;
    }
    if (current === '--account-id' && next) {
      args.accountId = next.trim();
      index += 1;
      continue;
    }

    if (current.startsWith('--')) {
      throw new Error(`不支持的参数：${current}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
用法：
  npm run deploy:panel -- --worker-base-url <Worker 地址> [可选参数]

示例：
  npm run deploy:panel -- --project-name tg-admin-panel --worker-base-url https://tg.example.com --canonical-host tg-admin.example.com

参数：
  --project-name      Cloudflare Pages 项目名，默认：tg-admin-panel
  --worker-base-url   必填，后台前端请求的 Worker 地址
  --canonical-host    可选，正式后台域名，用于把 pages.dev 自动跳到正式域名
  --branch            可选，部署到指定 Pages 分支环境
  --account-id        可选，显式指定 Cloudflare Account ID
  --skip-install      跳过 admin-panel 依赖安装
  --skip-build        跳过 admin-panel 构建
  --dry-run           仅打印将执行的步骤，不真正执行部署
  --help              查看帮助

说明：
  - 若 Pages 项目不存在，首次执行 wrangler 可能会创建一个 Direct Upload 类型的项目。
  - 如果你计划长期使用 Git 自动部署，建议先在 Cloudflare Pages 控制台创建项目，再使用这个脚本发版。
`);
}

function runCommand(command, args, options = {}) {
  const rendered = [command, ...args].join(' ');
  console.log(`\n> ${rendered}`);

  if (options.dryRun) return;

  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: options.cwd || cwd,
    env: options.env || process.env,
  });

  if (result.status !== 0) {
    throw new Error(`命令执行失败：${rendered}`);
  }
}

function buildEnvFileContent({ workerBaseUrl, canonicalHost }) {
  const lines = [`VITE_WORKER_BASE_URL=${workerBaseUrl}`];
  if (canonicalHost) lines.push(`VITE_CANONICAL_HOST=${canonicalHost}`);
  lines.push('');
  return lines.join('\n');
}

function validateUrl(label, value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('仅支持 http/https');
  } catch (error) {
    throw new Error(`${label} 不是合法 URL：${value}`);
  }
}

function validateHost(host) {
  if (!host) return;
  if (/^https?:\/\//i.test(host)) {
    throw new Error(`--canonical-host 只需要填域名，不要带协议：${host}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!existsSync(panelDir)) {
    throw new Error(`未找到 admin-panel 目录：${panelDir}`);
  }
  if (!args.workerBaseUrl) {
    throw new Error('缺少 --worker-base-url，或者未设置环境变量 VITE_WORKER_BASE_URL');
  }

  validateUrl('worker-base-url', args.workerBaseUrl);
  validateHost(args.canonicalHost);

  const backup = existsSync(envFilePath) ? readFileSync(envFilePath, 'utf8') : null;
  const nextEnvFile = buildEnvFileContent(args);
  const commandEnv = { ...process.env };
  if (args.accountId) {
    commandEnv.CLOUDFLARE_ACCOUNT_ID = args.accountId;
  }

  console.log('开始部署 admin-panel...');
  console.log(`Pages 项目：${args.projectName}`);
  console.log(`Worker 地址：${args.workerBaseUrl}`);
  if (args.canonicalHost) console.log(`正式域名：${args.canonicalHost}`);
  if (args.branch) console.log(`分支环境：${args.branch}`);
  if (args.dryRun) console.log('当前为 dry-run，不会实际执行命令。');

  try {
    writeFileSync(envFilePath, nextEnvFile, 'utf8');
    console.log(`已写入临时构建配置：${envFilePath}`);

    if (!args.skipInstall) {
      const installArgs = existsSync(packageLockPath) ? ['ci'] : ['install'];
      runCommand('npm', installArgs, { cwd: panelDir, env: commandEnv, dryRun: args.dryRun });
    }

    if (!args.skipBuild) {
      runCommand('npm', ['run', 'build'], { cwd: panelDir, env: commandEnv, dryRun: args.dryRun });
    }

    const deployArgs = ['wrangler', 'pages', 'deploy', 'dist', '--project-name', args.projectName];
    if (args.branch) deployArgs.push('--branch', args.branch);
      
    runCommand('npx', deployArgs, { cwd: panelDir, env: commandEnv, dryRun: args.dryRun });
    console.log('\nadmin-panel 部署完成。');
  } finally {
    if (backup === null) {
      if (existsSync(envFilePath)) rmSync(envFilePath);
      console.log(`已清理临时构建配置：${envFilePath}`);
    } else {
      writeFileSync(envFilePath, backup, 'utf8');
      console.log(`已恢复原有构建配置：${envFilePath}`);
    }
  }
}

main().catch((error) => {
  console.error(`\n部署失败：${error.message}`);
  process.exit(1);
});
