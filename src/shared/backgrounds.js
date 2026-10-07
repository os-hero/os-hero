const SCENE_WIDTH = 39;
const SCENE_HEIGHT = 26;
const HERO_X = 7;
const HERO_Y = 1;
const DEFAULT_BACKGROUND_ID = "background_meadow";

const BACKGROUND_ITEMS = [
  ["meadow", "Blue Meadow", "푸른 초원", "蓝天草原"],
  ["forest", "Pine Forest", "소나무 숲", "松树林"],
  ["coast", "Turquoise Coast", "청록 해변", "碧海沙滩"],
  ["dunes", "Sunset Dunes", "노을 사막", "落日沙漠"],
  ["snow", "Snowy Peaks", "눈 덮인 산", "雪山"],
  ["blossoms", "Blossom Garden", "벚꽃 정원", "樱花庭园"],
  ["rain_town", "Rainy Village", "비 오는 마을", "雨中小镇"],
  ["moon_lake", "Moonlit Lake", "달빛 호수", "月光湖畔"],
  ["autumn", "Autumn Woods", "가을숲", "秋日树林"],
  ["volcano", "Volcanic Trail", "화산 길", "火山小径"]
].map(([theme, name, ko, zh]) => ({
  id: `background_${theme}`, name, theme, category: "background", slot: "background",
  owned: true, collection: "pixel_backgrounds", isDefault: theme === "meadow",
  assetPath: `assets/backgrounds/${theme}.png`, names: { en: name, ko, "zh-CN": zh }
}));

function backgroundMessages(language) {
  return {
    "category.background": { ko: "배경", en: "Backgrounds", "zh-CN": "背景" }[language] || "Backgrounds",
    "inventory.resetBackground": { ko: "초원으로", en: "Reset to meadow", "zh-CN": "恢复草原" }[language] || "Reset to meadow",
    ...Object.fromEntries(BACKGROUND_ITEMS.map((item) => [`item.${item.id}`, item.names[language] || item.name]))
  };
}

module.exports = { SCENE_WIDTH, SCENE_HEIGHT, HERO_X, HERO_Y, DEFAULT_BACKGROUND_ID, BACKGROUND_ITEMS, backgroundMessages };
