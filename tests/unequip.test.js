const test = require("node:test");
const assert = require("node:assert/strict");
const { ITEM_CATEGORIES, defaultCharacter, normalizeCharacter, equipItem, unequipSlot } = require("../src/shared/catalog");
const { getMessages, translate } = require("../src/shared/i18n");

test("clearing every slot preserves other equipment, appearance and its original input", () => {
  let hero = { ...defaultCharacter("1.5.0"), gender: "female", bodyColor: "#FFE6BD", eyeType: "bright", hairColor: "#714D38" };
  for (const id of ["long_hair", "red_cap", "round_glasses", "travel_jacket", "teal_backpack", "travel_mug", "background_rain_town"]) hero = equipItem(hero, id);
  const original = structuredClone(hero);
  for (const { id: slot } of ITEM_CATEGORIES) {
    const next = unequipSlot(hero, slot);
    assert.equal(next.equipped[slot], slot === "clothes" ? "default_clothes" : null);
    assert.deepEqual({ ...next, equipped: hero.equipped }, hero);
    assert.deepEqual({ ...next.equipped, [slot]: hero.equipped[slot] }, hero.equipped);
    assert.deepEqual(normalizeCharacter(next, "1.5.0"), next);
    assert.deepEqual(unequipSlot(next, slot), next);
  }
  assert.deepEqual(hero, original);
  assert.throws(() => unequipSlot(hero, "unknown"));
});

test("equipment toolbar states and accessible action names are localized in all languages", () => {
  const keys = ["equipment", "backgroundSlot", "emptySlot", "openSlot", "clearSlot", "resetOutfit", "defaultOutfit"];
  for (const language of ["ko", "en", "zh-CN"]) {
    const messages = getMessages(language);
    for (const key of keys) assert.ok(messages[`inventory.${key}`]);
    const action = translate(language, "inventory.clearSlot", { category: "Headwear", item: "Red Cap" });
    assert.ok(action.includes("Headwear") && action.includes("Red Cap"));
    assert.ok(!action.includes("{"));
  }
});
