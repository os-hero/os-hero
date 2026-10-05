# OS Hero Stable Releases

## Channels and Client Behavior

- Public target: Apple Silicon macOS 12 or later. Windows/Intel distribution is not part of this channel.
- Existing clients keep using `https://os-hero.github.io/updates/latest-mac.yml`.
- New immutable installer/ZIP/blockmap/checksum assets are hosted in `os-hero/os-hero` GitHub Releases. The Pages compatibility feed points to those exact assets; never change its URL in already installed clients.
- The app checks at startup and every six hours, downloads stable upgrades in the background, and installs on normal app quit or explicit restart. It does not force a restart during use. Prereleases/downgrades are disabled. Offline errors retry at the next check or through Settings.
- The previous public 1.2.0 ZIP was ad-hoc signed (no TeamIdentifier). Those installations may need one manual installation of the Developer ID-signed release before signature-validated automatic updates work. Do not weaken signature verification. Preserve `~/Library/Application Support/OS Hero`.

## One-Time Local Credentials

Use Node 22.12+ (`nvm use`), Xcode command-line tools, GitHub CLI login with repository write access, and a valid Developer ID Application certificate in the local keychain. No production npm dependency is added for releases; YAML/semantic-version tooling is pinned in devDependencies.

Create an app-specific password in the developer's Apple Account, then enter it at the secure terminal prompt (never in source, shell arguments, logs or chat):

```sh
xcrun notarytool store-credentials "oshero-notary" --apple-id "YOUR_DEVELOPER_EMAIL" --team-id "YOUR_TEAM_ID"
```

The profile name is only a reference to the keychain credential, not a secret. Do not export the certificate/private key to GitHub just to automate this local workflow. GitHub Actions runs source/unit/native-compile checks without signing credentials; signed release publication runs locally with the existing keychain.

## Release Procedure

1. Update package.json/package-lock.json to a strictly newer stable version and add localized `releases/VERSION.json` notes. Never overwrite 1.2.0 with new bytes.
2. Run `npm test` and `npm run test:electron`. Review the UI and any data migration changes. Commit only intended source/tests/docs. Push the commit, create a lightweight `vVERSION` tag at that exact commit, and push the tag. CI must pass. Do not tag the unrelated experimental prototype checkout.
3. Keep the website checkout clean and current. It must be `https://github.com/os-hero/os-hero.github.io.git`, with the release-registry capable app.js and releases.json.
4. Run the fail-closed release command:

```sh
APPLE_KEYCHAIN_PROFILE=oshero-notary \
OS_HERO_PAGES_DIR=/absolute/path/to/os-hero.github.io \
npm run release:mac
```

This validates credentials, tests, builds arm64 DMG/ZIP without automatic publishing, signs/notarizes/staples, verifies Gatekeeper/signatures and artifact checksums, creates a draft GitHub Release, uploads all assets, publishes it, then commits/pushes the Pages feed and registry. Published assets are never overwritten; a retry verifies an existing public release before advancing Pages. No Pages binary copies or unrelated archive deletions occur.

5. Wait for the website's `pages build and deployment` workflow. Fetch the public feed with a cache-busting query; verify version, absolute URLs, sizes and SHA-512 against downloaded artifacts. Test detection/download from a signed older build and latest-version behavior from the new build. A push alone is not deployment success.
6. Install the verified app locally after an app/data backup. Record release URL, source/tag, signature/notary result, feed verification, test results and residual risks in project deployment docs.

## Failure and Recovery

- No signing identity, notarization failure, mismatched version/hash, dirty website checkout, wrong repository or unpublished source tag: stop before changing the stable feed.
- A published GitHub Release with Pages still stale is recoverable by rerunning `npm run deploy:updates` with the same verified artifacts after correcting the Pages issue. Do not rebuild the same public version.
- If an issue is discovered after publication, ship a higher corrective version with the stable code. Lowering the feed cannot downgrade already-updated apps. For a local rollback, restore the previous bundle and the schema-compatible backup as required.
- Never silently downgrade the six-slot character schema. Existing v2 migration retains a pre-migration character backup. Test full old-to-new data preservation.
- Native pointer interaction on macOS and Windows hardware need explicit QA; programmatic menu-handler tests alone are not proof of physical OS-menu/picker behavior.
