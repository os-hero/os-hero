const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const assert = require("node:assert/strict");
const { app } = require("electron");
const { MacUpdater } = require("electron-updater");
const { ElectronHttpExecutor } = require("electron-updater/out/electronHttpExecutor");
const version = require("../package.json").version;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-public-update-"));
app.setPath("userData", root);
const output = path.resolve(__dirname, "../review-artifacts/2026-10-06");
fs.mkdirSync(output, {recursive: true});
const report = {version, checks: [], nativeInstallation: "separate signed fixture QA", passed: false};
let updater;
const adapter = current => ({version: current, name: "OS Hero Public Update QA", isPackaged: true,
  appUpdateConfigPath: path.resolve(__dirname, "../release/mac-arm64/OS Hero.app/Contents/Resources/app-update.yml"),
  userDataPath: root, baseCachePath: root, whenReady: () => app.whenReady(), onQuit() {},
  quit() {throw Error("Public-feed QA must not install");}, relaunch() {throw Error("Public-feed QA must not relaunch");}});
function client(current) {
  const value = new MacUpdater(null, adapter(current));
  value.httpExecutor = new ElectronHttpExecutor(() => {});
  value.autoDownload = false;
  value.autoInstallOnAppQuit = false;
  value.allowDowngrade = false;
  value.allowPrerelease = false;
  value.logger = {info() {}, debug() {}, warn() {}, error() {}};
  value.setFeedURL({provider: "generic", url: "https://os-hero.github.io/updates/", useMultipleRangeRequest: false});
  return value;
}
function hash(file) {return crypto.createHash("sha512").update(fs.readFileSync(file)).digest("hex");}
async function cleanup(code) {
  updater?.closeServerIfExists();
  fs.writeFileSync(path.join(output, `qa-public-update-${version}.json`), JSON.stringify(report, null, 2));
  fs.rmSync(root, {recursive: true, force: true, maxRetries: 3});
  console.log(JSON.stringify({...report, temporaryProfileRemoved: !fs.existsSync(root)}));
  app.exit(code);
}
const timeout = setTimeout(() => {report.error = "Public update timeout"; void cleanup(1);}, 180000);
app.whenReady().then(async () => {
  let code = 0;
  try {
    updater = client(process.env.OS_HERO_QA_FROM || "1.3.0");
    const result = await updater.checkForUpdates();
    assert.equal(result.updateInfo.version, version);
    report.checks.push("signed previous-version baseline discovers public stable release");
    await updater.downloadUpdate();
    const helper = await updater.getOrCreateDownloadHelper();
    const zip = fs.readdirSync(helper.cacheDirForPendingUpdate).find(file => file.endsWith(".zip"));
    assert.ok(zip);
    assert.equal(hash(path.join(helper.cacheDirForPendingUpdate, zip)), hash(path.resolve(__dirname, `../release/OS-Hero-${version}-arm64.zip`)));
    report.checks.push("real MacUpdater downloads exact published ZIP without installation");
    const current = client(version);
    let latest = false;
    current.on("update-not-available", () => {latest = true;});
    await current.checkForUpdates();
    assert.ok(latest);
    report.checks.push("current version reports up to date");
    const old = client("1.2.0");
    assert.equal((await old.checkForUpdates()).updateInfo.version, version);
    report.checks.push("legacy version still discovers the same compatibility feed");
    report.passed = true;
  } catch (error) {report.error = error.message; code = 1;}
  finally {clearTimeout(timeout); await cleanup(code);}
});
