const test = require("node:test");
const assert = require("node:assert/strict");
const { PNG } = require("pngjs");
const { defaultCharacter, equipItem, ITEMS } = require("../src/shared/catalog");
const { MAC_TRAY_SIZE, WALK_POSES, renderCharacterBuffer, renderTrayCharacterBuffer, renderItemDataUrl } = require("../src/main/pixelRenderer");
const { companionMessages } = require("../src/shared/companionMessages");

test("non-mac tray preserves the full canonical pixels, without an outline", () => {
  for (const gender of ["male", "female"]) {
    for (const item of ITEMS) {
      const hero = equipItem({ ...defaultCharacter("1.2.0"), gender }, item.id);
      for (let frame = 0; frame < 4; frame++) {
        const normal = PNG.sync.read(renderCharacterBuffer(hero, frame, 1));
        const tray = PNG.sync.read(renderTrayCharacterBuffer(hero, frame, { platform: "win32" }));
        assert.equal(normal.width, 24);
        assert.equal(tray.width, 26);
        for (let y = 0; y < 24; y++) {
          assert.deepEqual(tray.data.subarray(((y + 1) * 26 + 1) * 4, ((y + 1) * 26 + 25) * 4), normal.data.subarray(y * 24 * 4, (y + 1) * 24 * 4));
        }
      }
    }
  }
});
test("mac tray fits every item/body/frame at 1x and Retina, preserving opaque canonical colors", () => {
  for (const gender of ["male", "female"]) for (const item of ITEMS) for (let frame = 0; frame < 4; frame++) {
    const hero = equipItem({ ...defaultCharacter(), gender }, item.id);
    const original = PNG.sync.read(renderCharacterBuffer(hero, frame, 1));
    for (const scaleFactor of [1, 2]) {
      const tray = PNG.sync.read(renderTrayCharacterBuffer(hero, frame, { platform: "darwin", scaleFactor }));
      const size = MAC_TRAY_SIZE * scaleFactor, content = (MAC_TRAY_SIZE - 2) * scaleFactor;
      assert.equal(tray.width, size); assert.equal(tray.height, size);
      for (let y = 0; y < content; y++) for (let x = 0; x < content; x++) {
        const from = (Math.floor(y * 24 / content) * 24 + Math.floor(x * 24 / content)) * 4;
        const to = ((y + scaleFactor) * size + x + scaleFactor) * 4;
        if (original.data[from + 3] === 255) assert.deepEqual(tray.data.subarray(to, to + 4), original.data.subarray(from, from + 4), `${item.id}/${frame}/${scaleFactor}`);
      }
      assert.ok(tray.data.some((v, i) => i % 4 === 3 && v === 224), `${item.id} has white silhouette`);
    }
  }
});
test("long hair keeps center chin and eyes identical to uncovered face", () => {
  const base = defaultCharacter("1.2.0");
  for (const id of ["long_hair", "bob_hair", "twin_tails", "princess_hair", "short_bangs", "braided_hair"]) {
    for (let frame = 0; frame < 4; frame++) {
      const plain = PNG.sync.read(renderCharacterBuffer(base, frame, 1));
      const hair = PNG.sync.read(renderCharacterBuffer(equipItem(base, id), frame, 1));
      const bob = WALK_POSES[frame].bob;
      for (let y = 8 + bob; y <= 11 + bob; y++) {
        for (let x = 10; x <= 13; x++) {
          const offset = (y * 24 + x) * 4;
          assert.deepEqual(hair.data.subarray(offset, offset + 4), plain.data.subarray(offset, offset + 4), `${id}: ${x},${y}`);
        }
      }
    }
  }
});
test("new reward item thumbnails are transparent nonempty PNGs", () => {
  for (const item of ITEMS.filter((item) => !item.owned)) {
    const png = PNG.sync.read(Buffer.from(renderItemDataUrl(item.id).split(",")[1], "base64"));
    const alphas = png.data.filter((_v, i) => i % 4 === 3);
    assert.ok(alphas.some((a) => a > 0));
    assert.ok(alphas.some((a) => a === 0));
  }
});
test("all companion strings exist in three app languages", () => {
  const keys = Object.keys(companionMessages("en")).sort();
  for (const language of ["ko", "zh-CN"]) assert.deepEqual(Object.keys(companionMessages(language)).sort(), keys);
});
