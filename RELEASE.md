# Release Process

Stable releases must use a new version number. Android artifacts must be signed before publishing.

## Versioning

Update every app package before publishing a stable release:

- `admin-panel/package.json`
- `electron-app/package.json`
- `mobile-app/package.json`
- `mobile-app/android/app/build.gradle` (`versionCode` and `versionName`)

Use patch versions for compatible fixes and optimizations, minor versions for new user-facing features, and major versions for breaking changes.

## Windows Desktop

Windows desktop installers do not require code signing for stable releases. Publish the installer produced by the stable build.

## Android Signing

Android release APKs must pass `apksigner verify`.

The Android project reads signing credentials from:

```text
mobile-app/android/keystore/release-v2.3.credentials.txt
```

Expected keys:

```text
KEYSTORE_PATH=C:/absolute/path/to/release.keystore
STORE_PASS=...
ALIAS=...
```

The keystore directory is ignored by Git.

## Build Commands

Validate package, lockfile, and Android versions:

```powershell
npm run check:versions
```

Build only the signed Android APK:

```powershell
npm run build:mobile:release
```

Build all stable artifacts and enforce the Android signature:

```powershell
npm run build:stable
```

Verify release artifacts after building:

```powershell
npm run verify:release-signatures
```

`build:stable` and `verify:release-signatures` fail if the Android APK signature is invalid or any expected artifact is missing.
