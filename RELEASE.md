# Release Process

Stable releases must use a new version number and only publish signed artifacts.

## Versioning

Update every app package before publishing a stable release:

- `admin-panel/package.json`
- `electron-app/package.json`
- `mobile-app/package.json`
- `mobile-app/android/app/build.gradle` (`versionCode` and `versionName`)

Use patch versions for compatible fixes and optimizations, minor versions for new user-facing features, and major versions for breaking changes.

## Windows Signing

Windows stable installers must pass Authenticode verification.

Configure one of the following before building:

```powershell
$env:CSC_LINK = "C:\path\to\code-signing-cert.pfx"
$env:CSC_KEY_PASSWORD = "pfx-password"
```

or install a Code Signing certificate into the Windows certificate store.

Check readiness:

```powershell
npm run check:windows-signing
```

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

Build only the signed Android APK:

```powershell
npm run build:mobile:release
```

Build all stable artifacts and enforce signatures:

```powershell
npm run build:stable
```

Verify release artifacts after building:

```powershell
npm run verify:release-signatures
```

`build:stable` and `verify:release-signatures` fail if the Windows installer is unsigned or the Android APK signature is invalid.
