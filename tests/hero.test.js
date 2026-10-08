const test = require("node:test");
const assert = require("node:assert/strict");
const { PNG } = require("pngjs");
const { defaultCharacter, equipItem, ITEMS } = require("../src/shared/catalog");
const { MAC_TRAY_SIZE, IDLE_POSES, renderCharacterBuffer, renderTrayCharacterBuffer, renderItemDataUrl } = require("../src/main/pixelRenderer");
const { companionMessages } = require("../src/shared/companionMessages");
const { SCENE_WIDTH, SCENE_HEIGHT, HERO_X, HERO_Y } = require("../src/shared/backgrounds");

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
test("mac landscape uses the original 1x grid and a crisp 50px Retina composite, with no halo", () => {
  assert.equal(MAC_TRAY_SIZE, 26);
  for (const gender of ["male", "female"]) for (const item of ITEMS) for (let frame = 0; frame < 4; frame++) {
    const hero = equipItem({ ...defaultCharacter(), gender }, item.id);
    const original = PNG.sync.read(renderCharacterBuffer(hero, frame, 1));
    for (const scaleFactor of [1, 2]) {
      const tray = PNG.sync.read(renderTrayCharacterBuffer(hero, frame, { platform: "darwin", scaleFactor }));
      const width = SCENE_WIDTH * scaleFactor, content = scaleFactor === 2 ? 50 : 24;
      const originX = scaleFactor === 2 ? 14 : HERO_X, originY = 1;
      assert.equal(tray.width, width); assert.equal(tray.height, SCENE_HEIGHT * scaleFactor);
      for (let y = 0; y < content; y++) for (let x = 0; x < content; x++) {
        const from = (Math.floor(y * 24 / content) * 24 + Math.floor(x * 24 / content)) * 4;
        const to = ((y + originY) * width + x + originX) * 4;
        if (original.data[from + 3] === 255) assert.deepEqual(tray.data.subarray(to, to + 4), original.data.subarray(from, from + 4), `${item.id}/${frame}/${scaleFactor}`);
      }
      let cutouts = 0;
      for (let y = 0; y < tray.height; y++) for (let x = 0; x < tray.width; x++) {
        const edgeX = Math.min(Math.floor(x / scaleFactor), 38 - Math.floor(x / scaleFactor));
        const edgeY = Math.min(Math.floor(y / scaleFactor), 25 - Math.floor(y / scaleFactor));
        const rounded = edgeY === 0 && edgeX < 2 || edgeY === 1 && edgeX === 0;
        assert.equal(tray.data[(y * width + x) * 4 + 3], rounded ? 0 : 255, `${item.id}: only background corners may be transparent`);
        if (rounded) cutouts++;
      }
      assert.equal(cutouts, 12 * scaleFactor * scaleFactor, `${item.id} has no translucent halo or clipped Hero`);
    }
  }
});
test("long hair keeps center chin and eyes identical to uncovered face", () => {
  const base = defaultCharacter("1.2.0");
  for (const id of ["long_hair", "bob_hair", "twin_tails", "princess_hair", "short_bangs", "braided_hair"]) {
    for (let frame = 0; frame < 4; frame++) {
      const plain = PNG.sync.read(renderCharacterBuffer(base, frame, 1));
      const hair = PNG.sync.read(renderCharacterBuffer(equipItem(base, id), frame, 1));
      const bob = IDLE_POSES[frame].bob;
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
