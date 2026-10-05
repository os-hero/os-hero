const fs = require("fs");
const path = require("path");

module.exports = async function ({ panel, BrowserWindow, output, check, capture, wait }) {
  await panel.webContents.executeJavaScript("window.osHeroApi.openTrayView('inventory')", true);
  await wait(250);
  const inventory = panel;
  const js = (code) => inventory.webContents.executeJavaScript(code, true);
  const measurements = [];
  for (const size of [[860, 720], [720, 600], [600, 600], [520, 540]]) {
    inventory.setSize(...size);
    inventory.show();
    await wait(150);
    for (const language of ["ko", "en", "zh-CN"]) {
      await js(`window.osHeroApi.setLanguage(${JSON.stringify(language)})`);
      await wait(80);
      const group = [];
      for (const tab of ["back", "hair", "head", "face", "clothes", "tool", "back"]) {
        await js(`document.getElementById('inventory-category').value=${JSON.stringify(tab)};document.getElementById('inventory-category').dispatchEvent(new Event('change'))`);
        await wait(60);
        const metrics = await js(`(() => {
          const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x, width:r.width}; };
          return { viewport:innerWidth, documentWidth:document.documentElement.clientWidth, overflow:document.documentElement.scrollWidth>innerWidth,
            shell:rect('.app-shell'), list:rect('.inventory-list'), row:rect('.item-row'), preview:rect('.side-preview') };
        })()`);
        group.push({ size, language, tab, native: inventory.getSize(), ...metrics });
      }
      measurements.push(...group);
      fs.writeFileSync(path.join(output, "inventory-layout-measurements.json"), JSON.stringify(measurements, null, 2));
      const first = group[0];
      // Root clientWidth reports scrollbar presence, not the reserved layout gutter.
      for (const property of ["native", "shell", "list", "row", "preview"]) {
        check(`${size[0]}px ${language}: ${property} stable through all tabs`, group.every((entry) => JSON.stringify(entry[property]) === JSON.stringify(first[property])));
      }
      check(`${size[0]}px ${language}: no horizontal overflow`, group.every((entry) => !entry.overflow));
    }
    await js("window.osHeroApi.setLanguage('ko')");
    await wait(80);
    await capture(inventory, `inventory-layout-${size[0]}.png`);
  }
  await js("navigateTray('companion')");
};
