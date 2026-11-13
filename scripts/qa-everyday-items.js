const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { defaultCharacter, equipItem, getItemById } = require("../src/shared/catalog");
const { renderCharacterDataUrl, renderSceneDataUrl, renderTrayCharacterBuffer } = require("../src/main/pixelRenderer");

const IDS = ["twin_buns", "wave_bob", "berry_beret", "studio_headphones", "workshop_apron", "raincoat", "bedroll_pack", "flower_basket", "camp_lantern", "big_paintbrush", "background_rain_cafe", "background_glasshouse"];
const decode = src => PNG.sync.read(Buffer.from(src.split(",")[1], "base64"));

module.exports = async function ({ panel, BrowserWindow, profile, output, check, capture, wait, getTrayImage }) {
  const js = code => panel.webContents.executeJavaScript(code, true);
  panel.setSize(760, 600);
  await js("window.osHeroApi.setLanguage('ko')");
  await js("navigateTray('inventory')");
  await wait(150);
  const bounds = JSON.stringify(panel.getBounds());
  const initial = await js("window.osHeroApi.getState()");
  for (const id of IDS) {
    const item = getItemById(id);
    const previous = await js("window.osHeroApi.getState()");
    check(`${id}: starter-owned in real application state`, previous.items.some(entry => entry.id === id));
    await js(`document.getElementById('inventory-category').value=${JSON.stringify(item.slot)};document.getElementById('inventory-category').dispatchEvent(new Event('change'));document.querySelector('[data-item=${id}]').click()`);
    await wait(100);
    check(`${id}: selection remains a draft`, JSON.stringify((await js("window.osHeroApi.getState()")).character) === JSON.stringify(previous.character));
    await js("document.getElementById('equip-button').click()");
    await wait(200);
    const state = await js("window.osHeroApi.getState()");
    check(`${id}: changes only its equipment slot`, state.character.equipped[item.slot] === id && JSON.stringify({ ...state.character.equipped, [item.slot]: previous.character.equipped[item.slot] }) === JSON.stringify(previous.character.equipped));
    check(`${id}: saved to the same Hero ledger`, JSON.stringify(JSON.parse(fs.readFileSync(path.join(profile, "character.json")))) === JSON.stringify(state.character));
    check(`${id}: shared Hero key reaches preview and menu`, await js(`document.getElementById('character-preview').dataset.heroKey===${JSON.stringify(state.hero.key)} && Array.from(document.querySelectorAll('[data-canonical-hero]')).every(img=>img.dataset.heroKey===${JSON.stringify(state.hero.key)})`));
    for (const scaleFactor of [1, 2]) {
      const actual = PNG.sync.read(getTrayImage().toPNG({ scaleFactor }));
      check(`${id}: real ${scaleFactor}x tray matches one canonical Idle frame`, [0, 1, 2, 3].some(frame => PNG.sync.read(renderTrayCharacterBuffer(state.character, frame, { platform: "darwin", scaleFactor })).data.equals(actual.data)));
    }
    check(`${id}: no popup resize or horizontal overflow`, JSON.stringify(panel.getBounds()) === bounds && await js("document.documentElement.scrollWidth<=innerWidth"));
  }
  const saved = await js("window.osHeroApi.getState()");
  check("new collection does not spend gold, change quests or unlock expedition rewards", saved.wallet.gold >= initial.wallet.gold && JSON.stringify(saved.quests) === JSON.stringify(initial.quests) && JSON.stringify(saved.expedition.unlocked) === JSON.stringify(initial.expedition.unlocked));
  for (const language of ["ko", "en", "zh-CN"]) {
    await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
    await wait(100);
    const state = await js("window.osHeroApi.getState()");
    check(`${language}: all twelve new names and native thumbnails resolve`, IDS.every(id => state.messages[`item.${id}`] && decode(state.itemThumbnails[id]).data.some((value, index) => index % 4 === 3 && value > 0)));
    for (const width of [760, 720, 681, 680, 520, 421, 420, 390, 320]) {
      panel.setSize(width, 600);
      await wait(100);
      for (const slot of new Set(IDS.map(id => getItemById(id).slot))) {
        await js(`document.getElementById('inventory-category').value=${JSON.stringify(slot)};document.getElementById('inventory-category').dispatchEvent(new Event('change'))`);
        const fits = await js(`document.documentElement.scrollWidth<=innerWidth && appRoot.scrollWidth<=appRoot.clientWidth && Array.from(document.querySelectorAll('.item-row')).every(button=>button.scrollWidth<=button.clientWidth+1 && button.scrollHeight<=button.clientHeight+1)`);
        if (!fits) await capture(panel, `everyday-clipped-${language}-${width}-${slot}.png`);
        check(`${language}/${width}/${slot}: collection and full item names fit`, fits);
      }
    }
  }
  panel.setSize(760, 600);
  await js("window.osHeroApi.setLanguage('ko')");
  await capture(panel, "everyday-inventory-desktop.png");
  panel.setSize(320, 600); await wait(100);
  await capture(panel, "everyday-inventory-compact.png");
  await renderBoard({ BrowserWindow, output, capture });
};

