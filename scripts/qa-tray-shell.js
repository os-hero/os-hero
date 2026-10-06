const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

module.exports = async function ({ panel, BrowserWindow, app, tray, output, check, capture, wait }) {
  const js = (code) => panel.webContents.executeJavaScript(code, true);
  const restored = async (code) => {
    // Packaged renderer startup is asynchronous and can exceed 650ms under signing/build load.
    for (let attempt = 0; attempt < 50; attempt++) {
      try { if (await js(code)) return true; } catch {}
      await wait(100);
    }
    return false;
  };
  const go = async (route) => { await js(`navigateTray(${JSON.stringify(route)})`); await wait(100); };
  const originalId = panel.id;
  const helperRunning = () => spawnSync("pgrep", ["-P", String(process.pid), "-f", "oshero-outside-click"]).status === 0;
  if (process.platform === "darwin") check("outside-click helper running only with visible popup", helperRunning());
  const metrics = [];
  const measure = () => js(`(() => {
    const page = document.getElementById('tray-page');
    const overflow = [...document.querySelectorAll('.tray-shell, .tray-shell *')].filter(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (!r.width || !r.height || s.visibility === 'hidden' || el.closest('dialog:not([open])')) return false;
      return r.left < -1 || r.right > innerWidth + 1;
    }).map(el => el.id || el.className || el.tagName);
    return { width: innerWidth, height: innerHeight, pageWidth:page.clientWidth, pageScrollWidth:page.scrollWidth,
      documentWidth:document.documentElement.scrollWidth, overflow };
  })()`);
  for (const size of [[760,600], [640,480], [520,600], [390,560], [320,480]]) {
    panel.setSize(...size);
    await wait(250);
    await js("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    for (const language of ["ko", "en", "zh-CN"]) {
      await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
      await wait(100);
      const bounds = JSON.stringify(panel.getBounds());
      for (const route of ["inventory", "customization", "companion", "quests", "settings", "about", "updates"]) {
        await go(route);
        if (route === "inventory") await js("document.getElementById('inventory-category').value='back'; document.getElementById('inventory-category').dispatchEvent(new Event('change'))");
        await wait(80);
        const result = await measure();
        metrics.push({size, language, route, expectedBounds: JSON.parse(bounds), nativeBounds: panel.getBounds(), ...result});
        fs.writeFileSync(path.join(output,"tray-layout-measurements.json"), JSON.stringify(metrics,null,2));
        check(`${size[0]} ${language} ${route}: same native bounds and window`, JSON.stringify(panel.getBounds()) === bounds && BrowserWindow.getAllWindows().length === 1 && panel.id === originalId);
        check(`${size[0]} ${language} ${route}: content fits horizontally`, result.documentWidth <= size[0] && result.pageScrollWidth <= result.pageWidth + 1 && result.overflow.length === 0);
        check(`${size[0]} ${language} ${route}: all images render`, await js("Array.from(document.images).every(img => img.complete && img.naturalWidth > 0)"));
        if (language === "ko" && [760,390,320].includes(size[0])) await capture(panel, `tray-${route}-${size[0]}.png`);
      }
    }
  }
  panel.setSize(760,600);
  await js("window.osHeroApi.setLanguage('ko')");
  await go("customization");
  const original = await js("window.osHeroApi.getState()");
  await js("document.getElementById('body-color').value='#FADEBE';document.getElementById('body-color').dispatchEvent(new Event('input'))");
  await go("inventory");
  await go("customization");
  check("Hero draft survives internal routes without changing saved character", await js("document.getElementById('body-color').value==='#FADEBE'") && (await js("window.osHeroApi.getState()")).hero.key === original.hero.key);
  await js("document.getElementById('save-button').click()");
  await wait(200);
  check("Hero save stays in popup and refreshes canonical header", panel.isVisible() && await js("document.querySelector('[data-canonical-hero]').dataset.heroKey===state.hero.key && state.character.bodyColor==='#FADEBE'"));
  await js("document.getElementById('body-color').value='#INVALID';document.getElementById('body-color').dispatchEvent(new Event('input'))");
  await go("settings");
  await go("customization");
  check("invalid unsaved input is retained and cannot save", await js("document.getElementById('body-color').value==='#INVALID' && document.getElementById('save-button').disabled"));
  await js("document.getElementById('cancel-button').click()");
  await wait(100);
  check("Hero cancel resets draft but does not dismiss popup", panel.isVisible() && await js("document.getElementById('body-color').value==='#FADEBE'"));
  await go("inventory");
  await js("window.osHeroApi.updateEquipment({action:'equip',itemId:'long_hair'})");
  await go("customization");
  check("untouched hairstyle field follows equipment changed from inventory", await js("document.getElementById('hair-style').value==='long_hair'"));
  await go("quests");
  await js("document.getElementById('new-quest-button').click(); document.querySelector('[data-quest-type=adventure]').click(); document.getElementById('quest-title').value='QA 내부 이동 초안';document.getElementById('quest-title').dispatchEvent(new Event('input'))");
  await go("settings");
  await go("quests");
  check("quest draft survives menu navigation", await js("document.getElementById('quest-title').value==='QA 내부 이동 초안'"));
  await js("document.getElementById('save-quest-button').click()");
  await wait(200);
  check("quest save persists in same popup", BrowserWindow.getAllWindows().length === 1 && panel.isVisible() && (await js("window.osHeroApi.getState()")).quests.some(q=>q.title==='QA 내부 이동 초안'));
  await js("document.querySelector('[data-quest-id]').click();document.getElementById('edit-quest-button').click();document.getElementById('quest-title').value='X'.repeat(300);document.getElementById('quest-body').value='word'.repeat(500);document.getElementById('quest-title').dispatchEvent(new Event('input'))");
  panel.setSize(320,480);
  check("long quest input stays bounded at compact width", (await measure()).overflow.length === 0);
  await capture(panel, "tray-quest-form-320.png");
  await go("settings");
  await js("document.getElementById('settings-about').click()");
  check("about opens within shell and returns to settings", await js("trayRoute==='about' && !!document.getElementById('close-button')"));
  await js("document.getElementById('close-button').click()");
  check("about back does not close popup", panel.isVisible() && await js("trayRoute==='settings'"));
  check("ellipsis removed from shell", await js("!document.querySelector('#companion-more') && document.querySelectorAll('.tray-shell-header button').length===1"));
  const beforeFit = JSON.stringify(panel.getBounds());
  await js("window.osHeroApi.fitWindowToContent({width:1600,height:1200})");
  check("content-fit requests cannot resize the shared popup", JSON.stringify(panel.getBounds()) === beforeFit);
  panel.close();
  check("window-close command does not dismiss the popup", !panel.isDestroyed() && panel.isVisible());
  let nativeMenu;
  const originalPopup = tray.popUpContextMenu;
  tray.popUpContextMenu = (menu) => { nativeMenu = menu; };
  tray.emit("right-click");
  check("real tray right-click handler opens native menu, never toggles popup open", !!nativeMenu && !panel.isVisible() && nativeMenu.items.length === 3 && nativeMenu.items[0].submenu.items.length === 3);
  await wait(150);
  if (process.platform === "darwin") check("outside-click helper stops when popup hides", !helperRunning());
  nativeMenu.items[1].click();
  await wait(200);
  check("native About command reopens same shell at internal About route", panel.isVisible() && panel.id === originalId && await js("trayRoute==='about'"));
  tray.popUpContextMenu = originalPopup;
  panel.emit("blur");
  await wait(100);
  if (process.platform === "darwin") check("keyboard focus loss alone does not dismiss popup", panel.isVisible());
  await go("customization");
  await js("document.getElementById('hair-style').value='princess_hair';document.getElementById('hair-style').dispatchEvent(new Event('change'));persistTrayUi()");
  await wait(100);
  // Click on the tray icon is outside the popup, so closes it without losing drafts.
  app.emit("second-instance");
  await wait(10500);
  check("hidden popup renderer released after idle grace", panel.isDestroyed());
  app.emit("second-instance");
  await wait(650);
  panel = BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=tray'));
  check("route and unsaved Hero survive renderer teardown", await restored("trayRoute==='customization' && document.getElementById('hair-style')?.value==='princess_hair'"));
  check("draft restoration never equips without save", (await js("window.osHeroApi.getState()")).character.equipped.hair !== 'princess_hair');
  await capture(panel, "tray-restored-draft.png");
  await go("companion");
  await js("document.getElementById('companion-add').click();document.getElementById('quick-quest-title').value='QA 임시 퀘스트';persistTrayUi()");
  await wait(100);
  app.emit("second-instance");
  await wait(10500);
  app.emit("second-instance");
  await wait(650);
  panel = BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=tray'));
  check("quick quest dialog and unsaved title survive renderer teardown", await restored("document.getElementById('companion-dialog')?.open && document.getElementById('quick-quest-title')?.value==='QA 임시 퀘스트'"));
  await js("document.getElementById('dialog-close').click()");
  await wait(100);
  check("closing a child dialog keeps the shared popup open", panel.isVisible() && await js("!document.getElementById('companion-dialog').open"));
  for (const id of ["basic_hair", "silver_circlet", "cleric_robes", "iron_sword"]) await js(`window.osHeroApi.updateEquipment({action:'equip',itemId:${JSON.stringify(id)}})`);
  await js("window.osHeroApi.saveCharacter({gender:'male',bodyColor:'#FFE6BD',eyeType:'default',hairColor:'#29262E'})");
  await go("inventory");
  await js("document.getElementById('inventory-category').value='back';document.getElementById('inventory-category').dispatchEvent(new Event('change'));document.querySelector('[data-item=teal_backpack]').click()");
  await wait(150);
  await capture(panel, "tray-selected-design-state.png");
  await go("settings");
  await capture(panel, "tray-selected-settings.png");
};
