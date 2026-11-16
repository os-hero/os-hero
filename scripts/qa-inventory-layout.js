const fs = require("fs");
const path = require("path");

module.exports = async function ({ panel, BrowserWindow, output, check, capture, wait }) {
  await panel.webContents.executeJavaScript("window.osHeroApi.openTrayView('inventory')", true);
  await wait(250);
  const inventory = panel;
  const js = (code) => inventory.webContents.executeJavaScript(code, true);
  const measurements = [];
  for (const size of [[760, 600], [860, 720], [720, 600], [681, 600], [680, 600], [720, 540], [760, 480], [600, 600], [520, 540], [390, 600], [320, 480]]) {
    inventory.setSize(...size);
    inventory.show();
    await wait(150);
    for (const language of ["ko", "en", "zh-CN"]) {
      await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
      await wait(80);
      const group = [];
      for (const tab of ["back", "hair", "head", "face", "clothes", "tool", "background", "back"]) {
        await js(`document.getElementById('inventory-category').value=${JSON.stringify(tab)};document.getElementById('inventory-category').dispatchEvent(new Event('change'))`);
        await wait(60);
        const metrics = await js(`(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x, width:r.width}; };
          const owners = [...document.querySelectorAll('*')].filter(element => element.getClientRects().length && /auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1);
          const action = document.querySelector('#selected-unequip-button:not([hidden]), #equip-button:not([hidden])').getBoundingClientRect();
          return { viewport:innerWidth, height:innerHeight, documentWidth:document.documentElement.clientWidth,
            overflow:document.documentElement.scrollWidth>innerWidth || appRoot.scrollWidth>appRoot.clientWidth,
            scrollOwners:owners.map(element=>element.className), innerScroll:getComputedStyle(document.querySelector('.item-list')).overflowY,
            pageClipped:appRoot.scrollHeight>appRoot.clientHeight+1 && getComputedStyle(appRoot).overflowY==='hidden',
            actionBottom:action.bottom,
            shell:rect('.app-shell'), list:rect('.inventory-list'), row:rect('.item-row'), preview:rect('.side-preview') };
        })()`);
        group.push({ size, language, tab, native: inventory.getSize(), ...metrics });
        if (language === "ko" && tab === "hair") await capture(inventory, `inventory-hair-${size[0]}x${size[1]}.png`);
      }
      measurements.push(...group);
      fs.writeFileSync(path.join(output, "inventory-layout-measurements.json"), JSON.stringify(measurements, null, 2));
      const first = group[0];
      // Root clientWidth reports scrollbar presence, not the reserved layout gutter.
      for (const property of ["native", "shell", "list", "row", "preview"]) {
        check(`${size[0]}px ${language}: ${property} stable through all tabs`, group.every((entry) => JSON.stringify(entry[property]) === JSON.stringify(first[property])));
      }
      check(`${size[0]}px ${language}: no horizontal overflow`, group.every((entry) => !entry.overflow));
      check(`${size.join('x')} ${language}: at most one vertical scroll owner`, group.every(entry => entry.scrollOwners.length <= 1));
      check(`${size.join('x')} ${language}: no content clipped by a hidden page`, group.every(entry => !entry.pageClipped));
      if (size[0] >= 681 && size[1] >= 600) {
        check(`${size.join('x')} ${language}: all actions visible without page scrolling`, group.every(entry => entry.actionBottom <= entry.height - 4));
        check(`${size.join('x')} ${language}: only the item grid may scroll`, group.every(entry => entry.scrollOwners.every(owner => owner.includes('item-list'))));
      } else {
        check(`${size.join('x')} ${language}: compact view uses page scrolling only`, group.every(entry => entry.innerScroll === 'visible' && entry.scrollOwners.every(owner => owner.includes('tray-page'))));
      }
    }
    await js("window.osHeroApi.setLanguage('ko')");
    await wait(80);
    await js("document.getElementById('inventory-category').value='hair';document.getElementById('inventory-category').dispatchEvent(new Event('change'))");
    await wait(80);
    await js("document.querySelector('.item-row:last-child').focus()");
    check(`${size.join('x')}: keyboard can reach last item`, await js("(() => {const r=document.activeElement.getBoundingClientRect();return r.top>=document.querySelector('.tray-page').getBoundingClientRect().top-1 && r.bottom<=innerHeight;})()"));
    await js("document.activeElement.click()");
    await wait(60);
    await js("document.getElementById('equip-button').focus()");
    check(`${size.join('x')}: selected-item action remains reachable`, await js("(() => {const r=document.activeElement.getBoundingClientRect();return document.activeElement.id==='equip-button' && r.top>=document.querySelector('.tray-page').getBoundingClientRect().top-1 && r.bottom<=innerHeight;})()"));
    await capture(inventory, `inventory-layout-${size[0]}x${size[1]}.png`);
  }
  await js("navigateTray('companion')");
};
