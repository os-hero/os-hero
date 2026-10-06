const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { dialog } = require("electron");

function prepare(mainPath) {
  process.env.OS_HERO_UPDATE_URL = "https://os-hero.github.io/updates/";
  const { autoUpdater } = createRequire(mainPath)("electron-updater");
  const qa = { updater: autoUpdater, checks: 0, downloads: 0, installs: 0, dialogs: [], response: 0, version: "99.0.1", failDownload: false, holdVerification: false };
  autoUpdater.setFeedURL = () => {};
  autoUpdater.checkForUpdates = async () => {
    qa.checks++; autoUpdater.emit("checking-for-update");
    autoUpdater.emit("update-available", { version: qa.version });
  };
  autoUpdater.downloadUpdate = async () => {
    qa.downloads++;
    if (qa.failDownload) throw Error("QA network failure");
    autoUpdater.emit("download-progress", { percent: 50 });
    autoUpdater.emit("update-downloaded", { version: qa.version });
    if (!qa.holdVerification) autoUpdater.nativeUpdater.emit("update-downloaded");
  };
  autoUpdater.quitAndInstall = () => { qa.installs++; };
  dialog.showMessageBox = async (...args) => { qa.dialogs.push(args.at(-1)); return { response: qa.response }; };
  return qa;
}

async function run({ panel, app, profile, check, capture, wait, qaUpdates: qa }) {
  const js = code => panel.webContents.executeJavaScript(code, true);
  const go = route => js(`navigateTray(${JSON.stringify(route)})`);
  await go("settings");
  check("automatic download defaults ON for legacy settings", await js("document.getElementById('auto-download-updates').checked"));
  await js("window.osHeroApi.setAutoDownloadUpdates(false)");
  check("auto-download OFF persists", JSON.parse(fs.readFileSync(path.join(profile,"settings.json"))).autoDownloadUpdates === false);
  await go("updates");
  await js("window.osHeroApi.checkForUpdates()");
  check("manual check with preference OFF offers Download, never restart", qa.downloads === 0 && qa.installs === 0 && await js("!!document.getElementById('download-update-button') && !document.getElementById('install-update-button')"));
  qa.holdVerification = true;
  await js("document.getElementById('download-update-button').click()");
  await wait(80);
  check("native verification disables restart until signature/staging completes", await js("state.update.status==='verifying' && !document.getElementById('install-update-button')"));
  qa.updater.nativeUpdater.emit("update-downloaded"); await wait(80);
  check("verified download shows separate restart and header indicator", qa.installs === 0 && await js("!!document.getElementById('install-update-button') && document.getElementById('tray-settings').classList.contains('update-ready')"));
  qa.holdVerification = false;
  await js("window.osHeroApi.checkForUpdates()");
  check("manual check rechecks even with a prepared version without redownload", qa.checks === 2 && qa.downloads === 1);
  await js("window.osHeroApi.setAutoDownloadUpdates(true)");
  qa.version = "99.0.2";
  await js("window.osHeroApi.checkForUpdates()");
  check("newer version replaces preparation without automatic restart", qa.downloads === 2 && qa.installs === 0 && await js("state.update.readyVersion==='99.0.2'"));
  qa.version = "99.0.3"; qa.failDownload = true;
  await js("window.osHeroApi.checkForUpdates()");
  check("newer download failure retains old verified candidate", await js("state.update.readyVersion==='99.0.2' && document.getElementById('install-update-button')?.textContent.includes('99.0.2') && !!document.getElementById('update-installer-link')"));
  for (const language of ["ko","en","zh-CN"]) {
    await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
    for (const width of [760, 390, 320]) {
      panel.setSize(width,600); await go("updates"); await wait(50);
      check(`update error/ready controls fit ${language} ${width}`, await js("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('#update-panel button')].every(e=>e.getBoundingClientRect().right<=innerWidth)"));
      if (language === "ko") await capture(panel, `updates-ready-${width}.png`);
    }
  }
  await js("window.osHeroApi.setLanguage('ko')"); panel.setSize(760,600);
  await go("customization");
  await js("document.getElementById('body-color').value='#ABCDEF';document.getElementById('body-color').dispatchEvent(new Event('input'))");
  await go("updates");
  await js("window.osHeroApi.restartForUpdate()");
  check("unsaved Hero default choice cancels update restart", qa.installs === 0 && qa.dialogs.at(-1).defaultId === 0 && qa.dialogs.at(-1).cancelId === 0);
  await go("customization");
  check("cancelled restart retains exact draft", await js("document.getElementById('body-color').value==='#ABCDEF'"));
  await js("document.getElementById('cancel-button').click()");
  await go("quests");
  await js("document.getElementById('new-quest-button').click();document.querySelector('[data-quest-type=adventure]').click();document.getElementById('quest-title').value='update draft';persistTrayUi()");
  await go("updates"); const dialogsBefore = qa.dialogs.length;
  await js("window.osHeroApi.quitApp()");
  check("normal quit also protects quest draft", qa.dialogs.length === dialogsBefore + 1 && !panel.isDestroyed());
  await go("quests"); await js("document.getElementById('cancel-quest-button').click()");
  await go("updates");
  fs.mkdirSync(path.join(profile,"expedition.json.tmp"));
  await js("window.osHeroApi.restartForUpdate()");
  check("failed progress save leaves app open and update retryable", qa.installs === 0 && await js("state.update.error==='update.saveFailed'"));
  fs.rmdirSync(path.join(profile,"expedition.json.tmp"));
  await js("window.osHeroApi.expeditionAction({action:'start'})"); await wait(150);
  await js("window.osHeroApi.restartForUpdate()");
  check("explicit restart prepares durable paused expedition then installs once", qa.installs === 1 && JSON.parse(fs.readFileSync(path.join(profile,"expedition.json"))).running === false);
  await js("window.osHeroApi.restartForUpdate()"); check("repeated restart cannot invoke installer twice", qa.installs === 1);
}
module.exports = { prepare, run };
