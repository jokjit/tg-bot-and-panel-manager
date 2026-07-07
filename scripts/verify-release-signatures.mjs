import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  readJson,
  releaseDirForVersion,
  sha256,
  verifyAndroidApkSignature,
  verifyWindowsSignature,
} from './release-utils.mjs';

const electronVersion = readJson('electron-app/package.json').version;
const mobileVersion = readJson('mobile-app/package.json').version;

if (electronVersion !== mobileVersion) {
  throw new Error(`Release versions differ: electron=${electronVersion}, mobile=${mobileVersion}`);
}

const releaseDir = releaseDirForVersion(electronVersion);
const windowsInstaller = join(releaseDir, 'tg-bot-deploy-setup.exe');
const androidApk = join(releaseDir, `tg-bot-mobile-deploy-v${mobileVersion}.apk`);

for (const artifact of [windowsInstaller, androidApk]) {
  if (!existsSync(artifact)) {
    throw new Error(`Missing release artifact: ${artifact}`);
  }
}

verifyWindowsSignature(windowsInstaller);
verifyAndroidApkSignature(androidApk);

for (const artifact of [windowsInstaller, androidApk]) {
  console.log(`${artifact}`);
  console.log(`Size: ${statSync(artifact).size}`);
  console.log(`SHA256: ${sha256(artifact)}`);
}
