const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { PNG } = require("pngjs");
const { BACKGROUND_ITEMS, DEFAULT_BACKGROUND_ID, SCENE_WIDTH, SCENE_HEIGHT, HERO_X, HERO_Y, backgroundMessages } = require("../src/shared/backgrounds");
const { ITEMS, ITEM_CATEGORIES, defaultCharacter, normalizeCharacter, equipItem, unequipSlot } = require("../src/shared/catalog");
const { renderSceneDataUrl, renderCharacterBuffer, renderTrayCharacterBuffer } = require("../src/main/pixelRenderer");
const { AppStore } = require("../src/main/store");
const { paintBackground } = require("../scripts/generate-backgrounds");
const decode = (url) => PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));

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
  for (const value of [null, "../settings.json", "iron_sword", {}, "unknown"]) {
    assert.equal(normalizeCharacter({ equipped: { background: value } }).equipped.background, DEFAULT_BACKGROUND_ID);
  }
});

test("background replacement, reset and preview do not change any canonical Hero frame", () => {
  const base = equipItem(equipItem(defaultCharacter(), "long_hair"), "trail_sword");
  const original = structuredClone(base);
  for (const item of BACKGROUND_ITEMS) {
    const next = equipItem(base, item.id);
    assert.deepEqual({ ...next.equipped, background: base.equipped.background }, base.equipped);
    for (let f = 0; f < 4; f++) assert.deepEqual(renderCharacterBuffer(next, f, 1), renderCharacterBuffer(base, f, 1));
    assert.equal(unequipSlot(next, "background").equipped.background, DEFAULT_BACKGROUND_ID);
  }
  assert.deepEqual(base, original);
});

test("all scenes match the tray and preserve original pixels, static background and exact Retina blocks", () => {
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
      for (let y = 0; y < SCENE_HEIGHT; y++) for (let x = 0; x < SCENE_WIDTH; x++) {
        const i = (y * SCENE_WIDTH + x) * 4;
        const rgba = scene.data.subarray(i, i + 4);
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const r = ((y * 2 + dy) * retina.width + x * 2 + dx) * 4;
          assert.deepEqual(retina.data.subarray(r, r + 4), rgba);
        }
        const hx = x - HERO_X, hy = y - HERO_Y;
        const j = (hy * 24 + hx) * 4;
        if (hx < 0 || hx >= 24 || hy < 0 || hy >= 24 || !original.data[j + 3]) {
          assert.deepEqual(rgba, background.data.subarray(i, i + 4), `${item.id}/${f}: unexpected halo or moving background`);
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
    assert.ok(first.data.every((v, i) => i % 4 !== 3 || v === 255));
    assert.equal(reads, 2); assert.equal(warnings.length, 2);
    assert.deepEqual(PNG.sync.read(module.exports.sceneBuffer(emptyHero, "background_coast")).data, first.data);
    assert.equal(reads, 2); assert.equal(warnings.length, 2);
  }
});
