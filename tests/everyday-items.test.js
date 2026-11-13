const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { ITEMS, defaultCharacter, equipItem, normalizeCharacter, getItemById } = require("../src/shared/catalog");
const { HAIR_IDS, HAIR_COLORS, wardrobeMessages } = require("../src/shared/wardrobe");
const { backgroundMessages } = require("../src/shared/backgrounds");
const { IDLE_POSES, renderCharacterLayers, renderCharacterBuffer, renderTrayCharacterBuffer } = require("../src/main/pixelRenderer");

const NEW_IDS = ["twin_buns", "wave_bob", "berry_beret", "studio_headphones", "workshop_apron", "raincoat", "bedroll_pack", "flower_basket", "camp_lantern", "big_paintbrush", "background_rain_cafe", "background_glasshouse"];
const pixel = (grid, x, y) => grid[y * 24 + x];
const compose = layers => layers[0].map((_, i) => layers.reduce((rgba, layer) => layer[i][3] ? layer[i] : rgba, [0, 0, 0, 0]));

test("exactly the twelve approved items are starter-owned, localized and slot-independent", () => {
  assert.equal(ITEMS.length, 90);
  assert.equal(new Set(ITEMS.map(item => item.id)).size, ITEMS.length);
  const base = { ...defaultCharacter("1.6.3"), hairColor: "#714D38", bodyColor: "#FFE6BD" };
  for (const id of NEW_IDS) {
    const item = getItemById(id);
    assert.ok(item?.owned, id);
    const equipped = equipItem(base, id);
    assert.equal(equipped.equipped[item.slot], id);
    assert.deepEqual({ ...equipped.equipped, [item.slot]: base.equipped[item.slot] }, base.equipped);
    assert.deepEqual(normalizeCharacter(equipped, base.version), equipped);
    for (const language of ["ko", "en", "zh-CN"]) {
      const messages = { ...wardrobeMessages(language), ...backgroundMessages(language) };
      assert.equal(typeof messages[`item.${id}`], "string", `${language}/${id}`);
      assert.ok(messages[`item.${id}`].length > 0);
    }
  }
  assert.deepEqual(ITEMS.filter(item => !item.owned).map(item => item.id), ["expedition_star_hat", "expedition_cloak", "expedition_sword"]);
});

test("all 78 pre-existing items retain exact metadata, Hero and both native tray representations", () => {
  const legacy = ITEMS.filter(item => !NEW_IDS.includes(item.id));
  assert.equal(legacy.length, 78);
  const hash = createHash("sha256");
  for (const item of legacy) {
    hash.update(JSON.stringify(item));
    for (let frame = 0; frame < 4; frame++) {
      const hero = equipItem(defaultCharacter(), item.id);
      hash.update(renderCharacterBuffer(hero, frame, 1));
      for (const scaleFactor of [1, 2]) hash.update(renderTrayCharacterBuffer(hero, frame, { platform: "darwin", scaleFactor }));
    }
  }
  assert.equal(hash.digest("hex"), "7dc5e84de6931b44ffbe1e27e0d4c13d43a0a571f08f0e714011eff0534044ae");
});

test("new gear preserves old faces across every hair, hat, face accessory and Idle pose", () => {
  const heads = [null, ...ITEMS.filter(item => item.slot === "head").map(item => item.id)];
  const faces = [null, ...ITEMS.filter(item => item.slot === "face").map(item => item.id)];
  const looks = [
    { clothes: "workshop_apron", back: "flower_basket", tool: "big_paintbrush" },
    { clothes: "raincoat", back: "bedroll_pack", tool: "camp_lantern" }
  ];
  for (const hair of HAIR_IDS) for (const head of heads) for (const face of faces) for (const look of looks) for (let frame = 0; frame < 4; frame++) {
    const hero = { ...defaultCharacter(), equipped: { hair, head, face, ...look } };
    const before = JSON.stringify(hero);
    const layers = renderCharacterLayers(hero, frame);
    const bodyAndFace = compose([layers.body, layers.hairFront, layers.head, layers.eyes, layers.face]);
    const all = compose(Object.values(layers));
    const bob = IDLE_POSES[frame].bob;
    for (let y = 6 + bob; y <= 10 + bob; y++) for (let x = 7; x <= 16; x++) {
      assert.deepEqual(pixel(all, x, y), pixel(bodyAndFace, x, y), `${hair}/${head}/${face}/${look.tool}/${frame}: face covered`);
    }
    for (let y = 11 + bob; y <= 12 + bob; y++) for (let x = 10; x <= 13; x++) {
      assert.equal(pixel(layers.hairFront, x, y)[3], 0, `${hair}: chin covered`);
      assert.equal(pixel(layers.tool, x, y)[3], 0, `${look.tool}: chin covered`);
    }
    for (const [name, grid] of Object.entries(layers)) assert.equal(grid.clippedPixels.length, 0, `${hair}/${head}/${name}`);
    assert.equal(JSON.stringify(hero), before);
  }
});

