// Real Squirrel.Mac replacement test. Only disposable, re-signed app copies are modified.
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("child_process");
const asar = require("@electron/asar");
const { signAsync } = require("@electron/osx-sign");
const { defaultCharacter } = require("../src/shared/catalog");
const { normalizeExpedition, dayKey } = require("../src/shared/expedition");
const repo = path.resolve(__dirname, "..");
const baseline = process.env.OS_HERO_QA_BASELINE;
const target = process.env.OS_HERO_QA_TARGET || path.join(repo, "release/mac-arm64/OS Hero.app");
const output = path.join(repo, "review-artifacts/2026-10-06");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
async function until(fn, label, timeout = 180000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = fn(); if (value) return value; await wait(500); }
  throw new Error(`Timed out: ${label}`);
}
function events(root) {
  const file = path.join(root, "events.jsonl");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
}
function bootstrap(root, feed) {
  return `(() => {
    const fs = require('fs'), path = require('path');
    const { app, ipcMain } = require('electron');
    const root = ${JSON.stringify(root)};
    process.env.OS_HERO_USER_DATA_DIR = path.join(root, 'profile');
    process.env.OS_HERO_UPDATE_URL = ${JSON.stringify(feed)};
    const log = (event, data = {}) => fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify({event, version: app.getVersion(), pid: process.pid, time: Date.now(), ...data}) + '\\n');
    const updater = require('electron-updater').autoUpdater;
    Object.defineProperty(updater.app, 'baseCachePath', {value: path.join(root, 'cache')});
    updater.logger = {info() {}, debug() {}, warn() {}, error(error) {log('updater-error', {message: String(error)});}};
    updater.nativeUpdater.on('update-downloaded', () => log('native-ready'));
    updater.on('error', error => log('updater-error', {message: String(error)}));
    app.whenReady().then(() => setTimeout(() => log('started'), 1000));
    app.on('quit', () => log('quit'));
    const timer = setInterval(async () => {
      const file = path.join(root, 'command.json');
      if (!fs.existsSync(file)) return;
      const command = JSON.parse(fs.readFileSync(file)); fs.unlinkSync(file);
      try {
        if (command === 'quit') app.quit();
        else if (command === 'exit') app.exit(0);
        else if (command === 'restart') await ipcMain._invokeHandlers.get('update:restart')({});
        else if (command === 'start-expedition') await ipcMain._invokeHandlers.get('expedition:action')({}, {action: 'start'});
      } catch (error) {log('command-error', {message: String(error)});}
    }, 200);
    timer.unref();
  })();\n`;
}
async function fixture(source, destination, root, feed, id) {
  run('/usr/bin/ditto', [source, destination]);
  const updateConfig = path.join(destination, 'Contents/Resources/app-update.yml');
  if (!fs.existsSync(updateConfig)) fs.copyFileSync(path.join(target, 'Contents/Resources/app-update.yml'), updateConfig);
  const archive = path.join(destination, 'Contents/Resources/app.asar');
  const unpacked = path.join(root, `unpacked-${path.basename(path.dirname(destination))}`);
  asar.extractAll(archive, unpacked);
  const main = path.join(unpacked, 'src/main/main.js');
  fs.writeFileSync(main, bootstrap(root, feed) + fs.readFileSync(main, 'utf8'));
  fs.unlinkSync(archive);
  await asar.createPackage(unpacked, archive);
  const plist = path.join(destination, 'Contents/Info.plist');
  run('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', id, plist]);
  const hash = crypto.createHash('sha256').update(asar.getRawHeader(archive).headerString).digest('hex');
  run('/usr/bin/plutil', ['-replace', 'ElectronAsarIntegrity', '-json', JSON.stringify({'Resources/app.asar': {algorithm: 'SHA256', hash}}), plist]);
  await signAsync({app: destination, identity: 'Developer ID Application: Chung Bok Lee (8FB5QWNNFQ)', platform: 'darwin', type: 'distribution', version: '40.10.2', preAutoEntitlements: false,
    binaries: [path.join(destination, 'Contents/Resources/native/oshero-outside-click')]});
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', destination]);
  fs.rmSync(unpacked, {recursive: true});
}
async function scenario(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `oshero-native-${mode}-`));
  const id = `com.themercenary.oshero.qa.${crypto.randomBytes(6).toString('hex')}`;
  const extra = [path.join(os.homedir(), 'Library/Caches', `${id}.ShipIt`), path.join(os.homedir(), 'Library/Caches', id), path.join(os.homedir(), 'Library/Preferences', `${id}.plist`)];
  for (const file of extra) assert.ok(!fs.existsSync(file), 'QA identifier is new');
  write(path.join(output, `native-${mode}-ownership.json`), {root, id, ownedOutsideRoot: extra, method: 'ditto + asar test bootstrap + existing Developer ID', cleanup: 'stop test app PIDs, unregister exact app copies, remove root and listed new cache/preferences paths; no login items created'});
  const appPath = path.join(root, 'installed/OS Hero.app');
  const nextPath = path.join(root, 'candidate/OS Hero.app');
  const profile = path.join(root, 'profile');
  fs.mkdirSync(profile);
  write(path.join(profile, 'character.json'), {...defaultCharacter('1.3.0'), hasCharacter: true});
  write(path.join(profile, 'settings.json'), {version: '1.3.0', language: 'ko', launchAtLogin: false, autoDownloadUpdates: true});
  write(path.join(profile, 'wallet.json'), {gold: 17});
  const now = new Date().toISOString();
  write(path.join(profile, 'quests.json'), {quests: [{id: 'native-qa', title: 'Native update preservation', type: 'adventure', status: 'in_progress', createdAt: now, updatedAt: now}]});
  write(path.join(profile, 'expedition.json'), normalizeExpedition({day: dayKey()}));
  const zip = path.join(root, 'candidate-arm64.zip');
  let yaml = '', child;
  const server = http.createServer((req, res) => {
    if (req.url.split('?')[0] === '/latest-mac.yml') {res.writeHead(200, {'content-type': 'text/yaml'}); res.end(yaml);}
    else if (req.url === '/candidate-arm64.zip') {res.writeHead(200, {'content-length': fs.statSync(zip).size}); fs.createReadStream(zip).pipe(res);}
    else {res.writeHead(404); res.end();}
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const feed = `http://127.0.0.1:${server.address().port}/`;
  const command = value => write(path.join(root, 'command.json'), value);
  const launch = () => {child = spawn(path.join(appPath, 'Contents/MacOS/OS Hero'), [], {stdio: 'ignore'}); child.on('error', console.error);};
  try {
    console.log(`${mode}: preparing signed disposable fixtures`);
    await fixture(baseline, appPath, root, feed, id);
    await fixture(target, nextPath, root, feed, id);
    run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', nextPath, zip]);
    const version = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(nextPath, 'Contents/Info.plist')])).CFBundleShortVersionString;
    const hash = crypto.createHash('sha512').update(fs.readFileSync(zip)).digest('base64');
    yaml = `version: ${version}\nfiles:\n  - url: candidate-arm64.zip\n    sha512: ${hash}\n    size: ${fs.statSync(zip).size}\npath: candidate-arm64.zip\nsha512: ${hash}\nreleaseDate: '${now}'\n`;
    launch();
    await until(() => events(root).some(e => e.event === 'started'), 'baseline start');
    const before = {character: read(path.join(profile, 'character.json')), quests: read(path.join(profile, 'quests.json'))};
    command('start-expedition');
    await until(() => {
      const error = events(root).find(e => e.event === 'updater-error' || e.event === 'command-error');
      if (error) throw new Error(error.message);
      return events(root).some(e => e.event === 'native-ready');
    }, 'native signature verification');
    console.log(`${mode}: native verified, invoking actual ${mode} flow`);
    const oldPid = child.pid;
    command(mode);
    await until(() => events(root).some(e => e.event === 'quit' && e.pid === oldPid), 'baseline exit');
    await until(() => {
      try {return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(appPath, 'Contents/Info.plist')])).CFBundleShortVersionString === version;} catch {return false;}
    }, 'bundle replaced');
    if (mode === 'quit') {
      await wait(8000);
      assert.ok(!events(root).some(e => e.event === 'started' && e.version === version), 'ordinary Quit must not relaunch');
      launch();
    }
    await until(() => events(root).some(e => e.event === 'started' && e.version === version), 'updated app launch');
    assert.deepEqual(read(path.join(profile, 'character.json')), before.character, 'Hero preserved');
    const quests = read(path.join(profile, 'quests.json'));
    assert.equal(quests.quests[0].id, before.quests.quests[0].id, 'quest preserved');
    assert.equal(quests.quests[0].title, before.quests.quests[0].title, 'quest title preserved');
    assert.equal(read(path.join(profile, 'wallet.json')).gold, 17, 'gold preserved');
    assert.equal(read(path.join(profile, 'expedition.json')).running, false, 'expedition stays paused');
    assert.equal(events(root).filter(e => e.event === 'updater-error' || e.event === 'command-error').length, 0, 'no native errors');
    write(path.join(output, `native-${mode}-result.json`), {passed: true, mode, version, nativeVerification: true, bundleReplaced: true, automaticallyRelaunched: mode === 'restart', heroPreserved: true, questPreserved: true, goldPreserved: true, expeditionPaused: true, events: events(root)});
    console.log(`${mode}: PASS real bundle replacement, relaunch policy, data preservation`);
  } catch (error) {
    write(path.join(output, `native-${mode}-result.json`), {passed: false, message: error.message, events: events(root)});
    throw error;
  } finally {
    const pids = new Set(events(root).filter(e => e.event === 'started').map(e => e.pid));
    if (child?.pid) pids.add(child.pid);
    for (const pid of pids) {
      try {
        const args = run('/bin/ps', ['-p', String(pid), '-o', 'command=']);
        if (args.includes(root)) process.kill(pid, 'SIGTERM');
      } catch {}
    }
    await wait(1500);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    for (const app of [appPath, nextPath]) {
      try {run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-u', app]);} catch {}
    }
    for (const file of [...extra, root]) fs.rmSync(file, {recursive: true, force: true});
    write(path.join(output, `native-${mode}-cleanup.json`), {removed: [...extra, root].every(file => !fs.existsSync(file)), paths: [...extra, root]});
  }
}
async function main() {
  if (process.platform !== 'darwin' || !baseline || !fs.existsSync(baseline)) throw new Error('Set OS_HERO_QA_BASELINE to a signed older app with the new update policy.');
  fs.mkdirSync(output, {recursive: true});
  for (const mode of ['quit', 'restart']) await scenario(mode);
}
main().catch(error => {console.error(error); process.exitCode = 1;});
