const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { ITEM_CATEGORIES } = require("../src/shared/catalog");
const decode = (src) => PNG.sync.read(Buffer.from(src.split(",")[1], "base64"));
const fixtureItems = ["long_hair", "red_cap", "round_glasses", "travel_jacket", "teal_backpack", "travel_mug", "background_rain_town"];

async function run({ panel, BrowserWindow, app, profile, output, check, capture, wait, getTrayImage }) {
  const js = (code) => panel.webContents.executeJavaScript(code, true);
  await js("navigateTray('inventory')");
  await wait(150);
  let state = await js("window.osHeroApi.getState()");
  const owned = JSON.stringify(state.items.map(item => item.id));
  const quests = fs.readFileSync(path.join(profile, "quests.json"), "utf8");
  const initialBounds = JSON.stringify(panel.getBounds());
  check("seven independent equipped slots use separate accessible filter/remove buttons", await js("document.querySelectorAll('[data-equipped-slot]').length === 7 && !document.querySelector('button button') && Array.from(document.querySelectorAll('[data-equipped-slot], [data-unequip-slot]')).every(button => button.title && button.getAttribute('aria-label'))"));
  check("empty slots offer no active clear; default outfit reset is disabled", await js("document.querySelector('[data-equipped-slot=head]').dataset.empty === 'true' && !document.querySelector('[data-unequip-slot=head]') && document.querySelector('[data-unequip-slot=clothes]').disabled"));
  check("default meadow can be removed", await js("!document.querySelector('[data-unequip-slot=background]').disabled"));

  // Match the selected UI mock using the actual canonical rig, not generated sprites.
  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'basic_hair'})");
  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'red_cap'})");
  await js("window.osHeroApi.saveCharacter({gender:'male',bodyColor:'#F1C27D',eyeType:'default',hairColor:'#714D38'})");
  await js("document.querySelector('[data-equipped-slot=head]').click()");
  await wait(150);
  await js("clearInterval(previewTimer);previewFrame=0;updatePreview(document.getElementById('character-preview'),state.character)");
  check("desktop preview action fits completely inside the fixed popup", await js("document.getElementById('equip-button').getBoundingClientRect().bottom <= innerHeight - 8"));
  await capture(panel, "unequip-slots-desktop.png");
  await compare({ BrowserWindow, output, capture });

  for (const id of fixtureItems) await js(`window.osHeroApi.updateEquipment({action:'equip',itemId:${JSON.stringify(id)}})`);
  await js("window.osHeroApi.saveCharacter({gender:'female',bodyColor:'#FFE6BD',eyeType:'bright',hairColor:'#714D38'})");
  await wait(120);
  check("equipped toolbar uses catalog thumbnails for worn items only", await js("state.itemCategories.every(({id}) => {const img=document.querySelector(`[data-equipped-slot=${id}] .equipment-thumbnail`);return img && img.src===state.itemThumbnails[state.character.equipped[id]];})"));
  await js("document.querySelector('[data-equipped-slot=head]').click();document.querySelector('[data-item=wizard_hat]').click()");
  await wait(120);
  check("uncommitted preview never replaces the worn headwear in toolbar", (await js("window.osHeroApi.getState()")).character.equipped.head === "red_cap" && await js("document.querySelector('[data-equipped-slot=head] .equipment-thumbnail').src===state.itemThumbnails.red_cap && document.getElementById('character-preview').dataset.heroKey==='draft'"));
  await js("document.querySelector('[data-unequip-slot=head]').click()");
  await wait(180);
  state = await js("window.osHeroApi.getState()");
  check("remove targets actual worn item even while previewing another", state.character.equipped.head === null && state.character.equipped.hair === "long_hair");
  check("cleared slot preview immediately switches to saved canonical Hero", await js(`document.getElementById('character-preview').dataset.heroKey===${JSON.stringify(state.hero.key)} && !document.querySelector('.item-row.selected') && document.getElementById('equip-button').disabled`));
  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'red_cap'})");

  for (const { id: slot } of ITEM_CATEGORIES) {
    const before = (await js("window.osHeroApi.getState()")).character;
    await js("document.querySelector('[data-equipped-slot=background]').click()");
    const disabledDuringSave = await js(`(() => {const button=document.querySelector('[data-unequip-slot=${slot}]');button.click();button.click();return document.querySelector('.inventory-content').getAttribute('aria-busy')==='true' && Array.from(document.querySelectorAll('[data-unequip-slot], #equip-button')).every(b=>b.disabled);})()`);
    check(`${slot}: duplicate clicks are blocked while save is pending`, disabledDuringSave);
    await wait(200);
    state = await js("window.osHeroApi.getState()");
    const expected = slot === "clothes" ? "default_clothes" : null;
    check(`${slot}: correct removal/default-outfit policy applied`, state.character.equipped[slot] === expected);
    check(`${slot}: all other appearance fields and slots preserved`, JSON.stringify({ ...state.character, equipped: before.equipped }) === JSON.stringify(before) && JSON.stringify({ ...state.character.equipped, [slot]: before.equipped[slot] }) === JSON.stringify(before.equipped));
    check(`${slot}: ownership, gold and quest records retained`, JSON.stringify(state.items.map(item => item.id)) === owned && state.wallet.gold === 17 && fs.readFileSync(path.join(profile, "quests.json"), "utf8") === quests);
    check(`${slot}: saved Hero is shown without re-previewing removed equipment`, await js(`document.getElementById('character-preview').dataset.heroKey===${JSON.stringify(state.hero.key)} && document.getElementById('inventory-category').value===${JSON.stringify(slot)}`));
    check(`${slot}: empty/reset state prevents another active removal`, await js(slot === "clothes" ? "document.querySelector('[data-unequip-slot=clothes]').disabled" : `!document.querySelector('[data-unequip-slot=${slot}]') && document.querySelector('[data-equipped-slot=${slot}]').dataset.empty==='true'`));
    const actual = PNG.sync.read(getTrayImage().toPNG({ scaleFactor: 1 }));
    check(`${slot}: real native tray receives canonical scene live without restart`, state.hero.sceneFrames.map(decode).some(frame => frame.data.equals(actual.data)));
    check(`${slot}: popup bounds do not change`, JSON.stringify(panel.getBounds()) === initialBounds);
  }
  check("hair palette retained after all removals", state.character.hairColor === "#714D38");
  check("background removal preserves native 39x26 and 78x52 Retina bounds", getTrayImage().getSize().width === 39 && getTrayImage().getSize().height === 26 && PNG.sync.read(getTrayImage().toPNG({ scaleFactor: 2 })).width === 78);
  check("explicit no-background is persisted as null", JSON.parse(fs.readFileSync(path.join(profile, "character.json"))).equipped.background === null);
  await capture(panel, "unequip-background-transparent.png");

  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'long_hair'})");
  await js("document.querySelector('[data-equipped-slot=hair]').click()");
  const prior = (await js("window.osHeroApi.getState()")).character;
  fs.mkdirSync(path.join(profile, "character.json.tmp"));
  try {
    await js("document.querySelector('[data-unequip-slot=hair]').click()");
    await wait(180);
    check("failed clear keeps canonical Hero and disk unchanged", JSON.stringify((await js("window.osHeroApi.getState()")).character) === JSON.stringify(prior) && JSON.stringify(JSON.parse(fs.readFileSync(path.join(profile, "character.json")))) === JSON.stringify(prior));
    check("failed clear shows a visible error and allows retry", await js("!document.querySelector('.inventory-error').hidden && document.querySelector('.inventory-error').textContent.includes('저장') && !document.querySelector('[data-unequip-slot=hair]').disabled"));
    await capture(panel, "unequip-save-error.png");
  } finally { fs.rmdirSync(path.join(profile, "character.json.tmp")); }
  await js("document.querySelector('[data-unequip-slot=hair]').click()");
  await wait(180);
  check("retry clears successfully and dismisses error", (await js("window.osHeroApi.getState()")).character.equipped.hair === null && await js("document.querySelector('.inventory-error').hidden"));
  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'red_cap'})");
  const stale = await js("window.osHeroApi.updateEquipment({action:'unequip',slot:'head',itemId:'travel_cap'}).then(()=>false,()=>true)");
  check("stale removal cannot clear a newer equipped item", stale && (await js("window.osHeroApi.getState()")).character.equipped.head === "red_cap");
  check("invalid equipment slot assignment rejected", await js("window.osHeroApi.updateEquipment({action:'equip',slot:'back',itemId:'red_cap'}).then(()=>false,()=>true)"));
  check("unknown removal slot rejected", await js("window.osHeroApi.updateEquipment({action:'unequip',slot:'unknown'}).then(()=>false,()=>true)"));
  await js("window.osHeroApi.updateEquipment({action:'unequip',slot:'head'})");
  const bytes = fs.readFileSync(path.join(profile, "character.json"), "utf8");
  await js("window.osHeroApi.updateEquipment({action:'unequip',slot:'head'})");
  check("repeated slot-only removal is idempotent", fs.readFileSync(path.join(profile, "character.json"), "utf8") === bytes);

  const measurements = [];
  for (const language of ["ko", "en", "zh-CN"]) {
    await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
    for (const width of [760, 640, 520, 390, 320]) {
      panel.setSize(width, 600);
      await wait(80);
      const native = JSON.stringify(panel.getSize());
      const group = [];
      for (const { id: slot } of ITEM_CATEGORIES) {
        await js(`document.querySelector('[data-equipped-slot=${slot}]').click()`);
        await wait(25);
        const metrics = await js(`(() => {
          const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,width:r.width};};
          const tiles=Array.from(document.querySelectorAll('.equipment-slot'));
          return {overflow:document.documentElement.scrollWidth>innerWidth || document.querySelector('.tray-page').scrollWidth>document.querySelector('.tray-page').clientWidth,
            slots:rect('.equipment-slots'),list:rect('.inventory-list'),preview:rect('.side-preview'),
            rows:new Set(tiles.map(tile=>tile.getBoundingClientRect().top)).size,
            labelsFit:tiles.every(tile=>{const label=tile.querySelector('.equipment-slot-label');return label.scrollWidth<=label.clientWidth && label.scrollHeight<=label.clientHeight;}),
            iconsLoaded:Array.from(document.querySelectorAll('.ui-icon')).every(img=>img.complete && img.naturalWidth>0),
            localized:!document.body.innerText.includes('inventory.') && !document.body.innerText.includes('category.')};
        })()`);
        check(`${language}/${width}/${slot}: no overflow or native resizing`, !metrics.overflow && JSON.stringify(panel.getSize()) === native);
        check(`${language}/${width}/${slot}: labels, icons and current-slot state valid`, metrics.labelsFit && metrics.iconsLoaded && metrics.localized && await js(`document.querySelector('[data-equipped-slot=${slot}]').getAttribute('aria-current')==='true'`));
        if (language === "en") {
          const label = await js("(() => {const label=document.querySelector('[data-equipped-slot=background] .equipment-slot-label');const style=getComputedStyle(label);const range=document.createRange();range.selectNodeContents(label);return {text:label.textContent,width:label.getBoundingClientRect().width,height:label.getBoundingClientRect().height,font:style.font,lineWidths:Array.from(range.getClientRects(),rect=>rect.width)};})()");
          if (label.height >= 24) {
            await capture(panel, `unequip-label-${language}-${width}.png`);
            fs.writeFileSync(path.join(output, `unequip-label-${language}-${width}.json`), JSON.stringify(label, null, 2));
          }
          check(`${language}/${width}/${slot}: compact background label stays on one line`, label.height < 24);
        }
        if (width === 760) {
          const bottom = await js("document.getElementById('equip-button').getBoundingClientRect().bottom");
          if (bottom > 592) await capture(panel, `unequip-clipped-${language}-${slot}.png`);
          check(`${language}/${width}/${slot}: preview action visible without page scrolling (bottom ${bottom})`, bottom <= 592);
        }
        group.push({ language, width, slot, ...metrics });
      }
      for (const key of ["slots", "list", "preview"]) check(`${language}/${width}: ${key} width stable across all seven categories`, group.every(entry => JSON.stringify(entry[key]) === JSON.stringify(group[0][key])));
      check(`${language}/${width}: toolbar wraps only at responsive breakpoints`, group.every(entry => entry.rows === (width > 752 ? 1 : width > 420 ? 2 : 3)));
      measurements.push(...group);
      if (language === "en" || width === 390 || width === 320) await capture(panel, `unequip-${language}-${width}.png`);
      if (width <= 520) {
        await js("appRoot.scrollTop=appRoot.scrollHeight");
        await wait(50);
        check(`${language}/${width}: last inventory item remains reachable by vertical scroll`, await js("document.querySelector('.item-row:last-child').getBoundingClientRect().bottom <= innerHeight + 1"));
        if (language === "ko" && width === 320) await capture(panel, "unequip-ko-320-scrolled.png");
        await js("appRoot.scrollTop=0");
      }
    }
  }
  fs.writeFileSync(path.join(output, "unequip-layout-measurements.json"), JSON.stringify(measurements, null, 2));
  const boundaries = [];
  await js("window.osHeroApi.setLanguage('en')");
  for (const width of [753, 752, 749, 748, 721, 720, 421, 420, 361, 360]) {
    panel.setSize(width, 600);
    await wait(80);
    const native = JSON.stringify(panel.getSize());
    const metrics = await js("(() => {const label=document.querySelector('[data-equipped-slot=background] .equipment-slot-label');const slots=document.querySelector('.equipment-slots');return {width:innerWidth,labelHeight:label.getBoundingClientRect().height,rows:new Set(Array.from(slots.children,tile=>tile.getBoundingClientRect().top)).size,overflow:document.documentElement.scrollWidth>innerWidth || appRoot.scrollWidth>appRoot.clientWidth};})()");
    boundaries.push(metrics);
    if (metrics.labelHeight >= 24 || metrics.overflow) await capture(panel, `unequip-boundary-${width}.png`);
    check(`en/${width}: responsive boundary preserves labels and native size without overflow`, metrics.labelHeight < 24 && !metrics.overflow && JSON.stringify(panel.getSize()) === native);
    check(`en/${width}: responsive boundary uses the intended slot rows`, metrics.rows === (width > 752 ? 1 : width > 420 ? 2 : 3));
  }
  fs.writeFileSync(path.join(output, "unequip-boundary-measurements.json"), JSON.stringify(boundaries, null, 2));
  panel.setSize(760, 600);
  await js("window.osHeroApi.setLanguage('ko');document.querySelector('[data-equipped-slot=background]').click();persistTrayUi()");
  await wait(150);
  const fixture = Object.fromEntries(["character.json", "settings.json", "quests.json", "wallet.json", "expedition.json"].map(file => [file, JSON.parse(fs.readFileSync(path.join(profile, file)))]));
  fs.writeFileSync(path.join(output, "unequip-restart-fixture.json"), JSON.stringify(fixture));
  panel.show();
  check("inventory idle test starts from a visible popup", panel.isVisible());
  app.emit("second-instance");
  check("inventory toggle hides popup before idle grace", !panel.isVisible());
  await wait(10500);
  check("hidden inventory renderer is still disposed after idle grace", panel.isDestroyed());
  app.emit("second-instance");
  await wait(700);
  const recreated = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("view=tray"));
  check("recreated inventory restores the empty slot and canonical transparent preview", recreated && await recreated.webContents.executeJavaScript("document.getElementById('inventory-category').value==='background' && inventoryRoute.previewEquipped===true && document.getElementById('character-preview').dataset.heroKey===state.hero.key && document.querySelector('[data-equipped-slot=background]').dataset.empty==='true'"));
}

