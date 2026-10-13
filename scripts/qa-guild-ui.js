const fs = require("fs");
const path = require("path");

module.exports = async function ({ panel, BrowserWindow, profile, output, check, capture, wait }) {
  const js = code => panel.webContents.executeJavaScript(code, true);
  const fixture = ["long_hair", "silver_circlet", "forehead_goggles", "rune_coat", "teal_cape", "trail_sword", "background_meadow"];
  for (const itemId of fixture) await js(`window.osHeroApi.updateEquipment({action:'equip',itemId:${JSON.stringify(itemId)}})`);
  await js("window.osHeroApi.saveCharacter({gender:'female',bodyColor:'#FFE6BD',eyeType:'bright',hairColor:'#714D38'});navigateTray('inventory');document.querySelector('[data-equipped-slot=head]').click()");
  await wait(150);
  await js("document.fonts.ready");
  check("pixel display font loads offline while body text remains the system font", await js("Array.from(document.fonts).some(face=>face.family==='OS Hero Pixel' && face.status==='loaded') && !getComputedStyle(document.body).fontFamily.includes('OS Hero Pixel')"));
  check("horizontal top navigation uses three accessible in-popup routes", await js("getComputedStyle(document.querySelector('.tray-rail')).gridTemplateColumns.split(' ').length===3 && Array.from(document.querySelectorAll('.tray-rail button')).every(button=>button.getAttribute('aria-label') && button.title)"));
  check("equipped slots surround the Hero; the scene remains a wide 3:2 image", await js("(() => {const r=document.getElementById('character-preview').getBoundingClientRect();return document.querySelectorAll('[data-equipped-slot]').length===7 && document.querySelector('.equipment-scene').contains(document.getElementById('character-preview')) && Math.abs(r.width/r.height-1.5)<.01;})()"));
  check("inventory uses a three-column grid and selected accessible current item", await js("getComputedStyle(document.querySelector('.item-list')).gridTemplateColumns.split(' ').length===3 && document.querySelector('[data-item=silver_circlet]').getAttribute('aria-pressed')==='true'"));
  check("selected equipped item is fully visible within the desktop grid", await js("(() => {const list=document.querySelector('.item-list').getBoundingClientRect(),row=document.querySelector('.item-row.selected').getBoundingClientRect();return row.top>=list.top-1 && row.bottom<=list.bottom+1;})()"));
  check("footer clear acts on an actually equipped item; old Equip remains disabled", await js("!document.getElementById('selected-unequip-button').disabled && document.getElementById('equip-button').disabled && document.getElementById('equip-button').hidden"));
  const saved = fs.readFileSync(path.join(profile, "character.json"), "utf8");
  await js("document.querySelector('[data-item=red_cap]').click()");
  await wait(100);
  check("draft selection does not save or change the worn slot; primary Equip is available", fs.readFileSync(path.join(profile, "character.json"), "utf8") === saved && await js("!document.getElementById('equip-button').disabled && !document.getElementById('selected-unequip-button') && document.getElementById('equipment-heading').textContent==='미리보기' && document.querySelector('[data-equipped-slot=head] img').src===state.itemThumbnails.silver_circlet"));
  await js("document.querySelector('[data-equipped-slot=head]').click();document.getElementById('selected-unequip-button').click();document.getElementById('selected-unequip-button').click()");
  await wait(180);
  check("footer clear preserves hair, ownership and gold and restores visible keyboard focus", await js("state.character.equipped.head===null && state.character.equipped.hair==='long_hair' && state.wallet.gold===17 && document.activeElement.dataset.equippedSlot==='head' && !document.getElementById('selected-unequip-button')"));
  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'silver_circlet'});document.querySelector('[data-equipped-slot=head]').click()");
  const beforeFailure = fs.readFileSync(path.join(profile, "character.json"), "utf8");
  fs.mkdirSync(path.join(profile, "character.json.tmp"));
  try {
    await js("document.getElementById('selected-unequip-button').click()");
    await wait(180);
    check("failed footer clear leaves disk/appearance intact and allows retry", fs.readFileSync(path.join(profile, "character.json"), "utf8") === beforeFailure && await js("!document.querySelector('.inventory-error').hidden && !document.getElementById('selected-unequip-button').disabled"));
  } finally { fs.rmdirSync(path.join(profile, "character.json.tmp")); }
  await js("document.getElementById('selected-unequip-button').click()");
  await wait(150);
  check("footer retry succeeds without stale equipped item or lingering error", await js("state.character.equipped.head===null && document.querySelector('.inventory-error').hidden"));
  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'silver_circlet'});document.querySelector('[data-equipped-slot=head]').click()");
  const { ipcMain } = require("electron");
  const originalEquipment = ipcMain._invokeHandlers.get("inventory:update-equipment");
  ipcMain.removeHandler("inventory:update-equipment");
  ipcMain.handle("inventory:update-equipment", async (event,payload) => { await wait(180); return originalEquipment(event,payload); });
  try {
    await js("document.getElementById('selected-unequip-button').click();document.querySelector('[data-equipped-slot=back]').click()");
    await wait(350);
    check("late equipment save cannot overwrite a newer category choice or steal its focus", await js("state.character.equipped.head===null && inventoryRoute.tab==='back' && document.getElementById('inventory-category').value==='back' && document.activeElement.dataset.equippedSlot!=='head'"));
  } finally {
    ipcMain.removeHandler("inventory:update-equipment");
    ipcMain.handle("inventory:update-equipment", originalEquipment);
  }
  await js("document.querySelector('[data-equipped-slot=clothes]').click();document.getElementById('selected-unequip-button').click()");
  await wait(150);
  check("footer outfit reset preserves non-removable default-clothes policy", await js("state.character.equipped.clothes==='default_clothes' && !document.getElementById('selected-unequip-button') && document.querySelector('[data-unequip-slot=clothes]').disabled"));
  await js("document.querySelector('[data-equipped-slot=background]').click();document.getElementById('selected-unequip-button').click()");
  await wait(150);
  check("footer background clear persists explicit transparency and retains scene size", JSON.parse(fs.readFileSync(path.join(profile, "character.json"))).equipped.background === null && await js("Math.abs(document.getElementById('character-preview').width/document.getElementById('character-preview').height-1.5)<.01"));
  for (const itemId of fixture) await js(`window.osHeroApi.updateEquipment({action:'equip',itemId:${JSON.stringify(itemId)}})`);
  await js("document.querySelector('[data-equipped-slot=head]').click()");
  const rows = [];
  for (const language of ["ko", "en", "zh-CN"]) {
    await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
    for (const width of [760, 720, 681, 680, 520, 421, 420, 390, 320]) {
      panel.setSize(width, 600);
      await wait(80);
      await js("appRoot.scrollTop=0");
      const metrics = await js(`(() => {
        const r=document.getElementById('character-preview').getBoundingClientRect();
        const visibleClear=document.getElementById('selected-unequip-button').getBoundingClientRect();
        const controls=[...document.querySelectorAll('.guild-inventory button')].filter(button=>!button.hidden);
        return {width:innerWidth,height:innerHeight,pageOverflow:appRoot.scrollWidth>appRoot.clientWidth,
          documentOverflow:document.documentElement.scrollWidth>innerWidth,sceneRatio:r.width/r.height,
          labelsFit:controls.every(button=>button.scrollWidth<=button.clientWidth+1 && button.scrollHeight<=button.clientHeight+1),
          clippedControls:controls.filter(button=>button.scrollWidth>button.clientWidth+1 || button.scrollHeight>button.clientHeight+1).map(button=>({id:button.id,item:button.dataset.item,slot:button.dataset.equippedSlot,text:button.textContent.trim(),width:button.clientWidth,scrollWidth:button.scrollWidth,height:button.clientHeight,scrollHeight:button.scrollHeight})),
          clearBottom:visibleClear.bottom,slots:document.querySelectorAll('[data-equipped-slot]').length};})()`);
      rows.push({language,...metrics});
      fs.writeFileSync(path.join(output, "guild-layout-measurements.json"), JSON.stringify(rows, null, 2));
      if (metrics.pageOverflow || metrics.documentOverflow || !metrics.labelsFit) await capture(panel, `guild-clipped-${language}-${width}.png`);
      check(`${language}/${width}: 3:2 scene, seven slots, no horizontal clipping`, Math.abs(metrics.sceneRatio-1.5)<.01 && metrics.slots===7 && !metrics.pageOverflow && !metrics.documentOverflow && metrics.labelsFit);
      if (width > 680) check(`${language}/${width}: footer clear fits without scrolling`, metrics.clearBottom<=592);
      if (width===760 || width===320) await capture(panel, `guild-inventory-${language}-${width}.png`);
    }
  }
  fs.writeFileSync(path.join(output, "guild-layout-measurements.json"), JSON.stringify(rows, null, 2));
  panel.setSize(760, 600);
  await js("window.osHeroApi.setLanguage('ko')");
  for (const route of ["customization", "companion", "settings", "about", "updates"]) {
    await js(`navigateTray(${JSON.stringify(route)})`);
    await wait(80);
    if (route === "settings") {
      check("unchecked and checked switches retain distinct visible tracks", await js("getComputedStyle(document.getElementById('launch-at-login')).backgroundColor==='rgb(154, 170, 158)' && getComputedStyle(document.getElementById('auto-download-updates')).backgroundColor==='rgb(40, 100, 83)'"));
    }
    await capture(panel, `guild-${route}-760.png`);
  }
  await js("navigateTray('inventory');document.querySelector('[data-equipped-slot=head]').click()");
  await wait(100);
  await capture(panel, "guild-inventory-desktop.png");
  const reference = path.resolve(__dirname, "../review-artifacts/2026-10-13/guild-ui/selected-concept.png");
  if (fs.existsSync(reference)) {
    const image = file => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    const actual = path.join(output, "guild-inventory-desktop.png");
    const html = `<html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#e7ece8;font:14px system-ui}main{display:flex;gap:16px}figure{margin:0}figcaption{height:24px}img{display:block;width:760px;height:600px;object-fit:contain}</style><main><figure><figcaption>Selected concept 2 / normalized 760 x 600</figcaption><img src="${image(reference)}"></figure><figure><figcaption>Actual Electron / same equipped Hero and category</figcaption><img src="${image(actual)}"></figure></main></html>`;
    const comparison = new BrowserWindow({width:1568,height:656,show:false,frame:false,useContentSize:true});
    await comparison.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await capture(comparison, "guild-design-comparison.png");
    comparison.destroy();
    check("comparison capture leaves only the real popup", BrowserWindow.getAllWindows().length===1);
  }
};
