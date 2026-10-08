const fs = require("fs");
const path = require("path");
const { defaultCharacter, equipItem, ITEMS } = require("../src/shared/catalog");
const { renderCharacterDataUrl, renderTrayCharacterBuffer, renderItemDataUrl } = require("../src/main/pixelRenderer");

const LOOKS = [
  ["Traveler", "ponytail_hair", "travel_cap", "travel_jacket", "teal_backpack", "travel_mug", null],
  ["Forest Guide", "braided_hair", null, "sage_tunic", "ochre_cape", "trail_sword", null],
  ["Rune Scholar", "princess_hair", "rune_hat", "rune_coat", null, "field_book", "round_glasses"],
  ["Village Knight", "long_hair", "silver_circlet", "village_armor", "teal_cape", "trail_sword", null]
];

function snapshot() {
  return {
    items: Object.fromEntries(ITEMS.filter(item => item.slot !== "background").map(item => [item.id, renderItemDataUrl(item.id)])),
    looks: LOOKS.map(([name, hair, head, clothes, back, tool, face]) => {
      let hero = { ...defaultCharacter(), hairColor: "#714D38" };
      for (const id of [hair, head, clothes, back, tool, face].filter(Boolean)) hero = equipItem(hero, id);
      return {
        name, hero,
        frames: [0, 1, 2, 3].map(frame => renderCharacterDataUrl(hero, frame, 1)),
        scenes: [0, 1, 2, 3].map(frame => `data:image/png;base64,${renderTrayCharacterBuffer(hero, frame, { platform: "darwin", scaleFactor: 2 }).toString("base64")}`)
      };
    })
  };
}

async function renderReview({ BrowserWindow, output, capture }) {
  const beforePath = path.join(output, "idle-before.json");
  const before = fs.existsSync(beforePath) ? JSON.parse(fs.readFileSync(beforePath, "utf8")) : null;
  const after = snapshot();
  const escape = value => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const animated = (frames, kind, className = "hero") => `<img class="${className}" data-frames='${JSON.stringify(frames)}' data-kind="${kind}" src="${frames[0]}" alt="${kind}">`;
  const html = `<html lang="en"><meta charset="utf-8"><title>OS Hero Idle Review</title><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#fff;color:#20252c;font:14px -apple-system,sans-serif;letter-spacing:0}h1{margin:0;font-size:24px}h2{font-size:16px;margin:0 0 12px}p{margin:10px 0 20px;color:#5d6873}img{image-rendering:pixelated;image-rendering:crisp-edges}.looks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.look{text-align:center}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pair span{display:block;font-size:12px;color:#657181;margin-bottom:8px}.hero{width:96px;height:96px;background:#f3f6f7}.steps{display:flex;justify-content:center;gap:6px;margin-top:14px}.steps img{width:40px;height:40px}.native{display:flex;justify-content:center;align-items:center;gap:16px;padding:10px;background:#151a1e;margin-top:12px}.native img{width:39px;height:26px}.zoom{display:flex;justify-content:center;gap:12px;padding:14px 0}.zoom img{width:117px;height:78px}section.materials{border-top:1px solid #d5dde2;margin-top:26px;padding-top:20px}.items{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:12px}.item{text-align:center;min-width:0}.item img{width:42px;height:42px;object-fit:contain}.item span{display:block;overflow-wrap:anywhere;font-size:11px;line-height:1.4;margin-top:6px}.cpu{display:flex;align-items:center;gap:16px;margin:14px 0 22px}.cpu input{width:180px}small{color:#657181}
    </style><h1>OS Hero · Idle & Material Review</h1><p>Same saved Hero · grounded feet · shared breathing clock · fixed 39 × 26 scene · 4px pixel corners</p><label class="cpu">CPU <input id="cpu" type="range" min="0" max="100" value="20"><output id="cpu-value">20%</output></label>
    <main class="looks">${after.looks.map((look, index) => `<section class="look"><h2>${look.name}</h2><div class="pair">${before ? `<div><span>Before · walk</span>${animated(before.looks[index].frames, "before")}</div>` : ""}<div><span>After · idle</span>${animated(look.frames, "after")}</div></div><div class="steps">${look.frames.map((src, frame) => `<img src="${src}" alt="Idle frame ${frame}">`).join("")}</div><div class="native">${before ? animated(before.looks[index].scenes, "before", "scene") : ""}${animated(look.scenes, "after", "scene")}</div><div class="zoom">${animated(look.scenes, "after", "scene")}</div></section>`).join("")}</main>
    <section class="materials"><h2>Material Details · Before / After</h2><div class="items">${["travel_cap", "gold_crown", "knight_helmet", "wizard_hat", "travel_jacket", "village_armor", "princess_dress", "rune_coat", "teal_backpack", "small_bag", "kite_shield", "battle_axe", "health_potion", "field_book", "iron_sword", "forehead_goggles"].map(id => `<div class="item">${before ? `<img src="${before.items[id]}" alt="Before">` : ""}<img src="${after.items[id]}" alt="After"><span>${escape(id.replaceAll("_", " "))}</span></div>`).join("")}</div></section><p><small>Retina menu-bar Hero: 50 × 50 physical pixels (was 48 × 48). Canvas/background unchanged: 78 × 52. Non-Retina retains the native pixel grid.</small></p>
    <script>let oldFrame=0,newFrame=0;const images=Array.from(document.querySelectorAll('[data-frames]'));function paint(kind,frame){for(const image of images)if(image.dataset.kind===kind)image.src=JSON.parse(image.dataset.frames)[frame];}function next(){const cpu=Number(document.getElementById('cpu').value);document.getElementById('cpu-value').textContent=cpu+'%';newFrame=(newFrame+1)%4;paint('after',newFrame);setTimeout(next,cpu<10?1000:cpu<30?800:cpu<60?625:cpu<85?500:400);}setTimeout(next,800);setInterval(()=>{oldFrame=(oldFrame+1)%4;paint('before',oldFrame)},650);</script></html>`;
  fs.writeFileSync(path.join(output, "idle-review.html"), html);
  fs.writeFileSync(path.join(output, "idle-after.json"), JSON.stringify(after));
  const board = new BrowserWindow({ width: 1000, height: 825, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await board.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await capture(board, "idle-review.png");
  board.close();
}

module.exports = { snapshot, renderReview };
