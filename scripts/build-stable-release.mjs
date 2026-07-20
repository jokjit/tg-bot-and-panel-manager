import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  commandName,
  releaseDirForVersion,
  repoRoot,
  run,
  sha256,
} from './release-utils.mjs';
import { assertVersionConsistency } from './check-version-consistency.mjs';

const { version } = assertVersionConsistency();

const releaseDir = releaseDirForVersion(version);
mkdirSync(releaseDir, { recursive: true });

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
