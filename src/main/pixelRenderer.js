const { PNG } = require("pngjs");
const {
  DEFAULT_CLOTHES_ID,
  getEyeType,
  getItemById,
  normalizeCharacter
} = require("../shared/catalog");

const VIRTUAL_SIZE = 24;
const TRAY_PADDING = 4;
const OUTLINE = "#1F2328";
const SHADOW = "#000000";

function parseHex(hex) {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

function toHexChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function rgbToHex([red, green, blue]) {
  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function mixColor(hex, target, amount) {
  const sourceRgb = parseHex(hex);
  const targetRgb = parseHex(target);
  return rgbToHex(
    sourceRgb.map((channel, index) => {
      return channel + (targetRgb[index] - channel) * amount;
    })
  );
}

function darken(hex, amount) {
  return mixColor(hex, "#000000", amount);
}

function lighten(hex, amount) {
  return mixColor(hex, "#FFFFFF", amount);
}

function hexToRgba(hex, alpha = 255) {
  const [red, green, blue] = parseHex(hex);
  return [red, green, blue, alpha];
}

function createGrid() {
  return Array.from({ length: VIRTUAL_SIZE * VIRTUAL_SIZE }, () => [0, 0, 0, 0]);
}

function setPixel(grid, x, y, color, alpha = 255) {
  if (x < 0 || y < 0 || x >= VIRTUAL_SIZE || y >= VIRTUAL_SIZE) {
    return;
  }

  grid[y * VIRTUAL_SIZE + x] = hexToRgba(color, alpha);
}

function drawRect(grid, x, y, width, height, color, alpha = 255) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      setPixel(grid, px, py, color, alpha);
    }
  }
}

function drawPixelPattern(grid, pixels, color, alpha = 255) {
  for (const [x, y] of pixels) {
    setPixel(grid, x, y, color, alpha);
  }
}

function getClothesStyle(character) {
  const clothes = getItemById(character.equipped.clothes) || getItemById(DEFAULT_CLOTHES_ID);
  return clothes.style;
}

function drawBodyLayer(grid, character, bob) {
  const skin = character.bodyColor;
  const skinShade = darken(skin, 0.16);
  const skinLight = lighten(skin, 0.12);
  const headY = 2 + bob;

  drawRect(grid, 8, headY, 8, 1, OUTLINE);
  drawRect(grid, 6, headY + 1, 12, 1, OUTLINE);
  drawRect(grid, 5, headY + 2, 14, 7, OUTLINE);
  drawRect(grid, 6, headY + 9, 12, 1, OUTLINE);
  drawRect(grid, 8, headY + 10, 8, 1, OUTLINE);

  drawRect(grid, 8, headY + 1, 8, 1, skin);
  drawRect(grid, 6, headY + 2, 12, 7, skin);
  drawRect(grid, 7, headY + 9, 10, 1, skin);
  drawRect(grid, 9, headY + 10, 6, 1, skin);
  drawRect(grid, 6, headY + 7, 1, 2, skinShade);
  drawRect(grid, 17, headY + 7, 1, 2, skinShade);
  setPixel(grid, 8, headY + 4, skinLight);
  setPixel(grid, 15, headY + 4, skinLight);
  setPixel(grid, 12, headY + 6, skinShade);
  drawPixelPattern(
    grid,
    [
      [11, headY + 8],
      [12, headY + 8]
    ],
    darken(skin, 0.32)
  );

  const neckY = headY + 10;
  drawRect(grid, 10, neckY, 4, 3, OUTLINE);
  drawRect(grid, 10, neckY, 4, 2, skin);
  drawRect(grid, 10, neckY + 1, 1, 1, skinShade);
  drawRect(grid, 13, neckY + 1, 1, 1, skinShade);

  const armY = 12 + bob;
  drawRect(grid, 4, armY + 1, 3, 6, OUTLINE);
  drawRect(grid, 17, armY + 1, 3, 6, OUTLINE);
  drawRect(grid, 4, armY + 4, 3, 2, skin);
  drawRect(grid, 17, armY + 4, 3, 2, skin);
  setPixel(grid, 5, armY + 6, skinShade);
  setPixel(grid, 18, armY + 6, skinShade);
}

function drawSleeves(grid, style, torsoY, expanded) {
  const leftX = expanded ? 4 : 5;
  const rightX = expanded ? 17 : 16;

  drawRect(grid, leftX, torsoY + 1, 3, 4, OUTLINE);
  drawRect(grid, rightX, torsoY + 1, 3, 4, OUTLINE);
  drawRect(grid, leftX + 1, torsoY + 2, 2, 2, style.shirt);
  drawRect(grid, rightX, torsoY + 2, 2, 2, style.shirt);
}

function drawLegs(grid, bob, pantsColor) {
  const legTop = 18 + bob;
  const legHeight = bob ? 3 : 4;

  drawRect(grid, 7, legTop - 1, 10, 1, OUTLINE);
  drawRect(grid, 7, legTop, 5, legHeight, OUTLINE);
  drawRect(grid, 12, legTop, 5, legHeight, OUTLINE);
  drawRect(grid, 8, legTop, 3, legHeight, pantsColor);
  drawRect(grid, 13, legTop, 3, legHeight, pantsColor);
  drawRect(grid, 9, legTop, 1, legHeight, lighten(pantsColor, 0.1));
  drawRect(grid, 14, legTop, 1, legHeight, lighten(pantsColor, 0.1));
  drawRect(grid, 6, 22, 6, 1, OUTLINE);
  drawRect(grid, 12, 22, 6, 1, OUTLINE);
}

