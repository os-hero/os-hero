const fs = require("fs");
const path = require("path");
const { defaultCharacter, equipItem, ITEMS, EYE_TYPES } = require("../src/shared/catalog");
const { renderCharacterDataUrl, renderTrayCharacterBuffer, renderItemDataUrl } = require("../src/main/pixelRenderer");

function heroFor(ids, overrides = {}) {
  let hero = { ...defaultCharacter(), bodyColor: "#FFE6BD", hairColor: "#714D38", ...overrides };
  for (const id of ids.filter(Boolean)) hero = equipItem(hero, id);
  return hero;
}

function snapshot() {
  const image = (hero, frame = 0) => renderCharacterDataUrl(hero, frame, 1);
  const scene = (hero, frame = 0) => `data:image/png;base64,${renderTrayCharacterBuffer(hero, frame, { platform: "darwin", scaleFactor: 2 }).toString("base64")}`;
  const looks = [
    ["Pocket Companion", "basic_hair", "travel_jacket", "travel_mug"],
    ["Rune Scholar", "curly_hair", "wizard_hat", "wizard_robe", "magic_staff"],
    ["Village Knight", "side_part_hair", "silver_circlet", "village_armor", "teal_cape", "trail_sword"],
    ["Long Hair", "princess_hair", "princess_dress", "ochre_cape", "field_book"]
  ].map(([name, ...ids]) => {
    const hero = heroFor(ids);
    return { name, hero, frames: [0, 1, 2, 3].map(frame => image(hero, frame)), scenes: [0, 1, 2, 3].map(frame => scene(hero, frame)) };
  });
  const categories = ["hair", "head", "clothes", "back", "face", "tool"].map(slot => ({
    slot, items: ITEMS.filter(item => item.slot === slot).map(item => {
      const hero = heroFor(["basic_hair", "travel_jacket", item.id]);
      return { id: item.id, image: image(hero), icon: renderItemDataUrl(item.id) };
    })
  }));
  const eyes = EYE_TYPES.map(({ id }) => ({ id, image: image(heroFor(["basic_hair", "travel_jacket"], { eyeType: id })) }));
  const skin = ["#FFE6BD", "#F1C27D", "#6C4437"].map(bodyColor => ({ id: bodyColor, image: image(heroFor(["basic_hair", "travel_jacket"], { bodyColor })) }));
  return { looks, categories, eyes, skin };
}

