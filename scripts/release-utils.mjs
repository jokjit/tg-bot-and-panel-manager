import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[\s"&<>|^]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function run(command, args = [], options = {}) {
  const useCmdWrapper =
    process.platform === 'win32' && options.shell === undefined && /\.(cmd|bat)$/i.test(command);
  const spawnCommand = useCmdWrapper ? 'cmd.exe' : command;
  const spawnArgs = useCmdWrapper
    ? ['/d', '/c', [command, ...args].map(quoteWindowsArg).join(' ')]
    : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: options.cwd || repoRoot,
    stdio: options.stdio || 'inherit',
    shell: options.shell ?? false,
    windowsHide: true,
    encoding: options.encoding || 'utf8',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return result;
}

export function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'));
}

export function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function releaseDirForVersion(version) {
  return join(repoRoot, 'release-packages', `v${version}`);
}

function readAndroidSdkFromLocalProperties() {
  const localPropertiesPath = join(repoRoot, 'mobile-app', 'android', 'local.properties');
  if (!existsSync(localPropertiesPath)) return '';
  const line = readFileSync(localPropertiesPath, 'utf8')
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith('sdk.dir='));
  if (!line) return '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/\\/g, '/');
}

export function findAndroidSdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    readAndroidSdkFromLocalProperties(),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '',
  ].filter(Boolean);
  return candidates.find((item) => existsSync(item)) || '';
}

export function findApkSigner() {
  const sdkRoot = findAndroidSdkRoot();
  if (!sdkRoot) return '';
  const buildToolsRoot = join(sdkRoot, 'build-tools');
  if (!existsSync(buildToolsRoot)) return '';
  const fileName = process.platform === 'win32' ? 'apksigner.bat' : 'apksigner';
  const versions = readdirSync(buildToolsRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const version of versions) {
    const candidate = join(buildToolsRoot, version, fileName);
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

export function verifyAndroidApkSignature(apkPath) {
  const apkSigner = findApkSigner();
  if (!apkSigner) {
    throw new Error('apksigner not found. Install Android SDK build-tools or set ANDROID_HOME.');
  }
  run(apkSigner, ['verify', '--verbose', apkPath]);
}

export function verifyWindowsSignature(exePath) {
  if (process.platform !== 'win32') {
    throw new Error('Windows signature verification requires Windows and PowerShell.');
  }
  const escapedPath = String(exePath).replace(/'/g, "''");
  const script = [
    `$sig = Get-AuthenticodeSignature -LiteralPath '${escapedPath}'`,
    'Write-Output $sig.Status',
    'if ($sig.Status -ne "Valid") { exit 1 }',
  ].join('; ');
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    stdio: 'inherit',
  });
}

function getWindowsCodeSigningCertStoreCount() {
  if (process.platform !== 'win32') return 0;
  const script = [
    '$current = @(Get-ChildItem Cert:\\CurrentUser\\My -CodeSigningCert -ErrorAction SilentlyContinue).Count',
    '$local = @(Get-ChildItem Cert:\\LocalMachine\\My -CodeSigningCert -ErrorAction SilentlyContinue).Count',
    'Write-Output ($current + $local)',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: repoRoot,
    stdio: 'pipe',
    shell: false,
    windowsHide: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) return 0;
  const count = Number(String(result.stdout || '').trim());
  return Number.isFinite(count) ? count : 0;
}

export function getWindowsCodeSigningStatus() {
  const cscLink = String(process.env.CSC_LINK || '').trim();
  const cscPassword = String(process.env.CSC_KEY_PASSWORD || '').trim();
  if (cscLink && cscPassword) {
    return { ready: true, source: 'CSC_LINK' };
  }
  if (cscLink && !cscPassword) {
    return { ready: false, source: 'CSC_LINK', reason: 'CSC_KEY_PASSWORD is missing' };
  }

  const certStoreCount = getWindowsCodeSigningCertStoreCount();
  if (certStoreCount > 0) {
    return { ready: true, source: 'Windows certificate store' };
  }

  return {
    ready: false,
    source: 'none',
    reason: 'No CSC_LINK/CSC_KEY_PASSWORD pair and no Windows Code Signing certificate found',
  };
}

export function assertWindowsCodeSigningReady() {
  const status = getWindowsCodeSigningStatus();
  if (!status.ready) {
    throw new Error(
      `Windows code signing is not configured: ${status.reason}. Configure CSC_LINK + CSC_KEY_PASSWORD or install a Code Signing certificate.`,
    );
  }
  console.log(`Windows code signing: ${status.source}`);
  return status;
}
