const test = require("node:test");
const assert = require("node:assert/strict");
const { PNG } = require("pngjs");
const { defaultCharacter, equipItem, ITEMS } = require("../src/shared/catalog");
const { HAIR_IDS } = require("../src/shared/wardrobe");
const { IDLE_POSES, renderCharacterLayers, renderCharacterBuffer, renderTrayCharacterBuffer } = require("../src/main/pixelRenderer");

const pixel = (grid, x, y) => grid[y * 24 + x];
const outline = [31, 35, 40, 255];

test("Pocket Buddy face and cheeks remain visible under every hairstyle and handheld in all poses", () => {
  const tools = [null, ...ITEMS.filter(item => item.slot === "tool").map(item => item.id)];
  for (const bodyColor of ["#FFE6BD", "#F1C27D", "#6C4437"]) for (const hair of HAIR_IDS) for (const tool of tools) {
    const hero = { ...defaultCharacter(), bodyColor, equipped: { hair, tool, clothes: "travel_jacket", back: "teal_cape" } };
    const unchanged = JSON.stringify(hero);
    for (let frame = 0; frame < 4; frame++) {
      const layers = renderCharacterLayers(hero, frame);
      const png = PNG.sync.read(renderCharacterBuffer(hero, frame, 1));
      const bob = IDLE_POSES[frame].bob;
      for (let y = 6 + bob; y <= 10 + bob; y++) for (let x = 7; x <= 16; x++) {
        assert.equal(pixel(layers.hairFront, x, y)[3], 0, `${hair} covers the face`);
        assert.equal(pixel(layers.tool, x, y)[3], 0, `${tool} covers the face`);
      }
      for (const [x, y] of [[7, 9 + bob], [16, 9 + bob], [11, 10 + bob], [12, 10 + bob]]) {
        assert.equal(pixel(layers.eyes, x, y)[3], 255);
        assert.deepEqual(Array.from(png.data.subarray((y * 24 + x) * 4, (y * 24 + x) * 4 + 4)), pixel(layers.eyes, x, y), `${hair}/${tool} obscures expression`);
      }
    }
    assert.equal(JSON.stringify(hero), unchanged, "rendering must never mutate saved appearance");
  }
});

test("recognizable swords keep a two-pixel metal blade, outline, crossguard and attached grip", () => {
  for (const id of ["iron_sword", "expedition_sword", "trail_sword", "steel_dagger"]) for (let frame = 0; frame < 4; frame++) {
    const layers = renderCharacterLayers(equipItem(defaultCharacter(), id), frame);
    const bob = IDLE_POSES[frame].torsoBob;
    const y = (id === "steel_dagger" ? 10 : 11) + bob;
    for (const x of [21, 22]) {
      assert.equal(pixel(layers.tool, x, y)[3], 255);
      assert.notDeepEqual(pixel(layers.tool, x, y), outline, `${id}: metal is still a one-pixel line`);
    }
    assert.deepEqual(pixel(layers.tool, 23, y), outline);
    const guardY = (id === "steel_dagger" ? 13 : 15) + bob;
    assert.ok([19, 20, 21, 22].every(x => pixel(layers.tool, x, guardY)[3] === 255));
    assert.equal(pixel(layers.grip, 21, (id === "steel_dagger" ? 14 : 16) + bob)[3], 255);
  }
});

test("mug handle has a real open hole and book has a separate page edge on every pose", () => {
  for (let frame = 0; frame < 4; frame++) {
    const bob = IDLE_POSES[frame].torsoBob;
    const mug = renderCharacterLayers(equipItem(defaultCharacter(), "travel_mug"), frame).tool;
    assert.equal(pixel(mug, 22, 15 + bob)[3], 0);
    for (const [x, y] of [[22, 14], [23, 14], [23, 15], [23, 16], [22, 16]]) assert.equal(pixel(mug, x, y + bob)[3], 255);
    const book = renderCharacterLayers(equipItem(defaultCharacter(), "field_book"), frame).tool;
    assert.equal(pixel(book, 22, 17 + bob)[3], 255);
    assert.notDeepEqual(pixel(book, 22, 17 + bob), pixel(book, 20, 17 + bob));
  }
});

test("local art change keeps exact menu geometry, native alpha and all four cached poses", () => {
  for (const item of ITEMS.filter(item => item.slot !== "background")) {
    const hero = equipItem(equipItem(defaultCharacter(), "basic_hair"), item.id);
    for (let frame = 0; frame < 4; frame++) {
      const png = PNG.sync.read(renderCharacterBuffer(hero, frame, 1));
      assert.equal(png.width, 24); assert.equal(png.height, 24);
      assert.ok(png.data.filter((_, i) => i % 4 === 3).every(alpha => [0, 90, 255].includes(alpha)), item.id);
      for (const scaleFactor of [1, 2]) {
        const tray = PNG.sync.read(renderTrayCharacterBuffer(hero, frame, { platform: "darwin", scaleFactor }));
        assert.equal(tray.width, 39 * scaleFactor);
        assert.equal(tray.height, 26 * scaleFactor);
      }
    }
  }
});
