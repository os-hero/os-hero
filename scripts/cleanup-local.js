const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const crypto = require("crypto");
const semver = require("semver");
const yaml = require("js-yaml");
const { validateRelease, RELEASE_REPO } = require("./release-feed");

const APP_ID = "com.themercenary.oshero";
const LSREGISTER = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
const exists = file => fs.existsSync(file);
const identity = file => {
  const stat = fs.lstatSync(file);
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
};
const plainPath = file => !fs.lstatSync(file).isSymbolicLink() && fs.realpathSync(file) === path.resolve(file);
const readMetadata = bundle => JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", path.join(bundle, "Contents/Info.plist")], { encoding: "utf8" }));
const runningExecutables = () => execFileSync("/bin/ps", ["-axo", "comm="], { encoding: "utf8" }).split("\n").map(line => line.trim()).filter(Boolean);
const runningBundle = (bundle, executables) => executables.some(file => file === bundle || file.startsWith(`${bundle}${path.sep}`));

function planCleanup({ applicationsDir, releaseDir, buildApps = [], version, metadata = readMetadata, executables = runningExecutables() }) {
  if (!semver.valid(version) || semver.prerelease(version)) throw Error("Cleanup requires a stable release version");
  const plan = { version, candidates: [], skipped: [], protected: [path.join(applicationsDir, "OS Hero.app")], roots: [applicationsDir, releaseDir] };
  for (const root of plan.roots) if (exists(root) && (!fs.lstatSync(root).isDirectory() || !plainPath(root))) throw Error(`Unsafe cleanup root: ${root}`);
  const apps = exists(applicationsDir) ? fs.readdirSync(applicationsDir).filter(name => /^OS Hero\.app\.backup-[\w.-]+$/.test(name)).map(name => path.join(applicationsDir, name)) : [];
  for (const bundle of [...apps, ...buildApps]) {
    if (!exists(bundle)) continue;
    try {
      const plist = path.join(bundle, "Contents/Info.plist");
      if (!plainPath(bundle) || !fs.lstatSync(bundle).isDirectory() || !plainPath(plist)) throw Error("symlink or unexpected bundle path");
      const meta = metadata(bundle);
      if (meta.CFBundleIdentifier !== APP_ID || !semver.valid(meta.CFBundleShortVersionString) || semver.gt(meta.CFBundleShortVersionString, version)) throw Error("unrecognized app identity or newer version");
      if (plan.protected.includes(bundle) || runningBundle(bundle, executables)) throw Error("installed or running app");
      plan.candidates.push({ path: bundle, kind: "app", version: meta.CFBundleShortVersionString, identity: identity(bundle), plistIdentity: identity(plist) });
    } catch (error) { plan.skipped.push({ path: bundle, reason: error.message }); }
  }
  if (exists(releaseDir)) for (const name of fs.readdirSync(releaseDir)) {
    const match = /^OS-Hero-(\d+\.\d+\.\d+)-arm64\.(dmg|zip)(\.blockmap)?$/.exec(name);
    if (!match || !semver.valid(match[1]) || !semver.lt(match[1], version)) continue;
    const file = path.join(releaseDir, name);
    if (!plainPath(file) || !fs.lstatSync(file).isFile()) { plan.skipped.push({ path: file, reason: "not a regular local installer" }); continue; }
    plan.candidates.push({ path: file, kind: "installer", version: match[1], identity: identity(file) });
  }
  return plan;
}

