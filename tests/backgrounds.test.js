const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { PNG } = require("pngjs");
const { BACKGROUND_ITEMS, DEFAULT_BACKGROUND_ID, SCENE_WIDTH, SCENE_HEIGHT, HERO_X, HERO_Y, backgroundMessages } = require("../src/shared/backgrounds");
const { ITEMS, ITEM_CATEGORIES, defaultCharacter, normalizeCharacter, equipItem, unequipSlot } = require("../src/shared/catalog");
const { renderSceneDataUrl, renderCharacterBuffer, renderTrayCharacterBuffer, renderItemDataUrl } = require("../src/main/pixelRenderer");
const { sceneBuffer } = require("../src/main/pixelScene");
const { AppStore } = require("../src/main/store");
const { paintBackground } = require("../scripts/generate-backgrounds");
const decode = (url) => PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));

// The hard-edged circle of radius 4 removes these three pixels at each corner.
function isRoundCutout(x, y) {
  const edgeX = Math.min(x, 38 - x), edgeY = Math.min(y, 25 - y);
  return edgeY === 0 && edgeX < 2 || edgeY === 1 && edgeX === 0;
}

function assertMenuPixels(tray, original, background, scale) {
  const size = scale === 2 ? 50 : 24, left = scale === 2 ? 14 : 7, top = 1;
  assert.equal(tray.width, 39 * scale); assert.equal(tray.height, 26 * scale);
  for (let y = 0; y < tray.height; y++) for (let x = 0; x < tray.width; x++) {
    const offset = (y * tray.width + x) * 4;
    const bgOffset = (Math.floor(y / scale) * 39 + Math.floor(x / scale)) * 4;
    let rgba = background && !isRoundCutout(Math.floor(x / scale), Math.floor(y / scale)) ? Array.from(background.data.subarray(bgOffset, bgOffset + 4)) : [0, 0, 0, 0];
    if (x >= left && x < left + size && y >= top && y < top + size) {
      const sx = Math.floor((x - left) / size * 24), sy = Math.floor((y - top) / size * 24);
      const pixel = Array.from(original.data.subarray((sy * 24 + sx) * 4, (sy * 24 + sx + 1) * 4));
      if (!rgba[3] || pixel[3] === 255) rgba = pixel;
      else if (pixel[3]) rgba = pixel.slice(0, 3).map((value, channel) => Math.round(value * pixel[3] / 255 + rgba[channel] * (1 - pixel[3] / 255))).concat(255);
    }
    assert.deepEqual(Array.from(tray.data.subarray(offset, offset + 4)), rgba, `${scale}x/${x},${y}`);
  }
}

test("ten original backgrounds have unique reproducible 3:2 opaque native PNG assets", () => {
  assert.equal(BACKGROUND_ITEMS.length, 10);
  const unique = new Set();
  for (const item of BACKGROUND_ITEMS) {
    const bytes = fs.readFileSync(path.resolve(__dirname, "../public", item.assetPath));
    assert.deepEqual(bytes, paintBackground(item.theme), item.id);
    const png = PNG.sync.read(bytes);
    assert.equal(png.width, 39); assert.equal(png.height, 26);
    assert.ok(png.data.every((v, i) => i % 4 !== 3 || v === 255));
    unique.add(bytes.toString("base64"));
    assert.equal(item.owned, true); assert.equal(item.slot, "background");
    assert.equal(ITEMS.find((entry) => entry.id === item.id), item);
  }
  assert.equal(unique.size, 10);
  assert.equal(ITEM_CATEGORIES.at(-1).id, "background");
});

