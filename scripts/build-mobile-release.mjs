import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  commandName,
  readJson,
  releaseDirForVersion,
  repoRoot,
  run,
  sha256,
  verifyAndroidApkSignature,
} from './release-utils.mjs';

const version = readJson('mobile-app/package.json').version;
const releaseDir = releaseDirForVersion(version);
const androidDir = join(repoRoot, 'mobile-app', 'android');
const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const apkSource = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const apkTarget = join(releaseDir, `tg-bot-mobile-deploy-v${version}.apk`);

run(commandName('npm'), ['--prefix', 'mobile-app', 'run', 'build']);
run(commandName('npm'), ['--prefix', 'mobile-app', 'run', 'cap:sync']);
run(process.platform === 'win32' ? join(androidDir, gradleCommand) : gradleCommand, ['assembleRelease'], {
  cwd: androidDir,
});

mkdirSync(releaseDir, { recursive: true });
copyFileSync(apkSource, apkTarget);
verifyAndroidApkSignature(apkTarget);

const apkStat = statSync(apkTarget);
console.log(`Android release APK: ${apkTarget}`);
console.log(`Size: ${apkStat.size}`);
console.log(`SHA256: ${sha256(apkTarget)}`);