function drawClothesLayer(grid, character, bob, frameIndex) {
  const style = getClothesStyle(character);
  const clothesId = character.equipped.clothes;
  const torsoY = 12 + bob;
  const expanded = frameIndex % 4 === 1;
  const shirtShade = darken(style.shirt, 0.16);
  const pantsShade = darken(style.pants, 0.18);
  const trim = style.trim || style.accent;

  drawSleeves(grid, style, torsoY, expanded);

  drawRect(grid, 6, torsoY, 12, 1, OUTLINE);
  drawRect(grid, 5, torsoY + 1, 14, 6, OUTLINE);
  drawRect(grid, 6, torsoY + 6, 12, 1, OUTLINE);
  drawRect(grid, 7, torsoY + 1, 10, 5, style.shirt);
  drawRect(grid, 7, torsoY + 5, 10, 1, shirtShade);

  if (clothesId === "blue_overalls") {
    drawRect(grid, 8, torsoY + 1, 2, 5, style.pants);
    drawRect(grid, 14, torsoY + 1, 2, 5, style.pants);
    drawRect(grid, 9, torsoY + 3, 6, 3, style.pants);
    drawRect(grid, 10, torsoY + 4, 4, 1, lighten(style.pants, 0.1));
    setPixel(grid, 9, torsoY + 2, style.accent);
    setPixel(grid, 14, torsoY + 2, style.accent);
    drawLegs(grid, bob, style.pants);
    return;
  }

  if (clothesId === "green_tunic") {
    drawRect(grid, 6, torsoY + 5, 12, 2, style.shirt);
    drawRect(grid, 7, torsoY + 4, 10, 1, style.accent);
    drawPixelPattern(
      grid,
      [
        [7, torsoY + 6],
        [10, torsoY + 6],
        [13, torsoY + 6],
        [16, torsoY + 6]
      ],
      shirtShade
    );
    setPixel(grid, 11, torsoY + 1, style.accent);
    setPixel(grid, 12, torsoY + 1, style.accent);
    drawLegs(grid, bob, style.pants);
    return;
  }

  if (["wizard_robe", "royal_robe", "cleric_robes"].includes(clothesId)) {
    drawRect(grid, 6, torsoY + 5, 12, 5, OUTLINE);
    drawRect(grid, 7, torsoY + 5, 10, 4, style.shirt);
    drawRect(grid, 8, torsoY + 9, 8, 1, style.pants);
    drawRect(grid, 11, torsoY + 1, 2, 8, trim);
    drawPixelPattern(
      grid,
      [
        [9, torsoY + 2],
        [14, torsoY + 2],
        [8, torsoY + 5],
        [15, torsoY + 5],
        [10, torsoY + 7],
        [13, torsoY + 7]
      ],
      style.accent
    );
    drawRect(grid, 6, 22, 12, 1, OUTLINE);
    return;
  }

  if (clothesId === "princess_dress") {
    drawPixelPattern(
      grid,
      [
        [8, torsoY + 1],
        [15, torsoY + 1],
        [7, torsoY + 2],
        [16, torsoY + 2]
      ],
      trim
    );
    drawRect(grid, 5, torsoY + 6, 14, 5, OUTLINE);
    drawRect(grid, 6, torsoY + 6, 12, 4, style.shirt);
    drawRect(grid, 8, torsoY + 10, 8, 1, style.pants);
    drawRect(grid, 7, torsoY + 7, 10, 1, style.accent);
    drawPixelPattern(
      grid,
      [
        [10, torsoY + 3],
        [13, torsoY + 3],
        [9, torsoY + 8],
        [14, torsoY + 8]
      ],
      trim
    );
    return;
  }

  if (clothesId === "knight_armor") {
    drawRect(grid, 7, torsoY + 1, 10, 1, style.accent);
    drawRect(grid, 8, torsoY + 3, 8, 2, trim);
    drawRect(grid, 10, torsoY + 1, 4, 5, darken(style.shirt, 0.08));
    drawRect(grid, 11, torsoY + 1, 2, 5, lighten(style.shirt, 0.12));
    drawPixelPattern(
      grid,
      [
        [7, torsoY + 2],
        [16, torsoY + 2],
        [9, torsoY + 5],
        [14, torsoY + 5]
      ],
      OUTLINE
    );
    drawLegs(grid, bob, style.pants);
    return;
  }

  if (["rogue_cloak", "ninja_suit", "ranger_hoodie", "pirate_coat"].includes(clothesId)) {
    drawRect(grid, 5, torsoY + 1, 3, 8, OUTLINE);
    drawRect(grid, 16, torsoY + 1, 3, 8, OUTLINE);
    drawRect(grid, 6, torsoY + 1, 2, 7, darken(style.shirt, 0.12));
    drawRect(grid, 16, torsoY + 1, 2, 7, darken(style.shirt, 0.18));
    drawRect(grid, 7, torsoY + 4, 10, 1, trim);
    drawRect(grid, 11, torsoY + 1, 2, 5, style.accent);
    if (clothesId === "pirate_coat") {
      setPixel(grid, 8, torsoY + 2, style.accent);
      setPixel(grid, 15, torsoY + 2, style.accent);
      drawRect(grid, 9, torsoY + 5, 6, 1, trim);
    }
    if (clothesId === "ninja_suit") {
      drawRect(grid, 9, torsoY + 2, 6, 1, trim);
    }
    drawLegs(grid, bob, style.pants);
    return;
  }

  if (clothesId === "dragon_suit") {
    drawRect(grid, 10, torsoY + 1, 4, 5, style.accent);
    drawPixelPattern(
      grid,
      [
        [8, torsoY + 2],
        [15, torsoY + 2],
        [9, torsoY + 4],
        [14, torsoY + 4],
        [20, torsoY + 5],
        [21, torsoY + 6],
        [20, torsoY + 7]
      ],
      trim
    );
    drawRect(grid, 19, torsoY + 4, 3, 5, OUTLINE);
    drawRect(grid, 20, torsoY + 5, 1, 3, style.shirt);
    drawLegs(grid, bob, style.pants);
    return;
  }

  if (clothesId === "space_suit") {
    drawRect(grid, 8, torsoY + 1, 8, 4, lighten(style.shirt, 0.08));
    drawRect(grid, 9, torsoY + 2, 6, 2, style.accent);
    drawRect(grid, 7, torsoY + 5, 10, 1, trim);
    setPixel(grid, 16, torsoY + 2, trim);
    setPixel(grid, 7, torsoY + 2, trim);
    drawLegs(grid, bob, style.pants);
    return;
  }

  if (clothesId === "devil_suit") {
    drawRect(grid, 7, torsoY + 4, 10, 1, trim);
    drawRect(grid, 11, torsoY + 1, 2, 5, style.accent);
    drawPixelPattern(
      grid,
      [
        [4, torsoY],
        [3, torsoY - 1],
        [19, torsoY],
        [20, torsoY - 1],
        [20, torsoY + 5],
        [21, torsoY + 6],
        [20, torsoY + 7]
      ],
      style.accent
    );
    drawLegs(grid, bob, style.pants);
    return;
  }

  if (clothesId === "barbarian_armor") {
    drawRect(grid, 7, torsoY + 1, 10, 2, style.accent);
    drawRect(grid, 7, torsoY + 4, 10, 1, trim);
    drawPixelPattern(
      grid,
      [
        [6, torsoY + 1],
        [17, torsoY + 1],
        [9, torsoY + 3],
        [14, torsoY + 3]
      ],
      trim
    );
    drawLegs(grid, bob, style.pants);
    return;
  }

  drawPixelPattern(
    grid,
    [
      [10, torsoY + 1],
      [13, torsoY + 1],
      [11, torsoY + 2],
      [12, torsoY + 2]
    ],
    character.bodyColor
  );
  drawRect(grid, 7, torsoY + 4, 10, 1, style.accent);
  setPixel(grid, 8, torsoY + 2, shirtShade);
  setPixel(grid, 15, torsoY + 2, lighten(style.shirt, 0.12));
  drawLegs(grid, bob, pantsShade);
}