function applyCleanup(plan, { verifiedVersion, metadata = readMetadata, getExecutables = runningExecutables, inUse = file => spawnSync("/usr/sbin/lsof", ["-t", file], { encoding: "utf8" }).status !== 1, unregister = file => spawnSync(LSREGISTER, ["-u", file], { encoding: "utf8" }).status } = {}) {
  if (verifiedVersion !== plan.version) throw Error("Verify the published release before applying cleanup");
  const report = { version: plan.version, mode: "apply", removed: [], skipped: [...plan.skipped], protected: plan.protected };
  try {
  for (const candidate of plan.candidates) {
    const file = candidate.path;
    if (!exists(file)) continue;
    if (!plainPath(file) || identity(file) !== candidate.identity) throw Error(`Cleanup candidate changed: ${file}`);
    if (plan.protected.includes(file)) throw Error("Refusing to remove the installed app");
    if (candidate.kind === "app") {
      const meta = metadata(file);
      if (identity(path.join(file, "Contents/Info.plist")) !== candidate.plistIdentity || meta.CFBundleIdentifier !== APP_ID || meta.CFBundleShortVersionString !== candidate.version) throw Error(`App metadata changed: ${file}`);
      if (runningBundle(file, getExecutables())) { report.skipped.push({ path: file, reason: "app became active" }); continue; }
      const registrationStatus = unregister(file);
      if (registrationStatus !== 0) throw Error(`Could not unregister app copy: ${file}`);
    } else if (inUse(file)) { report.skipped.push({ path: file, reason: "installer is open or mounted" }); continue; }
    fs.rmSync(file, { recursive: candidate.kind === "app", force: false });
    report.removed.push({ path: file, kind: candidate.kind, version: candidate.version });
  }
  } catch (error) {
    report.error = error.message;
    error.cleanupReport = report;
    throw error;
  }
  return report;
}

async function verifyPublished(root, version) {
  const { info } = validateRelease(path.join(root, "release"), version);
  const release = JSON.parse(execFileSync("gh", ["release", "view", `v${version}`, "--repo", RELEASE_REPO, "--json", "isDraft,isPrerelease"], { encoding: "utf8" }));
  if (release.isDraft || release.isPrerelease) throw Error("Cleanup requires a published stable GitHub release");
  const response = await fetch(`https://github.com/${RELEASE_REPO}/releases/download/v${version}/latest-mac.yml`);
  if (!response.ok) throw Error(`Published release metadata unavailable: ${response.status}`);
  const remote = yaml.load(await response.text());
  if (remote.version !== version || remote.sha512 !== info.sha512 || JSON.stringify(remote.files) !== JSON.stringify(info.files)) throw Error("Published artifacts do not match the verified local release");
  const files = [];
  for (const file of info.files) {
    const download = await fetch(`https://github.com/${RELEASE_REPO}/releases/download/v${version}/${file.url}`, { signal: AbortSignal.timeout(120000) });
    if (!download.ok) throw Error(`Published installer unavailable: ${download.status}`);
    const digest = crypto.createHash("sha512");
    let size = 0;
    for await (const chunk of download.body) {
      size += chunk.length;
      if (size > file.size) throw Error(`Published installer exceeds verified size: ${file.url}`);
      digest.update(chunk);
    }
    const sha512 = digest.digest("base64");
    if (size !== file.size || sha512 !== file.sha512) throw Error(`Published installer hash mismatch: ${file.url}`);
    files.push({ name: file.url, size, sha512, passed: true });
  }
  return { version, files };
}

async function main() {
  if (process.platform !== "darwin") throw Error("Local app cleanup supports macOS only");
  if (process.argv.slice(2).some(arg => arg !== "--apply")) throw Error("Usage: npm run cleanup:local -- [--apply]");
  const root = path.resolve(__dirname, "..");
  const version = require(path.join(root, "package.json")).version;
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: root, encoding: "utf8" }).trim();
  const primary = path.dirname(path.resolve(root, common));
  const buildApps = [...new Set([root, primary])].map(repo => path.join(repo, "release/mac-arm64/OS Hero.app"));
  const plan = planCleanup({ applicationsDir: "/Applications", releaseDir: path.join(root, "release"), buildApps, version });
  const apply = process.argv.includes("--apply");
  const output = process.env.OS_HERO_CLEANUP_REPORT || path.join(root, "review-artifacts", new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }), `cleanup-${version}.json`);
  let report;
  try {
    if (apply) {
      const publication = await verifyPublished(root, version);
      report = applyCleanup(plan, { verifiedVersion: publication.version });
      report.publication = publication;
    } else report = { ...plan, mode: "dry-run" };
  } catch (error) {
    report = error.cleanupReport || { version, mode: "apply", removed: [], error: error.message };
    throw error;
  } finally {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ ...report, reportPath: output }, null, 2));
  }
}

module.exports = { planCleanup, applyCleanup };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
