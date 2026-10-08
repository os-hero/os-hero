const test = require("node:test");
const assert = require("node:assert/strict");
const { PNG } = require("pngjs");
const { defaultCharacter, equipItem, ITEMS } = require("../src/shared/catalog");
const { HAIR_IDS, HAIR_COLORS } = require("../src/shared/wardrobe");
const { IDLE_POSES, renderCharacterBuffer, renderCharacterLayers } = require("../src/main/pixelRenderer");
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
  assert.deepEqual(at(2, 2), [255, 255, 255, 51]);
  assert.deepEqual(at(4, 4), [0, 0, 0, 0]);
  assert.deepEqual(at(1, 3), [0, 0, 0, 0]);
  assert.deepEqual(at(3, 3), [31, 35, 40, 255]);
  assert.deepEqual(source.data, before);
  const doubled = addOuterOutline(source, mask, 2);
  assert.equal(doubled.data[(3 * 9 + 1) * 4 + 3], 51);
  assert.equal(doubled.data[(3 * 9) * 4 + 3], 0);
});

test("20 percent outline changes opacity only, not canvas, silhouette or foreground", () => {
  const source = new PNG({ width: 9, height: 9 });
  const mask = new Uint8Array(81);
  for (let y = 3; y <= 5; y++) for (let x = 3; x <= 5; x++) {
    mask[y * 9 + x] = 1;
    source.data.set([31, 35, 40, 255], (y * 9 + x) * 4);
  }
  for (const thickness of [1, 2]) {
    const before = addOuterOutline(source, mask, thickness, 224);
    const after = addOuterOutline(source, mask, thickness);
    assert.equal(after.width, before.width);
    assert.equal(after.height, before.height);
    for (let i = 0; i < mask.length; i++) {
      const offset = i * 4;
      assert.equal(after.data[offset + 3] > 0, before.data[offset + 3] > 0);
      assert.deepEqual(after.data.subarray(offset, offset + 3), before.data.subarray(offset, offset + 3));
      if (before.data[offset + 3] === 224) assert.equal(after.data[offset + 3], 51);
      else assert.equal(after.data[offset + 3], before.data[offset + 3]);
    }
  }
});

test("shadow-only pixels never generate an outline", () => {
  const shadow = new PNG({ width: 5, height: 5 });
  shadow.data.set([0, 0, 0, 90], (2 * 5 + 2) * 4);
  assert.deepEqual(addOuterOutline(shadow, new Uint8Array(25)).data, shadow.data);
});

test("each outfit has four subtle idle poses with grounded feet", () => {
  for (const outfit of ITEMS.filter((item) => item.slot === "clothes")) {
    const hero = equipItem(defaultCharacter(), outfit.id);
    const frames = [0, 1, 2, 3].map((frame) => renderCharacterBuffer(hero, frame, 1).toString("base64"));
    assert.equal(new Set(frames).size, 4, outfit.id);
    const poses = [0, 1, 2, 3].map(frame => renderCharacterLayers(hero, frame).clothes);
    for (const pose of poses) for (const y of [21, 22]) for (const x of [7, 8, 9, 10, 14, 15, 16, 17]) {
      assert.deepEqual(pose[y * 24 + x], poses[0][y * 24 + x], `${outfit.id} lifts foot at ${x},${y}`);
    }
  }
  for (const pose of IDLE_POSES) assert.ok(pose.leftFoot === 0 && pose.rightFoot === 0 && pose.leftArm === 0 && pose.rightArm === 0);
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
    const a = IDLE_POSES[frame], b = IDLE_POSES[(frame + 1) % 4];
    assert.ok(Math.abs(a.torsoBob + a[arm] - b.torsoBob - b[arm]) <= 1, `${arm} jumps between ${frame} and ${(frame + 1) % 4}`);
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
        const body = renderCharacterLayers(equipItem(defaultCharacter(), item.id), frame).body;
        assert.ok([-1, 0, 1].some(dy => [-2, -1, 0, 1, 2].some(dx => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= 24 || ny < 0 || ny >= 24) return false;
          const pixel = body[ny * 24 + nx];
          return pixel[3] === 255 && !(pixel[0] === 31 && pixel[1] === 35 && pixel[2] === 40);
        })), `${item.id} held grip is detached from the actual hand in frame ${frame}`);
      }
    }
  }
});