test("new headwear leaves expression visible and hair restoration lossless for every palette", () => {
  for (const hair of HAIR_IDS) for (const hairColor of [null, ...HAIR_COLORS]) for (const head of ["berry_beret", "studio_headphones"]) for (let frame = 0; frame < 4; frame++) {
    const hero = { ...defaultCharacter(), hairColor, equipped: { hair, head, clothes: "workshop_apron" } };
    const layers = renderCharacterLayers(hero, frame);
    const bob = IDLE_POSES[frame].bob;
    for (let y = 6 + bob; y <= 12 + bob; y++) for (let x = 7; x <= 16; x++) assert.equal(pixel(layers.head, x, y)[3], 0, `${head} hides face`);
    if (head === "studio_headphones") {
      const bare = renderCharacterLayers({ ...hero, equipped: { ...hero.equipped, head: null } }, frame);
      assert.deepEqual(layers.hairBack, bare.hairBack);
      assert.deepEqual(layers.hairFront, bare.hairFront);
    }
  }
  assert.equal(getItemById("berry_beret").hairFit, "cap");
  assert.equal(getItemById("studio_headphones").hairFit, "band");
});

test("new props have connected grips and distinct authored silhouettes on all four poses", () => {
  for (let frame = 0; frame < 4; frame++) {
    const bob = IDLE_POSES[frame].torsoBob;
    const lamp = renderCharacterLayers(equipItem(defaultCharacter(), "camp_lantern"), frame);
    assert.equal(pixel(lamp.grip, 18, 16 + bob)[3], 255);
    assert.equal(pixel(lamp.tool, 18, 16 + bob)[3], 255);
    assert.equal(pixel(lamp.tool, 19, 15 + bob)[3], 0, "lantern handle opening");
    assert.notDeepEqual(pixel(lamp.tool, 20, 19 + bob), pixel(lamp.tool, 19, 19 + bob), "large light window");
    const brush = renderCharacterLayers(equipItem(defaultCharacter(), "big_paintbrush"), frame);
    assert.equal(pixel(brush.grip, 21, 16 + bob)[3], 255);
    assert.equal(pixel(brush.tool, 21, 16 + bob)[3], 255);
    assert.notDeepEqual(pixel(brush.tool, 21, 9 + bob), pixel(brush.tool, 21, 12 + bob), "paint and ferrule differ");
    assert.notDeepEqual(pixel(brush.tool, 21, 12 + bob), pixel(brush.tool, 21, 15 + bob), "ferrule and handle differ");
  }
});

test("new outfits keep planted feet and new equipment shares the existing breath clock", () => {
  for (const clothes of ["workshop_apron", "raincoat"]) {
    const hero = { ...defaultCharacter(), equipped: { hair: "twin_buns", head: "studio_headphones", clothes, back: "flower_basket", tool: "camp_lantern" } };
    const poses = [0, 1, 2, 3].map(frame => renderCharacterLayers(hero, frame));
    for (const layers of poses) for (let y = 19; y <= 22; y++) for (let x = 7; x <= 16; x++) assert.deepEqual(pixel(layers.clothes, x, y), pixel(poses[0].clothes, x, y), `${clothes} lower body moved`);
    for (const name of ["hairBack", "hairFront", "head", "back", "straps", "tool", "grip"]) for (let frame = 0; frame < 4; frame++) {
      const delta = IDLE_POSES[frame].bob - IDLE_POSES[0].bob;
      for (let y = 1; y < 23; y++) for (let x = 0; x < 24; x++) assert.deepEqual(pixel(poses[frame][name], x, y + delta), pixel(poses[0][name], x, y), `${name}/${frame}: independent movement`);
    }
  }
});
