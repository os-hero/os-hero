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

This validates credentials, tests, builds arm64 DMG/ZIP without automatic publishing, signs/notarizes/staples, verifies Gatekeeper/signatures and artifact checksums, creates a draft GitHub Release, uploads all assets, publishes it, then commits/pushes the Pages feed and registry. Published assets are never overwritten; a retry verifies an existing public release before advancing Pages. No Pages binary copies or unrelated archive deletions occur.

5. Wait for the website's `pages build and deployment` workflow. Fetch the public feed with a cache-busting query; verify version, absolute URLs, sizes and SHA-512 against downloaded artifacts. Test detection/download from a signed older build and latest-version behavior from the new build. A push alone is not deployment success.
6. Install the verified app locally after an app/data backup. Record release URL, source/tag, signature/notary result, feed verification, test results and residual risks in project deployment docs.

## Failure and Recovery

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
