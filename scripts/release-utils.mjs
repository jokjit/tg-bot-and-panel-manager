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