function drawHeadLayer(grid, character, bob) {
  const item = getItemById(character.equipped.head);
  if (!item) {
    return;
  }

  const headY = 2 + bob;
  const primary = item.style.primary;
  const accent = item.style.accent || darken(primary, 0.2);
  const shade = darken(primary, 0.22);
  const light = lighten(primary, 0.16);

  if (item.id === "basic_hair") {
    drawRect(grid, 8, headY - 1, 9, 1, OUTLINE);
    drawRect(grid, 6, headY, 12, 2, OUTLINE);
    drawRect(grid, 5, headY + 2, 4, 3, OUTLINE);
    drawRect(grid, 15, headY + 2, 3, 2, OUTLINE);
    drawRect(grid, 8, headY - 1, 8, 1, primary);
    drawRect(grid, 6, headY, 11, 2, primary);
    drawRect(grid, 5, headY + 2, 3, 2, primary);
    drawRect(grid, 16, headY + 2, 2, 1, shade);
    drawPixelPattern(
      grid,
      [
        [8, headY + 2],
        [9, headY + 2],
        [10, headY + 3],
        [15, headY + 1]
      ],
      accent
    );
  }

  if (item.id === "red_cap") {
    drawRect(grid, 8, headY - 2, 8, 1, OUTLINE);
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 13, headY + 1, 7, 1, OUTLINE);
    drawRect(grid, 8, headY - 2, 7, 1, primary);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 14, headY + 1, 5, 1, primary);
    drawRect(grid, 9, headY - 1, 3, 1, light);
    drawPixelPattern(
      grid,
      [
        [11, headY],
        [12, headY]
      ],
      accent
    );
  }

  if (item.id === "long_hair") {
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 4, headY + 1, 5, 11, OUTLINE);
    drawRect(grid, 15, headY + 1, 5, 11, OUTLINE);
    drawRect(grid, 6, headY + 9, 12, 4, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 5, headY + 1, 4, 10, primary);
    drawRect(grid, 15, headY + 1, 4, 10, primary);
    drawRect(grid, 7, headY + 9, 10, 3, primary);
    drawRect(grid, 5, headY + 7, 1, 4, shade);
    drawRect(grid, 18, headY + 7, 1, 4, shade);
    drawPixelPattern(
      grid,
      [
        [8, headY + 1],
        [9, headY + 2],
        [14, headY + 1],
        [15, headY + 2],
        [7, headY + 10],
        [16, headY + 10]
      ],
      accent
    );
  }

  if (item.id === "bob_hair") {
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 5, headY + 1, 4, 8, OUTLINE);
    drawRect(grid, 15, headY + 1, 4, 8, OUTLINE);
    drawRect(grid, 7, headY + 8, 10, 2, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 6, headY + 1, 3, 7, primary);
    drawRect(grid, 15, headY + 1, 3, 7, primary);
    drawRect(grid, 8, headY + 8, 8, 1, primary);
    drawRect(grid, 6, headY + 5, 1, 3, shade);
    drawRect(grid, 17, headY + 5, 1, 3, shade);
    drawPixelPattern(
      grid,
      [
        [8, headY + 1],
        [9, headY + 1],
        [10, headY + 2],
        [13, headY + 1],
        [14, headY + 2]
      ],
      accent
    );
  }

  if (item.id === "twin_tails") {
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 5, headY + 1, 4, 5, OUTLINE);
    drawRect(grid, 15, headY + 1, 4, 5, OUTLINE);
    drawRect(grid, 2, headY + 5, 5, 6, OUTLINE);
    drawRect(grid, 17, headY + 5, 5, 6, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 6, headY + 1, 3, 4, primary);
    drawRect(grid, 15, headY + 1, 3, 4, primary);
    drawRect(grid, 3, headY + 6, 3, 4, primary);
    drawRect(grid, 18, headY + 6, 3, 4, primary);
    drawRect(grid, 3, headY + 9, 3, 1, shade);
    drawRect(grid, 18, headY + 9, 3, 1, shade);
    drawPixelPattern(
      grid,
      [
        [5, headY + 5],
        [18, headY + 5],
        [4, headY + 8],
        [19, headY + 8]
      ],
      accent
    );
  }

  if (item.id === "spiky_hair") {
    drawPixelPattern(
      grid,
      [
        [7, headY - 2],
        [10, headY - 2],
        [13, headY - 2],
        [16, headY - 2],
        [6, headY - 1],
        [8, headY - 1],
        [11, headY - 1],
        [14, headY - 1],
        [17, headY - 1]
      ],
      OUTLINE
    );
    drawRect(grid, 6, headY, 12, 2, OUTLINE);
    drawRect(grid, 5, headY + 2, 4, 3, OUTLINE);
    drawRect(grid, 15, headY + 2, 4, 2, OUTLINE);
    drawPixelPattern(
      grid,
      [
        [7, headY - 1],
        [10, headY - 1],
        [13, headY - 1],
        [16, headY - 1],
        [6, headY],
        [8, headY],
        [11, headY],
        [14, headY],
        [17, headY]
      ],
      primary
    );
    drawRect(grid, 6, headY + 1, 11, 1, primary);
    drawRect(grid, 5, headY + 2, 3, 2, shade);
    drawRect(grid, 16, headY + 2, 2, 1, accent);
  }

  if (item.id === "side_part_hair") {
    drawRect(grid, 7, headY - 1, 10, 1, OUTLINE);
    drawRect(grid, 5, headY, 14, 3, OUTLINE);
    drawRect(grid, 5, headY + 3, 3, 4, OUTLINE);
    drawRect(grid, 16, headY + 2, 3, 4, OUTLINE);
    drawRect(grid, 7, headY - 1, 9, 1, light);
    drawRect(grid, 6, headY, 12, 2, primary);
    drawRect(grid, 6, headY + 2, 5, 1, accent);
    drawRect(grid, 5, headY + 3, 2, 3, shade);
    drawRect(grid, 16, headY + 2, 2, 3, shade);
    drawPixelPattern(
      grid,
      [
        [9, headY + 1],
        [10, headY + 2],
        [11, headY + 2]
      ],
      light
    );
  }

  if (item.id === "mohawk_hair") {
    drawRect(grid, 10, headY - 3, 4, 5, OUTLINE);
    drawRect(grid, 6, headY + 1, 12, 2, OUTLINE);
    drawRect(grid, 5, headY + 3, 3, 3, OUTLINE);
    drawRect(grid, 16, headY + 3, 3, 3, OUTLINE);
    drawRect(grid, 11, headY - 2, 2, 4, primary);
    drawRect(grid, 12, headY - 2, 1, 4, light);
    drawRect(grid, 6, headY + 1, 12, 1, shade);
    drawRect(grid, 5, headY + 3, 2, 2, shade);
    drawRect(grid, 17, headY + 3, 1, 2, shade);
    setPixel(grid, 12, headY, accent);
  }

  if (item.id === "curly_hair") {
    drawPixelPattern(
      grid,
      [
        [7, headY - 1],
        [9, headY - 2],
        [12, headY - 2],
        [15, headY - 1],
        [5, headY + 1],
        [18, headY + 1],
        [5, headY + 4],
        [18, headY + 4]
      ],
      OUTLINE
    );
    drawRect(grid, 6, headY, 12, 3, OUTLINE);
    drawRect(grid, 5, headY + 2, 4, 5, OUTLINE);
    drawRect(grid, 15, headY + 2, 4, 5, OUTLINE);
    drawRect(grid, 7, headY, 10, 2, primary);
    drawRect(grid, 6, headY + 2, 3, 4, primary);
    drawRect(grid, 15, headY + 2, 3, 4, primary);
    drawPixelPattern(
      grid,
      [
        [8, headY],
        [11, headY + 1],
        [14, headY],
        [6, headY + 3],
        [17, headY + 3]
      ],
      accent
    );
  }

  if (item.id === "ponytail_hair") {
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 5, headY + 1, 4, 6, OUTLINE);
    drawRect(grid, 15, headY + 1, 4, 5, OUTLINE);
    drawRect(grid, 18, headY + 4, 4, 8, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 6, headY + 1, 3, 5, primary);
    drawRect(grid, 15, headY + 1, 3, 4, primary);
    drawRect(grid, 19, headY + 5, 2, 6, primary);
    drawRect(grid, 19, headY + 10, 2, 1, shade);
    drawPixelPattern(
      grid,
      [
        [18, headY + 4],
        [20, headY + 7],
        [8, headY + 1],
        [14, headY + 1]
      ],
      accent
    );
  }

  if (item.id === "princess_hair") {
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 4, headY + 1, 5, 11, OUTLINE);
    drawRect(grid, 15, headY + 1, 5, 11, OUTLINE);
    drawRect(grid, 6, headY + 8, 12, 5, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 5, headY + 1, 4, 10, primary);
    drawRect(grid, 15, headY + 1, 4, 10, primary);
    drawRect(grid, 7, headY + 9, 10, 3, primary);
    drawRect(grid, 6, headY + 4, 2, 6, light);
    drawRect(grid, 16, headY + 4, 2, 6, shade);
    drawPixelPattern(
      grid,
      [
        [8, headY + 1],
        [9, headY + 2],
        [14, headY + 1],
        [15, headY + 2],
        [10, headY + 10],
        [13, headY + 10]
      ],
      accent
    );
  }

  if (item.id === "short_bangs") {
    drawRect(grid, 7, headY - 1, 10, 1, OUTLINE);
    drawRect(grid, 5, headY, 14, 3, OUTLINE);
    drawRect(grid, 5, headY + 2, 3, 5, OUTLINE);
    drawRect(grid, 16, headY + 2, 3, 5, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 1, primary);
    drawRect(grid, 6, headY, 12, 2, primary);
    drawRect(grid, 6, headY + 2, 2, 4, shade);
    drawRect(grid, 16, headY + 2, 2, 4, shade);
    drawPixelPattern(
      grid,
      [
        [8, headY + 2],
        [10, headY + 2],
        [12, headY + 2],
        [14, headY + 2],
        [16, headY + 2]
      ],
      accent
    );
  }

  if (item.id === "braided_hair") {
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 4, headY + 1, 5, 8, OUTLINE);
    drawRect(grid, 15, headY + 1, 5, 8, OUTLINE);
    drawRect(grid, 3, headY + 8, 4, 7, OUTLINE);
    drawRect(grid, 17, headY + 8, 4, 7, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 5, headY + 1, 4, 7, primary);
    drawRect(grid, 15, headY + 1, 4, 7, primary);
    drawRect(grid, 4, headY + 9, 2, 5, primary);
    drawRect(grid, 18, headY + 9, 2, 5, primary);
    drawPixelPattern(
      grid,
      [
        [4, headY + 9],
        [5, headY + 11],
        [4, headY + 13],
        [18, headY + 9],
        [19, headY + 11],
        [18, headY + 13]
      ],
      accent
    );
  }

  if (item.id === "wizard_hat") {
    drawPixelPattern(
      grid,
      [
        [12, headY - 4],
        [11, headY - 3],
        [12, headY - 3],
        [13, headY - 3],
        [10, headY - 2],
        [11, headY - 2],
        [12, headY - 2],
        [13, headY - 2],
        [14, headY - 2]
      ],
      OUTLINE
    );
    drawRect(grid, 6, headY - 1, 13, 2, OUTLINE);
    drawRect(grid, 11, headY - 3, 3, 1, primary);
    drawRect(grid, 10, headY - 2, 5, 1, primary);
    drawRect(grid, 7, headY - 1, 11, 1, primary);
    drawRect(grid, 9, headY, 8, 1, primary);
    drawPixelPattern(grid, [[8, headY], [13, headY - 2], [16, headY - 1]], accent);
  }

  if (item.id === "gold_crown") {
    drawPixelPattern(
      grid,
      [
        [6, headY - 2],
        [8, headY - 3],
        [12, headY - 3],
        [16, headY - 3],
        [18, headY - 2],
        [6, headY - 1],
        [18, headY - 1]
      ],
      OUTLINE
    );
    drawRect(grid, 7, headY - 1, 11, 2, OUTLINE);
    drawPixelPattern(
      grid,
      [
        [7, headY - 2],
        [8, headY - 2],
        [12, headY - 2],
        [16, headY - 2],
        [17, headY - 2]
      ],
      primary
    );
    drawRect(grid, 7, headY - 1, 11, 1, primary);
    drawRect(grid, 8, headY, 9, 1, darken(primary, 0.08));
    setPixel(grid, 12, headY - 1, accent);
    setPixel(grid, 9, headY - 1, "#5FC9F3");
    setPixel(grid, 15, headY - 1, "#5FC9F3");
  }

  if (item.id === "knight_helmet") {
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 5, headY + 1, 14, 7, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 6, headY + 1, 12, 6, primary);
    drawRect(grid, 8, headY + 4, 8, 3, character.bodyColor);
    drawRect(grid, 10, headY + 1, 4, 6, accent);
    drawPixelPattern(
      grid,
      [
        [7, headY + 2],
        [16, headY + 2],
        [9, headY + 3],
        [14, headY + 3]
      ],
      shade
    );
  }

  if (item.id === "pirate_hat") {
    drawRect(grid, 5, headY - 2, 14, 2, OUTLINE);
    drawRect(grid, 7, headY - 4, 10, 3, OUTLINE);
    drawRect(grid, 6, headY - 2, 12, 1, primary);
    drawRect(grid, 8, headY - 3, 8, 2, primary);
    drawRect(grid, 9, headY - 1, 6, 1, darken(primary, 0.12));
    drawPixelPattern(
      grid,
      [
        [11, headY - 2],
        [12, headY - 2],
        [10, headY - 3],
        [13, headY - 3]
      ],
      accent
    );
  }

  if (item.id === "horned_helm") {
    drawRect(grid, 7, headY - 1, 10, 2, OUTLINE);
    drawRect(grid, 5, headY + 1, 14, 6, OUTLINE);
    drawPixelPattern(
      grid,
      [
        [3, headY - 1],
        [4, headY],
        [5, headY + 1],
        [20, headY - 1],
        [19, headY],
        [18, headY + 1]
      ],
      OUTLINE
    );
    drawRect(grid, 8, headY - 1, 8, 2, primary);
    drawRect(grid, 6, headY + 1, 12, 5, primary);
    drawRect(grid, 8, headY + 4, 8, 2, character.bodyColor);
    drawPixelPattern(
      grid,
      [
        [4, headY],
        [5, headY + 1],
        [19, headY],
        [18, headY + 1]
      ],
      accent
    );
    drawRect(grid, 10, headY + 1, 4, 4, light);
  }

  if (item.id === "ninja_hood") {
    drawRect(grid, 6, headY - 1, 12, 2, OUTLINE);
    drawRect(grid, 5, headY + 1, 14, 9, OUTLINE);
    drawRect(grid, 7, headY - 1, 10, 2, primary);
    drawRect(grid, 6, headY + 1, 12, 8, primary);
    drawRect(grid, 8, headY + 4, 8, 3, character.bodyColor);
    drawRect(grid, 8, headY + 6, 8, 1, primary);
    drawRect(grid, 5, headY + 8, 14, 2, shade);
    setPixel(grid, 16, headY + 2, accent);
  }
}

