const fs = require("fs");
const path = require("path");
const { defaultCharacter, equipItem } = require("../src/shared/catalog");
const { renderCharacterDataUrl } = require("../src/main/pixelRenderer");

module.exports = async function ({ panel, BrowserWindow, profile, output, check, capture, wait }) {
  const js = (code) => panel.webContents.executeJavaScript(code, true);
  const original = fs.readFileSync(path.join(profile, "character.json"), "utf8");
  let state = await js("window.osHeroApi.getState()");
  check("legacy head and tool slots migrate in memory", state.character.equipped.hair === "long_hair" && state.character.equipped.back === "small_bag" && !state.character.equipped.head && !state.character.equipped.tool);
  check("68 items include all 50 legacy owned items plus 15 starter items", state.items.length === 65);
  await js("window.osHeroApi.openTrayView('inventory')");
  await wait(250);
  const inventory = panel;
  const ij = (code) => inventory.webContents.executeJavaScript(code, true);
  await ij("document.querySelector('[data-tab=head]').click(); document.querySelector('[data-item=travel_cap]').click()");
  check("uncommitted inventory selection does not mutate head slot", !(await js("window.osHeroApi.getState()")).character.equipped.head);
  await ij("document.getElementById('equip-button').click()");
  await wait(200);
  state = await js("window.osHeroApi.getState()");
  check("hat equips without removing hair or bag", state.character.equipped.head === "travel_cap" && state.character.equipped.hair === "long_hair" && state.character.equipped.back === "small_bag");
  check("inventory keeps selected category through saved-state broadcast", await ij("document.querySelector('[data-tab=head]').classList.contains('active') && document.querySelector('[data-item=travel_cap]').classList.contains('selected')"));
  check("original character backed up byte-for-byte on first v2 save", fs.readFileSync(path.join(profile, "backups/wardrobe-v2/character.json"), "utf8") === original);
  for (const [tab, id] of [["face", "round_glasses"], ["clothes", "travel_jacket"], ["back", "teal_backpack"], ["tool", "travel_mug"]]) {
    await ij(`document.querySelector('[data-tab=${tab}]').click(); document.querySelector('[data-item=${id}]').click(); document.getElementById('equip-button').click()`);
    await wait(120);
    state = await js("window.osHeroApi.getState()");
    check(`${tab} equips independently`, state.character.equipped[tab] === id && state.character.equipped.hair === "long_hair" && state.character.equipped.head === "travel_cap");
  }
  await wait(450);
  check("inventory worn preview is canonical", await ij(`document.getElementById('character-preview').dataset.heroKey === ${JSON.stringify(state.hero.key)}`));
  await capture(inventory, "wardrobe-inventory.png");
  await js("window.osHeroApi.openTrayView('customization')");
  await wait(250);
  const custom = panel;
  const cj = (code) => custom.webContents.executeJavaScript(code, true);
  check("hair color swatches have visible colors under CSP", await cj("Array.from(document.querySelectorAll('.hair-color')).every(button => getComputedStyle(button, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)')"));
  await cj("document.getElementById('hair-style').value='ponytail_hair'; document.getElementById('hair-style').dispatchEvent(new Event('change')); document.querySelector('[data-hair-color=\"#714D38\"]').click()");
  check("hairstyle and palette draft isolated", (await js("window.osHeroApi.getState()")).character.equipped.hair === "long_hair");
  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'square_glasses'})");
  await wait(200);
  check("draft hair survives equipment update from another window", await cj("document.getElementById('hair-style').value === 'ponytail_hair' && document.querySelector('[data-hair-color=\"#714D38\"]').classList.contains('active')"));
  await capture(custom, "wardrobe-customization.png");
  await cj("document.getElementById('save-button').click()");
  await wait(250);
  state = await js("window.osHeroApi.getState()");
  check("hair save merges latest equipment without overwriting it", state.character.equipped.hair === "ponytail_hair" && state.character.hairColor === "#714D38" && state.character.equipped.face === "square_glasses" && state.character.equipped.tool === "travel_mug");
  check("all companion Hero locations use same saved key", await js(`Array.from(document.querySelectorAll('[data-canonical-hero]')).every(img => img.dataset.heroKey === ${JSON.stringify(state.hero.key)})`));
  for (let f = 0; f < 4; f++) check(`canonical frame ${f} matches preview renderer`, state.hero.frames[f] === await js(`window.osHeroApi.renderCharacter(null,${f},1)`));
  await js("navigateTray('companion')");
  await capture(panel, "wardrobe-companion.png");
  const animated = new Set();
  for (let sample = 0; sample < 5; sample++) {
    animated.add(await js("document.getElementById('expedition-hero').src"));
    await wait(430);
  }
  check("fully equipped canonical Hero animates through distinct frames", animated.size >= 2);
  await js("window.osHeroApi.updateEquipment({action:'unequip',slot:'head'})");
  state = await js("window.osHeroApi.getState()");
  check("removing hat retains saved hairstyle and color", state.character.equipped.hair === "ponytail_hair" && state.character.hairColor === "#714D38" && !state.character.equipped.head);
  check("forged hairstyle assignment rejected", await js("window.osHeroApi.saveCharacter({bodyColor:'#F1C27D',hair:'expedition_star_hat'}).then(()=>false,()=>true)"));
  check("unsupported palette rejected", await js("window.osHeroApi.saveCharacter({bodyColor:'#F1C27D',hairColor:'bad'}).then(()=>false,()=>true)"));
  for (const language of ["ko", "en", "zh-CN"]) {
    await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
    await wait(100);
    await js("navigateTray('inventory')");
    await ij("document.querySelector('[data-tab=back]').click()");
    check(`${language} wardrobe names and thumbnails resolve`, await ij("!document.body.innerText.includes('item.') && !document.body.innerText.includes('category.') && Array.from(document.querySelectorAll('.item-thumbnail')).every(img=>img.complete && img.naturalWidth > 0)"));
    await capture(inventory, `wardrobe-inventory-${language}.png`);
  }
  inventory.setSize(390, 720);
  await wait(200);
  check("six category tabs remain within narrow window", await ij("document.documentElement.scrollWidth <= innerWidth"));
  await capture(inventory, "wardrobe-inventory-compact.png");
  await js("navigateTray('companion')");
  await renderLookBoard({ BrowserWindow, capture });
};

