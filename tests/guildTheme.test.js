const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const { getMessages } = require("../src/shared/i18n");
const { TRAY_PANEL_SIZE } = require("../src/shared/trayPanel");
const root = path.resolve(__dirname, "..");

test("guild UI uses a genuine transparent raster frame and a bundled licensed font", () => {
  const png = PNG.sync.read(fs.readFileSync(path.join(root,"public/assets/ui/guild-frame.png")));
  assert.equal(png.data[(Math.floor(png.height/2)*png.width+Math.floor(png.width/2))*4+3],0);
  assert.ok(png.data.some((value,index)=>index%4===3 && value===255));
  const font = fs.readFileSync(path.join(root,"public/assets/fonts/press-start-2p/PressStart2P-Regular.ttf"));
  assert.equal(font.readUInt32BE(0),0x00010000);
  assert.match(fs.readFileSync(path.join(root,"public/assets/fonts/press-start-2p/OFL.txt"),"utf8"),/SIL OPEN FONT LICENSE/);
  assert.ok(fs.existsSync(path.join(root,"public/assets/fonts/press-start-2p/FONTLOG.txt")));
});

test("guild headings and existing removal commands are translated for all app languages", () => {
  for (const language of ["ko","en","zh-CN"]) {
    const messages=getMessages(language);
    for (const key of ["inventory.currentHero","inventory.draftPreview","inventory.unequip","inventory.resetOutfit"])
      assert.ok(typeof messages[key]==="string" && messages[key]!==key && messages[key].length>0);
  }
});

test("guild appearance does not alter the native fixed popup geometry", () => {
  assert.deepEqual(TRAY_PANEL_SIZE,{width:760,height:600});
  const css=fs.readFileSync(path.join(root,"src/renderer/guild.css"),"utf8");
  assert.match(css,/\.tray-window/);
  assert.match(css,/aspect-ratio: 3 \/ 2/);
  assert.doesNotMatch(css,/https?:\/\//);
});