function drawEyeLayer(grid, character, bob) {
  const eyeType = getEyeType(character.eyeType).id;
  const eyeY = 7 + bob;

  if (eyeType === "dot") {
    setPixel(grid, 9, eyeY, OUTLINE);
    setPixel(grid, 14, eyeY, OUTLINE);
    return;
  }

  if (eyeType === "happy") {
    drawPixelPattern(
      grid,
      [
        [8, eyeY],
        [9, eyeY + 1],
        [10, eyeY + 1],
        [13, eyeY + 1],
        [14, eyeY + 1],
        [15, eyeY]
      ],
      OUTLINE
    );
    return;
  }

  if (eyeType === "sleepy") {
    drawRect(grid, 8, eyeY, 4, 1, OUTLINE);
    drawRect(grid, 13, eyeY, 4, 1, OUTLINE);
    return;
  }

  if (eyeType === "focused") {
    drawPixelPattern(
      grid,
      [
        [8, eyeY],
        [9, eyeY],
        [10, eyeY + 1],
        [15, eyeY],
        [14, eyeY],
        [13, eyeY + 1],
        [9, eyeY + 2],
        [14, eyeY + 2]
      ],
      OUTLINE
    );
    return;
  }

  if (eyeType === "bright") {
    drawRect(grid, 8, eyeY, 3, 3, OUTLINE);
    drawRect(grid, 13, eyeY, 3, 3, OUTLINE);
    setPixel(grid, 9, eyeY, "#F8FBFF");
    setPixel(grid, 14, eyeY, "#F8FBFF");
    setPixel(grid, 10, eyeY + 2, "#6D3D24");
    setPixel(grid, 15, eyeY + 2, "#6D3D24");
    return;
  }

  drawRect(grid, 9, eyeY, 2, 2, OUTLINE);
  drawRect(grid, 14, eyeY, 2, 2, OUTLINE);
  setPixel(grid, 10, eyeY, "#F8FBFF");
  setPixel(grid, 15, eyeY, "#F8FBFF");
}

