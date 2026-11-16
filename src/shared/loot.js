const LOOT_VERSION = 1;
const PITY_LIMIT = 80;
const LOOT_ITEMS = [
  { id: "meadow_crown", price: 600, slot: "head", name: "Moss Star Crown" },
  { id: "moon_coat", price: 600, slot: "clothes", name: "Moon Coat" },
  { id: "leaf_cape", price: 600, slot: "back", name: "Leaf Cape" },
  { id: "firefly_lantern", price: 600, slot: "tool", name: "Firefly Lantern" },
  { id: "background_star_meadow", price: 600, slot: "background", name: "Starlit Meadow" },
  { id: "meadow_badge", price: null, slot: "face", name: "Meadow Mark", firstClear: true }
];
const DROP_ITEMS = LOOT_ITEMS.filter(item => !item.firstClear);
const RATES = { normal: 0.01, elite: 0.04, boss: 0.08 };
const GOLD = { normal: [[1, 0.6], [2, 0.9], [3, 1]], elite: [[3, 0.5], [4, 0.85], [6, 1]], boss: [[8, 0.5], [10, 0.85], [15, 1]] };
const XP = { normal: 6, elite: 16, boss: 32 };
module.exports = { LOOT_VERSION, PITY_LIMIT, LOOT_ITEMS, DROP_ITEMS, RATES, GOLD, XP };
