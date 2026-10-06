const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { UpdateManager, UPDATE_CHECK_INTERVAL_MS, STARTUP_COOLDOWN_MS, RETRY_DELAYS_MS, resolveUpdateFeedUrl } = require("../src/main/updater");
const { normalizeSettings } = require("../src/shared/catalog");

function fixture(options = {}) {
  const updater = new EventEmitter();
  const calls = { checks: 0, downloads: 0, installs: 0, intervals: 0, cleared: 0, prepared: 0 };
  let now = 1800000000000, online = true, automatic = options.automatic !== false;
  let version = "1.3.1", metadata = options.saved || {};
  updater.setFeedURL = config => { calls.feed = config; };
  updater.checkForUpdates = async () => { calls.checks++; updater.emit("checking-for-update"); updater.emit("update-available", { version }); };
  updater.downloadUpdate = async () => {
    calls.downloads++;
    updater.emit("update-downloaded", { version });
    if (options.native) updater.nativeUpdater.emit("update-downloaded");
  };
  updater.quitAndInstall = () => { calls.installs++; };
  if (options.native) updater.nativeUpdater = new EventEmitter();
  const timers = {
    setInterval(callback, ms) { calls.intervals++; calls.tick = callback; calls.ms = ms; return { unref() {} }; },
    clearInterval() { calls.cleared++; }, setTimeout(callback) { calls.timeout = callback; return 1; }, clearTimeout() {}
  };
  const app = { isPackaged: options.packaged !== false, getVersion: () => "1.3.0", getAppPath: () => path.resolve(__dirname, "..") };
  const manager = new UpdateManager({ app, autoUpdater: updater, notifyState() {}, timers,
    now: () => now, isOnline: () => online, getAutoDownload: () => automatic,
    readMetadata: () => metadata, writeMetadata: value => { metadata = { ...value }; },
    beforeInstall: async () => { calls.prepared++; return options.prepare ? options.prepare() : true; }
  });
  return { app, manager, updater, calls, saved: () => metadata, advance: ms => { now += ms; },
    setVersion: value => { version = value; }, setOnline: value => { online = value; }, setAutomatic: value => { automatic = value; } };
}

