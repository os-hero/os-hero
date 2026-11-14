const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const [reference, output] = process.argv.slice(2);
if (!process.env.OS_HERO_QA_PROFILE || !reference || !output) throw new Error("Pass reference directory, capture directory and isolated QA profile");
app.setPath("userData", process.env.OS_HERO_QA_PROFILE);
const png = file => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1560, height: 660, useContentSize: true, show: false, frame: false });
  for (const [key, source, actual] of [
    ["01", "01-registration.png", "hero-01-registration.png"],
    ["02", "02-my-hero.png", "hero-02-profile.png"],
    ["03", "03-expedition.png", "hero-03-exploration.png"]
  ]) {
    const html = `<html><style>*{box-sizing:border-box}body{margin:0;padding:12px;background:#e7ebeb;font:14px system-ui;color:#202d29}main{display:flex;gap:16px}h2{font-size:14px;margin:0 0 8px}img{display:block;width:760px;height:600px}</style><main><section><h2>Approved concept / normalized to 760 x 600</h2><img src="${png(path.join(reference,source))}"></section><section><h2>Actual Electron / 760 x 600 / synthetic QA Hero</h2><img src="${png(path.join(output,actual))}"></section></main></html>`;
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await window.webContents.executeJavaScript("Promise.all([...document.images].map(img=>img.decode()))");
    fs.writeFileSync(path.join(output,`hero-design-${key}.png`),(await window.webContents.capturePage()).toPNG());
  }
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
