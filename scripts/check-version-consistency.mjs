import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJson, repoRoot } from './release-utils.mjs';

const PACKAGE_PATHS = [
  'admin-panel/package.json',
  'electron-app/package.json',
  'mobile-app/package.json',
];

export function parseAndroidVersionConfig(source) {
  const text = String(source || '');
  const codeMatches = [...text.matchAll(/^\s*versionCode\s+(\d+)\s*$/gm)];
  const nameMatches = [...text.matchAll(/^\s*versionName\s+["']([^"']+)["']\s*$/gm)];
  if (codeMatches.length !== 1 || nameMatches.length !== 1) {
    throw new Error('Android build.gradle must define exactly one versionCode and versionName');
  }
  return {
    versionCode: Number(codeMatches[0][1]),
    versionName: nameMatches[0][1].trim(),
  };
}

function assertSemanticVersion(version, source) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version || ''))) {
    throw new Error(`${source} has invalid semantic version: ${version || '(empty)'}`);
  }
}

export function assertReleaseTagVersion(tag, version) {
  const releaseTag = String(tag || '').trim();
  const expectedTag = `v${String(version || '').trim()}`;
  if (!releaseTag) {
    throw new Error('Release tag is required');
  }
  if (releaseTag !== expectedTag) {
    throw new Error(`Release tag ${releaseTag} differs from application version ${expectedTag}`);
  }
  return releaseTag;
}

function readLockVersion(packagePath) {
  const lockPath = packagePath.replace(/package\.json$/, 'package-lock.json');
  const lock = readJson(lockPath);
  return String(lock?.packages?.['']?.version || lock?.version || '').trim();
}

export function assertVersionConsistency() {
  const versions = PACKAGE_PATHS.map((packagePath) => {
    const version = String(readJson(packagePath).version || '').trim();
    assertSemanticVersion(version, packagePath);
    const lockVersion = readLockVersion(packagePath);
    if (lockVersion !== version) {
      throw new Error(`${packagePath} version ${version} differs from its lockfile version ${lockVersion || '(empty)'}`);
    }
    return { packagePath, version };
  });

  const expectedVersion = versions[0].version;
  const mismatches = versions.filter((item) => item.version !== expectedVersion);
  if (mismatches.length > 0) {
    throw new Error(`Application versions differ: ${versions.map((item) => `${item.packagePath}=${item.version}`).join(', ')}`);
  }

  const gradlePath = join(repoRoot, 'mobile-app', 'android', 'app', 'build.gradle');
  const android = parseAndroidVersionConfig(readFileSync(gradlePath, 'utf8'));
  if (android.versionName !== expectedVersion) {
    throw new Error(`Android versionName ${android.versionName} differs from application version ${expectedVersion}`);
  }
  if (!(Number.isInteger(android.versionCode) && android.versionCode > 0)) {
    throw new Error(`Android versionCode must be a positive integer: ${android.versionCode}`);
  }

  return { version: expectedVersion, versionCode: android.versionCode };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = assertVersionConsistency();
  const releaseTag = String(process.env.RELEASE_TAG || '').trim();
  if (releaseTag) assertReleaseTagVersion(releaseTag, result.version);
  console.log(`Versions OK: ${result.version} (Android versionCode ${result.versionCode})`);
}