async function restart({ panel, profile, output, check, capture, wait, getTrayImage }) {
  const js = code => panel.webContents.executeJavaScript(code, true);
  const state = await js("window.osHeroApi.getState()");
  const fixture = JSON.parse(fs.readFileSync(path.join(output, "unequip-restart-fixture.json")));
  check("all cleared slots survive full process restart", ITEM_CATEGORIES.every(({ id }) => state.character.equipped[id] === (id === "clothes" ? "default_clothes" : null)));
  check("appearance palette and personal records preserved on restart", state.character.hairColor === "#714D38" && state.character.gender === "female" && state.character.bodyColor === "#FFE6BD" && JSON.stringify(state.quests) === JSON.stringify(fixture["quests.json"].quests.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) && state.wallet.gold === 17);
  check("saved background remains explicit null, not meadow", JSON.parse(fs.readFileSync(path.join(profile, "character.json"))).equipped.background === null);
  check("cached scenes and actual tray remain transparent after restart", state.hero.sceneFrames.every(src => decode(src).data.some((v, i) => i % 4 === 3 && v === 0)) && state.hero.sceneFrames.map(decode).some(frame => frame.data.equals(PNG.sync.read(getTrayImage().toPNG({ scaleFactor: 1 })).data)));
  await js("navigateTray('inventory');document.querySelector('[data-equipped-slot=background]').click()");
  await wait(150);
  check("restarted empty-slot preview uses saved universal Hero", await js("document.getElementById('character-preview').dataset.heroKey===state.hero.key && !document.querySelector('.item-row.selected') && document.getElementById('equip-button').disabled"));
  await capture(panel, "unequip-restarted.png");
}

