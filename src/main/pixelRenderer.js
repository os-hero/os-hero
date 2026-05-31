const { PNG } = require("pngjs");
const {
  DEFAULT_CLOTHES_ID,
  getEyeType,
  getItemById,
  normalizeCharacter
} = require("../shared/catalog");

const VIRTUAL_SIZE = 24;
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
  const torsoY = 12 + bob;
  const expanded = frameIndex % 4 === 1;
  const shirtShade = darken(style.shirt, 0.16);
  const pantsShade = darken(style.pants, 0.18);

  drawSleeves(grid, style, torsoY, expanded);

  drawRect(grid, 6, torsoY, 12, 1, OUTLINE);
  drawRect(grid, 5, torsoY + 1, 14, 6, OUTLINE);
  drawRect(grid, 6, torsoY + 6, 12, 1, OUTLINE);
  drawRect(grid, 7, torsoY + 1, 10, 5, style.shirt);
  drawRect(grid, 7, torsoY + 5, 10, 1, shirtShade);

  if (character.equipped.clothes === "blue_overalls") {
    drawRect(grid, 8, torsoY + 1, 2, 5, style.pants);
    drawRect(grid, 14, torsoY + 1, 2, 5, style.pants);
    drawRect(grid, 9, torsoY + 3, 6, 3, style.pants);
    drawRect(grid, 10, torsoY + 4, 4, 1, lighten(style.pants, 0.1));
    setPixel(grid, 9, torsoY + 2, style.accent);
    setPixel(grid, 14, torsoY + 2, style.accent);
    drawLegs(grid, bob, style.pants);
    return;
  }

  if (character.equipped.clothes === "green_tunic") {
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
}

function gridToPngBuffer(grid, scale) {
  const size = VIRTUAL_SIZE * scale;
  const png = new PNG({ width: size, height: size });

  for (let y = 0; y < VIRTUAL_SIZE; y += 1) {
    for (let x = 0; x < VIRTUAL_SIZE; x += 1) {
      const rgba = grid[y * VIRTUAL_SIZE + x];

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const pixelIndex = ((y * scale + sy) * size + (x * scale + sx)) * 4;
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
  const character = normalizeCharacter(characterInput, (characterInput && characterInput.version) || "0.1.12");
  const grid = createGrid();
  const bob = [0, 0, 1, 0][frameIndex % 4];

  drawRect(grid, 7, 23, 10, 1, SHADOW, 90);
  drawBodyLayer(grid, character, bob);
  drawClothesLayer(grid, character, bob, frameIndex);
  drawHeadLayer(grid, character, bob);
  drawEyeLayer(grid, character, bob);
  drawToolLayer(grid, character, bob);

  return gridToPngBuffer(grid, Math.max(1, Math.round(scale)));
}

function renderCharacterDataUrl(character, frameIndex = 0, scale = 8) {
  return `data:image/png;base64,${renderCharacterBuffer(character, frameIndex, scale).toString("base64")}`;
}

module.exports = {
  VIRTUAL_SIZE,
  renderCharacterBuffer,
  renderCharacterDataUrl
};