function drawToolLayer(grid, character, bob) {
  const item = getItemById(character.equipped.tool);
  if (!item) {
    return;
  }

  const eyeY = 6 + bob;

  if (item.id === "round_glasses") {
    drawPixelPattern(
      grid,
      [
        [7, eyeY],
        [8, eyeY],
        [9, eyeY],
        [10, eyeY],
        [11, eyeY],
        [7, eyeY + 1],
        [11, eyeY + 1],
        [7, eyeY + 2],
        [11, eyeY + 2],
        [7, eyeY + 3],
        [8, eyeY + 3],
        [9, eyeY + 3],
        [10, eyeY + 3],
        [11, eyeY + 3],
        [12, eyeY + 1],
        [13, eyeY],
        [14, eyeY],
        [15, eyeY],
        [16, eyeY],
        [17, eyeY],
        [13, eyeY + 1],
        [17, eyeY + 1],
        [13, eyeY + 2],
        [17, eyeY + 2],
        [13, eyeY + 3],
        [14, eyeY + 3],
        [15, eyeY + 3],
        [16, eyeY + 3],
        [17, eyeY + 3]
      ],
      item.style.primary
    );
  }

  if (item.id === "small_bag") {
    const bagY = 15 + bob;
    drawPixelPattern(
      grid,
      [
        [15, 12 + bob],
        [16, 13 + bob],
        [17, 14 + bob],
        [18, 15 + bob]
      ],
      item.style.accent
    );
    drawRect(grid, 17, bagY, 5, 6, OUTLINE);
    drawRect(grid, 18, bagY + 1, 3, 4, item.style.primary);
    drawRect(grid, 18, bagY + 1, 3, 1, item.style.accent);
    setPixel(grid, 19, bagY + 3, darken(item.style.primary, 0.24));
  }

  if (item.id === "iron_sword") {
    drawRect(grid, 20, 6 + bob, 2, 11, OUTLINE);
    drawRect(grid, 21, 5 + bob, 1, 1, OUTLINE);
    drawRect(grid, 20, 7 + bob, 1, 9, item.style.primary);
    drawRect(grid, 21, 6 + bob, 1, 10, lighten(item.style.primary, 0.16));
    drawRect(grid, 18, 15 + bob, 5, 1, item.style.accent);
    drawRect(grid, 19, 16 + bob, 3, 2, darken(item.style.accent, 0.18));
  }

  if (item.id === "wooden_shield") {
    drawRect(grid, 1, 13 + bob, 6, 8, OUTLINE);
    drawRect(grid, 2, 14 + bob, 4, 6, item.style.primary);
    drawRect(grid, 3, 14 + bob, 2, 6, lighten(item.style.primary, 0.1));
    drawRect(grid, 2, 16 + bob, 4, 1, item.style.accent);
    drawRect(grid, 4, 14 + bob, 1, 6, item.style.accent);
  }

  if (item.id === "magic_staff") {
    drawRect(grid, 3, 7 + bob, 2, 14, OUTLINE);
    drawRect(grid, 4, 7 + bob, 1, 14, item.style.primary);
    drawRect(grid, 2, 5 + bob, 4, 4, OUTLINE);
    drawRect(grid, 3, 6 + bob, 2, 2, item.style.accent);
    setPixel(grid, 4, 6 + bob, lighten(item.style.accent, 0.25));
    drawPixelPattern(grid, [[1, 6 + bob], [6, 6 + bob], [4, 4 + bob]], "#F5D547");
  }

  if (item.id === "long_bow") {
    drawPixelPattern(
      grid,
      [
        [21, 6 + bob],
        [20, 7 + bob],
        [20, 8 + bob],
        [19, 9 + bob],
        [19, 10 + bob],
        [19, 11 + bob],
        [20, 12 + bob],
        [20, 13 + bob],
        [21, 14 + bob],
        [21, 15 + bob],
        [20, 16 + bob],
        [19, 17 + bob]
      ],
      OUTLINE
    );
    drawPixelPattern(grid, [[20, 7 + bob], [19, 9 + bob], [19, 13 + bob], [20, 15 + bob]], item.style.primary);
    drawRect(grid, 21, 7 + bob, 1, 10, item.style.accent);
    drawRect(grid, 18, 11 + bob, 5, 1, OUTLINE);
  }

  if (item.id === "battle_axe") {
    drawRect(grid, 20, 7 + bob, 2, 13, OUTLINE);
    drawRect(grid, 21, 8 + bob, 1, 12, item.style.accent);
    drawRect(grid, 16, 6 + bob, 5, 5, OUTLINE);
    drawRect(grid, 17, 7 + bob, 4, 3, item.style.primary);
    setPixel(grid, 16, 8 + bob, item.style.primary);
    setPixel(grid, 19, 7 + bob, lighten(item.style.primary, 0.18));
  }

  if (item.id === "steel_dagger") {
    drawPixelPattern(
      grid,
      [
        [19, 11 + bob],
        [20, 10 + bob],
        [21, 9 + bob],
        [22, 8 + bob],
        [20, 12 + bob],
        [21, 11 + bob],
        [22, 10 + bob]
      ],
      OUTLINE
    );
    drawPixelPattern(grid, [[20, 11 + bob], [21, 10 + bob], [22, 9 + bob]], item.style.primary);
    drawRect(grid, 17, 13 + bob, 4, 1, item.style.accent);
    drawRect(grid, 18, 14 + bob, 2, 2, darken(item.style.accent, 0.18));
  }

  if (item.id === "wizard_wand") {
    drawRect(grid, 3, 10 + bob, 2, 8, OUTLINE);
    drawRect(grid, 4, 10 + bob, 1, 8, item.style.primary);
    drawPixelPattern(
      grid,
      [
        [3, 7 + bob],
        [4, 6 + bob],
        [5, 7 + bob],
        [4, 8 + bob],
        [2, 8 + bob],
        [6, 8 + bob]
      ],
      item.style.accent
    );
  }

  if (item.id === "spellbook") {
    drawRect(grid, 1, 13 + bob, 7, 6, OUTLINE);
    drawRect(grid, 2, 14 + bob, 5, 4, item.style.primary);
    drawRect(grid, 4, 14 + bob, 1, 4, darken(item.style.primary, 0.22));
    drawRect(grid, 2, 15 + bob, 2, 1, item.style.accent);
    drawRect(grid, 5, 16 + bob, 2, 1, item.style.accent);
  }

  if (item.id === "kite_shield") {
    drawRect(grid, 1, 12 + bob, 6, 8, OUTLINE);
    drawRect(grid, 2, 13 + bob, 4, 5, item.style.primary);
    drawRect(grid, 3, 18 + bob, 2, 1, item.style.primary);
    drawRect(grid, 3, 13 + bob, 2, 6, item.style.accent);
    drawRect(grid, 2, 15 + bob, 4, 1, lighten(item.style.primary, 0.18));
  }

  if (item.id === "spear") {
    drawRect(grid, 21, 7 + bob, 2, 14, OUTLINE);
    drawRect(grid, 22, 7 + bob, 1, 14, item.style.accent);
    drawPixelPattern(
      grid,
      [
        [21, 3 + bob],
        [20, 4 + bob],
        [21, 4 + bob],
        [22, 4 + bob],
        [20, 5 + bob],
        [21, 5 + bob],
        [22, 5 + bob],
        [21, 6 + bob]
      ],
      OUTLINE
    );
    drawPixelPattern(grid, [[21, 4 + bob], [20, 5 + bob], [21, 5 + bob], [22, 5 + bob], [21, 6 + bob]], item.style.primary);
  }

  if (item.id === "war_hammer") {
    drawRect(grid, 20, 9 + bob, 2, 11, OUTLINE);
    drawRect(grid, 21, 10 + bob, 1, 10, item.style.accent);
    drawRect(grid, 17, 6 + bob, 6, 4, OUTLINE);
    drawRect(grid, 18, 7 + bob, 4, 2, item.style.primary);
    drawRect(grid, 18, 7 + bob, 1, 2, lighten(item.style.primary, 0.16));
  }

  if (item.id === "health_potion") {
    drawRect(grid, 18, 14 + bob, 5, 6, OUTLINE);
    drawRect(grid, 19, 15 + bob, 3, 4, item.style.primary);
    drawRect(grid, 19, 13 + bob, 3, 2, OUTLINE);
    drawRect(grid, 20, 13 + bob, 1, 2, item.style.accent);
    setPixel(grid, 20, 15 + bob, lighten(item.style.primary, 0.28));
    setPixel(grid, 21, 18 + bob, darken(item.style.primary, 0.18));
  }

  if (item.id === "torch") {
    drawRect(grid, 3, 10 + bob, 2, 11, OUTLINE);
    drawRect(grid, 4, 11 + bob, 1, 10, item.style.primary);
    drawPixelPattern(
      grid,
      [
        [3, 6 + bob],
        [4, 5 + bob],
        [5, 6 + bob],
        [2, 7 + bob],
        [3, 7 + bob],
        [4, 7 + bob],
        [5, 7 + bob],
        [6, 7 + bob],
        [3, 8 + bob],
        [4, 8 + bob],
        [5, 8 + bob]
      ],
      OUTLINE
    );
    drawPixelPattern(grid, [[4, 6 + bob], [3, 7 + bob], [4, 7 + bob], [5, 7 + bob], [4, 8 + bob]], item.style.accent);
    setPixel(grid, 4, 7 + bob, "#F5D547");
  }
}