test("all ten background thumbnails and scaled scenes share symmetric 4px pixel corners without changing their source", () => {
  const emptyHero = Array.from({ length: 24 * 24 }, () => [0, 0, 0, 0]);
  for (const item of BACKGROUND_ITEMS) {
    const bytes = fs.readFileSync(path.resolve(__dirname, "../public", item.assetPath));
    const background = PNG.sync.read(bytes);
    const thumbnail = decode(renderItemDataUrl(item.id));
    assert.equal(thumbnail.width, 39); assert.equal(thumbnail.height, 26);
    let cutouts = 0;
    for (const scale of [1, 2, 8]) {
      const scene = PNG.sync.read(sceneBuffer(emptyHero, item.id, scale));
      assert.equal(scene.width, 39 * scale); assert.equal(scene.height, 26 * scale);
      for (let y = 0; y < scene.height; y++) for (let x = 0; x < scene.width; x++) {
        const sx = Math.floor(x / scale), sy = Math.floor(y / scale), offset = (sy * 39 + sx) * 4;
        const rgba = isRoundCutout(sx, sy) ? [0, 0, 0, 0] : Array.from(background.data.subarray(offset, offset + 4));
        assert.deepEqual(Array.from(scene.data.subarray((y * scene.width + x) * 4, (y * scene.width + x + 1) * 4)), rgba, `${item.id}/${scale}/${x},${y}`);
        if (scale === 1) {
          assert.deepEqual(Array.from(thumbnail.data.subarray(offset, offset + 4)), rgba);
          if (rgba[3] === 0) cutouts++;
        }
      }
    }
    assert.equal(cutouts, 12);
    assert.deepEqual(fs.readFileSync(path.resolve(__dirname, "../public", item.assetPath)), bytes);
  }
});

test("rounded scenes preserve foreground color and original shadow alpha when the background is removed", () => {
  const grid = Array.from({ length: 24 * 24 }, () => [0, 0, 0, 0]);
  grid[0] = [101, 102, 103, 90];
  grid[1] = [201, 202, 203, 255];
  const scene = PNG.sync.read(sceneBuffer(grid, DEFAULT_BACKGROUND_ID));
  const shadow = (HERO_Y * 39 + HERO_X) * 4;
  const bg = PNG.sync.read(fs.readFileSync(path.resolve(__dirname, "../public", BACKGROUND_ITEMS[0].assetPath)));
  const expected = [0, 1, 2].map(channel => Math.round(grid[0][channel] * 90 / 255 + bg.data[shadow + channel] * (1 - 90 / 255))).concat(255);
  assert.deepEqual(Array.from(scene.data.subarray(shadow, shadow + 4)), expected);
  assert.deepEqual(Array.from(scene.data.subarray(shadow + 4, shadow + 8)), grid[1]);
  assert.deepEqual(Array.from(scene.data.subarray(0, 4)), [0, 0, 0, 0]);
  const transparent = PNG.sync.read(sceneBuffer(grid, null));
  assert.deepEqual(Array.from(transparent.data.subarray(shadow, shadow + 4)), grid[0]);
  assert.deepEqual(Array.from(transparent.data.subarray(shadow + 4, shadow + 8)), grid[1]);
});

test("legacy and invalid backgrounds default to meadow without changing existing equipment or data", () => {
  const old = { ...defaultCharacter("1.4.1"), hairColor: "#714D38" };
  delete old.equipped.background;
  const before = structuredClone(old);
  const next = normalizeCharacter(old, "1.4.1");
  assert.equal(next.equipped.background, DEFAULT_BACKGROUND_ID);
  assert.deepEqual({ ...next.equipped, background: undefined }, { ...old.equipped, background: undefined });
  assert.equal(next.hairColor, old.hairColor);
  assert.deepEqual(normalizeCharacter(next, "1.4.1"), next);
  assert.deepEqual(old, before);
  for (const value of [undefined, "", 0, "../settings.json", "iron_sword", {}, "unknown"]) {
    assert.equal(normalizeCharacter({ equipped: { background: value } }).equipped.background, DEFAULT_BACKGROUND_ID);
  }
});

