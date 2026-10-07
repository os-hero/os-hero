const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { planCleanup, applyCleanup } = require("../scripts/cleanup-local");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oshero-cleanup-test-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const apps = path.join(root, "Applications"), release = path.join(root, "release");
  fs.mkdirSync(apps); fs.mkdirSync(release);
  const metadata = bundle => JSON.parse(fs.readFileSync(path.join(bundle, "Contents/Info.plist")));
  const app = (name, version = "1.2.0", id = "com.themercenary.oshero") => {
    const dir = path.join(apps, name); fs.mkdirSync(path.join(dir, "Contents"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Contents/Info.plist"), JSON.stringify({ CFBundleIdentifier: id, CFBundleShortVersionString: version }));
    return dir;
  };
  const options = { applicationsDir: apps, releaseDir: release, version: "1.5.1", metadata, executables: [] };
  const apply = plan => applyCleanup(plan, { verifiedVersion: "1.5.1", metadata, getExecutables: () => [], inUse: () => false, unregister: () => 0 });
  return { root, apps, release, metadata, app, options, apply };
}

test("cleanup preview selects only confirmed app copies and older generated installers", t => {
  const f = fixture(t);
  const installed = f.app("OS Hero.app", "1.5.0");
  const old = f.app("OS Hero.app.backup-20261005-before-wardrobe");
  const other = f.app("OS Hero.app.backup-other", "1.2.0", "org.example.other");
  const newer = f.app("OS Hero.app.backup-newer", "1.6.0");
  const files = ["OS-Hero-1.5.0-arm64.zip", "OS-Hero-1.5.0-arm64.dmg.blockmap", "OS-Hero-1.5.1-arm64.zip", "OS-Hero-1.6.0-arm64.dmg", "artwork.zip", "latest-mac.yml"];
  for (const name of files) fs.writeFileSync(path.join(f.release, name), "fixture");
  const plan = planCleanup(f.options);
  assert.deepEqual(plan.candidates.map(item => path.basename(item.path)).sort(), [path.basename(old), files[0], files[1]].sort());
  assert.equal(plan.skipped.length, 2);
  assert.ok(plan.protected.includes(installed));
  for (const file of [installed, old, other, newer, ...files.map(name => path.join(f.release, name))]) assert.ok(fs.existsSync(file));
});

test("cleanup requires publication verification and preserves installed app and user data", t => {
  const f = fixture(t);
  const installed = f.app("OS Hero.app", "1.5.0");
  const old = f.app("OS Hero.app.backup-20261005-before-wardrobe");
  const data = path.join(f.root, "Application Support"); fs.mkdirSync(data);
  const ledger = path.join(data, "character.json"); fs.writeFileSync(ledger, "preserve");
  fs.symlinkSync(data, path.join(old, "Contents/user-data-link"));
  const plan = planCleanup(f.options);
  assert.throws(() => applyCleanup(plan, { verifiedVersion: "1.5.0" }), /Verify/);
  assert.ok(fs.existsSync(old));
  const report = f.apply(plan);
  assert.equal(report.removed.length, 1);
  assert.ok(!fs.existsSync(old));
  assert.ok(fs.existsSync(installed));
  assert.equal(fs.readFileSync(ledger, "utf8"), "preserve");
});

test("cleanup never follows symlink bundles, roots, metadata or installer files", t => {
  const f = fixture(t);
  const real = f.app("OS Hero.app", "1.5.0");
  const link = path.join(f.apps, "OS Hero.app.backup-linked"); fs.symlinkSync(real, link);
  const old = f.app("OS Hero.app.backup-linked-plist");
  fs.rmSync(path.join(old, "Contents/Info.plist"));
  fs.symlinkSync(path.join(real, "Contents/Info.plist"), path.join(old, "Contents/Info.plist"));
  const file = path.join(f.release, "OS-Hero-1.2.0-arm64.zip"); fs.symlinkSync(path.join(real, "Contents/Info.plist"), file);
  const plan = planCleanup(f.options);
  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.skipped.length, 3);
  const rootLink = path.join(f.root, "linked-root"); fs.symlinkSync(f.release, rootLink);
  assert.throws(() => planCleanup({ ...f.options, releaseDir: rootLink }), /Unsafe/);
});

test("cleanup protects active apps both when planning and immediately before deletion", t => {
  const f = fixture(t);
  const old = f.app("OS Hero.app.backup-running");
  const executable = path.join(old, "Contents/MacOS/OS Hero");
  assert.equal(planCleanup({ ...f.options, executables: [executable] }).candidates.length, 0);
  const plan = planCleanup(f.options);
  const report = applyCleanup(plan, { verifiedVersion: "1.5.1", metadata: f.metadata, getExecutables: () => [executable], unregister: () => { throw Error("must not unregister"); } });
  assert.equal(report.removed.length, 0); assert.equal(report.skipped[0].reason, "app became active");
  assert.ok(fs.existsSync(old));
});

test("cleanup rejects a changed bundle and never removes mounted installers", t => {
  const f = fixture(t);
  const old = f.app("OS Hero.app.backup-changed");
  const plan = planCleanup(f.options);
  fs.writeFileSync(path.join(old, "Contents/Info.plist"), JSON.stringify({ CFBundleIdentifier: "org.example.other", CFBundleShortVersionString: "1.2.0" }));
  assert.throws(() => f.apply(plan), /metadata changed/);
  assert.ok(fs.existsSync(old));
  fs.rmSync(old, { recursive: true });
  const file = path.join(f.release, "OS-Hero-1.5.0-arm64.dmg"); fs.writeFileSync(file, "fixture");
  const next = planCleanup(f.options);
  const report = applyCleanup(next, { verifiedVersion: "1.5.1", inUse: () => true });
  assert.equal(report.removed.length, 0); assert.ok(fs.existsSync(file));
});

test("cleanup stops before deleting an app if exact Launch Services unregister fails", t => {
  const f = fixture(t);
  const old = f.app("OS Hero.app.backup-registration");
  const plan = planCleanup(f.options);
  assert.throws(() => applyCleanup(plan, { verifiedVersion: "1.5.1", metadata: f.metadata, getExecutables: () => [], unregister: () => 1 }), /unregister/);
  assert.ok(fs.existsSync(old));
});

test("cleanup retains an accurate audit report if a later removal fails", t => {
  const f = fixture(t);
  const first = f.app("OS Hero.app.backup-first");
  const second = f.app("OS Hero.app.backup-second");
  const plan = planCleanup(f.options);
  let calls = 0;
  assert.throws(() => applyCleanup(plan, { verifiedVersion: "1.5.1", metadata: f.metadata, getExecutables: () => [], unregister: () => ++calls === 1 ? 0 : 1 }), error => {
    assert.equal(error.cleanupReport.removed.length, 1);
    assert.equal(error.cleanupReport.removed[0].path, first);
    assert.match(error.cleanupReport.error, /unregister/);
    return true;
  });
  assert.ok(!fs.existsSync(first));
  assert.ok(fs.existsSync(second));
});
