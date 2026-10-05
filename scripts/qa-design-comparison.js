const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
if (!process.env.OS_HERO_QA_PROFILE) throw new Error("Run with an isolated OS_HERO_QA_PROFILE");
app.setPath("userData", process.env.OS_HERO_QA_PROFILE);
const output = path.resolve(__dirname, "../review-artifacts/2026-10-06");
const source = process.argv[2];
if (!source) throw new Error("Pass the selected reference image path as the first argument");
const png = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1576, height: 666, show: false, frame: false, useContentSize: true });
  const html = `<html><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#e7ebf0;font:14px system-ui;color:#17212b}main{display:flex;gap:24px}h2{font-size:16px;margin:0 0 12px}.image{width:760px;height:604px;overflow:hidden;position:relative}.reference img{position:absolute;width:1297px;max-width:none;left:-44px;top:-213px}.actual{width:760px;height:600px}</style><main><section><h2>Selected concept 3 / normalized popup crop</h2><div class="image reference"><img src="${png(source)}"></div></section><section><h2>Actual Electron / 760 x 600 / same inventory selection</h2><div class="image"><img class="actual" src="${png(path.join(output,"tray-selected-design-state.png"))}"></div></section></main></html>`;
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await window.webContents.executeJavaScript("Promise.all([...document.images].map(img=>img.decode()))");
  fs.writeFileSync(path.join(output, "design-comparison.png"), (await window.webContents.capturePage()).toPNG());
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
