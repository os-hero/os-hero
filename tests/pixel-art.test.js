const test = require("node:test");
const assert = require("node:assert/strict");
const { PNG } = require("pngjs");
const { defaultCharacter, equipItem, ITEMS } = require("../src/shared/catalog");
const { HAIR_IDS, HAIR_COLORS } = require("../src/shared/wardrobe");
const { WALK_POSES, renderCharacterBuffer, renderCharacterLayers } = require("../src/main/pixelRenderer");
const { addOuterOutline } = require("../src/main/pixelOutline");

test("outer outline has crisp corners, no inner-hole halo and does not mutate the source", () => {
  const source = new PNG({ width: 9, height: 9 });
  const mask = new Uint8Array(81);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) {
    if (x === 4 && y === 4) continue;
    mask[y * 9 + x] = 1;
    source.data.set([31, 35, 40, 255], (y * 9 + x) * 4);
  }
  const before = Buffer.from(source.data);
  const out = addOuterOutline(source, mask);
  const at = (x, y) => Array.from(out.data.subarray((y * 9 + x) * 4, (y * 9 + x) * 4 + 4));
  assert.deepEqual(at(2, 2), [255, 255, 255, 224]);
  assert.deepEqual(at(4, 4), [0, 0, 0, 0]);
  assert.deepEqual(at(1, 3), [0, 0, 0, 0]);
  assert.deepEqual(at(3, 3), [31, 35, 40, 255]);
  assert.deepEqual(source.data, before);
  const doubled = addOuterOutline(source, mask, 2);
  assert.equal(doubled.data[(3 * 9 + 1) * 4 + 3], 224);
  assert.equal(doubled.data[(3 * 9) * 4 + 3], 0);
});

test("shadow-only pixels never generate an outline", () => {
  const shadow = new PNG({ width: 5, height: 5 });
  shadow.data.set([0, 0, 0, 90], (2 * 5 + 2) * 4);
  assert.deepEqual(addOuterOutline(shadow, new Uint8Array(25)).data, shadow.data);
});

test("each outfit has four distinct walking poses and alternating feet", () => {
  for (const outfit of ITEMS.filter((item) => item.slot === "clothes")) {
    const hero = equipItem(defaultCharacter(), outfit.id);
    const frames = [0, 1, 2, 3].map((frame) => renderCharacterBuffer(hero, frame, 1).toString("base64"));
    assert.equal(new Set(frames).size, 4, outfit.id);
  }
  const frames = [0, 2].map((frame) => renderCharacterLayers(defaultCharacter(), frame).clothes);
  assert.notDeepEqual(frames[0].slice(21 * 24), frames[1].slice(21 * 24));
  assert.equal(WALK_POSES[0].leftFoot, WALK_POSES[2].rightFoot);
  assert.equal(WALK_POSES[0].rightFoot, WALK_POSES[2].leftFoot);
});

test("all twelve hairstyles have distinct rendered silhouettes at the same color", () => {
  for (const hairColor of HAIR_COLORS) {
    const masks = HAIR_IDS.map((id) => {
      const hero = equipItem({ ...defaultCharacter(), hairColor }, id);
      const layers = renderCharacterLayers(hero, 0);
      return layers.hairBack.map((p, i) => p[3] || layers.hairFront[i][3] ? "1" : "0").join("");
    });
    assert.equal(new Set(masks).size, 12, hairColor);
  }
});

test("handheld items and finger pixels move together on every pose", () => {
  for (const arm of ["leftArm", "rightArm"]) for (let frame = 0; frame < 4; frame++) {
    const a = WALK_POSES[frame], b = WALK_POSES[(frame + 1) % 4];
    assert.ok(Math.abs(a.bob + a[arm] - b.bob - b[arm]) <= 1, `${arm} jumps between ${frame} and ${(frame + 1) % 4}`);
  }
  for (const item of ITEMS.filter((item) => item.slot === "tool" && !["wooden_shield", "kite_shield"].includes(item.id))) {
    for (let frame = 0; frame < 4; frame++) {
      const { grip, tool } = renderCharacterLayers(equipItem(defaultCharacter(), item.id), frame);
      assert.ok(grip.some((pixel) => pixel[3]), item.id);
      for (let i = 0; i < grip.length; i++) if (grip[i][3] && grip[i][0] !== 31) {
        const x = i % 24, y = Math.floor(i / 24);
        assert.ok([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => {
          const nx = x + dx, ny = y + dy;
          return nx >= 0 && nx < 24 && ny >= 0 && ny < 24 && tool[ny * 24 + nx][3];
        })), `${item.id} grip detached in frame ${frame}`);
      }
    }
  }
});