async function renderReview({ BrowserWindow, output, capture }) {
  const data = snapshot();
  const escape = value => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const tiles = items => items.map(item => `<figure><img class="hero" src="${item.image}" alt="${escape(item.id)}"><figcaption>${escape(item.id.replaceAll("_", " "))}</figcaption></figure>`).join("");
  const html = `<html lang="en"><meta charset="utf-8"><title>Pocket Buddy Native Review</title><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#fff;color:#20252c;font:14px -apple-system,sans-serif;letter-spacing:0}h1{margin:0;font-size:24px}h2{font-size:16px;margin:0 0 14px}p{color:#5d6873;margin:10px 0 24px}img{image-rendering:pixelated;image-rendering:crisp-edges}section{border-top:1px solid #d5dde2;padding-top:20px;margin-top:22px}.looks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.look{text-align:center}.look .hero{width:144px;height:144px;background:#f4f6f8}.frames{display:flex;justify-content:center;gap:8px;margin:12px 0}.frames img{width:48px;height:48px}.native{display:flex;justify-content:center;gap:18px;align-items:center;height:48px;background:#181c20}.native.light{background:#edf1f3}.native img{width:39px;height:26px}.scene{width:156px;height:104px;margin-top:12px}.tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px}.tiles figure{margin:0;text-align:center;min-width:0}.tiles .hero{width:72px;height:72px;background:#f4f6f8}.tiles figcaption{font-size:12px;line-height:1.4;overflow-wrap:anywhere;margin:6px 0 0}.eye-skin{display:grid;grid-template-columns:2fr 1fr;gap:30px}.eye-skin .tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.eye-skin .skin .tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.note{font-size:12px}
    </style><h1>OS Hero · Pocket Buddy</h1><p>Actual 24px renderer · same Hero on every surface · unchanged 39 × 26 menu scene · four grounded Idle poses</p><main class="looks">${data.looks.map(look => `<div class="look"><h2>${escape(look.name)}</h2><img class="hero" src="${look.frames[0]}" alt="${escape(look.name)}"><div class="frames">${look.frames.map((src, i) => `<img src="${src}" alt="Frame ${i}">`).join("")}</div><div class="native">${look.scenes.slice(0, 2).map(src => `<img src="${src}" alt="Native dark menu">`).join("")}</div><div class="native light">${look.scenes.slice(0, 2).map(src => `<img src="${src}" alt="Native light menu">`).join("")}</div><img class="scene" src="${look.scenes[0]}" alt="Enlarged scene"></div>`).join("")}</main>${data.categories.map(group => `<section><h2>${escape(group.slot.toUpperCase())}</h2><div class="tiles">${tiles(group.items)}</div></section>`).join("")}<section class="eye-skin"><div><h2>EYE STYLES</h2><div class="tiles">${tiles(data.eyes)}</div></div><div class="skin"><h2>SKIN COLORS</h2><div class="tiles">${tiles(data.skin)}</div></div></section><p class="note">Coarse native pixels, no per-layer scaling. Long-hair face/cheek masks, cover/cap policies and hand anchors are retained.</p></html>`;
  fs.writeFileSync(path.join(output, "pocket-buddy-review.html"), html);
  fs.writeFileSync(path.join(output, "pocket-buddy-after.json"), JSON.stringify(data));
  const window = new BrowserWindow({ width: 1000, height: 1000, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const height = await window.webContents.executeJavaScript("document.documentElement.scrollHeight");
    window.setContentSize(1000, height);
    await capture(window, "pocket-buddy-review.png");
    // macOS caps window height at the display work area; capture every section too.
    for (let index = 0; index <= data.categories.length; index++) {
      await window.webContents.executeJavaScript(`document.querySelectorAll('section')[${index}].scrollIntoView({block:'start'})`);
      await capture(window, `pocket-buddy-${data.categories[index]?.slot || "eyes-skin"}.png`);
    }
  } finally { window.close(); }

  const referencePath = process.env.OS_HERO_QA_ART_REFERENCE || path.resolve(output, "../pocket-buddy-concept.png");
  if (!fs.existsSync(referencePath)) return;
  const reference = `data:image/png;base64,${fs.readFileSync(referencePath).toString("base64")}`;
  const comparison = `<html lang="en"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#fff;color:#20252c;font:14px -apple-system,sans-serif;letter-spacing:0}h1{font-size:20px;margin:0 0 16px}h2{font-size:14px;margin:0 0 12px}p{font-size:12px;line-height:1.5;color:#58646f}.full{display:grid;grid-template-columns:576px 450px;gap:22px}.reference{width:576px;height:384px}.looks{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;text-align:center}.looks img{width:144px;height:144px;image-rendering:pixelated}.focus{border-top:1px solid #d5dde2;margin-top:16px;padding-top:18px;display:grid;grid-template-columns:300px 320px 1fr;gap:28px}.crop{position:relative;width:260px;height:300px;overflow:hidden}.crop img{position:absolute;left:-140px;top:-135px;width:1536px;height:1024px;max-width:none}.actual{width:288px;height:288px;image-rendering:pixelated;background:#f4f6f8}.menu{padding:18px;background:#181c20}.menu.light{background:#edf1f3}.menu img{width:39px;height:26px;image-rendering:pixelated;margin:0 6px}
    </style><h1>Selected concept and actual native renderer</h1><div class="full"><div><h2>Source: Pocket Buddy concept, 1536 x 1024</h2><img class="reference" src="${reference}"></div><div><h2>Implementation: native 24 x 24, displayed at 6x</h2><div class="looks">${data.looks.map(look => `<div><img src="${look.frames[0]}"><p>${escape(look.name)}</p></div>`).join("")}</div></div></div><div class="focus"><div><h2>Source companion crop, original pixels</h2><div class="crop"><img src="${reference}"></div></div><div><h2>Same companion, native 24px at 12x</h2><img class="actual" src="${data.looks[0].frames[0]}"></div><div><h2>Actual 39 x 26 menu scenes, 1x CSS</h2><div class="menu">${data.looks.map(look => `<img src="${look.scenes[0]}">`).join("")}</div><div class="menu light">${data.looks.map(look => `<img src="${look.scenes[0]}">`).join("")}</div><p>The selected art direction is re-authored on the existing 24px rig. This is not a downsampled sprite sheet. Saved hair, eye, skin and equipment choices remain unchanged. Four synchronized Idle poses use the existing anchors and clock.</p></div></div></html>`;
  fs.writeFileSync(path.join(output, "pocket-buddy-reference-comparison.html"), comparison);
  const compareWindow = new BrowserWindow({ width: 1100, height: 900, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  try {
    await compareWindow.loadFile(path.join(output, "pocket-buddy-reference-comparison.html"));
    await capture(compareWindow, "pocket-buddy-reference-comparison.png");
  } finally { compareWindow.close(); }
}

module.exports = { snapshot, renderReview };
