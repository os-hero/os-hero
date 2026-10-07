const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PNG } = require("pngjs");
const { ITEMS, ITEM_CATEGORIES, defaultCharacter, normalizeCharacter, equipItem, unequipSlot } = require("../src/shared/catalog");
const { HAIR_IDS, HAIR_COLORS, WARDROBE_ITEMS, wardrobeMessages } = require("../src/shared/wardrobe");
const { WALK_POSES, renderCharacterLayers, renderCharacterBuffer, renderItemDataUrl } = require("../src/main/pixelRenderer");
const { AppStore } = require("../src/main/store");

test("legacy hair / glasses / bag migrate without changing stable IDs, and normalization is idempotent", () => {
  for (const hair of HAIR_IDS) {
    for (const tool of [null, "round_glasses", "small_bag", "iron_sword"]) {
      const old = { gender: "female", bodyColor: "#FFE6BD", eyeType: "bright", equipped: { head: hair, clothes: "green_tunic", tool } };
      const next = normalizeCharacter(old, "1.2.0");
      assert.equal(next.equipped.hair, hair);
      assert.equal(next.equipped.head, null);
      assert.equal(next.equipped.face, tool === "round_glasses" ? tool : null);
      assert.equal(next.equipped.back, tool === "small_bag" ? tool : null);
      assert.equal(next.equipped.tool, tool === "iron_sword" ? tool : null);
      assert.equal(next.equipped.clothes, "green_tunic");
      assert.equal(next.bodyColor, old.bodyColor);
      assert.equal(next.hairColor, null);
      assert.deepEqual(normalizeCharacter(next, "1.2.0"), next);
      assert.equal(old.equipped.head, hair);
    }
  }
  const explicit = normalizeCharacter({ equipped: { head: "long_hair", hair: null, tool: "small_bag", back: null } });
  assert.equal(explicit.equipped.hair, null);
  assert.equal(explicit.equipped.back, null);
  assert.deepEqual(Object.keys(explicit.equipped), ITEM_CATEGORIES.map(({ id }) => id));
});

test("slot replacement is independent and removes only the requested slot", () => {
  let hero = defaultCharacter();
  for (const id of ["long_hair", "travel_cap", "round_glasses", "travel_jacket", "teal_backpack", "travel_mug"]) hero = equipItem(hero, id);
  const original = structuredClone(hero);
  const changed = equipItem(hero, "silver_circlet");
  assert.equal(changed.equipped.head, "silver_circlet");
  assert.deepEqual({ ...changed.equipped, head: hero.equipped.head }, hero.equipped);
  assert.equal(unequipSlot(changed, "head").equipped.hair, "long_hair");
  assert.equal(unequipSlot(changed, "clothes").equipped.clothes, "default_clothes");
  assert.deepEqual(hero, original);
  assert.throws(() => unequipSlot(hero, "unknown"));
});

test("every item draws inside the native canvas and independent layers follow the same head bob", () => {
  for (const item of ITEMS) {
    const hero = equipItem(defaultCharacter(), item.id);
    const poses = [0, 1, 2, 3].map((frame) => renderCharacterLayers(hero, frame));
    for (const layers of poses) for (const [name, grid] of Object.entries(layers)) assert.deepEqual(grid.clippedPixels, [], `${item.id}/${name}`);
    for (const name of ["back", "hairBack", "hairFront", "head", "eyes", "face", "tool"]) {
      for (let y = 0; y < 23; y++) for (let x = 0; x < 24; x++) {
        assert.deepEqual(poses[0][name][y * 24 + x], poses[1][name][(y + 1) * 24 + x], `${item.id}/${name}/${x},${y}`);
      }
    }
  }
});

