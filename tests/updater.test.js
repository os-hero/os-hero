const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { UpdateManager, UPDATE_CHECK_INTERVAL_MS, resolveUpdateFeedUrl } = require("../src/main/updater");

function fixture(packaged = true) {
  const updater = new EventEmitter();
  const calls = { checks: 0, downloads: 0, installs: 0, intervals: 0, cleared: 0 };
  updater.setFeedURL = config => { calls.feed = config; };
  updater.checkForUpdates = async () => { calls.checks++; updater.emit("update-available", { version: "1.3.0" }); };
  updater.downloadUpdate = async () => { calls.downloads++; updater.emit("update-downloaded", { version: "1.3.0" }); };
  updater.quitAndInstall = () => { calls.installs++; };
  const timers = { setInterval(callback, ms) { calls.intervals++; calls.tick = callback; calls.ms = ms; return { unref() {} }; }, clearInterval() { calls.cleared++; } };
  const app = { isPackaged: packaged, getVersion: () => "1.2.0", getAppPath: () => path.resolve(__dirname, "..") };
  const manager = new UpdateManager({ app, autoUpdater: updater, notifyState() {}, timers });
  return { app, manager, updater, calls };
}

test("stable channel retains legacy URL, skips prereleases/downgrades, uses compatible range requests", () => {
  const { app, updater, calls } = fixture();
  assert.equal(resolveUpdateFeedUrl(app), "https://os-hero.github.io/updates/");
  assert.equal(calls.feed.useMultipleRangeRequest, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.autoInstallOnAppQuit, true);
});

test("automatic launch downloads once, preserves ready update and never restarts during use", async () => {
  const { manager, calls } = fixture();
  await Promise.all([manager.checkAtLaunch(), manager.checkAtLaunch()]);
  assert.equal(calls.checks, 1);
  assert.equal(calls.downloads, 1);
  assert.equal(calls.installs, 0);
  assert.equal(calls.intervals, 1);
  assert.equal(calls.ms, UPDATE_CHECK_INTERVAL_MS);
  assert.equal(manager.state.startupCheckCompleted, true);
  await manager.checkAutomatically();
  await manager.checkForUpdates();
  assert.equal(manager.state.status, "downloaded");
  assert.equal(calls.checks, 1);
  manager.stop(); manager.stop();
  assert.equal(calls.cleared, 1);
});

test("periodic checks retry a network error and downloads without an open renderer", async () => {
  const { manager, updater, calls } = fixture();
  const workingCheck = updater.checkForUpdates;
  updater.checkForUpdates = async () => { calls.checks++; throw new Error("offline"); };
  await manager.checkAtLaunch();
  assert.equal(manager.state.status, "error");
  updater.checkForUpdates = workingCheck;
  calls.tick();
  await manager.automaticCheckPromise;
  assert.equal(calls.checks, 2);
  assert.equal(manager.state.status, "downloaded");
  assert.equal(calls.installs, 0);
});

test("development launches never silently fetch updates, explicit checks remain possible", async () => {
  const { manager, calls } = fixture(false);
  await manager.checkAtLaunch();
  assert.equal(calls.checks, 0);
  assert.equal(calls.intervals, 0);
  await manager.checkForUpdates();
  assert.equal(calls.checks, 1);
});

test("only explicit install request restarts after ready download", async () => {
  const { manager, calls } = fixture();
  await manager.checkAtLaunch();
  await manager.downloadUpdate(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.installs, 1);
});

test("parallel checks/download requests are deduplicated and retain explicit install intent", async () => {
  const { manager, updater, calls } = fixture();
  let resolveCheck, resolveDownload;
  updater.checkForUpdates = () => { calls.checks++; return new Promise(resolve => { resolveCheck = resolve; }); };
  const a = manager.checkForUpdates(), b = manager.checkForUpdates();
  updater.emit("update-available", { version: "1.3.0" }); resolveCheck();
  await Promise.all([a, b]);
  assert.equal(calls.checks, 1);
  updater.downloadUpdate = () => { calls.downloads++; return new Promise(resolve => { resolveDownload = resolve; }); };
  const downloads = [manager.downloadUpdate(false), manager.downloadUpdate(true), manager.downloadUpdate(false)];
  updater.emit("update-downloaded", { version: "1.3.0" }); resolveDownload();
  await Promise.all(downloads);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.downloads, 1);
  assert.equal(calls.installs, 1);
});