function drawCharacterGrid(characterInput, frameIndex = 0) {
  const character = normalizeCharacter(characterInput, (characterInput && characterInput.version) || "0.1.12");
  const grid = createGrid();
  const bob = [0, 0, 1, 0][frameIndex % 4];

  drawRect(grid, 7, 23, 10, 1, SHADOW, 90);
  drawBodyLayer(grid, character, bob);
  drawClothesLayer(grid, character, bob, frameIndex);
  drawHeadLayer(grid, character, bob);
  drawEyeLayer(grid, character, bob);
  drawToolLayer(grid, character, bob);

  return grid;
}

function gridToPngBuffer(grid, scale, padding = 0) {
  const virtualSize = VIRTUAL_SIZE + padding * 2;
  const size = virtualSize * scale;
  const png = new PNG({ width: size, height: size });

  for (let y = 0; y < VIRTUAL_SIZE; y += 1) {
    for (let x = 0; x < VIRTUAL_SIZE; x += 1) {
      const rgba = grid[y * VIRTUAL_SIZE + x];

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const pixelIndex = (((y + padding) * scale + sy) * size + ((x + padding) * scale + sx)) * 4;
          png.data[pixelIndex] = rgba[0];
          png.data[pixelIndex + 1] = rgba[1];
          png.data[pixelIndex + 2] = rgba[2];
          png.data[pixelIndex + 3] = rgba[3];
        }
      }
    }
  }

  return PNG.sync.write(png);
}

function renderCharacterBuffer(characterInput, frameIndex = 0, scale = 2) {
  const grid = drawCharacterGrid(characterInput, frameIndex);
  return gridToPngBuffer(grid, Math.max(1, Math.round(scale)));
}

function renderTrayCharacterBuffer(characterInput, frameIndex = 0) {
  const grid = drawCharacterGrid(characterInput, frameIndex);
  return gridToPngBuffer(grid, 1, TRAY_PADDING);
}

function renderCharacterDataUrl(character, frameIndex = 0, scale = 8) {
  return `data:image/png;base64,${renderCharacterBuffer(character, frameIndex, scale).toString("base64")}`;
}

module.exports = {
  TRAY_PADDING,
  VIRTUAL_SIZE,
  renderCharacterBuffer,
  renderTrayCharacterBuffer,
  renderCharacterDataUrl
};
