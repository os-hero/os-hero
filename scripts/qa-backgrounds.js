const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { BACKGROUND_ITEMS } = require("../src/shared/backgrounds");
const { defaultCharacter, equipItem, ITEMS } = require("../src/shared/catalog");
const { renderSceneDataUrl, renderTrayCharacterBuffer, renderCharacterBuffer } = require("../src/main/pixelRenderer");
const decode = (url) => PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));

module.exports = async function ({ panel, BrowserWindow, profile, check, capture, wait, getTrayImage }) {
  if (process.env.OS_HERO_QA_BASELINE) {
    const previous = require(path.join(process.env.OS_HERO_QA_BASELINE, "src/main/pixelRenderer.js"));
    let count = 0;
    for (const item of ITEMS.filter(item => item.slot !== "background")) for (const gender of ["male", "female"]) for (let frame = 0; frame < 4; frame++) {
      const hero = equipItem({ ...defaultCharacter(), gender }, item.id);
      if (!renderCharacterBuffer(hero, frame, 1).equals(previous.renderCharacterBuffer(hero, frame, 1))) throw new Error(`Canonical art changed: ${item.id}/${gender}/${frame}`);
      count++;
    }
    check(`${count} canonical Hero frames byte-match signed public 1.4.1 baseline`, count === 544);
  }
  const js = (code) => panel.webContents.executeJavaScript(code, true);
  const original = fs.readFileSync(path.join(profile, "character.json"), "utf8");
  let state = await js("window.osHeroApi.getState()");
  const canonicalFrames = JSON.stringify(state.hero.frames);
  const originalEquipment = { ...state.character.equipped };
  check("all ten backgrounds owned, default meadow assigned to existing Hero", state.items.filter(i => i.slot === "background").length === 10 && state.character.equipped.background === "background_meadow");
  await js("navigateTray('inventory');document.getElementById('inventory-category').value='background';document.getElementById('inventory-category').dispatchEvent(new Event('change'))");
  await wait(150);
  const bounds = JSON.stringify(panel.getBounds());
  for (const item of BACKGROUND_ITEMS) {
    const previous = (await js("window.osHeroApi.getState()")).character.equipped.background;
    await js(`document.querySelector('[data-item=${item.id}]').click()`);
    await wait(150);
    const selected = await js("document.getElementById('character-preview').src");
    const preview = decode(selected);
    check(`${item.theme}: selecting previews 3:2 scene without saving`, preview.width === 39 && preview.height === 26 && (await js("window.osHeroApi.getState()")).character.equipped.background === previous);
    if (previous !== item.id) {
      await js("document.getElementById('equip-button').click()");
      await wait(160);
    }
    state = await js("window.osHeroApi.getState()");
    check(`${item.theme}: one background replaces only its slot`, state.character.equipped.background === item.id && JSON.stringify({ ...state.character.equipped, background: originalEquipment.background }) === JSON.stringify(originalEquipment));
    check(`${item.theme}: transparent universal Hero remains identical`, JSON.stringify(state.hero.frames) === canonicalFrames);
    const scenes = state.hero.sceneFrames.map(decode);
    const actual = PNG.sync.read(getTrayImage().toPNG({ scaleFactor: 1 }));
    check(`${item.theme}: real tray receives the same selected scene immediately`, actual.width === 39 && actual.height === 26 && scenes.some(frame => frame.data.equals(actual.data)));
    await wait(430);
    check(`${item.theme}: inventory saved preview uses canonical scene and fixed popup bounds`, await js(`document.getElementById('character-preview').dataset.heroKey === ${JSON.stringify(state.hero.key)}`) && JSON.stringify(panel.getBounds()) === bounds);
    for (let f = 0; f < 4; f++) {
      const frame = decode(await js(`window.osHeroApi.renderScene(null,${f},1)`));
      check(`${item.theme}: frame ${f} preview and menu pixels equal`, frame.data.equals(scenes[f].data));
    }
  }
  check("pre-background character backed up without overwriting its bytes", fs.readFileSync(path.join(profile, "backups/pixel-backgrounds/character.json"), "utf8") === original);
  check("background metadata durable in canonical local ledger", JSON.parse(fs.readFileSync(path.join(profile, "character.json"))).equipped.background === state.character.equipped.background);
  await js("window.osHeroApi.updateEquipment({action:'unequip',slot:'background'})");
  state = await js("window.osHeroApi.getState()");
  check("reset returns to meadow and never leaves an empty scene", state.character.equipped.background === "background_meadow");
  check("forged background item assignment is rejected", await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'background_unknown'}).then(()=>false,()=>true)"));
  for (const language of ["ko", "en", "zh-CN"]) {
    await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
    await wait(100);
    await js("document.getElementById('inventory-category').value='background';document.getElementById('inventory-category').dispatchEvent(new Event('change'))");
    check(`${language}: all background names localized`, await js("!document.body.innerText.includes('item.') && !document.body.innerText.includes('category.')"));
    for (const width of [760, 520, 390, 320]) {
      panel.setSize(width, 600); await wait(100);
      check(`${language}/${width}: scene retains 3:2 without horizontal overflow`, await js("(() => { const r=document.getElementById('character-preview').getBoundingClientRect();return document.documentElement.scrollWidth <= innerWidth && Math.abs(r.width/r.height-1.5)<0.02;})()"));
    }
  }
  panel.setSize(760, 600);
  await js("window.osHeroApi.setLanguage('ko')");
  await js("document.getElementById('inventory-category').value='background';document.getElementById('inventory-category').dispatchEvent(new Event('change'));document.querySelector('[data-item=background_meadow]').click()");
  await capture(panel, "background-inventory-desktop.png");
  panel.setSize(390, 600); await capture(panel, "background-inventory-compact.png");
  await renderBoard({ BrowserWindow, capture });
};