test("all hair x headwear x color x frame combinations preserve the central face and stay in bounds", () => {
  const hats = [null, ...ITEMS.filter((i) => i.slot === "head").map((i) => i.id)];
  for (const hair of HAIR_IDS) for (const head of hats) for (const hairColor of [null, ...HAIR_COLORS]) for (let frame = 0; frame < 4; frame++) {
    const hero = { ...defaultCharacter(), hairColor, equipped: { hair, head, clothes: "rune_coat", back: "teal_cape", tool: "field_book" } };
    const layers = renderCharacterLayers(hero, frame);
    for (const [name, grid] of Object.entries(layers)) assert.equal(grid.clippedPixels.length, 0, `${hair}/${head}/${name}`);
    const bob = WALK_POSES[frame].bob;
    for (let y = 6 + bob; y < 11 + bob; y++) for (let x = 8; x <= 15; x++) assert.equal(layers.hairFront[y * 24 + x][3], 0, `${hair} covers face`);
    for (let y = 11 + bob; y <= 12 + bob; y++) for (let x = 10; x <= 13; x++) assert.equal(layers.hairFront[y * 24 + x][3], 0, `${hair} covers chin`);
  }
});

test("every pair of slots retains both items and renders without clipping in all four frames", () => {
  for (let a = 0; a < ITEMS.length; a++) for (let b = a + 1; b < ITEMS.length; b++) {
    const left = ITEMS[a], right = ITEMS[b];
    if (left.slot === right.slot) continue;
    const hero = equipItem(equipItem(defaultCharacter(), left.id), right.id);
    assert.equal(hero.equipped[left.slot], left.id);
    assert.equal(hero.equipped[right.slot], right.id);
    for (let frame = 0; frame < 4; frame++) for (const layer of Object.values(renderCharacterLayers(hero, frame))) assert.equal(layer.clippedPixels.length, 0, `${left.id}/${right.id}`);
  }
});

test("catalog thumbnails are nonempty, with opaque landscapes and transparent equipment", () => {
  for (const item of ITEMS) {
    const png = PNG.sync.read(Buffer.from(renderItemDataUrl(item.id).split(",")[1], "base64"));
    const alpha = png.data.filter((_, i) => i % 4 === 3);
    assert.ok(alpha.some((value) => value > 0), item.id);
    if (item.slot === "background") {
      assert.equal(png.width, 39); assert.equal(png.height, 26);
      assert.ok(alpha.every((value) => value === 255), item.id);
    } else assert.ok(alpha.some((value) => value === 0), item.id);
  }
  for (const lang of ["ko", "en", "zh-CN"]) for (const item of WARDROBE_ITEMS) assert.ok(wardrobeMessages(lang)[`item.${item.id}`]);
  const base = defaultCharacter();
  assert.deepEqual(renderCharacterBuffer(base, -1), renderCharacterBuffer(base, 3));
  assert.deepEqual(renderCharacterBuffer(base, NaN), renderCharacterBuffer(base, 0));
});

test("enclosing helmets hide, but never delete, the selected hairstyle", () => {
  for (const hair of HAIR_IDS) for (const hat of ["knight_helmet", "horned_helm", "ninja_hood"]) {
    const bare = equipItem(defaultCharacter(), hair);
    const covered = equipItem(bare, hat);
    for (let frame = 0; frame < 4; frame++) {
      const layers = renderCharacterLayers(covered, frame);
      assert.ok([...layers.hairBack, ...layers.hairFront].every((pixel) => pixel[3] === 0));
      assert.deepEqual(renderCharacterBuffer(unequipSlot(covered, "head"), frame), renderCharacterBuffer(bare, frame));
    }
  }
  assert.equal(normalizeCharacter({ hairColor: { toUpperCase: true } }).hairColor, null);
});

test("first v2 save backs up the original bytes once; failed save preserves original", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-migration-"));
  try {
    const store = new AppStore(dir);
    const raw = '{"hasCharacter":true,"equipped":{"head":"long_hair","tool":"small_bag"}}\n';
    fs.writeFileSync(store.characterPath, raw);
    const migrated = normalizeCharacter(store.loadCharacter(), "1.2.0");
    fs.mkdirSync(`${store.characterPath}.tmp`);
    assert.throws(() => store.saveCharacter(migrated));
    assert.equal(fs.readFileSync(store.characterPath, "utf8"), raw);
    fs.rmdirSync(`${store.characterPath}.tmp`);
    store.saveCharacter(migrated);
    store.saveCharacter(equipItem(migrated, "travel_cap"));
    assert.equal(fs.readFileSync(path.join(dir, "backups/wardrobe-v2/character.json"), "utf8"), raw);
    assert.equal(store.loadCharacter().equipped.hair, "long_hair");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
