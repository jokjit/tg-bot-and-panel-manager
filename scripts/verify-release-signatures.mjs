import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  releaseDirForVersion,
  sha256,
  verifyAndroidApkSignature,
} from './release-utils.mjs';
import { assertVersionConsistency } from './check-version-consistency.mjs';

const { version } = assertVersionConsistency();
const releaseDir = releaseDirForVersion(version);
const windowsInstaller = join(releaseDir, 'tg-bot-deploy-setup.exe');
const windowsBlockmap = `${windowsInstaller}.blockmap`;
const androidApk = join(releaseDir, `tg-bot-mobile-deploy-v${version}.apk`);

for (const artifact of [windowsInstaller, windowsBlockmap, androidApk]) {
  if (!existsSync(artifact)) {
    throw new Error(`Missing release artifact: ${artifact}`);
  }
}

verifyAndroidApkSignature(androidApk);
console.log('Windows installer signature: skipped by release policy');

for (const artifact of [windowsInstaller, windowsBlockmap, androidApk]) {
  console.log(`${artifact}`);
  console.log(`Size: ${statSync(artifact).size}`);
  console.log(`SHA256: ${sha256(artifact)}`);
}
