# OS Hero Stable Releases

## Channels and Client Behavior

- Public target: Apple Silicon macOS 12 or later. Windows/Intel distribution is not part of this channel.
- Existing clients keep using `https://os-hero.github.io/updates/latest-mac.yml`.
- New immutable installer/ZIP/blockmap/checksum assets are hosted in `os-hero/os-hero` GitHub Releases. The Pages compatibility feed points to those exact assets; never change its URL in already installed clients.
- The app checks 7.5 seconds after startup (skipping successful checks within 15 minutes), every six hours after a successful check, and when due after wake/network recovery. One unref'ed main-process minute tick handles due checks without a hidden renderer. Failed checks/downloads retry after 15 minutes, one hour, then six hours; manual checks bypass cooldown.
- Automatic download defaults ON and can be disabled in Settings. Manual checks honor this preference, but neither a check nor a download restarts the app. Only an explicit Restart to Apply does so; normal Quit remains a quit. Popup dismissal never installs or quits.
- On macOS, a ZIP download alone is not readiness: wait for native Squirrel signature validation/staging. Keep checking newer releases with an update ready. Failed newer downloads retain a previously verified native-staged update. Only stable upgrades are accepted; prereleases/downgrades remain disabled.
- Before normal quit/update restart, capture all unsaved tray drafts and default to Continue Editing if confirmation is needed. Explicit discard never saves/equips a draft. Persist/pause expedition and flush gold before closing windows; a save failure aborts the restart/quit. No offline expedition credit or automatic resume is introduced.
- `settings.json` adds backward-compatible `autoDownloadUpdates` (default true). `update-state.json` stores only check/retry timestamps, failure count and the acknowledged app version. Last successful check is not overwritten by a failed attempt. Applied-version notice appears once when the popup is next opened. Do not put user content/credentials in update metadata.
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

This validates credentials, tests, builds arm64 DMG/ZIP without automatic publishing, signs/notarizes/staples, verifies Gatekeeper/signatures, byte-compares packaged source and runs isolated Electron QA directly from the signed ASAR. It then verifies artifact checksums, creates/publishes an immutable GitHub Release and commits/pushes the Pages feed and registry. Published assets are never overwritten. No Pages binary copies or unrelated archive deletions occur.

After publication is verified against the full public installer hashes, the command automatically runs `cleanup:local -- --apply`. It removes confirmed inactive OS Hero backup apps in `/Applications`, transient macOS/Windows build apps in this checkout and its primary checkout, and older installers/blockmaps in both scoped `release/` directories (including the original OS Hero/OS Boy filenames). Windows build identity is checked through its runtime ASAR metadata, not its folder name alone. The installed `/Applications/OS Hero.app`, latest installers, running apps, mounted installers, user records/data backups, updater staging/cache and source/assets/reports remain untouched. Removed macOS app copies are unregistered from Launch Services first. Rollback installers remain available as immutable GitHub Releases; do not accumulate `.app.backup-*` copies locally.

5. Wait for the website's `pages build and deployment` workflow. Fetch the public feed with a cache-busting query; verify version, absolute URLs, sizes and SHA-512 against downloaded artifacts. Test detection/download from a signed older build and latest-version behavior from the new build. A push alone is not deployment success.
6. Let the installed app apply the verified update through its existing guarded quit/restart policy. Do not force-restart a running user app or create another permanent app backup. A manual installation can use the verified ZIP/DMG when needed; preserve user data. Record release URL, source/tag, signature/notary result, feed verification, cleanup report, test results and residual risks in project deployment docs.

## Local Artifact Retention

`npm run cleanup:local` previews the exact candidates without deleting anything. `npm run cleanup:local -- --apply` requires the current stable version to be published and its immutable release metadata/hashes to match verified local installers. Every app's identifier/version/path and running state are rechecked. Symlink roots/bundles/installers, unfamiliar app IDs, newer copies and changed candidates are protected or rejected. Nothing scans/deletes Application Support, Downloads, Desktop, updater cache or arbitrary home directories.

Packaged QA creates disposable user profiles, not extra `.app` bundles. Profiles are removed by the runner even on failure. Build outputs should not be retained after successful release QA/publication. Do not restore deleted local builds by rebuilding a published version; download and verify its immutable public ZIP/DMG if recovery is required. For a feed-only retry after cleanup, recover the exact signed bundle temporarily from that verified ZIP, run existing verification/deploy gates and clean it again.

## Failure and Recovery

The 1.6.0 visual update changes the common four-frame motion to grounded CPU-linked Idle and refines existing equipment pixels without changing item IDs, ownership or user schemas. Every visible Hero consumes the cached main-process frame clock. The 39x26 background has matching 4px native-grid corners in UI and menu-bar representations; mask only the background before overlaying the full Hero. Retina enlarges only the finished Hero to 50x50 physical pixels inside the unchanged 78x52 scene. Keep explicit no-background transparency and original 1x dimensions.

The 1.5.0 background slot is additive within character schema v2. Its first write keeps a private pre-background copy at `backups/pixel-backgrounds/character.json`. A previous six-slot app ignores the new slot while preserving the other equipment; never roll back quests, gold or expedition records to undo this visual feature. Backgrounds are bundled starter items, not new reward entitlements. Public recovery still requires a higher corrective version, not changing published 1.4.x or 1.5.0 bytes.

For updater lifecycle changes, also run the real Squirrel test on macOS after building. It re-signs disposable copies with separate bundle IDs/profiles and serves a loopback feed; it never installs into `/Applications` or uses real user records. `OS_HERO_QA_BASELINE` must be an older-version signed fixture carrying the policy under test (build it before bumping the version). Both regular Quit and explicit Restart must replace the bundle and preserve data; only Restart may relaunch. Ownership/cleanup/results go to `review-artifacts/2026-10-06/native-*`. Existing local signing tools are used; no global installation or login item is added.

```sh
OS_HERO_QA_BASELINE=/absolute/path/to/older/OS\ Hero.app \
OS_HERO_QA_TARGET=/absolute/path/to/release/mac-arm64/OS\ Hero.app \
node scripts/qa-native-update.js
```

- No signing identity, notarization failure, mismatched version/hash, dirty website checkout, wrong repository or unpublished source tag: stop before changing the stable feed.
- A published GitHub Release with Pages still stale is recoverable by rerunning `npm run deploy:updates` with the same verified artifacts after correcting the Pages issue. Do not rebuild the same public version.
- If an issue is discovered after publication, ship a higher corrective version with the stable code. Lowering the feed cannot downgrade already-updated apps. For a local rollback, restore the previous bundle and the schema-compatible backup as required.
- Never silently downgrade the six-slot character schema. Existing v2 migration retains a pre-migration character backup. Test full old-to-new data preservation.
- Native pointer interaction on macOS and Windows hardware need explicit QA; programmatic menu-handler tests alone are not proof of physical OS-menu/picker behavior.