async function renderBoard({ BrowserWindow, output, capture }) {
  const base = equipItem(equipItem({ ...defaultCharacter(), hairColor: "#714D38", bodyColor: "#FFE6BD" }, "basic_hair"), "travel_jacket");
  const looks = IDS.map(id => ({ id, hero: equipItem(base, id) }));
  const mixes = [
    ["Studio", "twin_buns", "studio_headphones", "workshop_apron", "flower_basket", "big_paintbrush", "background_glasshouse"],
    ["Rain Walk", "wave_bob", "berry_beret", "raincoat", "bedroll_pack", "camp_lantern", "background_rain_cafe"],
    ["Legacy Long Hair", "princess_hair", "silver_circlet", "princess_dress", "flower_basket", "camp_lantern", "background_glasshouse"],
    ["Legacy Armor", "braided_hair", "knight_helmet", "village_armor", "bedroll_pack", "big_paintbrush", "background_rain_cafe"]
  ].map(([id, ...items]) => ({ id, hero: items.reduce(equipItem, base) }));
  const tile = ({ id, hero }) => `<section><h2>${id.replaceAll("_", " ")}</h2><img class="large" src="${renderSceneDataUrl(hero, 0, 4)}"><div class="frames">${[0, 1, 2, 3].map(f => `<img src="${renderCharacterDataUrl(hero, f, 2)}">`).join("")}</div><div class="bar">${[1, 2].map(scaleFactor => `<img src="data:image/png;base64,${renderTrayCharacterBuffer(hero, 0, { platform: "darwin", scaleFactor }).toString("base64")}">`).join("")}</div><div class="bar light">${[1, 2].map(scaleFactor => `<img src="data:image/png;base64,${renderTrayCharacterBuffer(hero, 2, { platform: "darwin", scaleFactor }).toString("base64")}">`).join("")}</div></section>`;
  const style = `*{box-sizing:border-box}body{padding:24px;margin:0;background:white;color:#20252c;font:14px -apple-system,sans-serif;letter-spacing:0}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 18px;color:#58646f}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}section{text-align:center;min-width:0}h2{font-size:13px;margin:0 0 6px}img{image-rendering:pixelated}.large{width:156px;height:104px}.frames{display:flex;gap:6px;justify-content:center;margin:6px 0}.frames img{width:24px;height:24px}.bar{display:flex;gap:16px;justify-content:center;background:#20252c;padding:3px}.bar.light{background:#edf1f3}.bar img{width:39px;height:26px}`;
  const window = new BrowserWindow({ width: 1000, height: 960, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  try {
    for (const [name, title, items] of [["items", "Twelve New Items", looks], ["mixes", "New + Existing Equipment", mixes]]) {
      const html = `<html lang="en"><meta charset="utf-8"><style>${style}</style><h1>OS Hero / ${title}</h1><p>Actual 24px renderer / four synchronized Idle poses / 39x26 menu at 1x and Retina</p><main>${items.map(tile).join("")}</main></html>`;
      const file = path.join(output, `everyday-${name}.html`);
      fs.writeFileSync(file, html);
      await window.loadFile(file);
      await capture(window, `everyday-${name}.png`);
    }
  } finally { window.close(); }
}
