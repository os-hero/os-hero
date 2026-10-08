const { PNG } = require("pngjs");
const {
  DEFAULT_CLOTHES_ID,
  getEyeType,
  getItemById,
  normalizeCharacter
} = require("../shared/catalog");

const VIRTUAL_SIZE = 24;
const TRAY_PADDING = 1;
const MAC_TRAY_SIZE = VIRTUAL_SIZE + TRAY_PADDING * 2;
const OUTLINE = "#1F2328";
const SHADOW = "#000000";
const { sceneBuffer, backgroundDataUrl } = require("./pixelScene");
const IDLE_POSES = Object.freeze([
  Object.freeze({ bob: 1, torsoBob: 1, leftFoot: 0, rightFoot: 0, leftArm: 0, rightArm: 0 }),
  Object.freeze({ bob: 1, torsoBob: 0, leftFoot: 0, rightFoot: 0, leftArm: 0, rightArm: 0 }),
  Object.freeze({ bob: 0, torsoBob: 0, leftFoot: 0, rightFoot: 0, leftArm: 0, rightArm: 0 }),
  Object.freeze({ bob: 0, torsoBob: 1, leftFoot: 0, rightFoot: 0, leftArm: 0, rightArm: 0 })
]);
const LEFT_HAND_TOOLS = new Set(["wooden_shield", "kite_shield", "magic_staff", "wizard_wand", "spellbook", "torch"]);
const GRIP_HEIGHTS = Object.freeze({ trail_sword: 2, steel_dagger: -2, long_bow: -2 });

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
  return mixColor(hex, "#202B3C", amount);
}

function lighten(hex, amount) {
  return mixColor(hex, "#FFF2D5", amount);
}

function hexToRgba(hex, alpha = 255) {
  const [red, green, blue] = parseHex(hex);
  return [red, green, blue, alpha];
}

function createGrid() {
  const grid = Array.from({ length: VIRTUAL_SIZE * VIRTUAL_SIZE }, () => [0, 0, 0, 0]);
  grid.clippedPixels = [];
  return grid;
}