test("stable legacy channel and default-ON preference survive old settings", () => {
  const { app, updater, calls } = fixture();
  assert.equal(resolveUpdateFeedUrl(app), "https://os-hero.github.io/updates/");
  assert.equal(calls.feed.useMultipleRangeRequest, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(normalizeSettings({}, "1.3.1").autoDownloadUpdates, true);
  assert.equal(normalizeSettings({ autoDownloadUpdates: false }, "1.3.1").autoDownloadUpdates, false);
});
test("startup downloads once, never restarts and keeps checking after a ready update", async () => {
  const f = fixture();
  await Promise.all([f.manager.checkAtLaunch(), f.manager.checkAtLaunch()]);
  assert.equal(f.calls.checks, 1); assert.equal(f.calls.downloads, 1); assert.equal(f.calls.installs, 0);
  assert.equal(f.calls.intervals, 1);
  await f.manager.checkManually();
  assert.equal(f.calls.checks, 2); assert.equal(f.calls.downloads, 1);
  f.setVersion("1.3.2"); f.advance(UPDATE_CHECK_INTERVAL_MS);
  await f.manager.checkIfDue();
  assert.equal(f.manager.state.readyVersion, "1.3.2"); assert.equal(f.calls.downloads, 2);
  f.manager.stop(); f.manager.stop(); assert.equal(f.calls.cleared, 1);
});
test("manual check honors automatic download OFF; download never installs", async () => {
  const f = fixture({ automatic: false });
  await f.manager.checkManually();
  assert.equal(f.manager.state.status, "available"); assert.equal(f.calls.downloads, 0);
  await f.manager.downloadUpdate();
  assert.equal(f.manager.state.status, "downloaded"); assert.equal(f.calls.installs, 0);
});
test("only explicit restart applies once after durable-save preparation", async () => {
  const f = fixture(); await f.manager.checkAtLaunch();
  await Promise.all([f.manager.installDownloadedUpdate(), f.manager.installDownloadedUpdate()]);
  await f.manager.installDownloadedUpdate();
  assert.equal(f.calls.prepared, 1); assert.equal(f.calls.installs, 1);
});
test("cancelling unsaved changes prevents restart and retains prepared update", async () => {
  const f = fixture({ prepare: () => false }); await f.manager.checkAtLaunch();
  await f.manager.installDownloadedUpdate();
  assert.equal(f.calls.installs, 0); assert.equal(f.manager.state.status, "downloaded");
});
test("save failure blocks restart and can be retried", async () => {
  let fail = true;
  const f = fixture({ prepare: () => { if (fail) throw Error("disk full"); return true; } });
  await f.manager.checkAtLaunch(); await f.manager.installDownloadedUpdate();
  assert.equal(f.calls.installs, 0); assert.equal(f.manager.state.error, "update.saveFailed");
  fail = false; await f.manager.installDownloadedUpdate(); assert.equal(f.calls.installs, 1);
});
test("recent successful launch checks are skipped but manual checks bypass cooldown", async () => {
  const f = fixture({ saved: { lastSuccess: 1800000000000 - 1000 } });
  await f.manager.checkAtLaunch(); assert.equal(f.calls.checks, 0);
  await f.manager.checkManually(); assert.equal(f.calls.checks, 1);
  f.advance(STARTUP_COOLDOWN_MS); await f.manager.checkIfDue(); assert.equal(f.calls.checks, 1);
  f.advance(UPDATE_CHECK_INTERVAL_MS); await f.manager.checkIfDue(); assert.equal(f.calls.checks, 2);
});
test("failures retry at 15 minutes, one hour, six hours without claiming latest", async () => {
  const f = fixture();
  f.updater.checkForUpdates = async () => { f.calls.checks++; throw Error("offline"); };
  await f.manager.checkAtLaunch();
  assert.equal(f.manager.state.status, "error"); assert.equal(f.manager.state.lastCheckedAt, null);
  for (const delay of RETRY_DELAYS_MS) {
    const before = f.calls.checks;
    f.advance(delay - 1); await f.manager.checkIfDue(); assert.equal(f.calls.checks, before);
    f.advance(1); await f.manager.checkIfDue(); assert.equal(f.calls.checks, before + 1);
  }
  assert.ok(f.saved().retryAt);
});
test("network recovery checks when overdue without waking a renderer", async () => {
  const f = fixture(); await f.manager.checkAtLaunch();
  f.setOnline(false); f.advance(UPDATE_CHECK_INTERVAL_MS); await f.manager.checkIfDue(); assert.equal(f.calls.checks, 1);
  f.setOnline(true); await f.manager.checkIfDue(); assert.equal(f.calls.checks, 2);
});
test("failed newer download retains previously native-verified version", async () => {
  const f = fixture({ native: true }); await f.manager.checkAtLaunch();
  f.setVersion("1.3.2"); f.updater.downloadUpdate = async () => { throw Error("network"); };
  await f.manager.checkManually();
  assert.equal(f.manager.state.readyVersion, "1.3.1"); assert.equal(f.manager.state.latestVersion, "1.3.2");
  assert.equal(f.manager.state.error, "update.downloadFailed");
});
test("native signature/staging must finish before ready or install is permitted", async () => {
  const f = fixture({ native: true });
  f.updater.downloadUpdate = async () => { f.updater.emit("update-downloaded", { version: "1.3.1" }); };
  const task = f.manager.checkAtLaunch();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.manager.state.status, "verifying"); assert.equal(f.manager.state.readyVersion, null);
  await f.manager.installDownloadedUpdate(); assert.equal(f.calls.installs, 0);
  f.updater.nativeUpdater.emit("update-downloaded"); await task;
  assert.equal(f.manager.state.status, "downloaded");
});
test("native signature error never marks candidate ready", async () => {
  const f = fixture({ native: true });
  f.updater.downloadUpdate = async () => { f.updater.emit("update-downloaded", { version: "1.3.1" }); f.updater.emit("error", Error("bad signature")); };
  await f.manager.checkAtLaunch(); assert.equal(f.manager.state.readyVersion, null);
  assert.equal(f.manager.state.status, "error");
});
test("parallel checks and downloads are deduplicated", async () => {
  const f = fixture(); let release;
  f.updater.checkForUpdates = () => { f.calls.checks++; return new Promise(resolve => { release = resolve; }); };
  const a = f.manager.checkForUpdates(), b = f.manager.checkForUpdates();
  f.updater.emit("update-available", { version: "1.3.1" }); release(); await Promise.all([a, b]);
  assert.equal(f.calls.checks, 1);
  await Promise.all([f.manager.downloadUpdate(), f.manager.downloadUpdate()]); assert.equal(f.calls.downloads, 1);
});
test("development launch does not check and applied notification is acknowledged once", async () => {
  const f = fixture({ packaged: false, saved: { seenVersion: "1.2.0" } });
  await f.manager.checkAtLaunch(); assert.equal(f.calls.checks, 0); assert.equal(f.calls.intervals, 0);
  assert.equal(f.manager.state.appliedVersion, "1.3.0");
  f.manager.acknowledgeApplied(); assert.equal(f.manager.state.appliedVersion, null); assert.equal(f.saved().seenVersion, "1.3.0");
});
