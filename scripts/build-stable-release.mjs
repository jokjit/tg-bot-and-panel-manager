import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertWindowsCodeSigningReady,
  commandName,
  readJson,
  releaseDirForVersion,
  repoRoot,
  run,
  sha256,
} from './release-utils.mjs';

const version = readJson('electron-app/package.json').version;
const mobileVersion = readJson('mobile-app/package.json').version;
if (version !== mobileVersion) {
  throw new Error(`Release versions differ: electron=${version}, mobile=${mobileVersion}`);
}

const releaseDir = releaseDirForVersion(version);
mkdirSync(releaseDir, { recursive: true });

assertWindowsCodeSigningReady();
run(commandName('npm'), ['--prefix', 'electron-app', 'run', 'build']);

const installerSource = join(repoRoot, 'electron-app', 'dist', 'tg-bot-deploy-setup.exe');
const blockmapSource = `${installerSource}.blockmap`;
const installerTarget = join(releaseDir, 'tg-bot-deploy-setup.exe');
const blockmapTarget = `${installerTarget}.blockmap`;
copyFileSync(installerSource, installerTarget);
copyFileSync(blockmapSource, blockmapTarget);

console.log(`Windows installer: ${installerTarget}`);
console.log(`Size: ${statSync(installerTarget).size}`);
console.log(`SHA256: ${sha256(installerTarget)}`);

run(process.execPath, [join(repoRoot, 'scripts', 'build-mobile-release.mjs')]);
run(process.execPath, [join(repoRoot, 'scripts', 'verify-release-signatures.mjs')]);
