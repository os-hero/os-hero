const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { SCENE_WIDTH, SCENE_HEIGHT, HERO_X, HERO_Y, DEFAULT_BACKGROUND_ID, BACKGROUND_ITEMS } = require("../shared/backgrounds");
const backgrounds = new Map();
const BACKGROUND_RADIUS = 4;

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

function backgroundPixel(background, x, y) {
  if (!background) return [0, 0, 0, 0];
  // A native-grid mask keeps the same crisp 4px corners at every output scale.
  const dx = Math.max(0, BACKGROUND_RADIUS - Math.min(x + 0.5, SCENE_WIDTH - x - 0.5));
  const dy = Math.max(0, BACKGROUND_RADIUS - Math.min(y + 0.5, SCENE_HEIGHT - y - 0.5));
  if (dx * dx + dy * dy > BACKGROUND_RADIUS * BACKGROUND_RADIUS) return [0, 0, 0, 0];
  const offset = (y * SCENE_WIDTH + x) * 4;
  return background.data.subarray(offset, offset + 4);
}

function sceneBuffer(heroGrid, backgroundId, scale = 1, { menuBar = false } = {}) {
  const background = backgroundId === null ? null : getBackground(backgroundId);
  const png = new PNG({ width: SCENE_WIDTH * scale, height: SCENE_HEIGHT * scale });
  // Only the finished menu-bar composite grows. Individual layers never rescale.
  const heroSize = menuBar && scale === 2 ? 50 : 24 * scale;
  const originX = menuBar ? Math.floor((png.width - heroSize) / 2) : HERO_X * scale;
  const originY = menuBar ? Math.floor((png.height - heroSize) / 2) : HERO_Y * scale;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    let rgba = backgroundPixel(background, Math.floor(x / scale), Math.floor(y / scale));
    const hx = Math.floor((x - originX) * 24 / heroSize), hy = Math.floor((y - originY) * 24 / heroSize);
    if (hx >= 0 && hx < 24 && hy >= 0 && hy < 24) {
      const hero = heroGrid[hy * 24 + hx];
      if (!rgba[3] || hero[3] === 255) rgba = hero;
      else if (hero[3]) rgba = [0, 1, 2].map((channel) => Math.round(hero[channel] * hero[3] / 255 + rgba[channel] * (1 - hero[3] / 255))).concat(255);
    }
    png.data.set(rgba, (y * png.width + x) * 4);
  }
  return PNG.sync.write(png);
}

function backgroundDataUrl(id) {
  const emptyHero = Array.from({ length: 24 * 24 }, () => [0, 0, 0, 0]);
  return `data:image/png;base64,${sceneBuffer(emptyHero, id).toString("base64")}`;
}

module.exports = { sceneBuffer, backgroundDataUrl };