test("background replacement, removal and preview do not change any canonical Hero frame", () => {
  const base = equipItem(equipItem(defaultCharacter(), "long_hair"), "trail_sword");
  const original = structuredClone(base);
  for (const item of BACKGROUND_ITEMS) {
    const next = equipItem(base, item.id);
    assert.deepEqual({ ...next.equipped, background: base.equipped.background }, base.equipped);
    for (let f = 0; f < 4; f++) assert.deepEqual(renderCharacterBuffer(next, f, 1), renderCharacterBuffer(base, f, 1));
    assert.equal(unequipSlot(next, "background").equipped.background, null);
  }
  assert.deepEqual(base, original);
});

test("explicit no-background survives normalization, saves and reloads without resetting the meadow", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-no-background-"));
  try {
    const store = new AppStore(dir);
    const hero = unequipSlot(equipItem(defaultCharacter("1.5.0"), "background_coast"), "background");
    const original = structuredClone(hero);
    assert.equal(hero.equipped.background, null);
    assert.deepEqual(normalizeCharacter(hero, "1.5.0"), hero);
    store.saveCharacter(hero);
    assert.deepEqual(normalizeCharacter(store.loadCharacter(), "1.5.0"), hero);
    assert.equal(equipItem(hero, DEFAULT_BACKGROUND_ID).equipped.background, DEFAULT_BACKGROUND_ID);
    assert.deepEqual(unequipSlot(hero, "background"), hero);
    assert.deepEqual(hero, original);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("transparent scenes retain original RGBA and fixed bounds; Retina enlargement leaves a physical pixel margin", () => {
  let hero = { ...defaultCharacter(), hairColor: "#714D38" };
  for (const id of ["princess_hair", "rune_hat", "rune_coat", "teal_cape", "field_book"]) hero = equipItem(hero, id);
  hero = unequipSlot(hero, "background");
  for (let frame = 0; frame < 4; frame++) {
    const original = PNG.sync.read(renderCharacterBuffer(hero, frame, 1));
    const scene = decode(renderSceneDataUrl(hero, frame));
    assert.equal(scene.width, SCENE_WIDTH); assert.equal(scene.height, SCENE_HEIGHT);
    assert.deepEqual(PNG.sync.read(renderTrayCharacterBuffer(hero, frame, { platform: "darwin" })).data, scene.data);
    assert.ok(scene.data.some((v, i) => i % 4 === 3 && v === 0));
    for (const scaleFactor of [1, 2]) {
      const tray = PNG.sync.read(renderTrayCharacterBuffer(hero, frame, { platform: "darwin", scaleFactor }));
      assert.equal(tray.width, SCENE_WIDTH * scaleFactor); assert.equal(tray.height, SCENE_HEIGHT * scaleFactor);
      assertMenuPixels(tray, original, null, scaleFactor);
      assert.ok(tray.data.subarray(0, tray.width * 4).every(value => value === 0));
      assert.ok(tray.data.subarray((tray.height - 1) * tray.width * 4).every(value => value === 0));
    }
  }
});

test("all scenes match 1x tray pixels while Retina enlarges only the Hero, not the static background", () => {
  const base = equipItem(equipItem(equipItem(defaultCharacter(), "princess_hair"), "rune_coat"), "magic_staff");
  for (const item of BACKGROUND_ITEMS) {
    const hero = equipItem(base, item.id);
    const background = PNG.sync.read(fs.readFileSync(path.resolve(__dirname, "../public", item.assetPath)));
    for (let f = 0; f < 4; f++) {
      const original = PNG.sync.read(renderCharacterBuffer(hero, f, 1));
      const scene = decode(renderSceneDataUrl(hero, f));
      const tray = PNG.sync.read(renderTrayCharacterBuffer(hero, f, { platform: "darwin" }));
      const retina = PNG.sync.read(renderTrayCharacterBuffer(hero, f, { platform: "darwin", scaleFactor: 2 }));
      assert.equal(scene.width / scene.height, 1.5);
      assert.deepEqual(scene.data, tray.data);
      assert.equal(retina.width, 78); assert.equal(retina.height, 52);
      assertMenuPixels(retina, original, background, 2);
      for (let y = 0; y < SCENE_HEIGHT; y++) for (let x = 0; x < SCENE_WIDTH; x++) {
        const i = (y * SCENE_WIDTH + x) * 4;
        const rgba = scene.data.subarray(i, i + 4);
        const hx = x - HERO_X, hy = y - HERO_Y;
        const j = (hy * 24 + hx) * 4;
        if (hx < 0 || hx >= 24 || hy < 0 || hy >= 24 || !original.data[j + 3]) {
          assert.deepEqual(Array.from(rgba), isRoundCutout(x, y) ? [0, 0, 0, 0] : Array.from(background.data.subarray(i, i + 4)), `${item.id}/${f}: unexpected halo or moving background`);
        } else if (original.data[j + 3] === 255) assert.deepEqual(rgba, original.data.subarray(j, j + 4));
      }
    }
  }
});

test("background selection persists atomically and backs up pre-background bytes once", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-background-test-"));
  try {
    const store = new AppStore(dir);
    const legacy = defaultCharacter("1.4.1"); delete legacy.equipped.background;
    const bytes = JSON.stringify(legacy) + "\n";
    fs.writeFileSync(store.characterPath, bytes);
    const next = equipItem(normalizeCharacter(store.loadCharacter()), "background_moon_lake");
    fs.mkdirSync(`${store.characterPath}.tmp`);
    assert.throws(() => store.saveCharacter(next));
    assert.equal(fs.readFileSync(store.characterPath, "utf8"), bytes);
    fs.rmdirSync(`${store.characterPath}.tmp`);
    store.saveCharacter(next); store.saveCharacter(equipItem(next, "background_coast"));
    assert.equal(normalizeCharacter(store.loadCharacter()).equipped.background, "background_coast");
    assert.equal(fs.readFileSync(path.join(dir, "backups/pixel-backgrounds/character.json"), "utf8"), bytes);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("background names and actions exist consistently in all app languages", () => {
  for (const language of ["ko", "en", "zh-CN"]) {
    const messages = backgroundMessages(language);
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(backgroundMessages("en")).sort());
    for (const item of BACKGROUND_ITEMS) assert.ok(messages[`item.${item.id}`]);
  }
});

test("missing or malformed packaged backgrounds fail softly and cache the fallback", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/main/pixelScene.js"), "utf8");
  for (const mode of ["missing", "wrong-size", "transparent"]) {
    let reads = 0;
    const warnings = [];
    const bad = new PNG({ width: mode === "wrong-size" ? 1 : 39, height: mode === "wrong-size" ? 1 : 26 });
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module, __dirname: path.resolve(__dirname, "../src/main"), console: { warn: message => warnings.push(message) },
      require(name) {
        if (name === "fs") return { readFileSync() { reads++; if (mode === "missing") throw new Error("missing"); return PNG.sync.write(bad); } };
        if (name === "path") return path;
        if (name === "pngjs") return { PNG };
        if (name === "../shared/backgrounds") return require("../src/shared/backgrounds");
        throw new Error(`Unexpected dependency: ${name}`);
      }
    });
    const emptyHero = Array.from({ length: 24 * 24 }, () => [0,0,0,0]);
    const first = PNG.sync.read(module.exports.sceneBuffer(emptyHero, "background_coast"));
    assert.equal(first.width, 39); assert.equal(first.height, 26);
    for (let y = 0; y < 26; y++) for (let x = 0; x < 39; x++) assert.equal(first.data[(y * 39 + x) * 4 + 3], isRoundCutout(x, y) ? 0 : 255);
    assert.equal(reads, 2); assert.equal(warnings.length, 2);
    assert.deepEqual(PNG.sync.read(module.exports.sceneBuffer(emptyHero, "background_coast")).data, first.data);
    assert.equal(reads, 2); assert.equal(warnings.length, 2);
  }
});