function setPixel(grid, x, y, color, alpha = 255) {
  if (x < 0 || y < 0 || x >= VIRTUAL_SIZE || y >= VIRTUAL_SIZE) {
    grid.clippedPixels.push([x, y]);
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

function drawBodyLayer(grid, character, bob, pose) {
  const skin = character.bodyColor;
  const skinShade = mixColor(skin, "#A85C4A", 0.18);
  const skinLight = lighten(skin, 0.12);
  const headY = 2 + bob;

  drawRect(grid, 8, headY, 8, 1, OUTLINE);
  drawRect(grid, 6, headY + 1, 12, 1, OUTLINE);
  drawRect(grid, 5, headY + 2, 14, 5, OUTLINE);
  drawRect(grid, 6, headY + 7, 12, 2, OUTLINE);
  drawRect(grid, 7, headY + 9, 10, 1, OUTLINE);
  drawRect(grid, 9, headY + 10, 6, 1, OUTLINE);

  drawRect(grid, 8, headY + 1, 8, 1, skin);
  drawRect(grid, 6, headY + 2, 12, 5, skin);
  drawRect(grid, 7, headY + 7, 10, 2, skin);
  drawRect(grid, 8, headY + 9, 8, 1, skin);
  drawRect(grid, 10, headY + 10, 4, 1, skin);
  drawRect(grid, 16, headY + 3, 1, 4, skinShade);
  drawRect(grid, 7, headY + 7, 1, 2, skinShade);
  drawRect(grid, 16, headY + 7, 1, 2, skinShade);
  drawRect(grid, 7, headY + 3, 2, 1, skinLight);
  setPixel(grid, 12, headY + 7, skinShade);
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

  for (const [x, offset] of [[4, pose.leftArm], [17, pose.rightArm]]) {
    const armY = 12 + pose.torsoBob + offset;
    drawRect(grid, x, armY + 1, 3, 6, OUTLINE);
    drawRect(grid, x + 1, armY + 4, 2, 2, skin);
    setPixel(grid, x + 1, armY + 6, skinShade);
  }
}

function drawSleeves(grid, style, torsoY, pose) {
  for (const [x, offset] of [[4, pose.leftArm], [17, pose.rightArm]]) {
    drawRect(grid, x, torsoY + 1 + offset, 3, 4, OUTLINE);
    drawRect(grid, x + 1, torsoY + 2 + offset, 2, 2, style.shirt);
    setPixel(grid, x + 1, torsoY + 2 + offset, lighten(style.shirt, 0.22));
    setPixel(grid, x + 2, torsoY + 3 + offset, darken(style.shirt, 0.25));
  }
}

function drawFeet(grid, pantsColor, pose) {
  for (const [x, lift] of [[6, pose.leftFoot], [13, pose.rightFoot]]) {
    drawRect(grid, x + 1, 21 + lift, 4, 1, darken(pantsColor, 0.35));
    drawRect(grid, x, 22 + lift, 5, 1, OUTLINE);
    setPixel(grid, x + 1, 21 + lift, lighten(pantsColor, 0.2));
  }
}

function drawLegs(grid, bob, pantsColor, pose) {
  const legTop = 18 + bob;
  drawRect(grid, 7, legTop - 1, 10, 1, OUTLINE);
  for (const [x, lift] of [[7, pose.leftFoot], [13, pose.rightFoot]]) {
    const height = 22 + lift - legTop;
    drawRect(grid, x, legTop, 4, height, OUTLINE);
    drawRect(grid, x + 1, legTop, 2, height, pantsColor);
    drawRect(grid, x + 1, legTop, 1, height, lighten(pantsColor, 0.18));
  }
  drawFeet(grid, pantsColor, pose);
}

function drawClothesLayer(grid, character, bob, pose) {
  const style = getClothesStyle(character);
  const clothesId = getItemById(character.equipped.clothes)?.renderStyle || character.equipped.clothes;
  const torsoY = 12 + bob;
  const shirtShade = darken(style.shirt, 0.16);
  const pantsShade = darken(style.pants, 0.18);
  const trim = style.trim || style.accent;

  drawSleeves(grid, style, torsoY, pose);

  drawRect(grid, 6, torsoY, 12, 1, OUTLINE);
  drawRect(grid, 6, torsoY + 1, 12, 6, OUTLINE);
  drawRect(grid, 6, torsoY + 6, 12, 1, OUTLINE);
  drawRect(grid, 7, torsoY + 1, 10, 5, style.shirt);
  drawRect(grid, 7, torsoY + 5, 10, 1, shirtShade);
  drawRect(grid, 7, torsoY + 1, 1, 4, lighten(style.shirt, 0.2));
  drawRect(grid, 16, torsoY + 2, 1, 4, darken(style.shirt, 0.28));

  if (["travel_jacket", "rune_coat", "village_armor"].includes(clothesId)) {
    if (clothesId === "travel_jacket") {
      drawRect(grid, 11, torsoY + 1, 2, 5, style.trim);
      drawPixelPattern(grid, [[9, torsoY + 1], [14, torsoY + 1], [9, torsoY + 4], [14, torsoY + 4]], style.accent);
    } else if (clothesId === "rune_coat") {
      drawRect(grid, 8, torsoY + 1, 2, 5, style.accent);
      drawRect(grid, 14, torsoY + 1, 2, 5, style.accent);
      drawRect(grid, 11, torsoY + 1, 2, 5, style.pants);
      setPixel(grid, 9, torsoY + 3, style.trim);
      setPixel(grid, 14, torsoY + 3, style.trim);
    } else {
      drawRect(grid, 8, torsoY + 1, 8, 1, style.accent);
      drawRect(grid, 9, torsoY + 2, 6, 2, style.accent);
      drawRect(grid, 11, torsoY + 1, 2, 1, style.trim);
      drawRect(grid, 10, torsoY + 5, 4, 1, style.trim);
    }
    drawLegs(grid, bob, style.pants, pose);
    if (clothesId === "rune_coat") {
      drawRect(grid, 7, torsoY + 6, 3, 3, style.shirt);
      drawRect(grid, 14, torsoY + 6, 3, 3, style.shirt);
      drawRect(grid, 9, torsoY + 6, 1, 3, style.accent);
      drawRect(grid, 14, torsoY + 6, 1, 3, style.accent);
      drawFeet(grid, style.pants, pose);
    }
    return;
  }

  if (clothesId === "blue_overalls") {
    drawRect(grid, 8, torsoY + 1, 2, 5, style.pants);
    drawRect(grid, 14, torsoY + 1, 2, 5, style.pants);
    drawRect(grid, 9, torsoY + 3, 6, 3, style.pants);
    drawRect(grid, 10, torsoY + 4, 4, 1, lighten(style.pants, 0.1));
    setPixel(grid, 9, torsoY + 2, style.accent);
    setPixel(grid, 14, torsoY + 2, style.accent);
    drawLegs(grid, bob, style.pants, pose);
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
    drawLegs(grid, bob, style.pants, pose);
    return;
  }

  if (["wizard_robe", "royal_robe", "cleric_robes"].includes(clothesId)) {
    drawRect(grid, 6, torsoY + 5, 12, 5 - bob, OUTLINE);
    drawRect(grid, 7, torsoY + 5, 10, 4 - bob, style.shirt);
    drawRect(grid, 8, 21, 8, 1, style.pants);
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
    drawFeet(grid, style.pants, pose);
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
    drawRect(grid, 5, torsoY + 6, 14, 5 - bob, OUTLINE);
    drawRect(grid, 6, torsoY + 6, 12, 4 - bob, style.shirt);
    drawRect(grid, 8, 22, 8, 1, style.pants);
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
    drawFeet(grid, style.pants, pose);
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
    drawLegs(grid, bob, style.pants, pose);
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
    drawLegs(grid, bob, style.pants, pose);
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
    drawLegs(grid, bob, style.pants, pose);
    return;
  }

  if (clothesId === "space_suit") {
    drawRect(grid, 8, torsoY + 1, 8, 4, lighten(style.shirt, 0.08));
    drawRect(grid, 9, torsoY + 2, 6, 2, style.accent);
    drawRect(grid, 7, torsoY + 5, 10, 1, trim);
    setPixel(grid, 16, torsoY + 2, trim);
    setPixel(grid, 7, torsoY + 2, trim);
    drawLegs(grid, bob, style.pants, pose);
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
    drawLegs(grid, bob, style.pants, pose);
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
    drawLegs(grid, bob, style.pants, pose);
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
  drawLegs(grid, bob, pantsShade, pose);
}

function drawHairstyle(grid, character, bob, item) {
  const primary = character.hairColor || item.style.primary;
  const shade = darken(primary, 0.32);
  const light = lighten(primary, 0.28);
  const accent = character.hairColor ? lighten(primary, 0.48) : item.style.accent;
  const y = 2 + bob;
  const rect = (x, dy, w, h, color) => drawRect(grid, x, y + dy, w, h, color);
  const points = (pixels, color) => drawPixelPattern(grid, pixels.map(([x, dy]) => [x, y + dy]), color);
  const lock = (x, dy, w, h) => {
    rect(x + 1, dy, w - 2, 1, OUTLINE);
    rect(x, dy + 1, w, h - 2, OUTLINE);
    rect(x + 1, dy + h - 1, w - 2, 1, OUTLINE);
    rect(x + 1, dy + 1, w - 2, h - 2, primary);
    rect(x + 1, dy + 2, 1, Math.min(3, h - 3), light);
    if (h > 7) rect(x + 1, dy + h - 4, 1, 2, lighten(primary, 0.12));
    rect(x + w - 2, dy + 1, 1, h - 2, shade);
  };
  if (item.id === "mohawk_hair") {
    lock(10, -2, 4, 6);
    rect(12, -1, 1, 4, light);
    rect(5, 2, 2, 4, shade);
    rect(17, 2, 2, 4, shade);
    return;
  }
  rect(8, -1, 8, 1, OUTLINE);
  rect(6, 0, 12, 1, OUTLINE);
  rect(5, 1, 14, 3, OUTLINE);
  rect(7, 0, 10, 1, primary);
  rect(6, 1, 12, 2, primary);
  rect(8, 0, 4, 1, light);
  rect(7, 1, 3, 1, light);
  rect(15, 2, 3, 1, shade);
  switch (item.id) {
    case "long_hair":
      lock(4, 2, 5, 12); lock(15, 2, 5, 12);
      rect(6, 11, 12, 3, shade);
      points([[7, 3], [8, 4], [15, 3], [16, 4]], primary);
      break;
    case "bob_hair":
      lock(5, 2, 4, 8); lock(15, 2, 4, 8);
      rect(6, 9, 3, 1, OUTLINE); rect(15, 9, 3, 1, OUTLINE);
      rect(8, 3, 8, 1, primary);
      points([[9, 4], [11, 4], [14, 4]], shade);
      break;
    case "twin_tails":
      lock(5, 2, 4, 5); lock(15, 2, 4, 5);
      lock(2, 5, 5, 7); lock(17, 5, 5, 7);
      rect(3, 12, 3, 1, OUTLINE); rect(18, 12, 3, 1, OUTLINE);
      rect(3, 5, 3, 1, accent); rect(18, 5, 3, 1, accent);
      points([[8, 3], [9, 4], [14, 4], [15, 3]], primary);
      break;
    case "spiky_hair":
      points([[7, -2], [10, -2], [13, -2], [16, -2], [6, -1], [17, -1]], OUTLINE);
      points([[7, -1], [10, -1], [13, -1], [16, -1]], primary);
      lock(5, 2, 4, 5); lock(15, 2, 4, 4);
      points([[8, 3], [10, 4], [13, 3], [16, 4]], primary);
      points([[8, 1], [11, 0], [14, 1]], light);
      break;
    case "side_part_hair":
      rect(9, -2, 6, 1, OUTLINE); rect(9, -1, 5, 1, primary);
      lock(5, 2, 4, 6); lock(16, 2, 3, 5);
      rect(7, 2, 6, 1, primary); rect(7, 3, 4, 1, primary);
      points([[7, 2], [8, 3], [9, 3]], light);
      points([[10, 4], [11, 3], [12, 2]], shade);
      break;
    case "curly_hair":
      points([[6, -1], [9, -2], [12, -2], [16, -1], [4, 2], [19, 2]], OUTLINE);
      points([[9, -1], [12, -1], [6, 0], [16, 0]], primary);
      lock(4, 2, 5, 6); lock(15, 2, 5, 6);
      points([[6, 3], [7, 5], [16, 3], [17, 5], [10, 1], [13, 2]], light);
      points([[8, 4], [10, 3], [13, 3], [15, 4], [5, 7], [18, 7]], primary);
      break;
    case "ponytail_hair":
      lock(5, 2, 4, 5); lock(16, 2, 3, 5);
      lock(19, 3, 4, 7); rect(19, 10, 3, 1, OUTLINE);
      rect(20, 9, 2, 1, primary); rect(18, 4, 3, 1, accent);
      points([[8, 3], [9, 4], [10, 3]], primary);
      break;
    case "princess_hair":
      lock(4, 2, 5, 12); lock(15, 2, 5, 12);
      lock(3, 7, 5, 4); lock(16, 7, 5, 4);
      rect(5, 12, 3, 2, OUTLINE); rect(16, 12, 3, 2, OUTLINE);
      points([[6, 12], [17, 12], [5, 8], [18, 8]], light);
      points([[7, 3], [8, 4], [15, 3], [16, 4]], primary);
      break;
    case "short_bangs":
      lock(5, 2, 4, 6); lock(15, 2, 4, 6);
      rect(7, 3, 10, 1, primary);
      points([[8, 4], [10, 4], [12, 4], [14, 4], [16, 4]], shade);
      break;
    case "braided_hair":
      lock(5, 2, 4, 5); lock(15, 2, 4, 5);
      lock(3, 6, 4, 10); lock(17, 6, 4, 10);
      for (const dy of [7, 9, 11, 13]) {
        points([[4, dy], [19, dy], [5, dy + 1], [18, dy + 1]], light);
      }
      rect(4, 15, 2, 1, accent); rect(18, 15, 2, 1, accent);
      points([[8, 3], [9, 4], [14, 4], [15, 3]], primary);
      break;
    default:
      lock(5, 2, 4, 5); lock(16, 2, 3, 4);
      points([[8, 3], [10, 3], [11, 4], [15, 3]], primary);
      break;
  }
}

function drawHeadLayer(grid, character, bob, item = getItemById(character.equipped.head)) {
  if (!item) {
    return;
  }
  if (item.slot === "hair") return drawHairstyle(grid, character, bob, item);

  const headY = 2 + bob;
  const primary = item.style.primary;
  const accent = item.style.accent || darken(primary, 0.2);
  const shade = darken(primary, 0.22);
  const light = lighten(primary, 0.16);

  if (["wizard_hat", "rune_hat"].includes(item.id)) {
    drawRect(grid, 12, bob, 4, 1, OUTLINE);
    drawRect(grid, 10, 1 + bob, 7, 1, OUTLINE);
    drawRect(grid, 8, 2 + bob, 9, 2, OUTLINE);
    drawRect(grid, 5, 4 + bob, 15, 1, OUTLINE);
    drawRect(grid, 12, 1 + bob, 3, 1, primary);
    drawRect(grid, 10, 2 + bob, 6, 1, primary);
    drawRect(grid, 9, 3 + bob, 7, 1, accent);
    return;
  }
  if (["travel_cap", "pirate_hat"].includes(item.id)) {
    drawRect(grid, 8, bob, 9, 1, OUTLINE);
    drawRect(grid, 6, 1 + bob, 12, 3, OUTLINE);
    drawRect(grid, 13, 4 + bob, 7, 1, OUTLINE);
    drawRect(grid, 8, 1 + bob, 8, 1, light);
    drawRect(grid, 7, 2 + bob, 10, 2, primary);
    drawRect(grid, 14, 4 + bob, 5, 1, primary);
    drawRect(grid, 11, 2 + bob, 2, 1, accent);
    return;
  }
  if (item.id === "gold_crown") {
    drawPixelPattern(grid, [[7, bob], [11, bob], [16, bob]], OUTLINE);
    drawRect(grid, 6, 1 + bob, 12, 3, OUTLINE);
    drawPixelPattern(grid, [[7, 1 + bob], [11, 1 + bob], [16, 1 + bob]], primary);
    drawRect(grid, 7, 2 + bob, 10, 1, primary);
    setPixel(grid, 11, 2 + bob, accent);
    return;
  }
  if (item.id === "silver_circlet") {
    drawRect(grid, 5, 4 + bob, 14, 2, OUTLINE);
    drawRect(grid, 6, 4 + bob, 12, 1, primary);
    drawRect(grid, 11, 3 + bob, 2, 3, accent);
    setPixel(grid, 11, 3 + bob, light);
    return;
  }

  if (item.id === "expedition_star_hat") {
    // Headwear always stays inside the shared 24px rig.
    drawRect(grid, 11, bob, 4, 1, OUTLINE);
    drawRect(grid, 9, 1 + bob, 7, 2, OUTLINE);
    drawRect(grid, 6, 3 + bob, 13, 2, OUTLINE);
    drawRect(grid, 10, 1 + bob, 5, 2, primary);
    drawRect(grid, 7, 3 + bob, 11, 1, primary);
    setPixel(grid, 12, 1 + bob, accent);
    drawRect(grid, 11, 2 + bob, 3, 1, accent);
    setPixel(grid, 12, 3 + bob, accent);
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

  drawRect(grid, 9, eyeY, 2, 3, OUTLINE);
  drawRect(grid, 14, eyeY, 2, 3, OUTLINE);
  setPixel(grid, 10, eyeY, "#F8FBFF");
  setPixel(grid, 15, eyeY, "#F8FBFF");
}

function drawToolLayer(grid, character, bob, item = getItemById(character.equipped.tool)) {
  if (!item) {
    return;
  }

  const eyeY = 6 + bob;

  if (item.id === "travel_mug") {
    drawRect(grid, 18, 14 + bob, 4, 5, OUTLINE);
    drawRect(grid, 19, 15 + bob, 2, 3, item.style.primary);
    drawRect(grid, 22, 15 + bob, 1, 3, item.style.primary);
    setPixel(grid, 19, 14 + bob, item.style.accent);
    setPixel(grid, 19, 15 + bob, lighten(item.style.primary, 0.35));
    drawRect(grid, 20, 16 + bob, 1, 2, darken(item.style.primary, 0.22));
    return;
  }
  if (item.id === "field_book") {
    drawRect(grid, 18, 13 + bob, 5, 7, OUTLINE);
    drawRect(grid, 19, 14 + bob, 3, 5, item.style.primary);
    drawRect(grid, 19, 14 + bob, 1, 5, "#DDD9BF");
    drawRect(grid, 21, 15 + bob, 1, 3, item.style.accent);
    setPixel(grid, 20, 16 + bob, item.style.accent);
    drawRect(grid, 20, 18 + bob, 2, 1, darken(item.style.primary, 0.28));
    return;
  }
  if (item.id === "trail_sword") {
    drawRect(grid, 20, 10 + bob, 2, 8, OUTLINE);
    setPixel(grid, 20, 9 + bob, OUTLINE);
    drawRect(grid, 20, 11 + bob, 1, 6, item.style.primary);
    drawRect(grid, 21, 11 + bob, 1, 5, lighten(item.style.primary, 0.3));
    drawRect(grid, 18, 17 + bob, 5, 1, item.style.accent);
    drawRect(grid, 20, 18 + bob, 1, 3, "#775A3B");
    return;
  }
  if (item.id === "square_glasses") {
    for (const x of [7, 13]) {
      drawRect(grid, x, eyeY, 5, 1, item.style.primary);
      drawRect(grid, x, eyeY + 3, 5, 1, item.style.primary);
      drawRect(grid, x, eyeY + 1, 1, 2, item.style.primary);
      drawRect(grid, x + 4, eyeY + 1, 1, 2, item.style.primary);
    }
    setPixel(grid, 12, eyeY + 1, item.style.primary);
    return;
  }
  if (item.id === "forehead_goggles") {
    drawRect(grid, 6, 4 + bob, 12, 1, item.style.primary);
    drawRect(grid, 8, 3 + bob, 3, 3, OUTLINE);
    drawRect(grid, 13, 3 + bob, 3, 3, OUTLINE);
    setPixel(grid, 9, 4 + bob, item.style.accent);
    setPixel(grid, 14, 4 + bob, item.style.accent);
    return;
  }

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

  if (item.id === "iron_sword" || item.id === "expedition_sword") {
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

function drawBackLayer(grid, character, bob) {
  const item = getItemById(character.equipped.back);
  if (!item) return;
  if (item.id === "small_bag") return drawToolLayer(grid, character, bob, item);
  const { primary, accent } = item.style;
  if (item.id === "teal_backpack") {
    drawRect(grid, 2, 12 + bob, 6, 9, OUTLINE);
    drawRect(grid, 3, 13 + bob, 4, 7, primary);
    drawRect(grid, 3, 16 + bob, 3, 1, accent);
    setPixel(grid, 3, 14 + bob, lighten(primary, 0.2));
    drawRect(grid, 6, 14 + bob, 1, 5, darken(primary, 0.3));
    drawRect(grid, 3, 18 + bob, 3, 1, darken(primary, 0.2));
    setPixel(grid, 4, 16 + bob, lighten(accent, 0.25));
  } else {
    drawRect(grid, 6, 12 + bob, 12, 4, OUTLINE);
    drawRect(grid, 3, 16 + bob, 18, 5, OUTLINE);
    drawRect(grid, 2, 20 + bob, 20, 1, OUTLINE);
    drawRect(grid, 4, 16 + bob, 16, 4, primary);
    drawRect(grid, 3, 18 + bob, 18, 2, primary);
    drawRect(grid, 6, 13 + bob, 12, 4, primary);
    drawRect(grid, 3, 20 + bob, 18, 1, accent);
    drawRect(grid, 4, 17 + bob, 1, 3, lighten(primary, 0.24));
    drawRect(grid, 6, 16 + bob, 1, 4, darken(primary, 0.3));
    drawRect(grid, 17, 16 + bob, 1, 4, darken(primary, 0.3));
    drawRect(grid, 19, 18 + bob, 1, 2, darken(primary, 0.2));
  }
}

function drawStrapsLayer(grid, character, bob) {
  const item = getItemById(character.equipped.back);
  if (!item) return;
  if (item.id === "teal_backpack") {
    drawRect(grid, 8, 13 + bob, 1, 4, item.style.accent);
    drawRect(grid, 15, 13 + bob, 1, 4, darken(item.style.accent, 0.18));
    setPixel(grid, 8, 16 + bob, OUTLINE);
    setPixel(grid, 15, 16 + bob, OUTLINE);
  } else if (item.id === "small_bag") {
    drawPixelPattern(grid, [[8, 13 + bob], [9, 14 + bob], [10, 15 + bob], [11, 16 + bob], [12, 17 + bob], [13, 18 + bob], [14, 19 + bob]], item.style.accent);
  }
}

function drawGripLayer(grid, character, bob) {
  const item = getItemById(character.equipped.tool);
  if (!item || ["wooden_shield", "kite_shield"].includes(item.id)) return;
  let x = LEFT_HAND_TOOLS.has(item.id) ? 4 : 20;
  const y = 16 + bob + (GRIP_HEIGHTS[item.id] || 0);
  if (["travel_mug", "field_book", "health_potion"].includes(item.id)) x = 18;
  if (item.id === "steel_dagger") x = 19;
  if (item.id === "spear") x = 21;
  if (item.id === "spellbook") x = 6;
  setPixel(grid, x - (LEFT_HAND_TOOLS.has(item.id) ? -1 : 1), y, OUTLINE);
  setPixel(grid, x, y, character.bodyColor);
  setPixel(grid, x, y + 1, mixColor(character.bodyColor, "#A85C4A", 0.18));
}

function drawHairLayers(back, front, character, bob) {
  const item = getItemById(character.equipped.hair);
  if (!item) return;
  const hair = createGrid();
  drawHeadLayer(hair, character, bob, item);
  back.clippedPixels.push(...hair.clippedPixels);
  const fit = getItemById(character.equipped.head)?.hairFit;
  if (fit === "cover") return;
  for (let y = 0; y < VIRTUAL_SIZE; y++) {
    for (let x = 0; x < VIRTUAL_SIZE; x++) {
      const index = y * VIRTUAL_SIZE + x;
      if (!hair[index][3]) continue;
      // Fixed rig occlusion regions, not per-image bounds or automatic scaling.
      if (fit === "cap" && y < 4 + bob) continue;
      if (y >= 11 + bob || x < 6 || x > 17) back[index] = hair[index];
      else if (!(x >= 8 && x <= 15 && y >= 6 + bob)) front[index] = hair[index];
    }
  }
}

function inlay(grid, pixels, color) {
  for (const [x, y] of pixels) {
    if (x < 0 || x >= VIRTUAL_SIZE || y < 0 || y >= VIRTUAL_SIZE) throw new Error("Material detail outside rig");
    const pixel = grid[y * VIRTUAL_SIZE + x];
    if (pixel[3] === 255 && rgbToHex(pixel) !== OUTLINE) setPixel(grid, x, y, color);
  }
}

function drawClothesDetails(grid, character, bob) {
  const item = getItemById(character.equipped.clothes) || getItemById(DEFAULT_CLOTHES_ID);
  const id = item.renderStyle || item.id;
  const { shirt, pants, accent } = item.style;
  const trim = item.style.trim || accent;
  const y = 12 + bob;
  const points = (pixels, color) => inlay(grid, pixels.map(([x, dy]) => [x, y + dy]).filter(([, py]) => py < 21), color);
  const fold = darken(shirt, 0.28), light = lighten(shirt, 0.28);

  // Small authored clusters describe construction, not noisy per-pixel texture.
  if (["knight_armor", "village_armor", "space_suit"].includes(id)) {
    points([[7, 1], [8, 1], [9, 1], [8, 2]], lighten(shirt, 0.42));
    points([[15, 2], [16, 2], [16, 3], [14, 5], [15, 5]], fold);
    points([[8, 4], [9, 4]], light);
    points([[11, 5], [12, 5]], trim);
    if (id === "space_suit") points([[10, 2], [11, 2], [14, 3]], lighten(accent, 0.38));
  } else if (["wizard_robe", "royal_robe", "cleric_robes", "rune_coat"].includes(id)) {
    points([[8, 2], [8, 3], [8, 6], [8, 7]], light);
    points([[15, 3], [15, 4], [15, 6], [15, 7]], fold);
    points([[10, 1], [13, 1]], trim);
    points([[11, 3], [12, 3]], lighten(trim, 0.25));
    points([[9, 8], [10, 8], [13, 8], [14, 8]], darken(shirt, 0.12));
  } else if (id === "princess_dress") {
    points([[9, 1], [14, 1]], accent);
    points([[8, 6], [8, 7], [9, 8]], light);
    points([[15, 6], [15, 7], [14, 8]], fold);
    points([[11, 4], [12, 4]], trim);
  } else if (id === "blue_overalls") {
    points([[8, 2], [15, 2]], accent);
    points([[10, 4], [11, 4]], lighten(pants, 0.3));
    points([[12, 5], [13, 5], [14, 5]], darken(pants, 0.25));
  } else if (id === "dragon_suit") {
    points([[8, 1], [9, 2]], light);
    points([[15, 3], [16, 4]], fold);
    points([[10, 2], [13, 4]], lighten(accent, 0.22));
  } else if (id === "barbarian_armor") {
    points([[8, 1], [9, 1]], lighten(accent, 0.25));
    points([[7, 3], [8, 3], [15, 5], [16, 5]], fold);
    points([[9, 4], [14, 4]], lighten(trim, 0.3));
  } else if (id === "travel_jacket" || id === "pirate_coat") {
    points([[8, 2], [9, 2], [14, 2], [15, 2]], fold);
    points([[8, 3], [14, 3]], light);
    points([[9, 4], [14, 4]], trim);
    points([[11, 1], [12, 2]], lighten(trim, 0.22));
  } else {
    points([[8, 1], [9, 1], [8, 2]], light);
    points([[15, 2], [16, 3], [15, 5]], fold);
    points([[11, 4], [12, 4]], lighten(trim, 0.25));
    if (["green_tunic", "ranger_hoodie", "rogue_cloak", "ninja_suit"].includes(id)) points([[9, 3], [14, 3]], darken(shirt, 0.12));
  }
}

function drawItemDetails(grid, item, bob) {
  if (!item || !["head", "face", "back", "tool"].includes(item.slot)) return;
  const { primary, accent = primary } = item.style;
  const light = lighten(primary, 0.34), shade = darken(primary, 0.3);
  const points = (pixels, color) => inlay(grid, pixels.map(([x, y]) => [x, y + bob]), color);
  if (item.slot === "head") {
    if (["red_cap", "travel_cap", "pirate_hat"].includes(item.id)) {
      points([[8, 1], [9, 1], [7, 2]], light);
      points([[16, 2], [16, 3], [18, 4]], shade);
      points([[11, 2]], lighten(accent, 0.24));
    } else if (["wizard_hat", "rune_hat", "expedition_star_hat"].includes(item.id)) {
      points([[12, 1], [11, 2]], light);
      points([[15, 2], [16, 3]], shade);
      points([[7, 3], [8, 3]], lighten(accent, 0.18));
    } else if (item.id === "gold_crown" || item.id === "silver_circlet") {
      points([[7, item.id === "gold_crown" ? 2 : 4], [8, item.id === "gold_crown" ? 2 : 4]], light);
      points([[16, item.id === "gold_crown" ? 2 : 4]], shade);
      points([[11, item.id === "gold_crown" ? 2 : 3]], lighten(accent, 0.35));
    } else {
      points([[7, 3], [8, 3], [7, 4]], light);
      points([[16, 3], [17, 4], [17, 6]], shade);
      if (item.id !== "ninja_hood") points([[10, 3], [11, 3]], lighten(accent, 0.22));
    }
  } else if (item.slot === "face") {
    if (item.id === "forehead_goggles") {
      points([[9, 3], [14, 3]], light);
      points([[9, 4], [14, 4]], lighten(accent, 0.34));
    } else {
      points([[8, 6], [9, 6], [14, 6]], light);
      points([[11, 8], [17, 8]], shade);
    }
  } else if (item.slot === "back") {
    if (item.id === "small_bag") {
      points([[18, 16], [19, 16]], light);
      points([[20, 18], [20, 19]], shade);
      points([[19, 17]], lighten(accent, 0.3));
    } else if (item.id === "teal_backpack") {
      points([[3, 13], [4, 13], [3, 14]], light);
      points([[5, 17], [6, 18]], shade);
      points([[4, 16]], lighten(accent, 0.38));
    } else {
      points([[4, 16], [4, 17], [5, 18]], light);
      points([[18, 17], [18, 18], [19, 19]], shade);
      points([[5, 20], [6, 20]], lighten(accent, 0.2));
    }
  } else if (item.slot === "tool") {
    const clusters = {
      iron_sword: [[[20, 7], [20, 8], [21, 6]], [[20, 14]], [[19, 15]]],
      expedition_sword: [[[20, 7], [20, 8], [21, 6]], [[20, 14]], [[19, 15]]],
      trail_sword: [[[20, 11], [21, 11]], [[20, 15]], [[19, 17]]],
      battle_axe: [[[17, 7], [18, 7], [17, 8]], [[20, 9]], [[21, 12]]],
      steel_dagger: [[[22, 9], [21, 10]], [[20, 11]], [[18, 13]]],
      war_hammer: [[[18, 7], [19, 7]], [[21, 8]], [[21, 13]]],
      spear: [[[21, 4], [20, 5]], [[22, 5]], [[22, 14]]],
      long_bow: [[[20, 7], [19, 9]], [[19, 13]], [[21, 8], [21, 9]]],
      wooden_shield: [[[2, 14], [3, 14], [2, 15]], [[5, 18], [5, 19]], [[3, 16]]],
      kite_shield: [[[2, 13], [3, 13], [2, 14]], [[5, 16], [4, 18]], [[3, 15]]],
      magic_staff: [[[3, 6], [4, 7]], [[4, 12], [4, 13]], [[3, 6]]],
      wizard_wand: [[[4, 10], [4, 11]], [[4, 16]], [[4, 7]]],
      torch: [[[4, 11], [4, 12]], [[4, 18]], [[4, 6], [3, 7]]],
      spellbook: [[[2, 14], [3, 14]], [[6, 17]], [[5, 15], [6, 15]]],
      field_book: [[[19, 14], [19, 15]], [[21, 18]], [[21, 15]]],
      travel_mug: [[[19, 15], [19, 16]], [[20, 17]], [[19, 14]]],
      health_potion: [[[19, 15], [19, 16]], [[21, 18]], [[20, 13]]]
    }[item.id];
    if (clusters) {
      points(clusters[0], light);
      points(clusters[1], shade);
      points(clusters[2], lighten(accent, 0.3));
    }
  }
}

// All surfaces consume these same native layers and the same pose clock.
function renderCharacterLayers(characterInput, frameIndex = 0) {
  const character = normalizeCharacter(characterInput, characterInput?.version || "1.2.0");
  const frame = Number.isInteger(frameIndex) ? ((frameIndex % 4) + 4) % 4 : 0;
  const pose = { ...IDLE_POSES[frame], rightArm: GRIP_HEIGHTS[character.equipped.tool] || 0 };
  const bob = pose.bob;
  const torsoBob = pose.torsoBob;
  const layers = Object.fromEntries(["shadow", "back", "hairBack", "body", "clothes", "straps", "hairFront", "head", "eyes", "face", "tool", "grip"].map((key) => [key, createGrid()]));
  drawRect(layers.shadow, 7, 23, 10, 1, SHADOW, 90);
  drawBackLayer(layers.back, character, torsoBob);
  drawItemDetails(layers.back, getItemById(character.equipped.back), torsoBob);
  drawHairLayers(layers.hairBack, layers.hairFront, character, bob);
  drawBodyLayer(layers.body, character, bob, pose);
  drawClothesLayer(layers.clothes, character, torsoBob, pose);
  drawClothesDetails(layers.clothes, character, torsoBob);
  drawStrapsLayer(layers.straps, character, torsoBob);
  drawHeadLayer(layers.head, character, bob);
  drawItemDetails(layers.head, getItemById(character.equipped.head), bob);
  drawEyeLayer(layers.eyes, character, bob);
  drawToolLayer(layers.face, character, bob, getItemById(character.equipped.face));
  drawItemDetails(layers.face, getItemById(character.equipped.face), bob);
  const toolBob = torsoBob;
  drawToolLayer(layers.tool, character, toolBob);
  drawItemDetails(layers.tool, getItemById(character.equipped.tool), toolBob);
  drawGripLayer(layers.grip, character, toolBob);
  return layers;
}

function drawCharacterGrid(characterInput, frameIndex = 0) {
  return composeLayers(renderCharacterLayers(characterInput, frameIndex));
}

function composeLayers(layers) {
  const grid = createGrid();
  for (const layer of Object.values(layers)) {
    for (let i = 0; i < layer.length; i++) if (layer[i][3]) grid[i] = layer[i];
  }
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

function renderTrayCharacterBuffer(characterInput, frameIndex = 0, { platform = process.platform, scaleFactor = 1 } = {}) {
  const scale = scaleFactor === 2 ? 2 : 1;
  const grid = drawCharacterGrid(characterInput, frameIndex);
  if (platform !== "darwin") return gridToPngBuffer(grid, scale, TRAY_PADDING);
  return sceneBuffer(grid, normalizeCharacter(characterInput).equipped.background, scale, { menuBar: true });
}

function renderSceneDataUrl(characterInput, frameIndex = 0, scale = 1) {
  const buffer = sceneBuffer(drawCharacterGrid(characterInput, frameIndex), normalizeCharacter(characterInput).equipped.background, Math.min(12, Math.max(1, Math.round(scale) || 1)));
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function renderCharacterDataUrl(character, frameIndex = 0, scale = 8) {
  return `data:image/png;base64,${renderCharacterBuffer(character, frameIndex, scale).toString("base64")}`;
}

function renderItemDataUrl(itemId) {
  const item = getItemById(itemId);
  if (!item) throw new Error("Unknown item");
  if (item.slot === "background") return backgroundDataUrl(item.id);
  const character = normalizeCharacter({ equipped: { [item.slot]: item.id } }, "1.2.0");
  const grid = createGrid();
  if (["head", "hair"].includes(item.slot)) drawHeadLayer(grid, character, 0, item);
  if (item.slot === "clothes") {
    drawClothesLayer(grid, character, 0, IDLE_POSES[0]);
    drawClothesDetails(grid, character, 0);
  }
  if (item.slot === "back") drawBackLayer(grid, character, 0);
  if (item.slot === "face") drawToolLayer(grid, character, 0, item);
  if (item.slot === "tool") drawToolLayer(grid, character, 0);
  drawItemDetails(grid, item, 0);
  // Only standalone item thumbnails trim empty canvas. Hero frames never crop.
  const pixels = grid.map((rgba, index) => rgba[3] ? [index % VIRTUAL_SIZE, Math.floor(index / VIRTUAL_SIZE)] : null).filter(Boolean);
  const left = Math.min(...pixels.map(([x]) => x));
  const top = Math.min(...pixels.map(([, y]) => y));
  const width = Math.max(...pixels.map(([x]) => x)) - left + 1;
  const height = Math.max(...pixels.map(([, y]) => y)) - top + 1;
  if (!pixels.length) return `data:image/png;base64,${gridToPngBuffer(grid, 1).toString("base64")}`;
  const size = Math.max(width, height) + 2;
  const png = new PNG({ width: size, height: size });
  const offsetX = Math.floor((size - width) / 2);
  const offsetY = Math.floor((size - height) / 2);
  for (const [x, y] of pixels) {
    png.data.set(grid[y * VIRTUAL_SIZE + x], ((y - top + offsetY) * size + x - left + offsetX) * 4);
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}

module.exports = {
  MAC_TRAY_SIZE,
  IDLE_POSES,
  TRAY_PADDING,
  VIRTUAL_SIZE,
  renderCharacterLayers,
  renderCharacterBuffer,
  renderTrayCharacterBuffer,
  renderCharacterDataUrl,
  renderSceneDataUrl,
  renderItemDataUrl
};