async function renderBoard({ BrowserWindow, capture }) {
  let hero = { ...defaultCharacter(), hairColor: "#714D38" };
  for (const id of ["ponytail_hair", "travel_jacket", "teal_backpack", "travel_mug"]) hero = equipItem(hero, id);
  const html = `<html lang="ko"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:36px;background:#fff;color:#20252c;font:14px -apple-system,sans-serif}h1{font-size:24px;margin:0 0 10px}p{color:#657181;margin:0 0 28px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:24px}section{min-width:0}img{image-rendering:pixelated;image-rendering:crisp-edges}.large{display:block;width:234px;height:156px}h2{font-size:16px;margin:12px 0}.bar{display:flex;gap:12px;background:#22272c;padding:10px;width:234px}.bar img{width:39px;height:26px}.light{background:#f1f3f4;margin-top:6px}.bare{display:flex;gap:18px;margin-top:18px}.bare img{width:78px;height:52px}</style><h1>OS Hero · 픽셀 배경 컬렉션</h1><p>동일한 저장 히어로 · 캐릭터 24×24 원본 · 배경 39×26 (3:2) · 흰 테두리 없음</p><main>${BACKGROUND_ITEMS.map(item => {
    const character = equipItem(hero, item.id);
    const frames = [0,1,2,3].map(f => renderSceneDataUrl(character,f,1));
    return `<section><img class="large" src="${frames[0]}"><h2>${item.names.ko}</h2><div class="bar">${frames.map(src => `<img src="${src}">`).join("")}</div><div class="bar light">${frames.map(src => `<img src="${src}">`).join("")}</div><div class="bare"><img src="${frames[0]}"><img src="data:image/png;base64,${renderTrayCharacterBuffer(character,0,{platform:"darwin",scaleFactor:2}).toString("base64")}"></div></section>`;
  }).join("")}</main></html>`;
  const board = new BrowserWindow({ width: 1390, height: 940, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await board.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await capture(board, "background-collection-board.png"); board.close();
}