async function compare({ BrowserWindow, output, capture }) {
  const target = process.env.OS_HERO_QA_DESIGN;
  if (!target) return;
  const url = file => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  const html = `<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#e8edf3;font:14px system-ui;color:#17212b}main{display:flex;gap:16px}figure{margin:0}figcaption{height:24px}img{display:block;width:760px;height:600px;object-fit:fill}.detail{margin-top:16px}.detail img{width:1140px;height:900px;object-position:top left}</style><main><figure><figcaption>Selected concept 3 (normalized 760 x 600)</figcaption><img src="${url(target)}"></figure><figure><figcaption>Actual Electron implementation (760 x 600 CSS px)</figcaption><img src="${url(path.join(output, "unequip-slots-desktop.png"))}"></figure></main></html>`;
  const board = new BrowserWindow({ width: 1568, height: 656, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await board.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await capture(board, "unequip-design-comparison.png");
  board.close();
  const detailHtml = `<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#e8edf3;font:14px system-ui;color:#17212b}figure{margin:0 0 16px}figcaption{height:24px}.crop{width:1140px;height:312px;overflow:hidden}.crop img{display:block;max-width:none;width:1520px;height:1200px;margin-left:-328px;margin-top:-248px}</style>${[["Selected concept: equipped slots (2x)", target], ["Actual Electron: equipped slots (2x)", path.join(output, "unequip-slots-desktop.png")]].map(([label, file]) => `<figure><figcaption>${label}</figcaption><div class="crop"><img src="${url(file)}"></div></figure>`).join("")}</html>`;
  const detail = new BrowserWindow({ width: 1172, height: 720, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await detail.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(detailHtml)}`);
  await capture(detail, "unequip-design-detail.png");
  detail.close();
}

module.exports = { run, restart };