async function renderLookBoard({ BrowserWindow, capture }) {
  const looks = [
    ["도시의 여행자", "travel_cap", "travel_jacket", "teal_backpack", "travel_mug", null],
    ["숲의 길잡이", null, "sage_tunic", "ochre_cape", "trail_sword", null],
    ["룬 연구자", "rune_hat", "rune_coat", null, "field_book", "round_glasses"],
    ["마을의 기사", "silver_circlet", "village_armor", "teal_cape", "trail_sword", null]
  ];
  const heroes = looks.map(([name, head, clothes, back, tool, face]) => {
    let hero = { ...defaultCharacter(), hairColor: "#714D38" };
    for (const id of ["ponytail_hair", head, clothes, back, tool, face].filter(Boolean)) hero = equipItem(hero, id);
    return { name, hero, frames: [0, 1, 2, 3].map((frame) => renderCharacterDataUrl(hero, frame, 1)) };
  });
  const html = `<html lang="ko"><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:48px;font:16px -apple-system,sans-serif;color:#17212b;background:#fff}h1{font-size:32px;margin:0 0 12px}p{color:#657181}main{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin:40px 0}section{text-align:center}img{image-rendering:pixelated;image-rendering:crisp-edges}section>img{width:240px;height:240px;background:#f2f5f6}h2{font-size:20px}.frames{display:flex;justify-content:center;gap:8px}.frames img{width:48px;height:48px}.sizes{display:flex;align-items:center;gap:48px;padding:28px 0;border-top:1px solid #d2dbe4}.sizes span{text-align:center}.sizes img{display:block;margin:0 auto 12px}.detail{margin-top:30px;display:flex;gap:24px}.detail img{width:144px;height:144px}small{color:#657181}
  </style><h1>OS Hero · 모험가의 옷장</h1><p>실제 24 × 24 렌더링 · 동일한 헤어와 머리색 · 4프레임</p><main>${heroes.map(({ name, frames }) => `<section><img src="${frames[0]}"><h2>${name}</h2><div class="frames">${frames.map((src) => `<img src="${src}">`).join("")}</div></section>`).join("")}</main><div class="sizes">${[24,48,144].map((size, i) => `<span><img width="${size}" height="${size}" src="${heroes[0].frames[0]}">${["메뉴바 콘텐츠", "메뉴 버튼", "히어로"][i]}</span>`).join("")}<p>하나의 원장 · 하나의 렌더러<br>개별 레이어 자동 확대·축소 없음</p></div><div class="detail">${["long_hair","bob_hair","princess_hair","braided_hair"].map((id) => `<span><img src="${renderCharacterDataUrl(equipItem(heroes[0].hero,id),2,1)}"><br><small>${id}</small></span>`).join("")}</div></html>`;
  const board = new BrowserWindow({ width: 1536, height: 1024, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await board.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await capture(board, "wardrobe-native-board.png");
  board.close();
}
