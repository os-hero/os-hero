const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { SCENE_WIDTH, SCENE_HEIGHT, HERO_X, HERO_Y, DEFAULT_BACKGROUND_ID, BACKGROUND_ITEMS } = require("../shared/backgrounds");
const backgrounds = new Map();

function readBackground(item) {
  const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, "../../public", item.assetPath)));
  if (png.width !== SCENE_WIDTH || png.height !== SCENE_HEIGHT) throw new Error("Invalid background canvas");
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 255) throw new Error("Background must be opaque");
  return png;
}

function getBackground(id) {
  const item = BACKGROUND_ITEMS.find((entry) => entry.id === id) || BACKGROUND_ITEMS[0];
  if (!backgrounds.has(item.id)) {
    try { backgrounds.set(item.id, readBackground(item)); }
    catch (error) {
      console.warn(`Pixel background unavailable (${item.id}): ${error.message}`);
      if (item.id !== DEFAULT_BACKGROUND_ID) {
        const fallback = getBackground(DEFAULT_BACKGROUND_ID);
        backgrounds.set(item.id, fallback);
        return fallback;
      }
      const png = new PNG({ width: SCENE_WIDTH, height: SCENE_HEIGHT });
      for (let y = 0; y < SCENE_HEIGHT; y++) for (let x = 0; x < SCENE_WIDTH; x++) {
        png.data.set(y < 23 ? [131, 201, 229, 255] : [154, 201, 112, 255], (y * SCENE_WIDTH + x) * 4);
      }
      backgrounds.set(item.id, png);
    }
  }
  return backgrounds.get(item.id);
}

function sceneBuffer(heroGrid, backgroundId, scale = 1) {
  const background = getBackground(backgroundId);
  const png = new PNG({ width: SCENE_WIDTH * scale, height: SCENE_HEIGHT * scale });
  for (let y = 0; y < SCENE_HEIGHT; y++) for (let x = 0; x < SCENE_WIDTH; x++) {
    const offset = (y * SCENE_WIDTH + x) * 4;
    let rgba = background.data.subarray(offset, offset + 4);
    const hx = x - HERO_X, hy = y - HERO_Y;
    if (hx >= 0 && hx < 24 && hy >= 0 && hy < 24) {
      const hero = heroGrid[hy * 24 + hx];
      if (hero[3] === 255) rgba = hero;
      else if (hero[3]) rgba = [0, 1, 2].map((channel) => Math.round(hero[channel] * hero[3] / 255 + rgba[channel] * (1 - hero[3] / 255))).concat(255);
    }
    for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
      png.data.set(rgba, ((y * scale + sy) * png.width + x * scale + sx) * 4);
    }
  }
  return PNG.sync.write(png);
}

function backgroundDataUrl(id) {
  return `data:image/png;base64,${PNG.sync.write(getBackground(id)).toString("base64")}`;
}

module.exports = { sceneBuffer, backgroundDataUrl };
